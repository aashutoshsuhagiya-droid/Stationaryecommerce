import type {
  ArtworkImageAssetReference,
  ArtworkImageMimeType,
  ArtworkSurfacePolicy,
  ProductArtworkPolicy,
} from "../../lib/types";
import { resolveArtworkTextTypography } from "../../lib/artwork-text-policy";

export type ArtworkLayerType = "text" | "image";

export function sniffArtworkImageMime(bytes: Uint8Array): ArtworkImageMimeType | undefined {
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.every((value, index) => bytes[index] === value)) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) return "image/webp";
  return undefined;
}

export interface ArtworkLayer {
  id: string;
  type: ArtworkLayerType;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  text?: string;
  src?: string;
  asset?: ArtworkImageAssetReference;
  color?: string;
  fontSize?: number;
  fontFamily?: "sans" | "serif" | "rounded";
  textAlign?: "left" | "center" | "right";
  sourceWidth?: number;
  sourceHeight?: number;
  imageFit?: "contain" | "cover" | "stretch";
  aspectLocked?: boolean;
}

export interface ArtworkSurface {
  id: string;
  label: string;
  layers: ArtworkLayer[];
}

export interface ArtworkDocument {
  version: 1;
  activeSurfaceId: string;
  surfaces: ArtworkSurface[];
  updatedAt: string;
}

export interface PrintableSurfaceDefinition {
  id: string;
  label: string;
  width: number;
  height: number;
  safeInset: number;
  physicalWidthMm?: number;
  physicalHeightMm?: number;
  targetDpi?: number;
}

export function createArtworkDocument(surfaces: PrintableSurfaceDefinition[]): ArtworkDocument {
  const first = surfaces[0] ?? {
    id: "front",
    label: "Front",
    width: 600,
    height: 360,
    safeInset: 32,
  };

  return {
    version: 1,
    activeSurfaceId: first.id,
    surfaces: (surfaces.length ? surfaces : [first]).map((surface) => ({
      id: surface.id,
      label: surface.label,
      layers: [],
    })),
    updatedAt: new Date().toISOString(),
  };
}

export function keepArtworkLayerInForeground(document: ArtworkDocument, layerId: string): ArtworkDocument {
  let changed = false;
  const surfaces = document.surfaces.map((surface) => {
      const foregroundLayer = surface.layers.find((layer) => layer.id === layerId);
      if (!foregroundLayer || surface.layers.at(-1)?.id === foregroundLayer.id) return surface;
      changed = true;
      return {
        ...surface,
        layers: [
          ...surface.layers.filter((layer) => layer.id !== foregroundLayer.id),
          foregroundLayer,
        ],
      };
    });
  return changed ? { ...document, surfaces } : document;
}

export function insertArtworkBelowText(layers: ArtworkLayer[], layer: ArtworkLayer) {
  const firstTextIndex = layers.findIndex((candidate) => candidate.type === "text");
  return firstTextIndex < 0
    ? [...layers, layer]
    : [...layers.slice(0, firstTextIndex), layer, ...layers.slice(firstTextIndex)];
}

export function getArtworkLayersInRenderOrder(layers: ArtworkLayer[]) {
  return [
    ...layers.filter((layer) => layer.type === "image"),
    ...layers.filter((layer) => layer.type === "text"),
  ];
}

export function removePreviewImageLayers(document: ArtworkDocument): ArtworkDocument {
  let changed = false;
  const surfaces = document.surfaces.map((surface) => {
    const layers = surface.layers.flatMap((layer) => {
      if (layer.type !== "image") return [layer];
      if (!layer.asset) {
        changed = true;
        return [];
      }
      if (!layer.src) return [layer];
      const { src: _preview, ...persistedLayer } = layer;
      changed = true;
      return [persistedLayer];
    });
    if (!changed && layers.length === surface.layers.length) return surface;
    return { ...surface, layers };
  });
  return changed ? { ...document, surfaces } : document;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum));
}

function layerWithinRotatedBounds(layer: ArtworkLayer, surface: ArtworkSurfacePolicy) {
  const radians = layer.rotation * Math.PI / 180;
  const halfWidth = (Math.abs(Math.cos(radians)) * layer.width + Math.abs(Math.sin(radians)) * layer.height) / 2;
  const halfHeight = (Math.abs(Math.sin(radians)) * layer.width + Math.abs(Math.cos(radians)) * layer.height) / 2;
  const bounds = surface.printableBounds;
  return {
    halfWidth,
    halfHeight,
    fits: halfWidth * 2 <= bounds.width && halfHeight * 2 <= bounds.height,
  };
}

function layerGeometryIsInsideBounds(layer: ArtworkLayer, surface: ArtworkSurfacePolicy) {
  const extents = layerWithinRotatedBounds(layer, surface);
  const centerX = layer.x + layer.width / 2;
  const centerY = layer.y + layer.height / 2;
  const bounds = surface.printableBounds;
  return extents.fits &&
    centerX - extents.halfWidth >= bounds.x &&
    centerY - extents.halfHeight >= bounds.y &&
    centerX + extents.halfWidth <= bounds.x + bounds.width &&
    centerY + extents.halfHeight <= bounds.y + bounds.height;
}

/** Applies admin geometry and edit locks before an editor mutation is committed. */
export function constrainArtworkLayerToPolicy(
  layer: ArtworkLayer,
  surface: ArtworkSurfacePolicy,
): ArtworkLayer {
  const layerPolicy = layer.type === "text" ? surface.text : surface.image;
  const { geometry, permissions } = layerPolicy;
  const defaults = geometry.default;
  const next: ArtworkLayer = {
    ...layer,
    x: permissions.move ? layer.x : defaults.x,
    y: permissions.move ? layer.y : defaults.y,
    width: permissions.resize ? layer.width : defaults.width,
    height: permissions.resize ? layer.height : defaults.height,
    rotation: permissions.rotate ? layer.rotation : defaults.rotation,
  };

  next.width = clamp(next.width, geometry.minimumWidth, Math.min(geometry.maximumWidth, surface.printableBounds.width));
  next.height = clamp(next.height, geometry.minimumHeight, Math.min(geometry.maximumHeight, surface.printableBounds.height));
  next.rotation = clamp(next.rotation, geometry.minimumRotation, geometry.maximumRotation);

  if (next.type === "text") {
    const typography = resolveArtworkTextTypography(surface.text);
    if (!permissions.color) next.color = surface.text.defaultColor;
    if (surface.text.allowedColors.length && !surface.text.allowedColors.includes(next.color ?? "")) {
      next.color = surface.text.defaultColor;
    }
    if (!permissions.font) next.fontFamily = surface.text.defaultFontFamily;
    if (surface.text.allowedFontFamilies.length && !surface.text.allowedFontFamilies.includes(next.fontFamily ?? "rounded")) {
      next.fontFamily = surface.text.defaultFontFamily;
    }
    next.fontSize = !permissions.font && typography.fontSizeConfigured
      ? typography.defaultFontSize
      : clamp(next.fontSize ?? typography.defaultFontSize, typography.minimumFontSize, typography.maximumFontSize);
    next.textAlign = !permissions.font && typography.alignmentConfigured
      ? typography.defaultTextAlign
      : typography.allowedTextAlignments.includes(next.textAlign ?? typography.defaultTextAlign)
        ? next.textAlign ?? typography.defaultTextAlign
        : typography.defaultTextAlign;
  } else if (!surface.image.allowTransparency) {
    next.opacity = 1;
  }

  let extents = layerWithinRotatedBounds(next, surface);
  if (!extents.fits) {
    const scale = Math.min(
      surface.printableBounds.width / (extents.halfWidth * 2),
      surface.printableBounds.height / (extents.halfHeight * 2),
    );
    const scaledWidth = next.width * scale;
    const scaledHeight = next.height * scale;
    if (scaledWidth >= geometry.minimumWidth && scaledHeight >= geometry.minimumHeight) {
      next.width = scaledWidth;
      next.height = scaledHeight;
    } else {
      next.x = defaults.x;
      next.y = defaults.y;
      next.width = defaults.width;
      next.height = defaults.height;
      next.rotation = defaults.rotation;
    }
    extents = layerWithinRotatedBounds(next, surface);
  }

  const bounds = surface.printableBounds;
  const centerX = clamp(next.x + next.width / 2, bounds.x + extents.halfWidth, bounds.x + bounds.width - extents.halfWidth);
  const centerY = clamp(next.y + next.height / 2, bounds.y + extents.halfHeight, bounds.y + bounds.height - extents.halfHeight);
  next.x = centerX - next.width / 2;
  next.y = centerY - next.height / 2;
  if (!permissions.move) {
    next.x = defaults.x;
    next.y = defaults.y;
  }
  if (!permissions.resize) {
    next.width = defaults.width;
    next.height = defaults.height;
  }
  if (!permissions.rotate) next.rotation = defaults.rotation;
  if (!layerGeometryIsInsideBounds(next, surface)) {
    next.x = defaults.x;
    next.y = defaults.y;
    next.width = defaults.width;
    next.height = defaults.height;
    next.rotation = defaults.rotation;
  }
  return next;
}

export function canAddArtworkLayer(
  document: ArtworkDocument,
  surfaceId: string,
  type: ArtworkLayerType,
  policy: ProductArtworkPolicy,
) {
  const surfacePolicy = policy.surfaces.find((surface) => surface.id === surfaceId);
  const surface = document.surfaces.find((candidate) => candidate.id === surfaceId);
  if (!surfacePolicy || !surface) return false;
  const layerPolicy = type === "text" ? surfacePolicy.text : surfacePolicy.image;
  if (!layerPolicy.enabled) return false;
  const total = document.surfaces.reduce((count, candidate) => count + candidate.layers.length, 0);
  const perType = surface.layers.filter((layer) => layer.type === type).length;
  return total < policy.maximumElements && perType < layerPolicy.maximumElements;
}

function imageLayerMatchesPolicy(layer: ArtworkLayer, surface: ArtworkSurfacePolicy) {
  if (layer.type !== "image") return true;
  const imagePolicy = surface.image;
  const mimeType = layer.asset?.mimeType ?? layer.src?.match(/^data:(image\/(?:jpeg|png|webp));base64,/)?.[1];
  const encoded = layer.src?.split(",", 2)[1];
  const padding = encoded?.endsWith("==") ? 2 : encoded?.endsWith("=") ? 1 : 0;
  const bytes = layer.asset?.sizeBytes ?? (encoded ? encoded.length / 4 * 3 - padding : undefined);
  const width = layer.asset?.width ?? layer.sourceWidth;
  const height = layer.asset?.height ?? layer.sourceHeight;
  if (!mimeType || !imagePolicy.allowedMimeTypes.includes(mimeType as ArtworkImageAssetReference["mimeType"])) return false;
  if (!bytes || bytes > imagePolicy.maximumBytes || !width || !height) return false;
  if (width < imagePolicy.minimumSourceWidth || width > imagePolicy.maximumSourceWidth) return false;
  if (height < imagePolicy.minimumSourceHeight || height > imagePolicy.maximumSourceHeight) return false;
  if (!imagePolicy.allowTransparency && layer.asset?.hasTransparency === true) return false;
  if (!imagePolicy.allowCrop && layer.imageFit === "cover") return false;
  const ratio = width / height;
  return !imagePolicy.allowedAspectRatios.length || imagePolicy.allowedAspectRatios.some(
    (allowed) => Math.abs(allowed - ratio) <= imagePolicy.aspectRatioTolerance,
  );
}

/** Removes surfaces and layers which are not allowed by the current product policy. */
export function normalizeArtworkDocumentToPolicy(
  document: ArtworkDocument,
  policy: ProductArtworkPolicy,
): ArtworkDocument {
  let remaining = policy.maximumElements;
  const surfaces = policy.surfaces.map((surfacePolicy) => {
    const existing = document.surfaces.find((surface) => surface.id === surfacePolicy.id);
    let textRemaining = surfacePolicy.text.enabled ? surfacePolicy.text.maximumElements : 0;
    let imageRemaining = surfacePolicy.image.enabled ? surfacePolicy.image.maximumElements : 0;
    const layers = (existing?.layers ?? []).flatMap((layer) => {
      if (remaining <= 0) return [];
      if (layer.type === "text") {
        if (textRemaining <= 0) return [];
        textRemaining -= 1;
      } else {
        if (imageRemaining <= 0 || !imageLayerMatchesPolicy(layer, surfacePolicy)) return [];
        imageRemaining -= 1;
      }
      remaining -= 1;
      return [constrainArtworkLayerToPolicy(layer, surfacePolicy)];
    });
    return { id: surfacePolicy.id, label: surfacePolicy.label, layers };
  });
  const activeSurfaceId = policy.surfaces.some((surface) => surface.id === document.activeSurfaceId)
    ? document.activeSurfaceId
    : policy.surfaces[0]?.id ?? document.activeSurfaceId;
  return { ...document, activeSurfaceId, surfaces };
}
