import type {
  ArtworkDocumentSnapshot,
  ArtworkEditPermissions,
  ArtworkGeometry,
  ArtworkGeometryPolicy,
  ArtworkImageMimeType,
  ArtworkLayerSnapshot,
  ArtworkSurfacePolicy,
  Product,
  ProductArtworkPolicy,
} from "./types";
import { resolveArtworkTextTypography } from "./artwork-text-policy";

export type ArtworkPolicyIssueCode =
  | "ACTIVE_SURFACE_NOT_ALLOWED"
  | "SURFACE_NOT_ALLOWED"
  | "MAX_ELEMENTS_EXCEEDED"
  | "LAYER_TYPE_NOT_ALLOWED"
  | "LAYER_PROPERTY_LOCKED"
  | "SIZE_OUT_OF_RANGE"
  | "ROTATION_OUT_OF_RANGE"
  | "GEOMETRY_OUT_OF_BOUNDS"
  | "REQUIRED_IMAGE_MISSING"
  | "IMAGE_COUNT_EXCEEDED"
  | "IMAGE_SOURCE_INVALID"
  | "IMAGE_MIME_NOT_ALLOWED"
  | "IMAGE_BYTES_EXCEEDED";

export interface ArtworkPolicyIssue {
  code: ArtworkPolicyIssueCode;
  message: string;
  surfaceId?: string;
  layerId?: string;
  property?: "position" | "size" | "rotation" | "color" | "font";
}

const EDITABLE: ArtworkEditPermissions = {
  move: true,
  resize: true,
  rotate: true,
  color: true,
  font: true,
};

const IMAGE_EDITABLE: ArtworkEditPermissions = {
  ...EDITABLE,
  color: false,
  font: false,
};

function surfaceCoordinateSpace(
  product: Product,
  surface: NonNullable<Product["configurator"]>["printAreas"][number],
) {
  const designKey = product.artwork.toLowerCase();
  const fallbackRatio = designKey.includes("pencil")
    ? 6
    : designKey.includes("notebook")
      ? 148 / 210
      : designKey.includes("geometry-box")
        ? 2.5
        : 5 / 3;
  const physicalWidth = surface.widthMm;
  const physicalHeight = surface.heightMm;
  const ratio = physicalWidth && physicalHeight ? physicalWidth / physicalHeight : fallbackRatio;
  const width = ratio >= 1 ? 600 : Math.max(240, Math.round(600 * ratio));
  const height = ratio >= 1 ? Math.max(180, Math.round(600 / ratio)) : 600;
  const safeInset = surface.safeInsetMm && physicalWidth && physicalHeight
    ? Math.max(8, Math.round(Math.min(width * (surface.safeInsetMm / physicalWidth), height * (surface.safeInsetMm / physicalHeight))))
    : Math.max(18, Math.round(Math.min(width, height) * 0.09));
  return { width, height, safeInset };
}

function defaultGeometryPolicy(
  defaultGeometry: ArtworkGeometry,
  printableWidth: number,
  printableHeight: number,
): ArtworkGeometryPolicy {
  return {
    default: defaultGeometry,
    minimumWidth: Math.min(20, printableWidth),
    maximumWidth: printableWidth,
    minimumHeight: Math.min(20, printableHeight),
    maximumHeight: printableHeight,
    minimumRotation: -180,
    maximumRotation: 180,
  };
}

function legacySurfacePolicy(product: Product, surface: NonNullable<Product["configurator"]>["printAreas"][number]): ArtworkSurfacePolicy {
  const { width, height, safeInset } = surfaceCoordinateSpace(product, surface);
  // A catalog-defined physical inset is authoritative. The editor's visual fallback
  // inset remains advisory so legacy snapshots keep their original full-canvas bounds.
  const printableInset = surface.safeInsetMm && surface.widthMm && surface.heightMm ? safeInset : 0;
  const printableWidth = Math.max(1, width - printableInset * 2);
  const printableHeight = Math.max(1, height - printableInset * 2);
  const textDefault = {
    x: width * 0.2,
    y: height * 0.4,
    width: width * 0.6,
    height: Math.min(70, height * 0.2),
    rotation: 0,
  };
  const imageWidth = Math.min(printableWidth, width * 0.42);
  const imageHeight = Math.min(printableHeight, imageWidth);
  const upload = product.configurator?.artworkUpload;
  const allowedMimeTypes = upload?.enabled
    ? upload.acceptedMimeTypes.filter((mimeType): mimeType is ArtworkImageMimeType =>
        mimeType === "image/jpeg" || mimeType === "image/png" || mimeType === "image/webp")
    : [];
  const imageUploadEnabled = Boolean(upload?.enabled && allowedMimeTypes.length && upload.maximumBytes > 0);

  return {
    id: surface.id,
    label: surface.label,
    coordinateSpace: { width, height },
    printableBounds: {
      x: printableInset,
      y: printableInset,
      width: printableWidth,
      height: printableHeight,
    },
    text: {
      enabled: true,
      maximumElements: 100,
      permissions: { ...EDITABLE },
      geometry: defaultGeometryPolicy(textDefault, printableWidth, printableHeight),
      defaultColor: "#17324d",
      allowedColors: [],
      defaultFontFamily: "rounded",
      allowedFontFamilies: ["sans", "serif", "rounded"],
      defaultFontSize: Math.max(8, Math.min(180, textDefault.height * 0.64)),
      minimumFontSize: 8,
      maximumFontSize: 180,
      defaultTextAlign: "center",
      allowedTextAlignments: ["left", "center", "right"],
    },
    image: {
      enabled: imageUploadEnabled,
      required: false,
      maximumElements: imageUploadEnabled ? 1 : 0,
      permissions: { ...IMAGE_EDITABLE },
      geometry: defaultGeometryPolicy({
        x: (width - imageWidth) / 2,
        y: (height - imageHeight) / 2,
        width: imageWidth,
        height: imageHeight,
        rotation: 0,
      }, printableWidth, printableHeight),
      allowedMimeTypes,
      maximumBytes: imageUploadEnabled ? upload?.maximumBytes ?? 0 : 0,
      minimumSourceWidth: 1,
      maximumSourceWidth: 50_000,
      minimumSourceHeight: 1,
      maximumSourceHeight: 50_000,
      allowedAspectRatios: [],
      aspectRatioTolerance: 0.01,
      allowTransparency: true,
      allowCrop: true,
      approvalRequired: false,
      chargePerImagePaise: 0,
    },
  };
}

/** Resolves a complete policy while keeping products without one compatible with the existing editor. */
export function resolveProductArtworkPolicy(product: Product): ProductArtworkPolicy {
  if (product.configurator?.artworkPolicy) return product.configurator.artworkPolicy;
  const surfaces = product.configurator?.printAreas?.length
    ? product.configurator.printAreas
    : [{ id: "primary", label: "Primary print area" }];
  return {
    maximumElements: 100,
    surfaces: surfaces.map((surface) => legacySurfacePolicy(product, surface)),
  };
}

function geometryInsideBounds(layer: ArtworkLayerSnapshot, surface: ArtworkSurfacePolicy) {
  const radians = layer.rotation * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const centerX = layer.x + layer.width / 2;
  const centerY = layer.y + layer.height / 2;
  const halfWidth = layer.width / 2;
  const halfHeight = layer.height / 2;
  const bounds = surface.printableBounds;
  const maximumX = bounds.x + bounds.width;
  const maximumY = bounds.y + bounds.height;
  const epsilon = 1e-7;
  return [
    [-halfWidth, -halfHeight],
    [halfWidth, -halfHeight],
    [halfWidth, halfHeight],
    [-halfWidth, halfHeight],
  ].every(([offsetX, offsetY]) => {
    const x = centerX + offsetX * cosine - offsetY * sine;
    const y = centerY + offsetX * sine + offsetY * cosine;
    return x >= bounds.x - epsilon && y >= bounds.y - epsilon && x <= maximumX + epsilon && y <= maximumY + epsilon;
  });
}

export function inspectArtworkImageDataUrl(source: string): { mimeType: ArtworkImageMimeType; bytes: number } | undefined {
  const match = source.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match || match[2].length % 4 !== 0) return undefined;
  const mimeType = match[1] as ArtworkImageMimeType;
  let prefix: string;
  try {
    prefix = globalThis.atob(match[2].slice(0, 24));
  } catch {
    return undefined;
  }
  const genuine = mimeType === "image/png"
    ? prefix.charCodeAt(0) === 0x89 && prefix.slice(1, 4) === "PNG"
    : mimeType === "image/jpeg"
      ? prefix.charCodeAt(0) === 0xff && prefix.charCodeAt(1) === 0xd8 && prefix.charCodeAt(2) === 0xff
      : prefix.slice(0, 4) === "RIFF" && prefix.slice(8, 12) === "WEBP";
  if (!genuine) return undefined;
  const padding = match[2].endsWith("==") ? 2 : match[2].endsWith("=") ? 1 : 0;
  return { mimeType, bytes: match[2].length / 4 * 3 - padding };
}

function validateGeometry(
  layer: ArtworkLayerSnapshot,
  surface: ArtworkSurfacePolicy,
  issues: ArtworkPolicyIssue[],
) {
  const layerPolicy = layer.type === "text" ? surface.text : surface.image;
  const { geometry, permissions } = layerPolicy;
  if (!permissions.move && (layer.x !== geometry.default.x || layer.y !== geometry.default.y)) {
    issues.push({ code: "LAYER_PROPERTY_LOCKED", message: `${layer.name} position is locked.`, surfaceId: surface.id, layerId: layer.id, property: "position" });
  }
  if (!permissions.resize && (layer.width !== geometry.default.width || layer.height !== geometry.default.height)) {
    issues.push({ code: "LAYER_PROPERTY_LOCKED", message: `${layer.name} size is locked.`, surfaceId: surface.id, layerId: layer.id, property: "size" });
  }
  if (!permissions.rotate && layer.rotation !== geometry.default.rotation) {
    issues.push({ code: "LAYER_PROPERTY_LOCKED", message: `${layer.name} rotation is locked.`, surfaceId: surface.id, layerId: layer.id, property: "rotation" });
  }
  if (
    layer.width < geometry.minimumWidth ||
    layer.width > geometry.maximumWidth ||
    layer.height < geometry.minimumHeight ||
    layer.height > geometry.maximumHeight
  ) {
    issues.push({ code: "SIZE_OUT_OF_RANGE", message: `${layer.name} size is outside the configured range.`, surfaceId: surface.id, layerId: layer.id });
  }
  if (layer.rotation < geometry.minimumRotation || layer.rotation > geometry.maximumRotation) {
    issues.push({ code: "ROTATION_OUT_OF_RANGE", message: `${layer.name} rotation is outside the configured range.`, surfaceId: surface.id, layerId: layer.id });
  }
  if (!geometryInsideBounds(layer, surface)) {
    issues.push({ code: "GEOMETRY_OUT_OF_BOUNDS", message: `${layer.name} must remain inside the printable area.`, surfaceId: surface.id, layerId: layer.id });
  }
}

/** Pure validation of a saved artwork snapshot against its authoritative product policy. */
export function validateArtworkDocumentPolicy(
  document: ArtworkDocumentSnapshot,
  policy: ProductArtworkPolicy,
): ArtworkPolicyIssue[] {
  const issues: ArtworkPolicyIssue[] = [];
  const policyBySurface = new Map(policy.surfaces.map((surface) => [surface.id, surface]));
  if (!policyBySurface.has(document.activeSurfaceId)) {
    issues.push({ code: "ACTIVE_SURFACE_NOT_ALLOWED", message: "The active surface is not available for this product.", surfaceId: document.activeSurfaceId });
  }
  const layerCount = document.surfaces.reduce((total, surface) => total + surface.layers.length, 0);
  if (layerCount > policy.maximumElements) {
    issues.push({ code: "MAX_ELEMENTS_EXCEEDED", message: `Artwork can contain at most ${policy.maximumElements} elements.` });
  }

  for (const surface of policy.surfaces) {
    if (!surface.image.enabled || !surface.image.required) continue;
    const submittedSurface = document.surfaces.find((candidate) => candidate.id === surface.id);
    if (!submittedSurface?.layers.some((layer) => layer.type === "image")) {
      issues.push({
        code: "REQUIRED_IMAGE_MISSING",
        message: `${surface.label} requires an uploaded image.`,
        surfaceId: surface.id,
      });
    }
  }

  for (const documentSurface of document.surfaces) {
    const surface = policyBySurface.get(documentSurface.id);
    if (!surface) {
      issues.push({ code: "SURFACE_NOT_ALLOWED", message: "The artwork uses a surface that is not available for this product.", surfaceId: documentSurface.id });
      continue;
    }
    const textLayers = documentSurface.layers.filter((layer) => layer.type === "text");
    const imageLayers = documentSurface.layers.filter((layer) => layer.type === "image");
    if (surface.text.enabled && textLayers.length > surface.text.maximumElements) {
      issues.push({ code: "MAX_ELEMENTS_EXCEEDED", message: `${surface.label} can contain at most ${surface.text.maximumElements} text elements.`, surfaceId: surface.id });
    }
    if (surface.image.enabled && imageLayers.length > surface.image.maximumElements) {
      issues.push({ code: "IMAGE_COUNT_EXCEEDED", message: `${surface.label} can contain at most ${surface.image.maximumElements} images.`, surfaceId: surface.id });
    }

    for (const layer of documentSurface.layers) {
      if (layer.type !== "text" && layer.type !== "image") {
        issues.push({ code: "LAYER_TYPE_NOT_ALLOWED", message: "The artwork contains an unsupported layer type.", surfaceId: surface.id, layerId: (layer as { id?: string }).id });
        continue;
      }
      const layerPolicy = layer.type === "text" ? surface.text : surface.image;
      if (!layerPolicy.enabled) {
        issues.push({ code: "LAYER_TYPE_NOT_ALLOWED", message: `${layer.type === "text" ? "Text" : "Image"} layers are not available on ${surface.label}.`, surfaceId: surface.id, layerId: layer.id });
        continue;
      }
      validateGeometry(layer, surface, issues);
      if (layer.type === "text") {
        const typography = resolveArtworkTextTypography(surface.text);
        const textAlign = layer.textAlign ?? "center";
        if (!surface.text.permissions.color && layer.color !== surface.text.defaultColor) {
          issues.push({ code: "LAYER_PROPERTY_LOCKED", message: `${layer.name} colour is locked.`, surfaceId: surface.id, layerId: layer.id, property: "color" });
        } else if (surface.text.allowedColors.length && !surface.text.allowedColors.includes(layer.color)) {
          issues.push({ code: "LAYER_PROPERTY_LOCKED", message: `${layer.name} uses a colour that is not available.`, surfaceId: surface.id, layerId: layer.id, property: "color" });
        }
        if (!surface.text.permissions.font && layer.fontFamily !== surface.text.defaultFontFamily) {
          issues.push({ code: "LAYER_PROPERTY_LOCKED", message: `${layer.name} font is locked.`, surfaceId: surface.id, layerId: layer.id, property: "font" });
        } else if (surface.text.allowedFontFamilies.length && !surface.text.allowedFontFamilies.includes(layer.fontFamily)) {
          issues.push({ code: "LAYER_PROPERTY_LOCKED", message: `${layer.name} uses a font that is not available.`, surfaceId: surface.id, layerId: layer.id, property: "font" });
        }
        if (typography.fontSizeConfigured && !surface.text.permissions.font && layer.fontSize !== typography.defaultFontSize) {
          issues.push({ code: "LAYER_PROPERTY_LOCKED", message: `${layer.name} font size is locked.`, surfaceId: surface.id, layerId: layer.id, property: "font" });
        } else if (typography.fontSizeConfigured && (layer.fontSize < typography.minimumFontSize || layer.fontSize > typography.maximumFontSize)) {
          issues.push({ code: "SIZE_OUT_OF_RANGE", message: `${layer.name} font size is outside the configured range.`, surfaceId: surface.id, layerId: layer.id, property: "font" });
        }
        if (typography.alignmentConfigured && !surface.text.permissions.font && textAlign !== typography.defaultTextAlign) {
          issues.push({ code: "LAYER_PROPERTY_LOCKED", message: `${layer.name} alignment is locked.`, surfaceId: surface.id, layerId: layer.id, property: "font" });
        } else if (typography.alignmentConfigured && !typography.allowedTextAlignments.includes(textAlign)) {
          issues.push({ code: "LAYER_PROPERTY_LOCKED", message: `${layer.name} uses an alignment that is not available.`, surfaceId: surface.id, layerId: layer.id, property: "font" });
        }
      } else {
        const details = layer.asset
          ? { mimeType: layer.asset.mimeType, bytes: layer.asset.sizeBytes }
          : layer.src
            ? inspectArtworkImageDataUrl(layer.src)
            : undefined;
        if (!details) {
          issues.push({ code: "IMAGE_SOURCE_INVALID", message: `${layer.name} needs a valid preview or persisted asset reference.`, surfaceId: surface.id, layerId: layer.id });
        } else {
          if (!surface.image.allowedMimeTypes.includes(details.mimeType)) {
            issues.push({ code: "IMAGE_MIME_NOT_ALLOWED", message: `${details.mimeType} images are not available for this product.`, surfaceId: surface.id, layerId: layer.id });
          }
          if (details.bytes > surface.image.maximumBytes) {
            issues.push({ code: "IMAGE_BYTES_EXCEEDED", message: `${layer.name} exceeds the configured image size limit.`, surfaceId: surface.id, layerId: layer.id });
          }
        }
        const sourceWidth = layer.asset?.width ?? layer.sourceWidth;
        const sourceHeight = layer.asset?.height ?? layer.sourceHeight;
        if (
          sourceWidth < surface.image.minimumSourceWidth ||
          sourceWidth > surface.image.maximumSourceWidth ||
          sourceHeight < surface.image.minimumSourceHeight ||
          sourceHeight > surface.image.maximumSourceHeight
        ) {
          issues.push({ code: "SIZE_OUT_OF_RANGE", message: `${layer.name} source dimensions are outside the configured range.`, surfaceId: surface.id, layerId: layer.id });
        }
        const sourceRatio = sourceWidth / sourceHeight;
        if (
          surface.image.allowedAspectRatios.length > 0 &&
          !surface.image.allowedAspectRatios.some((ratio) => Math.abs(sourceRatio - ratio) <= surface.image.aspectRatioTolerance)
        ) {
          issues.push({ code: "SIZE_OUT_OF_RANGE", message: `${layer.name} aspect ratio is not available for this product.`, surfaceId: surface.id, layerId: layer.id });
        }
        if (!surface.image.allowTransparency && layer.asset?.hasTransparency === true) {
          issues.push({ code: "LAYER_PROPERTY_LOCKED", message: `${layer.name} cannot contain transparency.`, surfaceId: surface.id, layerId: layer.id });
        }
        if (!surface.image.allowCrop && layer.imageFit === "cover") {
          issues.push({ code: "LAYER_PROPERTY_LOCKED", message: `${layer.name} cannot be cropped.`, surfaceId: surface.id, layerId: layer.id, property: "size" });
        }
      }
    }
  }
  return issues;
}
