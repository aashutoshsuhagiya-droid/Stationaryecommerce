import { createHash } from "node:crypto";
import sharp from "sharp";
import { getPrisma } from "@/lib/prisma";
import { visualizationSurfaceMappingsSchema } from "@/lib/visualization-studio-domain";
import { resolveVisualizationSurfaceCrop } from "@/lib/visualization-studio-service-policy";

const publicRasterMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export class PublishedVisualizationAssetError extends Error {
  constructor(readonly status: 400 | 404 | 500, readonly code: string, message: string) {
    super(message);
    this.name = "PublishedVisualizationAssetError";
  }
}

function notFound(): never {
  throw new PublishedVisualizationAssetError(404, "VISUALIZATION_ASSET_NOT_FOUND", "Visualization asset not found.");
}

function etagMatches(candidate: string | null | undefined, etag: string) {
  return candidate?.split(",").some((value) => value.trim() === etag || value.trim() === "*") ?? false;
}

export async function getPublishedVisualizationAsset(input: {
  assetId: string;
  surfaceId?: string;
  ifNoneMatch?: string | null;
}) {
  const prisma = getPrisma() as any;
  const now = new Date();
  const asset = await prisma.visualizationAsset.findFirst({
    where: {
      id: input.assetId,
      kind: "SOURCE_IMAGE",
      storage: "DATABASE",
      mimeType: { in: [...publicRasterMimeTypes] },
      template: {
        is: {
          status: "PUBLISHED",
          publishedAt: { not: null, lte: now },
          archivedAt: null,
          product: {
            is: { status: "ACTIVE", publishedAt: { not: null, lte: now }, archivedAt: null },
          },
        },
      },
    },
    select: {
      id: true,
      productId: true,
      kind: true,
      storage: true,
      mimeType: true,
      width: true,
      height: true,
      sha256: true,
      content: true,
      updatedAt: true,
      template: {
        select: {
          id: true,
          productId: true,
          status: true,
          publishedAt: true,
          archivedAt: true,
          surfaceMappings: true,
          updatedAt: true,
          product: { select: { id: true, status: true, publishedAt: true, archivedAt: true } },
        },
      },
    },
  });
  const product = asset?.template?.product;
  if (
    !asset
    || asset.kind !== "SOURCE_IMAGE"
    || asset.storage !== "DATABASE"
    || !asset.content
    || !asset.width
    || !asset.height
    || !asset.sha256
    || !publicRasterMimeTypes.has(asset.mimeType)
    || asset.template?.status !== "PUBLISHED"
    || !asset.template.publishedAt
    || asset.template.publishedAt > now
    || asset.template.archivedAt
    || !product
    || product.status !== "ACTIVE"
    || !product.publishedAt
    || product.publishedAt > now
    || product.archivedAt
    || asset.productId !== product.id
    || asset.template.productId !== product.id
  ) notFound();

  const mappings = visualizationSurfaceMappingsSchema.safeParse(asset.template.surfaceMappings);
  if (!mappings.success) {
    throw new PublishedVisualizationAssetError(500, "VISUALIZATION_MAPPING_INVALID", "The published visualization mapping is invalid.");
  }
  const selection = resolveVisualizationSurfaceCrop(mappings.data, input.surfaceId, asset.width, asset.height);
  if (!selection) notFound();

  const etagDigest = createHash("sha256")
    .update(asset.sha256)
    .update(asset.template.id)
    .update(selection.surface.surfaceId)
    .update(JSON.stringify(selection.crop))
    .digest("base64url");
  const etag = `"visualization-${etagDigest}"`;
  const lastModified = new Date(Math.max(
    new Date(asset.updatedAt).valueOf(),
    new Date(asset.template.updatedAt).valueOf(),
  )).toUTCString();
  if (etagMatches(input.ifNoneMatch, etag)) {
    return { notModified: true as const, etag, lastModified };
  }

  let content = Buffer.from(asset.content);
  if (selection.crop) {
    try {
      content = await sharp(content, {
        failOn: "error",
        limitInputPixels: 40_000_000,
        sequentialRead: true,
      })
        .extract(selection.crop)
        .timeout({ seconds: 5 })
        .toBuffer();
    } catch {
      throw new PublishedVisualizationAssetError(500, "VISUALIZATION_CROP_FAILED", "The published visualization crop is unavailable.");
    }
  }
  return {
    notModified: false as const,
    content,
    mimeType: asset.mimeType as "image/jpeg" | "image/png" | "image/webp",
    etag,
    lastModified,
  };
}
