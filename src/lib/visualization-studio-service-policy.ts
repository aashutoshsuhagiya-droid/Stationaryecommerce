export function visualizationIsoDate(value: unknown) {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.valueOf()) ? undefined : date.toISOString();
}

export function serializeVisualizationAsset(asset: any) {
  return {
    id: asset.id,
    kind: asset.kind,
    originalName: asset.originalName ?? undefined,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
    width: asset.width ?? undefined,
    height: asset.height ?? undefined,
    downloadUrl: asset.storage === "DATABASE"
      ? `/api/admin/visualization-studio/assets/${encodeURIComponent(asset.id)}`
      : undefined,
    createdAt: visualizationIsoDate(asset.createdAt),
  };
}

export function serializeVisualizationJob(job: any) {
  const sourceAsset = job.sourceAsset ?? job.assets?.find((asset: any) => asset.kind === "SOURCE_IMAGE");
  return {
    id: job.id,
    productId: job.productId,
    product: job.product ? {
      id: job.product.id,
      name: job.product.name,
      slug: job.product.slug,
      status: job.product.status,
    } : undefined,
    templateId: job.templateId ?? undefined,
    status: job.status,
    analysisMode: String(job.analysisMode).toLowerCase(),
    attempt: job.attempt,
    maxAttempts: job.maxAttempts,
    errorCode: job.errorCode ?? undefined,
    errorMessage: job.errorMessage ?? undefined,
    asset: sourceAsset ? serializeVisualizationAsset(sourceAsset) : undefined,
    outputs: (job.assets ?? [])
      .filter((asset: any) => asset.kind !== "SOURCE_IMAGE")
      .map(serializeVisualizationAsset),
    analysis: job.analysisResult ?? undefined,
    confirmation: job.confirmation ?? undefined,
    createdAt: visualizationIsoDate(job.createdAt),
    updatedAt: visualizationIsoDate(job.updatedAt),
    completedAt: visualizationIsoDate(job.completedAt),
  };
}

export function serializeVisualizationTemplate(template: any) {
  return {
    id: template.id,
    familyKey: template.familyKey,
    version: template.version,
    productId: template.productId ?? undefined,
    sourceJobId: template.sourceJobId ?? undefined,
    name: template.name,
    slug: template.slug,
    description: template.description ?? undefined,
    productType: template.productType,
    status: template.status,
    geometry: template.geometry,
    dimensions: template.dimensions,
    surfaces: template.surfaceMappings,
    materialSettings: template.materialSettings ?? undefined,
    previewCapabilities: template.previewCapabilities ?? undefined,
    manufacturingMetadata: template.manufacturingMetadata ?? undefined,
    publishedAt: visualizationIsoDate(template.publishedAt),
    archivedAt: visualizationIsoDate(template.archivedAt),
    createdAt: visualizationIsoDate(template.createdAt),
    updatedAt: visualizationIsoDate(template.updatedAt),
  };
}

export function publicVisualizationAnalysis(analysis: any) {
  return {
    ...analysis,
    generatedAssets: Array.isArray(analysis.generatedAssets)
      ? analysis.generatedAssets.map(({ privateRef: _privateRef, ...metadata }: any) => metadata)
      : [],
  };
}

const generatedAssetKinds = {
  processed_image: "PROCESSED_IMAGE",
  preview_image: "PREVIEW_IMAGE",
  texture: "TEXTURE",
  model_gltf: "MODEL_GLTF",
  model_glb: "MODEL_GLB",
} as const;

export function generatedVisualizationAssetKind(kind: keyof typeof generatedAssetKinds) {
  return generatedAssetKinds[kind];
}

export type VisualizationProductModel =
  | "label-pack"
  | "waterproof-sheet"
  | "bottle-label"
  | "rectangular-box"
  | "square-box"
  | "folding-carton"
  | "mailer-box"
  | "paper-bag"
  | "stand-up-pouch"
  | "product-sleeve";

function plainRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizedProductType(value: unknown) {
  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/[_\s]+/g, "-").replace(/-+/g, "-")
    : "";
}

export function resolveVisualizationProductModel(template: {
  productType?: unknown;
  geometry?: unknown;
  dimensions?: unknown;
}): VisualizationProductModel | null {
  const productType = normalizedProductType(template.productType);
  const geometry = plainRecord(template.geometry);
  const kind = normalizedProductType(geometry.kind);
  if (kind === "cylinder") return "bottle-label";
  if (kind === "plane") return "waterproof-sheet";
  if (kind === "label") return "label-pack";
  if (kind === "pouch") return "stand-up-pouch";
  if (kind === "bag") return "paper-bag";

  const explicit = new Set<VisualizationProductModel>([
    "label-pack", "waterproof-sheet", "bottle-label",
    "rectangular-box", "square-box", "folding-carton", "mailer-box",
    "paper-bag", "stand-up-pouch", "product-sleeve",
  ]);
  const explicitModel = explicit.has(productType as VisualizationProductModel)
    ? productType as VisualizationProductModel
    : null;
  const boxModels = new Set<VisualizationProductModel>([
    "rectangular-box", "square-box", "folding-carton", "mailer-box",
  ]);
  if (explicitModel && (kind !== "box" || boxModels.has(explicitModel))) return explicitModel;
  if (kind !== "box") {
    if (/(?:^|-)(?:bottle|jar|can|cylindrical-container)(?:-|$)/u.test(productType)) return "bottle-label";
    if (/(?:^|-)(?:(?:flat-)?sticker(?:-sheet)?|decal(?:-sheet)?)(?:-|$)/u.test(productType)) return "waterproof-sheet";
    if (/(?:^|-)(?:product-)?label(?:-pack)?(?:-|$)/u.test(productType)) return "label-pack";
    if (/(?:^|-)(?:paper|shopping|carry)-bag(?:-|$)/u.test(productType)) return "paper-bag";
    if (/(?:^|-)(?:stand-?up-)?(?:ziplock-)?pouch(?:-|$)/u.test(productType)) return "stand-up-pouch";
    if (/(?:^|-)(?:product-)?sleeve(?:-|$)/u.test(productType)) return "product-sleeve";
  }
  if (/(?:^|-)square-(?:gift-)?box(?:-|$)/u.test(productType)) return "square-box";
  if (/(?:^|-)(?:mailer|mailing|shipping)-box(?:-|$)/u.test(productType)) return "mailer-box";
  if (/(?:^|-)(?:folding-carton|carton|soap-box|perfume-box|cosmetic(?:-[a-z]+)*-box)(?:-|$)/u.test(productType)) {
    return "folding-carton";
  }
  if (/(?:^|-)(?:rectangular-)?(?:cake-|gift-)?box(?:-|$)/u.test(productType)) return "rectangular-box";

  if (kind !== "box") return null;

  const dimensions = plainRecord(template.dimensions);
  const width = typeof dimensions.width === "number" ? dimensions.width : null;
  const depth = typeof dimensions.depth === "number" ? dimensions.depth : null;
  if (width && depth && Math.abs(width - depth) / Math.max(width, depth) <= 0.02) return "square-box";
  return "rectangular-box";
}

export function nextVisualizationConfigurationVersion(value: unknown) {
  const current = typeof value === "string" ? Number(value) : 0;
  return Number.isSafeInteger(current) && current >= 0 && current < 1_000_000 ? String(current + 1) : "1";
}

export function activateVisualizationProductMetadata(
  currentMetadata: unknown,
  input: {
    templateId: string;
    productModel: VisualizationProductModel;
    visualization?: Record<string, unknown>;
  },
) {
  const metadata = plainRecord(currentMetadata);
  const configurator = plainRecord(metadata.configurator);
  return {
    ...metadata,
    configurator: {
      ...configurator,
      allow3D: true,
      productModel: input.productModel,
      previewTemplate: `visualization:${input.templateId}`,
      configurationVersion: nextVisualizationConfigurationVersion(configurator.configurationVersion),
      ...(input.visualization ? { visualization: input.visualization } : {}),
    },
  };
}

export function visualizationTemplateIsActive(currentMetadata: unknown, templateId: string) {
  const configurator = plainRecord(plainRecord(currentMetadata).configurator);
  return configurator.previewTemplate === `visualization:${templateId}`;
}

export function deactivateVisualizationProductMetadata(currentMetadata: unknown, templateId: string) {
  if (!visualizationTemplateIsActive(currentMetadata, templateId)) return currentMetadata;
  const metadata = plainRecord(currentMetadata);
  const configurator = plainRecord(metadata.configurator);
  return {
    ...metadata,
    configurator: {
      ...configurator,
      allow3D: false,
      productModel: null,
      previewTemplate: null,
      visualization: null,
      configurationVersion: nextVisualizationConfigurationVersion(configurator.configurationVersion),
    },
  };
}

export interface VisualizationRuntimeSurface {
  surfaceId: string;
  label: string;
  role: string;
  sourceBounds?: { x: number; y: number; width: number; height: number };
}

export function publicVisualizationAssetUrl(assetId: string, surfaceId?: string) {
  const assetPath = `/api/visualization-assets/${encodeURIComponent(assetId)}`;
  return surfaceId === undefined
    ? assetPath
    : `${assetPath}?surfaceId=${encodeURIComponent(surfaceId)}`;
}

export function visualizationRuntimeDescriptor(input: {
  templateId: string;
  asset: { id: string; width: number; height: number; mimeType: string };
  surfaces: VisualizationRuntimeSurface[];
}) {
  return {
    schemaVersion: 1,
    templateId: input.templateId,
    sourceAsset: { ...input.asset, url: publicVisualizationAssetUrl(input.asset.id) },
    surfaces: input.surfaces.map((surface) => ({
      ...surface,
      assetId: input.asset.id,
      url: publicVisualizationAssetUrl(input.asset.id, surface.surfaceId),
    })),
  };
}

export function resolveVisualizationSurfaceCrop(
  surfaces: VisualizationRuntimeSurface[],
  requestedSurfaceId: string | undefined,
  imageWidth: number,
  imageHeight: number,
) {
  if (!surfaces.length || !Number.isSafeInteger(imageWidth) || !Number.isSafeInteger(imageHeight) || imageWidth < 1 || imageHeight < 1) {
    return null;
  }
  const index = requestedSurfaceId === undefined
    ? 0
    : surfaces.findIndex(({ surfaceId }) => surfaceId === requestedSurfaceId);
  if (index < 0) return null;
  const surface = surfaces[index];
  const bounds = surface.sourceBounds;
  if (!bounds) return index === 0 ? { surface, crop: null } : null;
  if (
    ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)
    || bounds.x < 0 || bounds.y < 0 || bounds.width <= 0 || bounds.height <= 0
    || bounds.x + bounds.width > 1 + Number.EPSILON
    || bounds.y + bounds.height > 1 + Number.EPSILON
  ) return null;
  const left = Math.max(0, Math.min(imageWidth - 1, Math.floor(bounds.x * imageWidth)));
  const top = Math.max(0, Math.min(imageHeight - 1, Math.floor(bounds.y * imageHeight)));
  const right = Math.max(left + 1, Math.min(imageWidth, Math.ceil((bounds.x + bounds.width) * imageWidth)));
  const bottom = Math.max(top + 1, Math.min(imageHeight, Math.ceil((bounds.y + bounds.height) * imageHeight)));
  return { surface, crop: { left, top, width: right - left, height: bottom - top } };
}
