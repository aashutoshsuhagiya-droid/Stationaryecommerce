import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";

import { assertSameOrigin, AuthenticationError } from "@/lib/auth-session";
import { requireCatalogAdmin } from "@/lib/catalog-admin";
import { apiError, readJson, validationError } from "@/lib/http";
import {
  createProductImageAsset,
  hasConfiguredProductImageSurface,
  linkProductSurfaceBaseImage,
  PRODUCT_IMAGE_MAXIMUM_FILE_BYTES,
  ProductImageAssetError,
  productImageAssetUrl,
} from "@/lib/product-image-assets";
import { DatabaseConfigurationError, getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  productId: z.string().trim().regex(/^[A-Za-z0-9_-]{1,100}$/),
  surfaceId: z.string().trim().regex(/^[a-z][a-z0-9-]{0,79}$/),
  source: z.enum(["primary", "visualization"]),
}).strict();

function objectRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function serializableAsset(asset: any) {
  return {
    id: asset.id,
    productId: asset.productId,
    kind: asset.kind,
    surfaceId: asset.surfaceId,
    altText: asset.altText,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
    width: asset.width,
    height: asset.height,
    sha256: asset.sha256,
    createdAt: asset.createdAt,
    url: productImageAssetUrl(asset.id),
    publicUrl: productImageAssetUrl(asset.id),
  };
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await requireCatalogAdmin(request);
    const parsed = schema.safeParse(await readJson(request));
    if (!parsed.success) return validationError(parsed.error);

    const prisma = getPrisma() as any;
    const asset = await prisma.$transaction(async (transaction: any) => {
      const product = await transaction.product.findUnique({
        where: { id: parsed.data.productId },
        include: {
          images: { where: { sortOrder: 0 }, take: 1, select: { url: true } },
          imageAssets: {
            where: { kind: "primary" },
            orderBy: { createdAt: "desc" },
            select: {
              id: true, mimeType: true, sizeBytes: true, width: true, height: true,
              sha256: true, content: true, altText: true,
            },
          },
        },
      });
      if (!product) throw new ProductImageAssetError(404, "PRODUCT_NOT_FOUND", "The requested product was not found.");
      if (!hasConfiguredProductImageSurface(product.metadata, parsed.data.surfaceId)) {
        throw new ProductImageAssetError(422, "SURFACE_ID_UNKNOWN", "Choose a configured printable surface for this base image.");
      }

      let source: any;
      if (parsed.data.source === "primary") {
        const currentUrl = product.images[0]?.url;
        source = product.imageAssets.find((candidate: any) => productImageAssetUrl(candidate.id) === currentUrl)
          ?? product.imageAssets[0];
      } else {
        const configurator = objectRecord(objectRecord(product.metadata).configurator);
        const previewTemplate = typeof configurator.previewTemplate === "string"
          ? configurator.previewTemplate.replace(/^visualization:/, "")
          : undefined;
        const template = await transaction.visualizationTemplate.findFirst({
          where: {
            productId: product.id,
            status: "PUBLISHED",
            ...(previewTemplate ? { id: previewTemplate } : {}),
          },
          orderBy: { publishedAt: "desc" },
          select: {
            sourceJob: {
              select: {
                sourceAsset: {
                  select: {
                    originalName: true, mimeType: true, sizeBytes: true, width: true,
                    height: true, sha256: true, content: true,
                  },
                },
              },
            },
          },
        });
        source = template?.sourceJob?.sourceAsset;
      }

      if (!source?.content || !source.sha256 || !source.width || !source.height) {
        throw new ProductImageAssetError(404, "SOURCE_IMAGE_NOT_FOUND", "There is no reusable image for this product yet.");
      }
      if (!["image/jpeg", "image/png", "image/webp"].includes(source.mimeType) || source.sizeBytes > PRODUCT_IMAGE_MAXIMUM_FILE_BYTES) {
        throw new ProductImageAssetError(422, "SOURCE_IMAGE_INVALID", "The reusable image must be a JPG, PNG or WEBP up to 10 MB.");
      }
      const copied = await createProductImageAsset({
        productId: product.id,
        kind: "surface-base",
        surfaceId: parsed.data.surfaceId,
        altText: source.altText ?? `${product.name} base image`,
        prepared: {
          originalName: source.originalName ?? `${product.slug}-base-image`,
          mimeType: source.mimeType,
          sizeBytes: source.sizeBytes,
          width: source.width,
          height: source.height,
          hasTransparency: false,
          sha256: source.sha256,
          content: new Uint8Array(source.content),
        },
        database: transaction,
      });
      await linkProductSurfaceBaseImage({
        database: transaction,
        product,
        surfaceId: parsed.data.surfaceId,
        assetId: copied.id,
      });
      return copied;
    });
    revalidatePath("/", "layout");
    return NextResponse.json({ data: { asset: serializableAsset(asset) } }, {
      status: 201,
      headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch (error) {
    if (error instanceof ProductImageAssetError) return apiError(error.status, error.code, error.message);
    if (error instanceof AuthenticationError) return apiError(error.status, error.code, error.message);
    if (error instanceof DatabaseConfigurationError) return apiError(503, "PRODUCT_IMAGE_STORAGE_UNAVAILABLE", "Product image storage is not configured.");
    if (error instanceof SyntaxError) return apiError(400, "INVALID_JSON", error.message);
    console.error("Unexpected catalog image source-copy error", error);
    return apiError(500, "PRODUCT_IMAGE_SOURCE_COPY_FAILED", "The product image could not be reused safely.");
  }
}
