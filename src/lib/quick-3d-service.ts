import { getPrisma } from "./prisma";
import { supportedArtworkMimeTypes, validateArtworkUpload } from "./artwork-upload";
import { VisualizationStudioError } from "./visualization-studio-domain";
import {
  changeVisualizationTemplateStatus,
  confirmVisualizationAnalysis,
  processVisualizationJob,
  saveVisualizationTemplate,
  startVisualizationAnalysis,
} from "./visualization-studio-service";
import { VISUALIZATION_MAXIMUM_FILE_BYTES } from "./visualization-studio-upload";
import { parseExactDimensions } from "./product-configuration";
import { artworkEdgeColor, cropFrontArtwork, downscaleVisualizationSource } from "./visualization-artwork";
import { templateShapePlanForCategory, visualizationConfirmationFor } from "./visualization-shape-presets";

export type Quick3DResult =
  | { templateId: string; alreadyLinked: true }
  | {
      templateId: string;
      alreadyLinked: false;
      productModel: string;
      artworkConfidence: "high" | "low";
      artworkNote?: string;
    };

/**
 * One-click 3D preview for packaging products, shared by the studio's
 * quick-3d route and the listing publish flow.
 *
 * Runs the proven studio pipeline end to end in MANUAL mode (no external
 * analysis provider): the product's own primary image becomes a published
 * `VisualizationTemplate`, and publishing, not this function, writes
 * `allow3D`/`productModel`/`previewTemplate`, so the admin catalog's 3D
 * invariant keeps holding. Shapes without an honest model are refused.
 * Idempotent: a product that already has a published template is returned as is.
 */
export async function createQuick3DPreview(input: { actorId: string; productId: string }): Promise<Quick3DResult> {
  const prisma = getPrisma() as any;
  const product = await prisma.product.findUnique({
    where: { id: input.productId },
    include: {
      category: { select: { slug: true } },
      images: { where: { sortOrder: 0 }, take: 1, select: { url: true } },
      imageAssets: {
        where: { kind: { in: ["artwork", "primary"] } }, orderBy: { createdAt: "desc" },
        select: { id: true, kind: true, mimeType: true, sizeBytes: true, width: true, height: true, sha256: true, content: true, altText: true },
      },
      visualizationTemplates: {
        where: { status: "PUBLISHED", archivedAt: null },
        select: { id: true }, take: 1,
      },
    },
  });
  if (!product) throw new VisualizationStudioError(404, "PRODUCT_NOT_FOUND", "The selected product no longer exists.");
  if (product.visualizationTemplates.length) {
    return { templateId: product.visualizationTemplates[0].id, alreadyLinked: true };
  }

  const display = (product.dimensions as { display?: unknown } | null)?.display;
  const productDimensions = typeof display === "string" ? parseExactDimensions(display) : null;
  const plan = templateShapePlanForCategory(product.category?.slug, {
    productName: product.name,
    productSlug: product.slug,
    productDimensions,
  });
  if (!plan) {
    throw new VisualizationStudioError(
      422,
      "VISUALIZATION_SHAPE_UNSUPPORTED",
      "This shape has no 3D model yet. Flat printing and open trays stay 2D.",
    );
  }

  // Flat artwork (a dieline or front panel uploaded as such) beats any hero photo.
  const primaryUrl = product.images[0]?.url;
  const artworkAsset = product.imageAssets.find((asset: any) => asset.kind === "artwork");
  const primaryAssets = product.imageAssets.filter((asset: any) => asset.kind === "primary");
  const source = artworkAsset
    ?? primaryAssets.find((asset: any) => `/api/product-images/${asset.id}` === primaryUrl)
    ?? primaryAssets[0];
  if (!source?.content || !source.sha256 || !source.width || !source.height) {
    throw new VisualizationStudioError(404, "PRODUCT_IMAGE_NOT_FOUND", "Upload a product photo before creating a 3D preview.");
  }
  if (!supportedArtworkMimeTypes.includes(source.mimeType) || source.sizeBytes > VISUALIZATION_MAXIMUM_FILE_BYTES) {
    throw new VisualizationStudioError(422, "PRODUCT_IMAGE_INVALID", "The product photo must be a JPG, PNG or WEBP up to 12 MB.");
  }

  // Wrap the box's own front, not the whole scene it was photographed in.
  const frontAspect = (plan.dimensions.width ?? 1) / Math.max(1, plan.dimensions.height ?? 1);
  const original = new Uint8Array(source.content);
  const artwork = artworkAsset
    ? {
        bytes: original,
        mimeType: source.mimeType as "image/jpeg" | "image/png" | "image/webp",
        confidence: "high" as const,
        edgeColor: await artworkEdgeColor(original),
      }
    : await cropFrontArtwork(original, { targetAspect: frontAspect });

  // Large images are downscaled next: the studio writes the bytes inside a short
  // interactive transaction that a multi-megabyte insert can outlast.
  const downscaled = await downscaleVisualizationSource(artwork.bytes, artwork.mimeType);
  const upload = await validateArtworkUpload(
    new File([downscaled.bytes as unknown as BlobPart], `${product.slug}-hero`.slice(0, 180), { type: downscaled.mimeType }),
    {
      allowedMimeTypes: supportedArtworkMimeTypes,
      maximumBytes: VISUALIZATION_MAXIMUM_FILE_BYTES,
      minimumWidth: 1,
      minimumHeight: 1,
      maximumWidth: 50_000,
      maximumHeight: 50_000,
      allowTransparency: true,
    },
  );

  const job = await startVisualizationAnalysis({
    actorId: input.actorId,
    productId: product.id,
    analysisMode: "manual",
    upload,
    productType: plan.model,
    geometryKind: plan.geometryKind,
  });
  await processVisualizationJob(job.id);

  const confirmation = visualizationConfirmationFor(plan, {
    confidence: artwork.confidence,
    edgeColor: artwork.edgeColor,
  });
  await confirmVisualizationAnalysis(job.id, confirmation);
  const template = await saveVisualizationTemplate(input.actorId, job.id, {
    name: `${product.name}`.slice(0, 150) + " 3D",
    productId: product.id,
    productType: confirmation.productType,
    geometry: confirmation.geometry,
    dimensions: confirmation.dimensions,
    surfaces: confirmation.surfaceMappings,
    materialSettings: confirmation.materialSettings,
  });
  // Publishing (not this function) writes allow3D/productModel/previewTemplate.
  await changeVisualizationTemplateStatus(template.id, "publish");

  return {
    templateId: template.id,
    alreadyLinked: false,
    productModel: plan.model,
    artworkConfidence: artwork.confidence,
    ...(confirmation.materialSettings.artworkNote ? { artworkNote: confirmation.materialSettings.artworkNote } : {}),
  };
}
