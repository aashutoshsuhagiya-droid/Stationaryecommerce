import { createHash } from "node:crypto";

import {
  supportedArtworkMimeTypes,
  validateArtworkUpload,
  type PreparedArtworkUpload,
} from "./artwork-upload";

export const productImageAssetKinds = ["primary", "gallery", "surface-base"] as const;
export type ProductImageAssetKind = (typeof productImageAssetKinds)[number];

export const PRODUCT_IMAGE_MAXIMUM_FILE_BYTES = 10 * 1024 * 1024;
export const PRODUCT_IMAGE_MAXIMUM_REQUEST_BYTES = PRODUCT_IMAGE_MAXIMUM_FILE_BYTES + 128 * 1024;

const publicRasterMimeTypes = new Set(supportedArtworkMimeTypes);
const productImageIdPattern = /^[A-Za-z0-9_-]{1,100}$/;
const productImagePublicPathPattern = /^\/api\/product-images\/[A-Za-z0-9_-]{1,100}$/;

export class ProductImageAssetError extends Error {
  constructor(readonly status: 400 | 404 | 409 | 413 | 422 | 500, readonly code: string, message: string) {
    super(message);
    this.name = "ProductImageAssetError";
  }
}

export function isProductImageAssetKind(value: unknown): value is ProductImageAssetKind {
  return typeof value === "string" && productImageAssetKinds.includes(value as ProductImageAssetKind);
}

export function isProductImageAssetId(value: unknown): value is string {
  return typeof value === "string" && productImageIdPattern.test(value);
}

export function productImageAssetUrl(id: string) {
  return `/api/product-images/${id}`;
}

/** Allows the one first-party public path written by the catalog image endpoint. */
export function isFirstPartyProductImageUrl(value: unknown): value is string {
  return typeof value === "string" && productImagePublicPathPattern.test(value);
}

function etagMatches(candidate: string | null | undefined, etag: string) {
  return candidate?.split(",").some((value) => value.trim() === etag || value.trim() === "*") ?? false;
}

export function productImageAssetEtag(input: {
  id: string;
  sha256: string;
  updatedAt: Date | string;
}) {
  const digest = createHash("sha256")
    .update(input.id)
    .update("\0")
    .update(input.sha256)
    .update("\0")
    .update(new Date(input.updatedAt).toISOString())
    .digest("base64url");
  return `"product-image-${digest}"`;
}

function metadataRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function hasConfiguredSurface(metadata: unknown, surfaceId: string) {
  const configurator = metadataRecord(metadataRecord(metadata).configurator);
  const printAreas = Array.isArray(configurator.printAreas) ? configurator.printAreas : [];
  return printAreas.some((area) => metadataRecord(area).id === surfaceId);
}

async function database() {
  // Keep this dynamic so pure validation helpers remain runnable by the domain test runner.
  const { getPrisma } = await import("./prisma");
  return getPrisma() as any;
}

function validateCreateInput(input: {
  productId: string;
  kind: ProductImageAssetKind;
  surfaceId?: string;
  altText?: string;
}) {
  if (!isProductImageAssetId(input.productId)) {
    throw new ProductImageAssetError(400, "PRODUCT_ID_INVALID", "Choose a valid product before uploading an image.");
  }
  if (!isProductImageAssetKind(input.kind)) {
    throw new ProductImageAssetError(400, "PRODUCT_IMAGE_KIND_INVALID", "Choose a supported product image kind.");
  }
  if (input.kind === "surface-base") {
    if (!input.surfaceId || !/^[a-z][a-z0-9-]{0,79}$/.test(input.surfaceId)) {
      throw new ProductImageAssetError(400, "SURFACE_ID_INVALID", "Choose a valid printable surface.");
    }
  } else if (input.surfaceId) {
    throw new ProductImageAssetError(400, "SURFACE_ID_UNEXPECTED", "Only surface base images can specify a surface.");
  }
  if (input.altText && input.altText.trim().length > 240) {
    throw new ProductImageAssetError(400, "ALT_TEXT_INVALID", "Image alt text must be 240 characters or fewer.");
  }
}

/** Reuses the customer artwork decoder so product imagery has the same raster guarantees. */
export async function prepareProductImageAssetUpload(file: File): Promise<PreparedArtworkUpload> {
  return validateArtworkUpload(file, {
    allowedMimeTypes: supportedArtworkMimeTypes,
    maximumBytes: PRODUCT_IMAGE_MAXIMUM_FILE_BYTES,
    minimumWidth: 1,
    minimumHeight: 1,
    maximumWidth: 30_000,
    maximumHeight: 30_000,
  });
}

export async function createProductImageAsset(input: {
  productId: string;
  kind: ProductImageAssetKind;
  surfaceId?: string;
  altText?: string;
  file: File;
  prepared?: PreparedArtworkUpload;
  database?: any;
}) {
  validateCreateInput(input);
  const prepared = input.prepared ?? await prepareProductImageAssetUpload(input.file);
  const prisma = input.database ?? await database();
  return prisma.productImageAsset.create({
    data: {
      productId: input.productId,
      kind: input.kind,
      surfaceId: input.kind === "surface-base" ? input.surfaceId : null,
      altText: input.altText?.trim() || null,
      mimeType: prepared.mimeType,
      sizeBytes: prepared.sizeBytes,
      width: prepared.width,
      height: prepared.height,
      sha256: prepared.sha256,
      content: Buffer.from(prepared.content),
    },
    select: {
      id: true,
      productId: true,
      kind: true,
      surfaceId: true,
      altText: true,
      mimeType: true,
      sizeBytes: true,
      width: true,
      height: true,
      sha256: true,
      createdAt: true,
    },
  });
}

function unavailable(): never {
  throw new ProductImageAssetError(404, "PRODUCT_IMAGE_NOT_FOUND", "Product image not found.");
}

function isCurrentPublicAsset(asset: any) {
  const publicUrl = productImageAssetUrl(asset.id);
  if (asset.kind === "gallery") return true;
  if (asset.kind === "primary") return asset.product?.images?.[0]?.url === publicUrl;
  if (asset.kind !== "surface-base" || !asset.surfaceId) return false;
  const configurator = metadataRecord(metadataRecord(asset.product?.metadata).configurator);
  return hasConfiguredSurface(asset.product?.metadata, asset.surfaceId)
    && configurator[`${asset.surfaceId}.baseImage`] === publicUrl;
}

/** Finds a public asset only while its product is currently live and still references it. */
export async function getProductImageAssetForServing(input: {
  id: string;
  ifNoneMatch?: string | null;
}) {
  if (!isProductImageAssetId(input.id)) unavailable();

  const prisma = await database();
  const now = new Date();
  const asset = await prisma.productImageAsset.findFirst({
    where: {
      id: input.id,
      mimeType: { in: [...publicRasterMimeTypes] },
      product: {
        is: {
          status: "ACTIVE",
          publishedAt: { not: null, lte: now },
          archivedAt: null,
        },
      },
    },
    select: {
      id: true,
      kind: true,
      surfaceId: true,
      mimeType: true,
      width: true,
      height: true,
      sha256: true,
      content: true,
      updatedAt: true,
      product: {
        select: {
          id: true,
          status: true,
          publishedAt: true,
          archivedAt: true,
          metadata: true,
          images: { where: { sortOrder: 0 }, take: 1, select: { url: true } },
        },
      },
    },
  });

  if (
    !asset
    || !asset.content
    || !asset.sha256
    || !asset.width
    || !asset.height
    || !publicRasterMimeTypes.has(asset.mimeType)
    || asset.product?.status !== "ACTIVE"
    || !asset.product.publishedAt
    || asset.product.publishedAt > now
    || asset.product.archivedAt
    || !isCurrentPublicAsset(asset)
  ) unavailable();

  const etag = productImageAssetEtag(asset);
  const lastModified = new Date(asset.updatedAt).toUTCString();
  if (etagMatches(input.ifNoneMatch, etag)) {
    return { notModified: true as const, etag, lastModified };
  }

  return {
    notModified: false as const,
    content: Buffer.from(asset.content),
    mimeType: asset.mimeType as "image/jpeg" | "image/png" | "image/webp",
    etag,
    lastModified,
  };
}
