import type { ProductVisualizationTemplate } from "../../lib/types";
import type {
  ArtworkDocument,
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

function syntheticSurfaceDefinition(
  visualization: ProductVisualizationTemplate,
  surface: ProductVisualizationTemplate["surfaces"][number],
  id: string,
): PrintableSurfaceDefinition {
  const dimensions = visualization.dimensionsMm;
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
      ? { ...original.definition, id: previewId, label: mapping.label }
      : syntheticSurfaceDefinition(visualization, mapping, previewId);
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
          imageFit: "stretch",
          aspectLocked: false,
        },
        ...(original?.documentSurface?.layers.filter((layer) => layer.id !== baseLayerId) ?? []),
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
