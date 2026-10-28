import { z } from "zod";

export const visualizationAnalysisModeInputSchema = z.enum(["auto", "manual", "external"]);
export type VisualizationAnalysisModeInput = z.infer<typeof visualizationAnalysisModeInputSchema>;

export const visualizationGeometryKindSchema = z.enum([
  "box", "cylinder", "plane", "bag", "pouch", "label", "custom",
]);

const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum);
const dimensionValueSchema = z.number().finite().positive().max(100_000);
const confidenceSchema = z.number().finite().min(0).max(1).nullable();

export const visualizationDimensionsSchema = z.object({
  unit: z.enum(["mm", "cm", "in"]).default("mm"),
  width: dimensionValueSchema.optional(),
  height: dimensionValueSchema.optional(),
  depth: dimensionValueSchema.optional(),
  diameter: dimensionValueSchema.optional(),
  gusset: dimensionValueSchema.optional(),
  labelWidth: dimensionValueSchema.optional(),
  labelHeight: dimensionValueSchema.optional(),
}).strict().superRefine((dimensions, context) => {
  if (![dimensions.width, dimensions.height, dimensions.depth, dimensions.diameter, dimensions.gusset, dimensions.labelWidth, dimensions.labelHeight]
    .some((value) => value !== undefined)) {
    context.addIssue({ code: "custom", message: "At least one physical dimension is required." });
  }
});

export type VisualizationDimensions = z.infer<typeof visualizationDimensionsSchema>;

const requiredDimensionsByGeometry: Record<z.infer<typeof visualizationGeometryKindSchema>, readonly (keyof VisualizationDimensions)[]> = {
  box: ["width", "height", "depth"],
  cylinder: ["diameter", "height", "labelWidth", "labelHeight"],
  plane: ["width", "height"],
  bag: ["width", "height", "gusset"],
  pouch: ["width", "height", "gusset"],
  label: ["width", "height"],
  custom: ["width", "height", "depth"],
};

function validateGeometryDimensions(
  value: { geometry: { kind: z.infer<typeof visualizationGeometryKindSchema> }; dimensions: VisualizationDimensions },
  context: z.RefinementCtx,
) {
  for (const key of requiredDimensionsByGeometry[value.geometry.kind]) {
    if (value.dimensions[key] === undefined) {
      context.addIssue({
        code: "custom",
        path: ["dimensions", key],
        message: `${String(key)} is required for ${value.geometry.kind} geometry.`,
      });
    }
  }
}

export function dimensionsInMillimetres(dimensions: VisualizationDimensions) {
  const multiplier = dimensions.unit === "mm" ? 1 : dimensions.unit === "cm" ? 10 : 25.4;
  return {
    unit: "mm" as const,
    ...Object.fromEntries(
      (["width", "height", "depth", "diameter", "gusset", "labelWidth", "labelHeight"] as const)
        .filter((key) => dimensions[key] !== undefined)
        .map((key) => [key, Number((dimensions[key]! * multiplier).toFixed(4))]),
    ),
  };
}

export const visualizationSourceBoundsSchema = z.object({
  x: z.number().finite().min(0).max(1),
  y: z.number().finite().min(0).max(1),
  width: z.number().finite().positive().max(1),
  height: z.number().finite().positive().max(1),
}).strict().superRefine((bounds, context) => {
  if (bounds.x + bounds.width > 1 + Number.EPSILON) {
    context.addIssue({ code: "custom", path: ["width"], message: "Source bounds exceed the image width." });
  }
  if (bounds.y + bounds.height > 1 + Number.EPSILON) {
    context.addIssue({ code: "custom", path: ["height"], message: "Source bounds exceed the image height." });
  }
});

export const visualizationSurfaceMappingSchema = z.object({
  surfaceId: boundedText(80).regex(/^[a-z0-9][a-z0-9_-]*$/i),
  label: boundedText(120),
  role: z.enum(["front", "back", "left", "right", "top", "bottom", "wrap", "gusset", "inside", "other"]),
  sourceBounds: visualizationSourceBoundsSchema.optional(),
}).strict();

export const visualizationSurfaceMappingsSchema = z.array(visualizationSurfaceMappingSchema).min(1).max(24)
  .superRefine((surfaces, context) => {
    const seen = new Set<string>();
    for (const [index, surface] of surfaces.entries()) {
      const key = surface.surfaceId.toLowerCase();
      if (seen.has(key)) {
        context.addIssue({ code: "custom", path: [index, "surfaceId"], message: "Surface IDs must be unique." });
      }
      seen.add(key);
    }
  });

const confirmedVisualizationSurfaceMappingsSchema = visualizationSurfaceMappingsSchema.superRefine((surfaces, context) => {
  surfaces.forEach((surface, index) => {
    if (index > 0 && !surface.sourceBounds) {
      context.addIssue({
        code: "custom",
        path: [index, "sourceBounds"],
        message: "Every additional surface needs explicit source panel bounds.",
      });
    }
  });
});

const looseSettingsSchema = z.record(z.string().max(120), z.unknown());

export const visualizationConfirmationSchema = z.object({
  productType: boundedText(120),
  geometry: z.object({
    kind: visualizationGeometryKindSchema,
    parameters: z.record(z.string().max(80), z.number().finite()).optional(),
  }).strict(),
  dimensions: visualizationDimensionsSchema,
  surfaceMappings: confirmedVisualizationSurfaceMappingsSchema,
  materialSettings: looseSettingsSchema.optional(),
  notes: z.string().trim().max(2_000).optional(),
  manufacturingValidated: z.boolean().default(false),
}).strict().superRefine(validateGeometryDimensions);

export type VisualizationConfirmation = z.infer<typeof visualizationConfirmationSchema>;

export const visualizationTemplateInputSchema = z.object({
  name: boundedText(160),
  familyKey: boundedText(120).regex(/^[a-z0-9][a-z0-9_-]*$/i).optional(),
  description: z.string().trim().max(4_000).optional(),
  productId: z.string().trim().min(1).max(120).optional(),
  productType: boundedText(120),
  geometry: z.object({
    kind: visualizationGeometryKindSchema,
    parameters: z.record(z.string().max(80), z.number().finite()).optional(),
  }).strict(),
  dimensions: visualizationDimensionsSchema,
  surfaces: confirmedVisualizationSurfaceMappingsSchema,
  materialSettings: looseSettingsSchema.optional(),
  previewCapabilities: looseSettingsSchema.optional(),
  manufacturingMetadata: looseSettingsSchema.optional(),
}).strict().superRefine(validateGeometryDimensions);

export type VisualizationTemplateInput = z.infer<typeof visualizationTemplateInputSchema>;

const generatedAssetSchema = z.object({
  kind: z.enum(["processed_image", "preview_image", "texture", "model_gltf", "model_glb"]),
  privateRef: z.string().url().max(2_000).refine((value) => value.startsWith("https://"), {
    message: "Generated asset references must use HTTPS.",
  }),
  mimeType: z.enum([
    "image/jpeg", "image/png", "image/webp", "model/gltf+json", "model/gltf-binary", "application/octet-stream",
  ]),
  sizeBytes: z.number().int().min(0).max(100 * 1024 * 1024),
  width: z.number().int().positive().max(50_000).optional(),
  height: z.number().int().positive().max(50_000).optional(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
}).strict();

const analyzerDimensionSchema = z.object({
  unit: z.enum(["mm", "cm", "in"]),
  width: dimensionValueSchema.optional(),
  height: dimensionValueSchema.optional(),
  depth: dimensionValueSchema.optional(),
  diameter: dimensionValueSchema.optional(),
  gusset: dimensionValueSchema.optional(),
  labelWidth: dimensionValueSchema.optional(),
  labelHeight: dimensionValueSchema.optional(),
  confidence: confidenceSchema,
}).strict();

const analyzerSurfaceSchema = visualizationSurfaceMappingSchema.extend({ confidence: confidenceSchema }).strict();

export const visualizationAnalyzerResponseSchema = z.object({
  schemaVersion: z.literal(1),
  requestId: z.string().trim().min(1).max(160).optional(),
  classification: z.object({
    kind: z.enum(["flat_artwork", "photograph", "dieline", "unknown"]), confidence: confidenceSchema,
  }).strict(),
  productType: z.object({
    value: z.string().trim().min(1).max(120).nullable(), confidence: confidenceSchema,
  }).strict(),
  geometry: z.object({
    kind: visualizationGeometryKindSchema.nullable(),
    parameters: z.record(z.string().max(80), z.number().finite()).optional(),
    confidence: confidenceSchema,
  }).strict(),
  orientation: z.object({
    value: z.enum(["portrait", "landscape", "square", "unknown"]), confidence: confidenceSchema,
  }).strict(),
  dimensions: analyzerDimensionSchema.nullable(),
  surfaces: z.array(analyzerSurfaceSchema).max(24),
  dieline: z.object({ detected: z.boolean(), confidence: confidenceSchema }).strict().nullable(),
  requiredInputs: z.array(z.enum([
    "product_type", "geometry", "dimensions", "surface_mapping", "additional_images",
  ])).max(5),
  warnings: z.array(z.string().trim().min(1).max(500)).max(20),
  nextAction: z.string().trim().min(1).max(500),
  generatedAssets: z.array(generatedAssetSchema).max(20),
}).strict();

export type VisualizationAnalyzerResponse = z.infer<typeof visualizationAnalyzerResponseSchema>;

export interface ManualAnalysisInput {
  source: { width: number; height: number; mimeType: string };
  productType?: string;
  geometryKind?: z.infer<typeof visualizationGeometryKindSchema>;
  dimensions?: VisualizationDimensions;
}

export function buildManualVisualizationAnalysis(input: ManualAnalysisInput) {
  const orientation = input.source.width === input.source.height
    ? "square" : input.source.width > input.source.height ? "landscape" : "portrait";
  const requiredInputs: Array<"product_type" | "geometry" | "dimensions" | "surface_mapping"> = [];
  if (!input.productType) requiredInputs.push("product_type");
  if (!input.geometryKind) requiredInputs.push("geometry");
  if (!input.dimensions) requiredInputs.push("dimensions");
  requiredInputs.push("surface_mapping");

  return {
    schemaVersion: 1 as const,
    source: "manual" as const,
    classification: { kind: "unknown" as const, confidence: null },
    productType: { value: input.productType ?? null, confidence: null },
    geometry: { kind: input.geometryKind ?? null, confidence: null },
    orientation: { value: orientation, confidence: null },
    dimensions: input.dimensions ? { ...input.dimensions, confidence: null } : null,
    surfaces: [], dieline: null, requiredInputs,
    warnings: ["Automated image analysis is not configured. Review and confirm every value manually."],
    nextAction: "Confirm the product type, geometry, physical dimensions, and surface mapping.",
    generatedAssets: [], meshGenerated: false, requiresConfirmation: true,
  };
}

export function normalizeExternalVisualizationAnalysis(response: VisualizationAnalyzerResponse) {
  return {
    ...response,
    source: "external" as const,
    meshGenerated: response.generatedAssets.some(({ kind }) => kind === "model_gltf" || kind === "model_glb"),
    requiresConfirmation: true,
  };
}

export const visualizationPatchActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("retry"), jobId: boundedText(120), analysisMode: visualizationAnalysisModeInputSchema.optional() }).strict(),
  z.object({ action: z.literal("confirm-analysis"), jobId: boundedText(120), confirmation: visualizationConfirmationSchema }).strict(),
  z.object({ action: z.literal("save-template"), sourceJobId: boundedText(120), template: visualizationTemplateInputSchema }).strict(),
  z.object({ action: z.enum(["publish-template", "archive-template"]), templateId: boundedText(120) }).strict(),
]);

export type VisualizationPatchAction = z.infer<typeof visualizationPatchActionSchema>;

export class VisualizationStudioError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = "VisualizationStudioError";
  }
}

export function canRetryVisualizationJob(job: { status: string; attempt: number; maxAttempts: number }) {
  return job.status === "FAILED" && job.attempt >= 0 && job.attempt < job.maxAttempts;
}

export function nextVisualizationTemplateVersion(latestVersion: number | null | undefined) {
  if (latestVersion === null || latestVersion === undefined) return 1;
  if (!Number.isSafeInteger(latestVersion) || latestVersion < 1 || latestVersion >= 1_000_000) {
    throw new VisualizationStudioError(409, "TEMPLATE_VERSION_INVALID", "The template family cannot accept another version.");
  }
  return latestVersion + 1;
}

export function visualizationFamilyKey(value: string) {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
  if (!normalized) throw new VisualizationStudioError(400, "TEMPLATE_FAMILY_INVALID", "A valid template family key is required.");
  return normalized;
}
