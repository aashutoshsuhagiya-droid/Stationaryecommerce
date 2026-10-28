import { z } from "zod";
import {
  readLimitedArtworkFormData,
  supportedArtworkMimeTypes,
  validateArtworkUpload,
} from "@/lib/artwork-upload";
import {
  visualizationAnalysisModeInputSchema,
  visualizationDimensionsSchema,
  visualizationGeometryKindSchema,
  VisualizationStudioError,
} from "@/lib/visualization-studio-domain";

export const VISUALIZATION_MAXIMUM_FILE_BYTES = 12 * 1024 * 1024;
export const VISUALIZATION_MAXIMUM_REQUEST_BYTES = VISUALIZATION_MAXIMUM_FILE_BYTES + 128 * 1024;

const uploadFieldsSchema = z.object({
  productId: z.string().trim().min(1).max(120),
  productType: z.string().trim().min(1).max(120).optional(),
  geometryKind: visualizationGeometryKindSchema.optional(),
  analysisMode: visualizationAnalysisModeInputSchema.default("auto"),
}).strict();

function optionalField(formData: FormData, name: string) {
  const values = formData.getAll(name);
  if (values.length > 1) {
    throw new VisualizationStudioError(400, "UPLOAD_FIELD_DUPLICATED", `${name} may only be provided once.`);
  }
  const value = values[0];
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new VisualizationStudioError(400, "UPLOAD_FIELD_INVALID", `${name} must be text.`);
  }
  return value;
}

export async function readVisualizationUpload(request: Request) {
  const formData = await readLimitedArtworkFormData(request, VISUALIZATION_MAXIMUM_REQUEST_BYTES);
  const files = formData.getAll("file");
  if (files.length !== 1 || !(files[0] instanceof File)) {
    throw new VisualizationStudioError(400, "SOURCE_IMAGE_REQUIRED", "Provide exactly one source image file.");
  }

  const fields = uploadFieldsSchema.parse({
    productId: optionalField(formData, "productId"),
    productType: optionalField(formData, "productType"),
    geometryKind: optionalField(formData, "geometryKind"),
    analysisMode: optionalField(formData, "analysisMode"),
  });

  const dimensionsText = optionalField(formData, "dimensionsJson");
  let dimensions: z.infer<typeof visualizationDimensionsSchema> | undefined;
  if (dimensionsText) {
    if (dimensionsText.length > 4_096) {
      throw new VisualizationStudioError(400, "DIMENSIONS_TOO_LARGE", "dimensionsJson is too large.");
    }
    try {
      dimensions = visualizationDimensionsSchema.parse(JSON.parse(dimensionsText));
    } catch (error) {
      if (error instanceof z.ZodError) throw error;
      throw new VisualizationStudioError(400, "DIMENSIONS_JSON_INVALID", "dimensionsJson must contain valid JSON.");
    }
  }

  const upload = await validateArtworkUpload(files[0], {
    allowedMimeTypes: supportedArtworkMimeTypes,
    maximumBytes: VISUALIZATION_MAXIMUM_FILE_BYTES,
    minimumWidth: 1,
    minimumHeight: 1,
    maximumWidth: 50_000,
    maximumHeight: 50_000,
    allowTransparency: true,
  });

  return { ...fields, dimensions, upload };
}
