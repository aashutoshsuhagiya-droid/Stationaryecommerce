import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";

import { assertSameOrigin, AuthenticationError } from "@/lib/auth-session";
import { ArtworkUploadError, readLimitedArtworkFormData } from "@/lib/artwork-upload";
import { requireCatalogAdmin } from "@/lib/catalog-admin";
import { apiError, readJson } from "@/lib/http";
import {
  createProductImageAsset,
  isProductImageAssetId,
  isProductImageAssetKind,
  prepareProductImageAssetUpload,
  PRODUCT_IMAGE_MAXIMUM_REQUEST_BYTES,
  productImageAssetUrl,
  ProductImageAssetError,
  type ProductImageAssetKind,
} from "@/lib/product-image-assets";
import { DatabaseConfigurationError, getPrisma } from "@/lib/prisma";
import { consumeRateLimit, requestIdentifier } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const deleteSchema = z.object({
  productId: z.string().trim().regex(/^[A-Za-z0-9_-]{1,100}$/),
  assetId: z.string().trim().regex(/^[A-Za-z0-9_-]{1,100}$/),
}).strict();

class CatalogImageRequestError extends Error {
  constructor(readonly status: 400 | 404 | 409 | 413 | 422 | 429, readonly code: string, message: string) {
    super(message);
    this.name = "CatalogImageRequestError";
  }
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function nextConfigurationVersion(value: Record<string, unknown>) {
  const current = typeof value.configurationVersion === "string" ? Number(value.configurationVersion) : 0;
  return Number.isSafeInteger(current) && current >= 0 && current < 1_000_000 ? String(current + 1) : "1";
}

function requireSingleText(form: FormData, field: string, options: { optional?: boolean } = {}) {
  const values = form.getAll(field);
  if (options.optional && values.length === 0) return undefined;
  if (values.length !== 1 || typeof values[0] !== "string") {
    throw new CatalogImageRequestError(400, "MULTIPART_FIELD_INVALID", `Submit one ${field} field.`);
  }
  return values[0].trim();
}

function parseUploadForm(form: FormData) {
  const allowedFields = new Set(["productId", "kind", "surfaceId", "altText", "image"]);
  for (const [field] of form.entries()) {
    if (!allowedFields.has(field)) {
      throw new CatalogImageRequestError(400, "MULTIPART_FIELD_INVALID", "The upload includes an unsupported field.");
    }
  }

  const productId = requireSingleText(form, "productId");
  const kind = requireSingleText(form, "kind");
  const surfaceId = requireSingleText(form, "surfaceId", { optional: true });
  const altText = requireSingleText(form, "altText", { optional: true });
  const files = form.getAll("image");
  if (files.length !== 1 || !(files[0] instanceof File)) {
    throw new CatalogImageRequestError(400, "PRODUCT_IMAGE_REQUIRED", "Choose one JPG, PNG or WEBP image to upload.");
  }
  if (!isProductImageAssetId(productId)) {
    throw new CatalogImageRequestError(400, "PRODUCT_ID_INVALID", "Choose a valid product before uploading an image.");
  }
  if (!isProductImageAssetKind(kind)) {
    throw new CatalogImageRequestError(400, "PRODUCT_IMAGE_KIND_INVALID", "Choose a supported product image kind.");
  }
  if (altText && altText.length > 240) {
    throw new CatalogImageRequestError(400, "ALT_TEXT_INVALID", "Image alt text must be 240 characters or fewer.");
  }
  if (kind === "surface-base" && !surfaceId) {
    throw new CatalogImageRequestError(400, "SURFACE_ID_REQUIRED", "Choose a printable surface for this base image.");
  }
  if (kind !== "surface-base" && surfaceId) {
    throw new CatalogImageRequestError(400, "SURFACE_ID_UNEXPECTED", "Only surface base images can specify a surface.");
  }
  return { productId, kind, surfaceId, altText, file: files[0] } as {
    productId: string;
    kind: ProductImageAssetKind;
    surfaceId?: string;
    altText?: string;
    file: File;
  };
}

function configuredSurfaceIds(metadata: unknown) {
  const configurator = objectRecord(objectRecord(metadata).configurator);
  const printAreas = Array.isArray(configurator.printAreas) ? configurator.printAreas : [];
  return new Set(printAreas.flatMap((area) => {
    const record = objectRecord(area);
    return typeof record.id === "string" && /^[a-z][a-z0-9-]{0,79}$/.test(record.id)
      ? [record.id]
      : [];
  }));
}

function bumpedMetadata(metadata: unknown, updateConfigurator: (configurator: Record<string, unknown>) => Record<string, unknown>) {
  const current = objectRecord(metadata);
  const configurator = objectRecord(current.configurator);
  return {
    ...current,
    configurator: {
      ...updateConfigurator(configurator),
      configurationVersion: nextConfigurationVersion(configurator),
    },
  };
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

function uploadRateLimit(request: Request) {
  const limit = consumeRateLimit({
    namespace: "admin-catalog-image-upload",
    identifier: requestIdentifier(request),
    limit: 60,
    windowMs: 15 * 60_000,
  });
  if (!limit.allowed) {
    const error = new CatalogImageRequestError(429, "RATE_LIMITED", "Too many image uploads. Please wait and try again.");
    (error as CatalogImageRequestError & { retryAfterSeconds?: number }).retryAfterSeconds = limit.retryAfterSeconds;
    throw error;
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await requireCatalogAdmin(request);
    uploadRateLimit(request);

    const form = await readLimitedArtworkFormData(request, PRODUCT_IMAGE_MAXIMUM_REQUEST_BYTES);
    const input = parseUploadForm(form);
    const prepared = await prepareProductImageAssetUpload(input.file);
    const prisma = getPrisma() as any;
    const result = await prisma.$transaction(async (transaction: any) => {
      const product = await transaction.product.findUnique({
        where: { id: input.productId },
        select: { id: true, name: true, metadata: true },
      });
      if (!product) {
        throw new CatalogImageRequestError(404, "PRODUCT_NOT_FOUND", "The requested product was not found.");
      }
      if (input.kind === "surface-base" && (!input.surfaceId || !configuredSurfaceIds(product.metadata).has(input.surfaceId))) {
        throw new CatalogImageRequestError(422, "SURFACE_ID_UNKNOWN", "Choose a configured printable surface for this base image.");
      }

      const asset = await createProductImageAsset({ ...input, prepared, database: transaction });
      const url = productImageAssetUrl(asset.id);
      if (input.kind === "primary") {
        await transaction.productImage.upsert({
          where: { productId_sortOrder: { productId: product.id, sortOrder: 0 } },
          update: { url, altText: input.altText || product.name, width: asset.width, height: asset.height },
          create: { productId: product.id, url, altText: input.altText || product.name, width: asset.width, height: asset.height, sortOrder: 0 },
        });
      }
      if (input.kind === "surface-base" && input.surfaceId) {
        const key = `${input.surfaceId}.baseImage`;
        await transaction.product.update({
          where: { id: product.id },
          data: {
            metadata: bumpedMetadata(product.metadata, (configurator) => ({ ...configurator, [key]: url })),
          },
        });
      }
      return asset;
    });

    revalidatePath("/", "layout");
    return NextResponse.json(
      { data: { asset: serializableAsset(result) } },
      { status: 201, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } },
    );
  } catch (error) {
    return catalogImageError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    await requireCatalogAdmin(request);
    const parsed = deleteSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      return apiError(400, "VALIDATION_ERROR", "Choose a valid product image to remove.");
    }

    const prisma = getPrisma() as any;
    const deleted = await prisma.$transaction(async (transaction: any) => {
      const product = await transaction.product.findUnique({
        where: { id: parsed.data.productId },
        select: { id: true, name: true, metadata: true },
      });
      if (!product) {
        throw new CatalogImageRequestError(404, "PRODUCT_NOT_FOUND", "The requested product was not found.");
      }
      const asset = await transaction.productImageAsset.findFirst({
        where: { id: parsed.data.assetId, productId: product.id },
        select: { id: true, kind: true, surfaceId: true },
      });
      if (!asset) {
        throw new CatalogImageRequestError(404, "PRODUCT_IMAGE_NOT_FOUND", "The requested product image was not found.");
      }

      const url = productImageAssetUrl(asset.id);
      if (asset.kind === "primary") {
        const primary = await transaction.productImage.findUnique({
          where: { productId_sortOrder: { productId: product.id, sortOrder: 0 } },
          select: { id: true, url: true },
        });
        if (primary?.url === url) {
          const replacement = await transaction.productImageAsset.findFirst({
            where: { productId: product.id, kind: "primary", id: { not: asset.id } },
            orderBy: { createdAt: "desc" },
            select: { id: true, altText: true, width: true, height: true },
          });
          if (replacement) {
            await transaction.productImage.update({
              where: { id: primary.id },
              data: {
                url: productImageAssetUrl(replacement.id),
                altText: replacement.altText || product.name,
                width: replacement.width,
                height: replacement.height,
              },
            });
          } else {
            await transaction.productImage.delete({ where: { id: primary.id } });
          }
        }
      }
      let nextMetadata = bumpedMetadata(product.metadata, (configurator) => configurator);
      if (asset.kind === "surface-base" && asset.surfaceId) {
        const key = `${asset.surfaceId}.baseImage`;
        const configurator = objectRecord(objectRecord(product.metadata).configurator);
        if (configurator[key] === url) {
          nextMetadata = bumpedMetadata(product.metadata, (current) => {
            const { [key]: _removed, ...remaining } = current;
            return remaining;
          });
        }
      }
      await transaction.product.update({
        where: { id: product.id },
        data: { metadata: nextMetadata },
      });

      await transaction.productImageAsset.delete({ where: { id: asset.id } });
      return asset;
    });

    revalidatePath("/", "layout");
    return NextResponse.json(
      { data: { deleted: true, assetId: deleted.id } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return catalogImageError(error);
  }
}

function catalogImageError(error: unknown) {
  if (error instanceof CatalogImageRequestError) {
    const response = apiError(error.status, error.code, error.message);
    const retryAfter = (error as CatalogImageRequestError & { retryAfterSeconds?: number }).retryAfterSeconds;
    if (retryAfter) response.headers.set("Retry-After", String(retryAfter));
    return response;
  }
  if (error instanceof ProductImageAssetError || error instanceof ArtworkUploadError) {
    return apiError(error.status, error.code, error.message);
  }
  if (error instanceof AuthenticationError) return apiError(error.status, error.code, error.message);
  if (error instanceof DatabaseConfigurationError) {
    return apiError(503, "PRODUCT_IMAGE_STORAGE_UNAVAILABLE", "Product image storage is not configured.");
  }
  if (error instanceof SyntaxError) return apiError(400, "INVALID_JSON", error.message);
  console.error("Unexpected catalog image error", error);
  return apiError(500, "PRODUCT_IMAGE_UPLOAD_FAILED", "The product image could not be stored safely.");
}
