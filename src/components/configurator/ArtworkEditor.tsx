"use client";

import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BringToFront,
  Copy,
  Hand,
  ImagePlus,
  Layers3,
  Redo2,
  RotateCcw,
  RotateCw,
  SendToBack,
  Trash2,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { layoutStudioText, type StudioConfig, type StudioPhotoLayer } from "../../lib/studio-template";
import {
  clampPhotoTransform,
  photoPivot,
  stepPhotoTransform,
  studioPhotoFieldKey,
  studioPhotoLabel,
  studioPhotoLayerId,
  studioPhotoMarker,
  type PhotoAction,
  type StudioPhotoTransform,
} from "../../lib/studio-photo";
import { DesignCompletionMeter } from "./DesignCompletionMeter";
import { ensureStudioFonts, measureStudioText, studioFontFamily } from "./studio-canvas";
import { getReadableTextColor } from "./artwork-color";
import type { DesignCompletion } from "./design-completion";
import type {
  ArtworkDocument,
  ArtworkLayer,
  PrintableSurfaceDefinition,
} from "./artwork-types";
import {
  canAddArtworkLayer,
  constrainArtworkLayerToPolicy,
  getArtworkLayersInRenderOrder,
  insertArtworkBelowText,
  normalizeArtworkDocumentToPolicy,
  sniffArtworkImageMime,
} from "./artwork-types";
import { resizeArtworkGeometry, type ResizeDirection } from "./artwork-resize";
import type { ArtworkImageAssetReference, ArtworkSurfacePolicy, ProductArtworkPolicy } from "@/lib/types";
import { resolveArtworkTextTypography } from "@/lib/artwork-text-policy";
import styles from "./configurator.module.css";

interface ArtworkEditorProps {
  productId: string;
  document: ArtworkDocument;
  surfaces: PrintableSurfaceDefinition[];
  policy: ProductArtworkPolicy;
  uploads: {
    supported: boolean;
    acceptedMimeTypes: ArtworkImageAssetReference["mimeType"][];
    maximumBytes: number;
    endpoint: string;
  };
  background: string;
  foreground: string;
  accent: string;
  /** Product/template imagery stays locked beneath all editable artwork layers. */
  baseImages?: Record<string, string>;
  personalizationFontOptions?: Array<{
    value: "rounded" | "sans" | "serif";
    label: string;
  }>;
  designCompletion: DesignCompletion;
  onChange: (document: ArtworkDocument) => void;
  footer?: React.ReactNode;
  /**
   * A locked studio design: the product mockup with personalization text bound
   * to the customer's field values. The customer types; the layout never moves.
   */
  studio?: { config: StudioConfig; values: Readonly<Record<string, string>> };
}

type DragState = {
  layerId: string;
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

type ResizeState = {
  layerId: string;
  pointerId: number;
  direction: ResizeDirection;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  originWidth: number;
  originHeight: number;
  rotation: number;
  aspectLocked: boolean;
};

type PanState = {
  pointerId: number;
  startX: number;
  startY: number;
  scrollLeft: number;
  scrollTop: number;
};

/** A studio photo being dragged (one pointer) or pinched (two pointers). */
type PhotoGesture = {
  fieldKey: string;
  pointers: Map<number, { x: number; y: number }>;
  origin: StudioPhotoTransform;
  startCentroid: { x: number; y: number };
  startDistance: number;
};

const PHOTO_CONTROLS: Array<{ action: PhotoAction; label: string; icon: typeof RotateCw }> = [
  { action: "rotate-ccw", label: "Rotate left", icon: RotateCcw },
  { action: "rotate-cw", label: "Rotate right", icon: RotateCw },
  { action: "zoom-out", label: "Zoom out", icon: ZoomOut },
  { action: "zoom-in", label: "Zoom in", icon: ZoomIn },
  { action: "left", label: "Move left", icon: ArrowLeft },
  { action: "right", label: "Move right", icon: ArrowRight },
  { action: "up", label: "Move up", icon: ArrowUp },
  { action: "down", label: "Move down", icon: ArrowDown },
];

const pointerCentroid = (pointers: Map<number, { x: number; y: number }>) => {
  const points = [...pointers.values()];
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / Math.max(1, points.length),
    y: points.reduce((sum, point) => sum + point.y, 0) / Math.max(1, points.length),
  };
};

const pointerSpread = (pointers: Map<number, { x: number; y: number }>) => {
  const [first, second] = [...pointers.values()];
  return first && second ? Math.hypot(first.x - second.x, first.y - second.y) : 0;
};

const newId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

function cloneDocument(document: ArtworkDocument): ArtworkDocument {
  return {
    ...document,
    surfaces: document.surfaces.map((surface) => ({
      ...surface,
      layers: surface.layers.map((layer) => ({ ...layer })),
    })),
  };
}

function replaceLayers(
  document: ArtworkDocument,
  surfaceId: string,
  update: (layers: ArtworkLayer[]) => ArtworkLayer[],
) {
  return {
    ...document,
    updatedAt: new Date().toISOString(),
    surfaces: document.surfaces.map((surface) =>
      surface.id === surfaceId ? { ...surface, layers: update(surface.layers) } : surface,
    ),
  };
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("The image could not be read."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

function getImageSize(src: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("The image is damaged or unsupported."));
    image.src = src;
  });
}

function imagePolicyError(
  file: File,
  detectedType: string | undefined,
  width: number,
  height: number,
  surface: ArtworkSurfacePolicy,
  uploads: ArtworkEditorProps["uploads"],
  asset?: ArtworkImageAssetReference,
) {
  const image = surface.image;
  const allowedMimeTypes = image.allowedMimeTypes.filter((mimeType) => uploads.acceptedMimeTypes.includes(mimeType));
  const maximumBytes = Math.min(image.maximumBytes, uploads.maximumBytes);
  if (!detectedType || detectedType !== file.type || !allowedMimeTypes.includes(detectedType as ArtworkImageAssetReference["mimeType"])) {
    return `Use one of the allowed image types: ${allowedMimeTypes.map((type) => type.replace("image/", "").toUpperCase()).join(", ")}.`;
  }
  if ((asset?.sizeBytes ?? file.size) > maximumBytes) return `Use an image no larger than ${Math.max(1, Math.floor(maximumBytes / 1024 / 1024))} MB.`;
  if (width < image.minimumSourceWidth || width > image.maximumSourceWidth || height < image.minimumSourceHeight || height > image.maximumSourceHeight) {
    return `Use an image between ${image.minimumSourceWidth} x ${image.minimumSourceHeight} and ${image.maximumSourceWidth} x ${image.maximumSourceHeight} px.`;
  }
  const ratio = width / height;
  if (image.allowedAspectRatios.length && !image.allowedAspectRatios.some((allowed) => Math.abs(allowed - ratio) <= image.aspectRatioTolerance)) {
    return `This image aspect ratio is not available for ${surface.label}.`;
  }
  if (!image.allowTransparency && asset?.hasTransparency === true) return `Transparent images are not available for ${surface.label}.`;
  return undefined;
}

async function uploadArtworkAsset(endpoint: string, productId: string, surfaceId: string, file: File) {
  const body = new FormData();
  body.set("productId", productId);
  body.set("surfaceId", surfaceId);
  body.set("file", file);
  const response = await fetch(endpoint, { method: "POST", body });
  const payload = await response.json() as {
    data?: ArtworkImageAssetReference & { expiresAt?: string };
    error?: { message?: string };
  };
  if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "The image could not be stored securely.");
  const asset = payload.data;
  if (
    !asset.id || !asset.claimToken ||
    !["image/jpeg", "image/png", "image/webp"].includes(asset.mimeType) ||
    !Number.isSafeInteger(asset.sizeBytes) || asset.sizeBytes < 1 ||
    !Number.isSafeInteger(asset.width) || asset.width < 1 ||
    !Number.isSafeInteger(asset.height) || asset.height < 1
  ) throw new Error("The image storage response was incomplete.");
  return {
    id: asset.id,
    claimToken: asset.claimToken,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
    width: asset.width,
    height: asset.height,
    ...(typeof asset.hasTransparency === "boolean" ? { hasTransparency: asset.hasTransparency } : {}),
    ...(asset.sha256 ? { sha256: asset.sha256 } : {}),
  } satisfies ArtworkImageAssetReference;
}

export function ArtworkEditor({
  productId,
  document,
  surfaces,
  policy,
  uploads,
  background,
  foreground,
  accent,
  baseImages,
  personalizationFontOptions,
  designCompletion,
  onChange,
  footer,
  studio,
}: ArtworkEditorProps) {
  // Bumped once the design's web fonts have loaded: text is measured (and so
  // laid out) only then, and only after mount, so SSR and hydration agree.
  const [studioFontsVersion, setStudioFontsVersion] = useState(0);
  const studioConfig = studio?.config;
  useEffect(() => {
    if (!studioConfig) return;
    let cancelled = false;
    void ensureStudioFonts(studioConfig).then(() => {
      if (!cancelled) setStudioFontsVersion((version) => version + 1);
    });
    return () => { cancelled = true; };
  }, [studioConfig]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [message, setMessage] = useState("");
  const [panEnabled, setPanEnabled] = useState(false);
  const [undoStack, setUndoStack] = useState<ArtworkDocument[]>([]);
  const [redoStack, setRedoStack] = useState<ArtworkDocument[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const replacementImageId = useRef<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);
  const panRef = useRef<PanState | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const photoTargetKey = useRef<string | null>(null);
  const photoGestureRef = useRef<PhotoGesture | null>(null);
  const [selectedPhotoKey, setSelectedPhotoKey] = useState<string | null>(null);
  const clipIdPrefix = `studio-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  const activeSurface =
    document.surfaces.find((surface) => surface.id === document.activeSurfaceId) ??
    document.surfaces[0];
  const surfaceDefinition =
    surfaces.find((surface) => surface.id === activeSurface?.id) ?? surfaces[0];
  const activePolicy = policy.surfaces.find((surface) => surface.id === activeSurface?.id) ?? policy.surfaces[0];
  const activeTextTypography = activePolicy ? resolveArtworkTextTypography(activePolicy.text) : undefined;
  const selectedLayer = activeSurface?.layers.find((layer) => layer.id === selectedId);
  const canvasWidth = studio?.config.canvas.width ?? activePolicy?.coordinateSpace.width ?? surfaceDefinition?.width ?? 600;
  const canvasHeight = studio?.config.canvas.height ?? activePolicy?.coordinateSpace.height ?? surfaceDefinition?.height ?? 360;
  const baseImage = studio?.config.background.url ?? (activeSurface ? baseImages?.[activeSurface.id] : undefined);
  const canvasFill = studio?.config.background.color ?? background;
  const portraitRatio = studio ? Math.min(1, canvasWidth / canvasHeight) : 1;
  const printableBounds = activePolicy?.printableBounds ?? {
    x: surfaceDefinition?.safeInset ?? 32,
    y: surfaceDefinition?.safeInset ?? 32,
    width: canvasWidth - (surfaceDefinition?.safeInset ?? 32) * 2,
    height: canvasHeight - (surfaceDefinition?.safeInset ?? 32) * 2,
  };
  const physicalWidthMm = surfaceDefinition?.physicalWidthMm;
  const physicalHeightMm = surfaceDefinition?.physicalHeightMm;
  const targetDpi = surfaceDefinition?.targetDpi ?? 300;
  const selectedFontOptions = selectedLayer?.id === "personalization-name" && personalizationFontOptions?.length
    ? personalizationFontOptions
    : [
        { value: "rounded" as const, label: "Rounded" },
        { value: "sans" as const, label: "Sans" },
        { value: "serif" as const, label: "Serif" },
      ];
  const selectedPolicy = selectedLayer && activePolicy
    ? selectedLayer.type === "text" ? activePolicy.text : activePolicy.image
    : undefined;
  const availableFontOptions = selectedLayer?.type === "text" && activePolicy?.text.allowedFontFamilies.length
    ? selectedFontOptions.filter((option) => activePolicy.text.allowedFontFamilies.includes(option.value))
    : selectedFontOptions;
  const canAddText = Boolean(activeSurface && canAddArtworkLayer(document, activeSurface.id, "text", policy));
  const canAddImage = Boolean(uploads.supported && activeSurface && canAddArtworkLayer(document, activeSurface.id, "image", policy));
  // Photo slots are offered only where the product accepts uploads (otherwise they could never be filled).
  const photoSlots: StudioPhotoLayer[] = studio && uploads.supported && activePolicy?.image.enabled ? studio.config.photos : [];
  const photoLayers = new Map((activeSurface?.layers ?? []).flatMap((layer) => {
    const key = layer.type === "image" ? studioPhotoFieldKey(layer.id) : null;
    return key ? [[key, layer] as const] : [];
  }));
  const photoAccept = activePolicy?.image.allowedMimeTypes.filter((mimeType) => uploads.acceptedMimeTypes.includes(mimeType)).join(",") ?? "";

  const warnings = useMemo(() => {
    if (!activeSurface || studio) return [];
    return activeSurface.layers.flatMap((layer) => {
      const issues: string[] = [];
      if (
        layer.x < printableBounds.x ||
        layer.y < printableBounds.y ||
        layer.x + layer.width > printableBounds.x + printableBounds.width ||
        layer.y + layer.height > printableBounds.y + printableBounds.height
      ) {
        issues.push(`${layer.name} crosses the safe area.`);
      }
      if (layer.type === "image") {
        if (physicalWidthMm && physicalHeightMm) {
          const requiredWidth = Math.ceil((layer.width / canvasWidth) * physicalWidthMm / 25.4 * targetDpi);
          const requiredHeight = Math.ceil((layer.height / canvasHeight) * physicalHeightMm / 25.4 * targetDpi);
          if ((layer.sourceWidth ?? 0) < requiredWidth || (layer.sourceHeight ?? 0) < requiredHeight) {
            issues.push(`${layer.name} needs about ${requiredWidth} x ${requiredHeight} px for ${targetDpi} DPI at this size.`);
          }
        } else {
          issues.push(`${layer.name} resolution cannot be verified until physical print dimensions are configured.`);
        }
      }
      return issues;
    });
  }, [activeSurface, canvasHeight, canvasWidth, physicalHeightMm, physicalWidthMm, printableBounds, studio, targetDpi]);

  function apply(next: ArtworkDocument, recordHistory = true) {
    if (recordHistory) {
      setUndoStack((stack) => [...stack.slice(-39), cloneDocument(document)]);
      setRedoStack([]);
    }
    onChange(normalizeArtworkDocumentToPolicy(next, policy));
  }

  function updateLayer(layerId: string, patch: Partial<ArtworkLayer>, recordHistory = true) {
    if (!activePolicy) return;
    apply(
      replaceLayers(document, activeSurface.id, (layers) =>
        layers.map((layer) => layer.id === layerId
          ? constrainArtworkLayerToPolicy({ ...layer, ...patch }, activePolicy)
          : layer),
      ),
      recordHistory,
    );
  }

  function resizeLayer(layer: ArtworkLayer, axis: "width" | "height", rawValue: number) {
    const value = Math.max(20, rawValue || 20);
    if (layer.type !== "image" || layer.aspectLocked === false) {
      updateLayer(layer.id, { [axis]: value });
      return;
    }
    const aspect = layer.width / layer.height || (layer.sourceWidth ?? 1) / (layer.sourceHeight ?? 1);
    updateLayer(layer.id, axis === "width" ? { width: value, height: value / aspect } : { height: value, width: value * aspect });
  }

  function fitImageToPrintArea(layer: ArtworkLayer, fill: boolean) {
    if (layer.type !== "image" || !activePolicy?.image.permissions.move || !activePolicy.image.permissions.resize) return;
    const availableWidth = printableBounds.width;
    const availableHeight = printableBounds.height;
    if (fill) {
      if (!activePolicy.image.allowCrop) return;
      updateLayer(layer.id, {
        x: printableBounds.x,
        y: printableBounds.y,
        width: availableWidth,
        height: availableHeight,
        imageFit: "cover",
      });
      return;
    }
    const aspect = (layer.sourceWidth ?? layer.width) / (layer.sourceHeight ?? layer.height);
    const width = Math.min(availableWidth, availableHeight * aspect);
    const height = width / aspect;
    updateLayer(layer.id, {
      x: printableBounds.x + (printableBounds.width - width) / 2,
      y: printableBounds.y + (printableBounds.height - height) / 2,
      width,
      height,
      aspectLocked: true,
      imageFit: "contain",
    });
  }

  function fitTextToBox(layer: ArtworkLayer) {
    if (!activeTextTypography || (!activePolicy?.text.permissions.font && activeTextTypography.fontSizeConfigured)) return;
    const characterCount = Math.max(1, layer.text?.trim().length ?? 1);
    const widthLimitedSize = layer.width / (characterCount * 0.62);
    const heightLimitedSize = layer.height * 0.78;
    updateLayer(layer.id, {
      fontSize: Math.max(
        activeTextTypography.minimumFontSize,
        Math.min(activeTextTypography.maximumFontSize, Math.floor(Math.min(widthLimitedSize, heightLimitedSize))),
      ),
    });
  }

  function setLayerRotation(layer: ArtworkLayer, rotation: number) {
    if (!activePolicy) return;
    const layerPolicy = layer.type === "text" ? activePolicy.text : activePolicy.image;
    updateLayer(layer.id, { rotation: Math.max(layerPolicy.geometry.minimumRotation, Math.min(layerPolicy.geometry.maximumRotation, rotation)) });
  }

  function addText() {
    if (!activePolicy || !canAddText) {
      setMessage("This surface has reached its text element limit.");
      return;
    }
    const id = newId();
    const geometry = activePolicy.text.geometry.default;
    const typography = resolveArtworkTextTypography(activePolicy.text);
    apply(
      replaceLayers(document, activeSurface.id, (layers) => [
        ...layers,
        {
          id,
          type: "text",
          name: `Text ${layers.filter((layer) => layer.type === "text").length + 1}`,
          ...geometry,
          opacity: 1,
          text: "Your text",
          color: activePolicy.text.allowedColors.length
            ? activePolicy.text.defaultColor
            : getReadableTextColor(background, foreground),
          fontSize: typography.defaultFontSize,
          fontFamily: activePolicy.text.defaultFontFamily,
          textAlign: typography.defaultTextAlign,
        },
      ]),
    );
    setSelectedId(id);
  }

  async function addImage(file: File | undefined) {
    if (!file) return;
    setMessage("");
    const replaceId = replacementImageId.current;
    const replacement = replaceId
      ? activeSurface?.layers.find((layer) => layer.id === replaceId && layer.type === "image")
      : undefined;
    if (replaceId && !replacement) {
      setMessage("Select the image again before replacing it.");
      replacementImageId.current = null;
      return;
    }
    if (!activePolicy || (!replacement && !canAddImage)) {
      setMessage("This surface has reached its image limit.");
      return;
    }
    const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const detectedType = sniffArtworkImageMime(bytes);
    try {
      const src = await readAsDataUrl(file);
      const imageSize = await getImageSize(src);
      const localError = imagePolicyError(file, detectedType, imageSize.width, imageSize.height, activePolicy, uploads);
      if (localError) {
        setMessage(localError);
        return;
      }
      setMessage("Uploading and validating image...");
      const asset = await uploadArtworkAsset(uploads.endpoint, productId, activeSurface.id, file);
      const serverError = imagePolicyError(file, asset.mimeType, asset.width, asset.height, activePolicy, uploads, asset);
      if (serverError) {
        setMessage(serverError);
        return;
      }
      const id = replacement?.id ?? newId();
      const geometry = activePolicy.image.geometry.default;
      apply(
        replaceLayers(document, activeSurface.id, (layers) => {
          const imageLayer: ArtworkLayer = replacement ? {
            ...replacement,
            name: file.name.slice(0, 80),
            src,
            asset,
            sourceWidth: asset.width,
            sourceHeight: asset.height,
          } : {
            id,
            type: "image",
            name: file.name.slice(0, 80),
            ...geometry,
            opacity: 1,
            src,
            asset,
            sourceWidth: asset.width,
            sourceHeight: asset.height,
            imageFit: "contain",
            aspectLocked: true,
          };
          return replacement
            ? layers.map((layer) => layer.id === replacement.id ? imageLayer : layer)
            : insertArtworkBelowText(layers, imageLayer);
        }),
      );
      setSelectedId(id);
      setMessage(activePolicy.image.approvalRequired ? "Image uploaded. It will require artwork approval." : "Image uploaded securely.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The image could not be loaded.");
    } finally {
      replacementImageId.current = null;
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function openPhotoPicker(fieldKey: string) {
    photoTargetKey.current = fieldKey;
    setSelectedPhotoKey(fieldKey);
    photoInput.current?.click();
  }

  /** Uploads a customer photo into a studio slot (validated and stored privately, like any artwork image). */
  async function addStudioPhoto(file: File | undefined) {
    const fieldKey = photoTargetKey.current;
    const slot = photoSlots.find((candidate) => candidate.fieldKey === fieldKey);
    if (!file || !fieldKey || !slot || !activePolicy || !activeSurface) return;
    const existing = photoLayers.get(fieldKey);
    if (!existing && !canAddImage) {
      setMessage("This design has no free photo slot.");
      return;
    }
    setMessage("");
    try {
      const detectedType = sniffArtworkImageMime(new Uint8Array(await file.slice(0, 12).arrayBuffer()));
      const src = await readAsDataUrl(file);
      const imageSize = await getImageSize(src);
      const localError = imagePolicyError(file, detectedType, imageSize.width, imageSize.height, activePolicy, uploads);
      if (localError) {
        setMessage(localError);
        return;
      }
      setMessage("Uploading your photo...");
      const asset = await uploadArtworkAsset(uploads.endpoint, productId, activeSurface.id, file);
      const serverError = imagePolicyError(file, asset.mimeType, asset.width, asset.height, activePolicy, uploads, asset);
      if (serverError) {
        setMessage(serverError);
        return;
      }
      const id = studioPhotoLayerId(fieldKey);
      const photoLayer: ArtworkLayer = {
        id,
        type: "image",
        name: studioPhotoLabel(fieldKey, slot.label),
        ...studioPhotoMarker(slot),
        opacity: 1,
        src,
        asset,
        sourceWidth: asset.width,
        sourceHeight: asset.height,
        imageFit: "contain",
        aspectLocked: true,
        photo: clampPhotoTransform(null),
      };
      apply(replaceLayers(document, activeSurface.id, (layers) => existing
        ? layers.map((layer) => layer.id === id ? photoLayer : layer)
        : [...layers, photoLayer]));
      setSelectedPhotoKey(fieldKey);
      setMessage("Photo added. Drag it, or use the controls to rotate, zoom and move it.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The photo could not be loaded.");
    } finally {
      photoTargetKey.current = null;
      if (photoInput.current) photoInput.current.value = "";
    }
  }

  function setPhotoTransform(fieldKey: string, transform: StudioPhotoTransform, recordHistory = true) {
    const id = studioPhotoLayerId(fieldKey);
    apply(replaceLayers(document, activeSurface.id, (layers) =>
      layers.map((layer) => layer.id === id ? { ...layer, photo: clampPhotoTransform(transform) } : layer)), recordHistory);
  }

  function stepPhoto(fieldKey: string, action: PhotoAction) {
    const layer = photoLayers.get(fieldKey);
    if (!layer) return;
    setSelectedPhotoKey(fieldKey);
    setPhotoTransform(fieldKey, stepPhotoTransform(clampPhotoTransform(layer.photo), action));
  }

  function removePhoto(fieldKey: string) {
    const id = studioPhotoLayerId(fieldKey);
    apply(replaceLayers(document, activeSurface.id, (layers) => layers.filter((layer) => layer.id !== id)));
    setSelectedPhotoKey(null);
    setMessage("Photo removed.");
  }

  function beginPhotoGesture(event: React.PointerEvent<SVGGElement>, fieldKey: string) {
    event.stopPropagation();
    const layer = photoLayers.get(fieldKey);
    if (!layer) {
      openPhotoPicker(fieldKey);
      return;
    }
    setSelectedPhotoKey(fieldKey);
    setSelectedId(null);
    const point = pointerPosition(event);
    const gesture = photoGestureRef.current?.fieldKey === fieldKey ? photoGestureRef.current : null;
    const pointers = new Map(gesture?.pointers ?? []);
    pointers.set(event.pointerId, point);
    if (!gesture) {
      setUndoStack((stack) => [...stack.slice(-39), cloneDocument(document)]);
      setRedoStack([]);
    }
    // Each new finger restarts the gesture from the current transform, so drag ↔ pinch never jumps.
    photoGestureRef.current = {
      fieldKey,
      pointers,
      origin: clampPhotoTransform(layer.photo),
      startCentroid: pointerCentroid(pointers),
      startDistance: pointerSpread(pointers),
    };
    svgRef.current?.setPointerCapture(event.pointerId);
  }

  function movePhotoGesture(event: React.PointerEvent<SVGSVGElement>) {
    const gesture = photoGestureRef.current;
    if (!gesture?.pointers.has(event.pointerId)) return;
    gesture.pointers.set(event.pointerId, pointerPosition(event));
    const centroid = pointerCentroid(gesture.pointers);
    const spread = pointerSpread(gesture.pointers);
    setPhotoTransform(gesture.fieldKey, {
      ...gesture.origin,
      offsetX: gesture.origin.offsetX + centroid.x - gesture.startCentroid.x,
      offsetY: gesture.origin.offsetY + centroid.y - gesture.startCentroid.y,
      scale: gesture.startDistance > 0 && spread > 0 ? gesture.origin.scale * (spread / gesture.startDistance) : gesture.origin.scale,
    }, false);
  }

  function endPhotoGesture(event: React.PointerEvent<SVGSVGElement>) {
    const gesture = photoGestureRef.current;
    if (!gesture?.pointers.has(event.pointerId)) return;
    gesture.pointers.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const layer = photoLayers.get(gesture.fieldKey);
    if (!gesture.pointers.size || !layer) {
      photoGestureRef.current = null;
      return;
    }
    photoGestureRef.current = {
      ...gesture,
      origin: clampPhotoTransform(layer.photo),
      startCentroid: pointerCentroid(gesture.pointers),
      startDistance: pointerSpread(gesture.pointers),
    };
  }

  /** Keyboard for the selected photo: arrows move, +/− zoom, R / Shift+R rotate, 0 resets, Delete removes. */
  function handlePhotoKey(event: React.KeyboardEvent<SVGSVGElement>): boolean {
    if (!selectedPhotoKey || !photoLayers.has(selectedPhotoKey)) return false;
    const actions: Record<string, PhotoAction> = {
      ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down",
      "+": "zoom-in", "=": "zoom-in", "-": "zoom-out", r: "rotate-cw", R: "rotate-ccw", "0": "reset",
    };
    const action = actions[event.key];
    if (action) {
      event.preventDefault();
      stepPhoto(selectedPhotoKey, action);
      return true;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      removePhoto(selectedPhotoKey);
      return true;
    }
    return false;
  }

  function renderPhotoSlot(slot: StudioPhotoLayer) {
    const layer = photoLayers.get(slot.fieldKey);
    const transform = clampPhotoTransform(layer?.photo);
    const pivot = photoPivot(slot, transform);
    const clipId = `${clipIdPrefix}-${slot.fieldKey}`;
    const label = studioPhotoLabel(slot.fieldKey, slot.label);
    return (
      <g
        key={`photo-${slot.fieldKey}`}
        clipPath={`url(#${clipId})`}
        className={styles.studioPhotoSlot}
        onPointerDown={(event) => beginPhotoGesture(event, slot.fieldKey)}
        role="button"
        aria-label={layer ? `${label}: drag to move` : `Add ${label.toLowerCase()}`}
      >
        <defs>
          <clipPath id={clipId}>
            {slot.shape === "circle"
              ? <ellipse cx={slot.x + slot.width / 2} cy={slot.y + slot.height / 2} rx={slot.width / 2} ry={slot.height / 2} />
              : <rect x={slot.x} y={slot.y} width={slot.width} height={slot.height} />}
          </clipPath>
        </defs>
        <rect x={slot.x} y={slot.y} width={slot.width} height={slot.height} fill={layer?.src || (!layer && slot.sampleUrl) ? "transparent" : "#eef2f6"} />
        {layer?.src ? (
          <g transform={`translate(${pivot.x} ${pivot.y}) rotate(${transform.rotation}) scale(${transform.scale}) translate(${-slot.width / 2} ${-slot.height / 2})`}>
            <image href={layer.src} width={slot.width} height={slot.height} preserveAspectRatio="xMidYMid meet" />
          </g>
        ) : !layer && slot.sampleUrl ? (
          // Like the reference: the demo photo fills the empty slot until the customer uploads.
          // It is preview only — exports and orders draw just the customer's own photo.
          <image href={slot.sampleUrl} x={slot.x} y={slot.y} width={slot.width} height={slot.height} preserveAspectRatio="xMidYMid meet" data-sample-photo="true" />
        ) : (
          <text
            x={slot.x + slot.width / 2}
            y={slot.y + slot.height / 2}
            textAnchor="middle"
            dominantBaseline="central"
            fill="#64748b"
            fontSize={Math.max(12, Math.min(26, Math.min(slot.width, slot.height) * 0.09))}
            fontWeight="600"
          >
            {layer ? "Photo added" : `+ ${label}`}
          </text>
        )}
      </g>
    );
  }

  function undo() {
    const previous = undoStack.at(-1);
    if (!previous) return;
    setUndoStack((stack) => stack.slice(0, -1));
    setRedoStack((stack) => [...stack.slice(-39), cloneDocument(document)]);
    onChange(previous);
  }

  function redo() {
    const next = redoStack.at(-1);
    if (!next) return;
    setRedoStack((stack) => stack.slice(0, -1));
    setUndoStack((stack) => [...stack.slice(-39), cloneDocument(document)]);
    onChange(next);
  }

  function duplicateSelected() {
    if (!selectedLayer || !activePolicy) return;
    if (selectedLayer.id === "personalization-name") {
      setMessage("The required personalized name cannot be duplicated.");
      return;
    }
    if (!canAddArtworkLayer(document, activeSurface.id, selectedLayer.type, policy)) {
      setMessage(`This surface has reached its ${selectedLayer.type} element limit.`);
      return;
    }
    const id = newId();
    apply(
      replaceLayers(document, activeSurface.id, (layers) => [
        ...layers,
        constrainArtworkLayerToPolicy(
          { ...selectedLayer, id, name: `${selectedLayer.name} copy`, x: selectedLayer.x + 18, y: selectedLayer.y + 18 },
          activePolicy,
        ),
      ]),
    );
    setSelectedId(id);
  }

  function deleteSelected() {
    if (!selectedLayer) return;
    if (selectedLayer.id === "personalization-name") {
      setMessage("The required personalized name cannot be deleted.");
      return;
    }
    apply(
      replaceLayers(document, activeSurface.id, (layers) =>
        layers.filter((layer) => layer.id !== selectedLayer.id),
      ),
    );
    setSelectedId(null);
  }

  function reorder(toFront: boolean) {
    if (!selectedLayer) return;
    if (!toFront && selectedLayer.type === "text") {
      setMessage("Text stays on the front of the poster.");
      return;
    }
    apply(
      replaceLayers(document, activeSurface.id, (layers) => {
        const remaining = layers.filter((layer) => layer.id !== selectedLayer.id);
        return toFront ? [...remaining, selectedLayer] : [selectedLayer, ...remaining];
      }),
    );
  }

  function resetSurface() {
    if (!activeSurface.layers.length || !window.confirm("Reset this artwork surface?")) return;
    const hasRequiredName = activeSurface.layers.some((layer) => layer.id === "personalization-name");
    apply(replaceLayers(document, activeSurface.id, (layers) => {
      const requiredName = layers.find((layer) => layer.id === "personalization-name");
      return requiredName && activePolicy?.text.enabled ? [constrainArtworkLayerToPolicy({
        ...requiredName,
        ...activePolicy.text.geometry.default,
        opacity: 1,
      }, activePolicy)] : [];
    }));
    setSelectedId(hasRequiredName ? "personalization-name" : null);
  }

  function pointerPosition(event: React.PointerEvent<SVGElement>) {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const matrix = svg.getScreenCTM()?.inverse();
    const transformed = matrix ? point.matrixTransform(matrix) : point;
    return { x: transformed.x, y: transformed.y };
  }

  function beginDrag(event: React.PointerEvent<SVGGElement>, layer: ArtworkLayer) {
    event.stopPropagation();
    const svg = svgRef.current;
    const layerPolicy = activePolicy && (layer.type === "text" ? activePolicy.text : activePolicy.image);
    if (!layerPolicy?.permissions.move) {
      setSelectedId(layer.id);
      return;
    }
    if (!svg) return;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const matrix = svg.getScreenCTM()?.inverse();
    const transformed = matrix ? point.matrixTransform(matrix) : point;
    setSelectedId(layer.id);
    setUndoStack((stack) => [...stack.slice(-39), cloneDocument(document)]);
    setRedoStack([]);
    dragRef.current = {
      layerId: layer.id,
      pointerId: event.pointerId,
      startX: transformed.x,
      startY: transformed.y,
      originX: layer.x,
      originY: layer.y,
    };
    svg.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: React.PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const point = pointerPosition(event);
    updateLayer(
      drag.layerId,
      {
        x: Math.round(drag.originX + point.x - drag.startX),
        y: Math.round(drag.originY + point.y - drag.startY),
      },
      false,
    );
  }

  function beginResize(event: React.PointerEvent<SVGRectElement>, layer: ArtworkLayer, direction: ResizeDirection) {
    event.preventDefault();
    event.stopPropagation();
    const svg = svgRef.current;
    const layerPolicy = activePolicy && (layer.type === "text" ? activePolicy.text : activePolicy.image);
    if (!layerPolicy?.permissions.resize) return;
    if (!svg) return;
    const point = pointerPosition(event);
    setSelectedId(layer.id);
    setUndoStack((stack) => [...stack.slice(-39), cloneDocument(document)]);
    setRedoStack([]);
    resizeRef.current = {
      layerId: layer.id,
      pointerId: event.pointerId,
      direction,
      startX: point.x,
      startY: point.y,
      originX: layer.x,
      originY: layer.y,
      originWidth: layer.width,
      originHeight: layer.height,
      rotation: layer.rotation,
      aspectLocked: layer.type === "image" && layer.aspectLocked !== false,
    };
    svg.setPointerCapture(event.pointerId);
  }

  function moveResize(event: React.PointerEvent<SVGSVGElement>) {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    const point = pointerPosition(event);
    const deltaX = point.x - resize.startX;
    const deltaY = point.y - resize.startY;
    const geometry = resizeArtworkGeometry({
      x: resize.originX,
      y: resize.originY,
      width: resize.originWidth,
      height: resize.originHeight,
      rotation: resize.rotation,
    }, resize.direction, deltaX, deltaY, resize.aspectLocked);
    updateLayer(resize.layerId, {
      x: Math.round(geometry.x),
      y: Math.round(geometry.y),
      width: Math.round(geometry.width),
      height: Math.round(geometry.height),
    }, false);
  }

  function endDrag(event: React.PointerEvent<SVGSVGElement>) {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (resizeRef.current?.pointerId === event.pointerId) {
      resizeRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function beginPan(event: React.PointerEvent<HTMLDivElement>) {
    if (!panEnabled) return;
    event.preventDefault();
    event.stopPropagation();
    const viewport = viewportRef.current;
    if (!viewport) return;
    panRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    };
    viewport.setPointerCapture(event.pointerId);
  }

  function movePan(event: React.PointerEvent<HTMLDivElement>) {
    const pan = panRef.current;
    const viewport = viewportRef.current;
    if (!pan || !viewport || pan.pointerId !== event.pointerId) return;
    viewport.scrollLeft = pan.scrollLeft - (event.clientX - pan.startX);
    viewport.scrollTop = pan.scrollTop - (event.clientY - pan.startY);
  }

  function endPan(event: React.PointerEvent<HTMLDivElement>) {
    if (panRef.current?.pointerId !== event.pointerId) return;
    panRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function handleCanvasKeyDown(event: React.KeyboardEvent<SVGSVGElement>) {
    if (studio) {
      handlePhotoKey(event);
      return;
    }
    if (!selectedLayer) return;
    const step = event.shiftKey ? 10 : 1;
    const movement = {
      ArrowLeft: { x: selectedLayer.x - step },
      ArrowRight: { x: selectedLayer.x + step },
      ArrowUp: { y: selectedLayer.y - step },
      ArrowDown: { y: selectedLayer.y + step },
    }[event.key];
    if (movement && selectedPolicy?.permissions.move) {
      event.preventDefault();
      updateLayer(selectedLayer.id, movement);
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      deleteSelected();
    }
  }

  return (
    <section className={styles.editor} aria-label="Artwork editor">
      <div className={styles.editorToolbar}>
        {!studio && activePolicy?.text.enabled && <button type="button" onClick={addText} disabled={!canAddText} title="Add text"><Type /> <span>Add text</span></button>}
        {!studio && activePolicy?.image.enabled && uploads.supported && <>
          <button type="button" onClick={() => { replacementImageId.current = null; fileInput.current?.click(); }} disabled={!canAddImage} title="Upload an allowed image"><ImagePlus /> <span>Upload</span></button>
          <input
            ref={fileInput}
            className={styles.visuallyHidden}
            type="file"
            accept={activePolicy.image.allowedMimeTypes.filter((mimeType) => uploads.acceptedMimeTypes.includes(mimeType)).join(",")}
            onChange={(event) => void addImage(event.target.files?.[0])}
          />
        </>}
        <i />
        <button type="button" onClick={undo} disabled={!undoStack.length} title="Undo"><Undo2 /></button>
        <button type="button" onClick={redo} disabled={!redoStack.length} title="Redo"><Redo2 /></button>
        <button type="button" onClick={() => setZoom((value) => Math.max(0.7, value - 0.1))} title="Zoom out"><ZoomOut /></button>
        <span>{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => setZoom((value) => Math.min(1.8, value + 0.1))} title="Zoom in"><ZoomIn /></button>
        <button type="button" className={panEnabled ? styles.activeTool : ""} aria-pressed={panEnabled} onClick={() => setPanEnabled((value) => !value)} title="Pan canvas"><Hand /></button>
        {!studio && <button type="button" onClick={resetSurface} disabled={!activeSurface?.layers.length} title="Reset surface"><RotateCcw /></button>}
      </div>

      <DesignCompletionMeter completion={designCompletion} placement="editor" />

      {!studio && <div className={styles.surfaceTabs} role="tablist" aria-label="Printable surface">
        {document.surfaces.map((surface) => (
          <button
            key={surface.id}
            type="button"
            role="tab"
            aria-selected={surface.id === document.activeSurfaceId}
            className={surface.id === document.activeSurfaceId ? styles.active : ""}
            onClick={() => {
              onChange({ ...document, activeSurfaceId: surface.id });
              setSelectedId(null);
            }}
          >
            {surface.label}
            <small>{surface.layers.length}</small>
          </button>
        ))}
      </div>}

      <div
        ref={viewportRef}
        className={`${styles.artboardViewport} ${panEnabled ? styles.panning : ""}`}
        onPointerDownCapture={beginPan}
        onPointerMove={movePan}
        onPointerUp={endPan}
        onPointerCancel={endPan}
      >
        <div
          className={styles.artboardScale}
          // A portrait design (canvas follows the mockup) is narrowed so its height stays on screen.
          style={portraitRatio < 1
            ? { width: `${zoom * 100 * portraitRatio}%`, minWidth: `${70 * portraitRatio}%` }
            : { width: `${zoom * 100}%` }}
        >
          <svg
            ref={svgRef}
            className={styles.artboard}
            viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
            // With photo slots the canvas holds interactive parts, which an "img" would hide from assistive tech.
            role={photoSlots.length ? "group" : "img"}
            aria-label={`${activeSurface?.label ?? "Product"} artwork canvas`}
            tabIndex={0}
            onKeyDown={handleCanvasKeyDown}
            onPointerDown={() => { setSelectedId(null); setSelectedPhotoKey(null); }}
            onPointerMove={(event) => { moveDrag(event); moveResize(event); movePhotoGesture(event); }}
            onPointerUp={(event) => { endDrag(event); endPhotoGesture(event); }}
            onPointerCancel={(event) => { endDrag(event); endPhotoGesture(event); }}
          >
            <rect width={canvasWidth} height={canvasHeight} fill={canvasFill} />
            {/* Photos sit under the mockup and show through its window, as on the source site. */}
            {photoSlots.filter((slot) => slot.stacking === "under").map(renderPhotoSlot)}
            {baseImage && <image
              href={baseImage}
              width={canvasWidth}
              height={canvasHeight}
              preserveAspectRatio="xMidYMid meet"
              pointerEvents="none"
            />}
            {photoSlots.filter((slot) => slot.stacking === "over").map(renderPhotoSlot)}
            {selectedPhotoKey && photoSlots.filter((slot) => slot.fieldKey === selectedPhotoKey).map((slot) => (
              <rect key={`photo-selection-${slot.fieldKey}`} className={styles.selection} x={slot.x} y={slot.y} width={slot.width} height={slot.height} pointerEvents="none" />
            ))}
            {!studio && <rect x="0" y="0" width={canvasWidth} height={canvasHeight} fill="none" stroke={accent} strokeWidth="3" />}
            {!studio && <rect
              className={styles.safeArea}
              x={printableBounds.x}
              y={printableBounds.y}
              width={printableBounds.width}
              height={printableBounds.height}
              rx="6"
            />}
            {!studio && getArtworkLayersInRenderOrder(activeSurface?.layers ?? []).map((layer) => (
              <g
                key={layer.id}
                className={styles.artworkObject}
                transform={`translate(${layer.x} ${layer.y}) rotate(${layer.rotation} ${layer.width / 2} ${layer.height / 2})`}
                opacity={layer.opacity}
                onPointerDown={(event) => beginDrag(event, layer)}
              >
                {layer.type === "image" ? (layer.src ? <image
                  href={layer.src}
                  width={layer.width}
                  height={layer.height}
                  preserveAspectRatio={layer.imageFit === "stretch" ? "none" : layer.imageFit === "cover" ? "xMidYMid slice" : "xMidYMid meet"}
                /> : <rect width={layer.width} height={layer.height} fill="#e5e7eb" stroke="#94a3b8" strokeDasharray="8 6" />) : (
                  <text
                    x={(layer.textAlign ?? "center") === "left" ? 0 : (layer.textAlign ?? "center") === "right" ? layer.width : layer.width / 2}
                    y={layer.height / 2}
                    dominantBaseline="middle"
                    textAnchor={(layer.textAlign ?? "center") === "left" ? "start" : (layer.textAlign ?? "center") === "right" ? "end" : "middle"}
                    fill={layer.color}
                    fontSize={layer.fontSize}
                    fontFamily={layer.fontFamily === "serif" ? "Georgia, serif" : layer.fontFamily === "sans" ? "Arial, sans-serif" : "Manrope, Arial, sans-serif"}
                    fontWeight="700"
                  >
                    {layer.text}
                  </text>
                )}
                {selectedId === layer.id && (
                  <>
                    <rect className={styles.selection} width={layer.width} height={layer.height} />
                    {(layer.type === "text" ? activePolicy?.text.permissions.resize : activePolicy?.image.permissions.resize) && <>
                      <rect className={`${styles.resizeHandle} ${styles.resizeHandleDiagonalDown}`} x="-6" y="-6" width="12" height="12" onPointerDown={(event) => beginResize(event, layer, "northwest")} />
                      <rect className={`${styles.resizeHandle} ${styles.resizeHandleVertical}`} x={layer.width / 2 - 6} y="-6" width="12" height="12" onPointerDown={(event) => beginResize(event, layer, "north")} />
                      <rect className={`${styles.resizeHandle} ${styles.resizeHandleDiagonalUp}`} x={layer.width - 6} y="-6" width="12" height="12" onPointerDown={(event) => beginResize(event, layer, "northeast")} />
                      <rect className={`${styles.resizeHandle} ${styles.resizeHandleHorizontal}`} x={layer.width - 6} y={layer.height / 2 - 6} width="12" height="12" onPointerDown={(event) => beginResize(event, layer, "east")} />
                      <rect className={`${styles.resizeHandle} ${styles.resizeHandleDiagonalDown}`} x={layer.width - 6} y={layer.height - 6} width="12" height="12" onPointerDown={(event) => beginResize(event, layer, "southeast")} />
                      <rect className={`${styles.resizeHandle} ${styles.resizeHandleVertical}`} x={layer.width / 2 - 6} y={layer.height - 6} width="12" height="12" onPointerDown={(event) => beginResize(event, layer, "south")} />
                      <rect className={`${styles.resizeHandle} ${styles.resizeHandleDiagonalUp}`} x="-6" y={layer.height - 6} width="12" height="12" onPointerDown={(event) => beginResize(event, layer, "southwest")} />
                      <rect className={`${styles.resizeHandle} ${styles.resizeHandleHorizontal}`} x="-6" y={layer.height / 2 - 6} width="12" height="12" onPointerDown={(event) => beginResize(event, layer, "west")} />
                    </>}
                  </>
                )}
              </g>
            ))}
            {studio && studioFontsVersion > 0 && studio.config.texts.map((layer) => {
              const layout = layoutStudioText(layer, studio.values[layer.fieldKey], measureStudioText);
              const top = layout.pivot.y - layout.boxHeight / 2;
              return (
                <g
                  key={`studio-${layer.fieldKey}-${layer.x}-${layer.y}`}
                  transform={`rotate(${layer.rotation} ${layout.pivot.x} ${layout.pivot.y}) translate(${layer.x} ${top})`}
                  pointerEvents="none"
                  aria-hidden="true"
                >
                  {layout.lines.map((line, index) => (
                    <text
                      key={index}
                      x={layout.anchorX}
                      y={layout.lineCenters[index]}
                      textAnchor={layer.textAlign === "left" ? "start" : layer.textAlign === "right" ? "end" : "middle"}
                      dominantBaseline="central"
                      fill={layer.color}
                      fontSize={layout.fontSize}
                      fontWeight={layer.fontWeight}
                      letterSpacing={layer.letterSpacing || undefined}
                      opacity={layout.isPlaceholder ? 0.82 : 1}
                      style={{ fontFamily: studioFontFamily(layer.fontId) }}
                    >
                      {line}
                    </text>
                  ))}
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {!studio && <p className={styles.guideLegend}><span /> Safe area <i /> Product edge</p>}
      {(message || warnings.length > 0) && (
        <div className={styles.artworkWarnings} role="status">
          {message && <p>{message}</p>}
          {warnings.map((warning) => <p key={warning}>{warning}</p>)}
        </div>
      )}

      <aside className={styles.inspector} aria-label="Artwork properties">
        {studio ? (
          <>
            <div className={styles.inspectorTitle}><Layers3 /><div><strong>Your design</strong><small>Type your details and they appear on the product exactly where they will be printed.{photoSlots.length ? " Add your photo, then drag it or use the buttons to fit it." : ""}</small></div></div>
            {photoSlots.length > 0 && (
              <div className={styles.studioPhotos}>
                {photoSlots.map((slot) => {
                  const layer = photoLayers.get(slot.fieldKey);
                  const label = studioPhotoLabel(slot.fieldKey, slot.label);
                  return (
                    <div key={slot.fieldKey} className={`${styles.studioPhoto} ${selectedPhotoKey === slot.fieldKey ? styles.studioPhotoSelected : ""}`}>
                      <div className={styles.studioPhotoHead}>
                        <strong>{label}</strong>
                        <small>{layer ? "Drag on the design to position it" : slot.required === false ? "Optional" : "Required"}</small>
                      </div>
                      <button type="button" className={styles.studioPhotoUpload} onClick={() => openPhotoPicker(slot.fieldKey)}>
                        <ImagePlus /> <span>{layer ? "Replace photo" : "Upload photo"}</span>
                      </button>
                      {layer && (
                        <div className={styles.studioPhotoControls} role="group" aria-label={`Adjust ${label.toLowerCase()}`}>
                          {PHOTO_CONTROLS.map(({ action, label: controlLabel, icon: Icon }) => (
                            <button key={action} type="button" title={controlLabel} aria-label={controlLabel} onClick={() => stepPhoto(slot.fieldKey, action)}><Icon /></button>
                          ))}
                          <button type="button" className={styles.studioPhotoTextButton} onClick={() => stepPhoto(slot.fieldKey, "reset")}>Reset</button>
                          <button type="button" title="Remove photo" aria-label="Remove photo" className={styles.studioPhotoRemove} onClick={() => removePhoto(slot.fieldKey)}><Trash2 /></button>
                        </div>
                      )}
                    </div>
                  );
                })}
                <input
                  ref={photoInput}
                  className={styles.visuallyHidden}
                  type="file"
                  accept={photoAccept}
                  onChange={(event) => void addStudioPhoto(event.target.files?.[0])}
                />
              </div>
            )}
          </>
        ) : (
          <div className={styles.inspectorTitle}><Layers3 /><div><strong>Artwork layers</strong><small>{activeSurface?.label}</small></div></div>
        )}
        {!studio && <div className={styles.layerList}>
          {getArtworkLayersInRenderOrder(activeSurface?.layers ?? []).reverse().map((layer) => (
            <button
              key={layer.id}
              type="button"
              className={selectedId === layer.id ? styles.selectedLayer : ""}
              onClick={() => setSelectedId(layer.id)}
            >
              {layer.type === "text" ? <Type /> : <ImagePlus />}
              <span>{layer.name}</span>
            </button>
          ))}
          {!activeSurface?.layers.length && <p className={styles.emptyLayers}>Add an element allowed for this print area to begin.</p>}
        </div>}

        {selectedLayer && (
          <div className={styles.properties}>
            <strong>Selected element</strong>
            {selectedLayer.type === "text" && (
              <label>
                <span>Text</span>
                <input
                  value={selectedLayer.text ?? ""}
                  maxLength={80}
                  onChange={(event) => updateLayer(selectedLayer.id, { text: event.target.value })}
                />
              </label>
            )}
            <div className={styles.propertyGrid}>
              <label><span>Position X</span><input type="number" min={printableBounds.x} max={printableBounds.x + printableBounds.width} value={Math.round(selectedLayer.x)} disabled={!selectedPolicy?.permissions.move} onChange={(event) => updateLayer(selectedLayer.id, { x: Number(event.target.value) || 0 })} /></label>
              <label><span>Position Y</span><input type="number" min={printableBounds.y} max={printableBounds.y + printableBounds.height} value={Math.round(selectedLayer.y)} disabled={!selectedPolicy?.permissions.move} onChange={(event) => updateLayer(selectedLayer.id, { y: Number(event.target.value) || 0 })} /></label>
              <label><span>Width</span><input type="number" min={selectedPolicy?.geometry.minimumWidth} max={selectedPolicy?.geometry.maximumWidth} value={Math.round(selectedLayer.width)} disabled={!selectedPolicy?.permissions.resize} onChange={(event) => resizeLayer(selectedLayer, "width", Number(event.target.value))} /></label>
              <label><span>Height</span><input type="number" min={selectedPolicy?.geometry.minimumHeight} max={selectedPolicy?.geometry.maximumHeight} value={Math.round(selectedLayer.height)} disabled={!selectedPolicy?.permissions.resize} onChange={(event) => resizeLayer(selectedLayer, "height", Number(event.target.value))} /></label>
              <label><span>Rotation (degrees)</span><input type="number" min={selectedPolicy?.geometry.minimumRotation} max={selectedPolicy?.geometry.maximumRotation} value={selectedLayer.rotation} disabled={!selectedPolicy?.permissions.rotate} onChange={(event) => setLayerRotation(selectedLayer, Number(event.target.value) || 0)} /></label>
              <label><span>Opacity</span><input type="number" min="10" max="100" value={Math.round(selectedLayer.opacity * 100)} disabled={selectedLayer.type === "image" && !activePolicy?.image.allowTransparency} onChange={(event) => updateLayer(selectedLayer.id, { opacity: Math.max(0.1, Math.min(1, Number(event.target.value) / 100)) })} /></label>
            </div>
            {selectedPolicy?.permissions.rotate && <>
            <label className={styles.rotationControl}>
              <span>Rotate freely: {Math.round(selectedLayer.rotation)}°</span>
              <input type="range" min={selectedPolicy.geometry.minimumRotation} max={selectedPolicy.geometry.maximumRotation} step="1" value={selectedLayer.rotation} onChange={(event) => setLayerRotation(selectedLayer, Number(event.target.value))} />
            </label>
            <div className={styles.rotationPresets} aria-label="Rotation presets">
              <button type="button" onClick={() => setLayerRotation(selectedLayer, selectedLayer.rotation - 15)}>−15°</button>
              <button type="button" onClick={() => setLayerRotation(selectedLayer, -90)}>−90°</button>
              <button type="button" onClick={() => setLayerRotation(selectedLayer, 0)}>0°</button>
              <button type="button" onClick={() => setLayerRotation(selectedLayer, 90)}>90°</button>
              <button type="button" onClick={() => setLayerRotation(selectedLayer, selectedLayer.rotation + 15)}>+15°</button>
            </div>
            </>}
            {selectedLayer.type === "text" && (
              <>
                <div className={styles.propertyGrid}>
                  {activePolicy?.text.permissions.font && <label><span>Font</span><select value={selectedLayer.fontFamily} onChange={(event) => updateLayer(selectedLayer.id, { fontFamily: event.target.value as ArtworkLayer["fontFamily"] })}>{availableFontOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>}
                  {activePolicy?.text.permissions.color && <label><span>Colour</span>{activePolicy.text.allowedColors.length ? <select value={selectedLayer.color} onChange={(event) => updateLayer(selectedLayer.id, { color: event.target.value })}>{activePolicy.text.allowedColors.map((color) => <option key={color} value={color}>{color.toUpperCase()}</option>)}</select> : <input type="color" value={selectedLayer.color} onChange={(event) => updateLayer(selectedLayer.id, { color: event.target.value })} />}</label>}
                  <label><span>Font size</span><input type="number" min={activeTextTypography?.minimumFontSize ?? 8} max={activeTextTypography?.maximumFontSize ?? 180} value={selectedLayer.fontSize ?? activeTextTypography?.defaultFontSize ?? 34} disabled={!activePolicy?.text.permissions.font && activeTextTypography?.fontSizeConfigured} onChange={(event) => updateLayer(selectedLayer.id, { fontSize: Number(event.target.value) || (activeTextTypography?.minimumFontSize ?? 8) })} /></label>
                  <label><span>Alignment</span><select value={selectedLayer.textAlign ?? activeTextTypography?.defaultTextAlign ?? "center"} disabled={!activePolicy?.text.permissions.font && activeTextTypography?.alignmentConfigured} onChange={(event) => updateLayer(selectedLayer.id, { textAlign: event.target.value as ArtworkLayer["textAlign"] })}>{activeTextTypography?.allowedTextAlignments.map((alignment) => <option key={alignment} value={alignment}>{alignment[0].toUpperCase() + alignment.slice(1)}</option>)}</select></label>
                </div>
                <button type="button" className={styles.fitTextButton} disabled={!activePolicy?.text.permissions.font && activeTextTypography?.fontSizeConfigured} onClick={() => fitTextToBox(selectedLayer)}>Fit text inside selected area</button>
              </>
            )}
            {selectedLayer.type === "image" && (
              <div className={styles.imageControls}>
                <label><span>Image fit</span><select value={selectedLayer.imageFit ?? "contain"} disabled={!activePolicy?.image.permissions.resize} onChange={(event) => updateLayer(selectedLayer.id, { imageFit: event.target.value as ArtworkLayer["imageFit"] })}><option value="contain">Contain (no crop)</option>{activePolicy?.image.allowCrop && <option value="cover">Cover (fill area)</option>}<option value="stretch">Stretch to size</option></select></label>
                <label className={styles.aspectToggle}><input type="checkbox" checked={selectedLayer.aspectLocked !== false} disabled={!activePolicy?.image.permissions.resize} onChange={(event) => updateLayer(selectedLayer.id, { aspectLocked: event.target.checked })} /><span>Keep image proportions while resizing</span></label>
                {activePolicy?.image.permissions.move && activePolicy.image.permissions.resize && <div className={styles.imageActions}><button type="button" onClick={() => fitImageToPrintArea(selectedLayer, false)}>Fit print area</button>{activePolicy.image.allowCrop && <button type="button" onClick={() => fitImageToPrintArea(selectedLayer, true)}>Fill print area</button>}</div>}
                <button type="button" disabled={!uploads.supported} onClick={() => { replacementImageId.current = selectedLayer.id; fileInput.current?.click(); }}>Replace image</button>
              </div>
            )}
            <div className={styles.iconActions}>
              <button type="button" disabled={!selectedPolicy?.permissions.move} onClick={() => updateLayer(selectedLayer.id, { x: printableBounds.x + (printableBounds.width - selectedLayer.width) / 2 })} title="Centre horizontally"><AlignCenterHorizontal /></button>
              <button type="button" disabled={!selectedPolicy?.permissions.move} onClick={() => updateLayer(selectedLayer.id, { y: printableBounds.y + (printableBounds.height - selectedLayer.height) / 2 })} title="Centre vertically"><AlignCenterVertical /></button>
              <button type="button" onClick={() => reorder(true)} title="Bring to front"><BringToFront /></button>
              <button type="button" onClick={() => reorder(false)} disabled={selectedLayer.type === "text"} title={selectedLayer.type === "text" ? "Text stays on the front of the poster" : "Send to back"}><SendToBack /></button>
              <button type="button" onClick={duplicateSelected} disabled={selectedLayer.id === "personalization-name" || !canAddArtworkLayer(document, activeSurface.id, selectedLayer.type, policy)} title={selectedLayer.id === "personalization-name" ? "Required name cannot be duplicated" : "Duplicate"}><Copy /></button>
              <button type="button" onClick={deleteSelected} disabled={selectedLayer.id === "personalization-name"} title={selectedLayer.id === "personalization-name" ? "Required name cannot be deleted" : "Delete"}><Trash2 /></button>
            </div>
          </div>
        )}
        {!studio && <p className={styles.productionNote}>{physicalWidthMm && physicalHeightMm ? `Resolution checks use ${physicalWidthMm} x ${physicalHeightMm} mm at ${targetDpi} DPI. ` : "Physical output dimensions are not configured. "}Allowed images are stored privately and remain subject to production, rights and artwork review.</p>}
        {footer}
      </aside>
    </section>
  );
}
