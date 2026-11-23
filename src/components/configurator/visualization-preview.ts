import type { ProductVisualizationTemplate } from "../../lib/types";
import type {
  ArtworkDocument,
  ArtworkLayer,
  ArtworkSurface,
  PrintableSurfaceDefinition,
} from "./artwork-types";

const semanticRoles = new Set([
  "front",
  "back",
  "left",
  "right",
  "top",
  "bottom",
  "wrap",
  "gusset",
]);

function normalizedId(value: string) {
  return value.trim().toLowerCase();
}

function positiveDimension(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function uniquePreviewId(
  preferred: string,
  fallback: string,
  usedIds: Set<string>,
  index: number,
) {
  const candidates = [preferred, fallback, `${fallback}-${index + 1}`];
  for (const candidate of candidates) {
    const normalized = normalizedId(candidate);
    if (normalized && !usedIds.has(normalized)) {
      usedIds.add(normalized);
      return candidate;
    }
  }
  let suffix = index + 2;
  while (usedIds.has(normalizedId(`${fallback}-${suffix}`))) suffix += 1;
  const id = `${fallback}-${suffix}`;
  usedIds.add(normalizedId(id));
  return id;
}

/**
 * Physical size of one model face in mm. `faceDimensionsMm` is the size the 3D
 * model actually renders with (the product's own, or its shelf's); the
 * template's stored size is only the fallback.
 */
function facePhysicalSize(
  visualization: ProductVisualizationTemplate,
  surface: ProductVisualizationTemplate["surfaces"][number],
  faceDimensionsMm?: Readonly<Record<string, number>> | null,
) {
  const dimensions = { ...visualization.dimensionsMm, ...(faceDimensionsMm ?? {}) };
  const width = positiveDimension(dimensions.width, positiveDimension(dimensions.diameter, 100));
  const height = positiveDimension(dimensions.height, 100);
  const depth = positiveDimension(
    dimensions.depth,
    positiveDimension(dimensions.gusset, width * 0.35),
  );
  const diameter = positiveDimension(dimensions.diameter, width);
  let physicalWidthMm = width;
  let physicalHeightMm = height;

  if (surface.role === "left" || surface.role === "right" || surface.role === "gusset") {
    physicalWidthMm = depth;
  } else if (surface.role === "top" || surface.role === "bottom") {
    physicalWidthMm = width;
    physicalHeightMm = depth;
  } else if (surface.role === "wrap") {
    if (visualization.geometryKind === "cylinder") {
      physicalWidthMm = positiveDimension(dimensions.labelWidth, Math.PI * diameter);
      physicalHeightMm = positiveDimension(dimensions.labelHeight, height);
    } else {
      physicalWidthMm = 2 * (width + depth);
    }
  } else if ((surface.role === "inside" || surface.role === "other") && surface.sourceBounds) {
    const sourceWidth = visualization.sourceAsset?.width;
    const sourceHeight = visualization.sourceAsset?.height;
    if (sourceWidth && sourceHeight) {
      physicalWidthMm = surface.sourceBounds.width * sourceWidth;
      physicalHeightMm = surface.sourceBounds.height * sourceHeight;
    }
  }
  return { physicalWidthMm, physicalHeightMm };
}

function syntheticSurfaceDefinition(
  visualization: ProductVisualizationTemplate,
  surface: ProductVisualizationTemplate["surfaces"][number],
  id: string,
  faceDimensionsMm?: Readonly<Record<string, number>> | null,
): PrintableSurfaceDefinition {
  const { physicalWidthMm, physicalHeightMm } = facePhysicalSize(visualization, surface, faceDimensionsMm);
  const longest = Math.max(physicalWidthMm, physicalHeightMm, Number.EPSILON);
  const pixelScale = 600 / longest;
  const previewWidth = Math.max(64, Math.round(physicalWidthMm * pixelScale));
  const previewHeight = Math.max(64, Math.round(physicalHeightMm * pixelScale));
  return {
    id,
    label: surface.label,
    width: previewWidth,
    height: previewHeight,
    safeInset: Math.max(8, Math.round(Math.min(previewWidth, previewHeight) * 0.05)),
    physicalWidthMm,
    physicalHeightMm,
    targetDpi: 300,
  };
}

/**
 * Reshapes an editor surface to the model face it is painted on. The 2D editor's
 * coordinate space is often a generic shape; stretching that canvas over a face
 * of a different aspect squashes the print. The canvas keeps its long edge and
 * takes the face's proportions instead.
 */
function fitDefinitionToFace(
  definition: PrintableSurfaceDefinition,
  face: { physicalWidthMm: number; physicalHeightMm: number },
): PrintableSurfaceDefinition {
  const faceAspect = face.physicalWidthMm / face.physicalHeightMm;
  const currentAspect = definition.width / definition.height;
  const physical = { physicalWidthMm: face.physicalWidthMm, physicalHeightMm: face.physicalHeightMm };
  if (!Number.isFinite(faceAspect) || faceAspect <= 0 || Math.abs(faceAspect - currentAspect) / faceAspect < 0.02) {
    return { ...definition, ...physical };
  }
  const longest = Math.max(definition.width, definition.height);
  const width = faceAspect >= 1 ? longest : Math.max(64, Math.round(longest * faceAspect));
  const height = faceAspect >= 1 ? Math.max(64, Math.round(longest / faceAspect)) : longest;
  return {
    ...definition,
    width,
    height,
    safeInset: Math.max(8, Math.round(Math.min(width, height) * 0.05)),
    ...physical,
  };
}

/** Moves and resizes layer boxes onto a reshaped canvas; glyphs are never stretched. */
function relayout(layers: readonly ArtworkLayer[], scaleX: number, scaleY: number): ArtworkLayer[] {
  if (Math.abs(scaleX - 1) < 1e-6 && Math.abs(scaleY - 1) < 1e-6) return [...layers];
  return layers.map((layer) => ({
    ...layer,
    x: layer.x * scaleX,
    y: layer.y * scaleY,
    width: layer.width * scaleX,
    height: layer.height * scaleY,
  }));
}

interface OriginalSurface {
  id: string;
  definition?: PrintableSurfaceDefinition;
  documentSurface?: ArtworkSurface;
}

/**
 * Builds an ephemeral 3D document that combines storefront artwork with every
 * published visualization panel. The persisted editor document is never mutated.
 */
export function buildVisualization3DPreview(
  document: ArtworkDocument,
  definitions: PrintableSurfaceDefinition[],
  visualization: ProductVisualizationTemplate | undefined,
  /** The size the 3D model renders with, so each texture matches its face. */
  faceDimensionsMm?: Readonly<Record<string, number>> | null,
) {
  const texturedMappings = visualization?.surfaces.filter((surface) => surface.textureUrl) ?? [];
  if (!visualization || !texturedMappings.length) return { document, surfaces: definitions };

  const originalsById = new Map<string, OriginalSurface>();
  const originalOrder: OriginalSurface[] = [];
  const includeOriginal = (id: string) => {
    const key = normalizedId(id);
    let original = originalsById.get(key);
    if (!original) {
      original = { id };
      originalsById.set(key, original);
      originalOrder.push(original);
    }
    return original;
  };
  for (const definition of definitions) includeOriginal(definition.id).definition = definition;
  for (const surface of document.surfaces) includeOriginal(surface.id).documentSurface = surface;

  const assignedOriginals = new Map<number, OriginalSurface>();
  const claimedOriginalIds = new Set<string>();
  texturedMappings.forEach((mapping, index) => {
    const exact = originalsById.get(normalizedId(mapping.surfaceId));
    if (!exact) return;
    assignedOriginals.set(index, exact);
    claimedOriginalIds.add(normalizedId(exact.id));
  });
  texturedMappings.forEach((_mapping, index) => {
    if (assignedOriginals.has(index)) return;
    const fallback = originalOrder.find((candidate) => !claimedOriginalIds.has(normalizedId(candidate.id)));
    if (!fallback) return;
    assignedOriginals.set(index, fallback);
    claimedOriginalIds.add(normalizedId(fallback.id));
  });

  const usedPreviewIds = new Set<string>();
  const sourceToPreviewId = new Map<string, string>();
  const previewDefinitions: PrintableSurfaceDefinition[] = [];
  const previewDocumentSurfaces: ArtworkSurface[] = [];

  texturedMappings.forEach((mapping, index) => {
    const original = assignedOriginals.get(index);
    const roleId = semanticRoles.has(mapping.role) ? mapping.role : mapping.surfaceId;
    const previewId = uniquePreviewId(roleId, mapping.surfaceId, usedPreviewIds, index);
    if (original) sourceToPreviewId.set(normalizedId(original.id), previewId);

    const definition = original?.definition
      ? fitDefinitionToFace(
          { ...original.definition, id: previewId, label: mapping.label },
          facePhysicalSize(visualization, mapping, faceDimensionsMm),
        )
      : syntheticSurfaceDefinition(visualization, mapping, previewId, faceDimensionsMm);
    const scaleX = original?.definition ? definition.width / original.definition.width : 1;
    const scaleY = original?.definition ? definition.height / original.definition.height : 1;
    const baseLayerId = `visualization-base-${visualization.id}-${mapping.surfaceId}`;
    previewDefinitions.push(definition);
    previewDocumentSurfaces.push({
      id: previewId,
      label: mapping.label,
      layers: [
        {
          id: baseLayerId,
          type: "image",
          name: `${visualization.name} base artwork`,
          x: 0,
          y: 0,
          width: definition.width,
          height: definition.height,
          rotation: 0,
          opacity: 1,
          src: mapping.textureUrl,
          sourceWidth: visualization.sourceAsset?.width ?? definition.width,
          sourceHeight: visualization.sourceAsset?.height ?? definition.height,
          // Fill the panel without squashing: a 4:3 photo on a tall carton front
          // is cropped to the panel, never stretched to it.
          imageFit: "cover",
          aspectLocked: true,
        },
        ...relayout(original?.documentSurface?.layers.filter((layer) => layer.id !== baseLayerId) ?? [], scaleX, scaleY),
      ],
    });
  });

  for (const original of originalOrder) {
    if (claimedOriginalIds.has(normalizedId(original.id))) continue;
    const previewId = uniquePreviewId(original.id, original.id, usedPreviewIds, previewDefinitions.length);
    sourceToPreviewId.set(normalizedId(original.id), previewId);
    const definition = original.definition ?? {
      id: previewId,
      label: original.documentSurface?.label ?? original.id,
      width: 600,
      height: 360,
      safeInset: 24,
    };
    previewDefinitions.push({ ...definition, id: previewId });
    previewDocumentSurfaces.push(original.documentSurface
      ? { ...original.documentSurface, id: previewId }
      : { id: previewId, label: definition.label, layers: [] });
  }

  const activeSurfaceId = sourceToPreviewId.get(normalizedId(document.activeSurfaceId))
    ?? previewDocumentSurfaces[0]?.id
    ?? document.activeSurfaceId;
  return {
    document: {
      ...document,
      activeSurfaceId,
      surfaces: previewDocumentSurfaces,
    },
    surfaces: previewDefinitions,
  };
}
