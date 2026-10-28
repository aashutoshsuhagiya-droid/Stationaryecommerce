import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { CommerceError } from "./commerce-error";
import { resolveProductArtworkPolicy } from "./artwork-policy";
import {
  ArtworkUploadError,
  supportedArtworkMimeTypes,
  validateArtworkUpload,
  type PreparedArtworkUpload,
  type SupportedArtworkMimeType,
} from "./artwork-upload";
import { getPrisma } from "./prisma";
import { getStorefrontProductById } from "./runtime-catalog";
import { canVendorAccessApprovedArtwork } from "./vendor-operations-domain";
import type { AuthActor } from "./auth-session";
import type { ArtworkDocumentSnapshot } from "./types";

const UNATTACHED_ASSET_TTL_MS = 24 * 60 * 60 * 1_000;

export function hashArtworkClaimToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function safeMimeTypes(values: readonly string[]) {
  return values.filter((value): value is SupportedArtworkMimeType =>
    supportedArtworkMimeTypes.includes(value as SupportedArtworkMimeType));
}

async function uploadContext(productId: string, surfaceId: string) {
  const prisma = getPrisma();
  const persistent = await prisma.product.findFirst({
    where: {
      id: productId,
      status: "ACTIVE",
      publishedAt: { not: null, lte: new Date() },
      archivedAt: null,
    },
    select: { id: true },
  });
  if (!persistent) {
    throw new CommerceError(404, "PRODUCT_NOT_FOUND", "This product is not available for artwork uploads.");
  }
  const product = await getStorefrontProductById(productId);
  if (!product || !product.customizable) {
    throw new CommerceError(422, "ARTWORK_UPLOAD_NOT_SUPPORTED", "This product does not accept customer artwork.");
  }
  const upload = product.configurator?.artworkUpload;
  const policy = resolveProductArtworkPolicy(product);
  const surface = policy.surfaces.find((candidate) => candidate.id === surfaceId);
  if (!upload?.enabled || !surface?.image.enabled) {
    throw new CommerceError(422, "ARTWORK_UPLOAD_NOT_SUPPORTED", "Artwork upload is not enabled for this product surface.", {
      productId,
      surfaceId,
    });
  }
  const configuredMimeTypes = safeMimeTypes(upload.acceptedMimeTypes);
  const allowedMimeTypes = surface.image.allowedMimeTypes.filter((mimeType) => configuredMimeTypes.includes(mimeType));
  const maximumBytes = Math.min(upload.maximumBytes, surface.image.maximumBytes, 20 * 1024 * 1024);
  if (!allowedMimeTypes.length || !Number.isSafeInteger(maximumBytes) || maximumBytes < 1) {
    throw new CommerceError(422, "ARTWORK_UPLOAD_POLICY_INVALID", "This product does not have a safe artwork upload policy.", {
      productId,
      surfaceId,
    });
  }
  return { product, surface, allowedMimeTypes, maximumBytes };
}

function verifyAspectRatio(
  prepared: PreparedArtworkUpload,
  allowedRatios: readonly number[],
  tolerance: number,
) {
  if (!allowedRatios.length) return;
  const ratio = prepared.width / prepared.height;
  const matched = allowedRatios.some((allowed) =>
    Number.isFinite(allowed) && allowed > 0 && Math.abs(ratio - allowed) <= tolerance);
  if (!matched) {
    throw new ArtworkUploadError("ARTWORK_ASPECT_RATIO_INVALID", "The artwork aspect ratio does not match this product.");
  }
}

export async function createPrivateArtworkAsset(input: {
  productId: string;
  surfaceId: string;
  file: File;
  ownerUserId?: string;
}) {
  const { surface, allowedMimeTypes, maximumBytes } = await uploadContext(input.productId, input.surfaceId);
  const prepared = await validateArtworkUpload(input.file, {
    allowedMimeTypes,
    maximumBytes,
    minimumWidth: surface.image.minimumSourceWidth,
    minimumHeight: surface.image.minimumSourceHeight,
    maximumWidth: surface.image.maximumSourceWidth,
    maximumHeight: surface.image.maximumSourceHeight,
    allowTransparency: surface.image.allowTransparency,
  });
  verifyAspectRatio(prepared, surface.image.allowedAspectRatios, surface.image.aspectRatioTolerance);

  const claimToken = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + UNATTACHED_ASSET_TTL_MS);
  const prisma = getPrisma();
  // Expired, unattached originals have no production purpose. Prune them on
  // the next upload so abandoned guest files cannot accumulate indefinitely.
  await prisma.artworkAsset.deleteMany({
    where: { status: "UPLOADED", orderItemId: null, expiresAt: { lte: now } },
  });
  const asset = await prisma.artworkAsset.create({
    data: {
      productId: input.productId,
      surfaceId: input.surfaceId,
      ...(input.ownerUserId ? { ownerUserId: input.ownerUserId } : {}),
      claimTokenHash: hashArtworkClaimToken(claimToken),
      originalName: prepared.originalName,
      mimeType: prepared.mimeType,
      sizeBytes: prepared.sizeBytes,
      width: prepared.width,
      height: prepared.height,
      hasTransparency: prepared.hasTransparency,
      sha256: prepared.sha256,
      content: prepared.content,
      expiresAt,
    },
    select: {
      id: true,
      mimeType: true,
      sizeBytes: true,
      width: true,
      height: true,
      hasTransparency: true,
      sha256: true,
      expiresAt: true,
    },
  });
  return { ...asset, claimToken };
}

function tokenMatches(candidate: string, expectedHash: string) {
  const actual = Buffer.from(hashArtworkClaimToken(candidate), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function getPrivateArtworkAsset(input: {
  id: string;
  claimToken?: string;
  actor: AuthActor | null;
}) {
  const asset = await getPrisma().artworkAsset.findUnique({
    where: { id: input.id },
    include: {
      orderItem: {
        select: {
          order: {
            select: {
              assignment: {
                select: {
                  status: true,
                  assignedVendor: {
                    select: { userId: true, verificationStatus: true, operationalStatus: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!asset) throw new CommerceError(404, "ARTWORK_ASSET_NOT_FOUND", "Artwork asset not found.");
  const assignment = asset.orderItem?.order.assignment;
  const assignedVendor = assignment?.assignedVendor;
  const vendorAllowed = Boolean(
    input.actor?.permissions.includes("vendor.orders.manage") &&
    assignedVendor?.userId === input.actor.userId &&
    assignment &&
    canVendorAccessApprovedArtwork(assignedVendor, assignment.status, asset.status),
  );
  const actorAllowed = Boolean(
    input.actor && (
      asset.ownerUserId === input.actor.userId ||
      input.actor.permissions.includes("orders.read") ||
      input.actor.permissions.includes("catalog.manage") ||
      vendorAllowed
    ),
  );
  const claimAllowed = Boolean(
    input.claimToken &&
    ["UPLOADED", "ATTACHED", "APPROVED", "REJECTED"].includes(asset.status) &&
    asset.expiresAt > new Date() &&
    tokenMatches(input.claimToken, asset.claimTokenHash),
  );
  if (!actorAllowed && !claimAllowed) {
    throw new CommerceError(404, "ARTWORK_ASSET_NOT_FOUND", "Artwork asset not found.");
  }
  return asset;
}

export interface VerifiedArtworkAssetClaim {
  id: string;
  claimTokenHash: string;
}

export interface VerifiedArtworkAssets {
  claims: VerifiedArtworkAssetClaim[];
  artwork: ArtworkDocumentSnapshot;
}

/** Verifies opaque asset claims before checkout and removes secrets/preview data from the order snapshot. */
export async function verifyArtworkAssetsForOrder(input: {
  productId: string;
  artwork?: ArtworkDocumentSnapshot;
  ownerUserId?: string;
}): Promise<VerifiedArtworkAssets | undefined> {
  if (!input.artwork) return undefined;
  const imageLayers = input.artwork.surfaces.flatMap((surface) =>
    surface.layers.flatMap((layer) => layer.type === "image" ? [{ surfaceId: surface.id, layer }] : []));
  if (!imageLayers.length) return { claims: [], artwork: input.artwork };

  const missingClaim = imageLayers.find(({ layer }) => !layer.asset?.id || !layer.asset.claimToken);
  if (missingClaim) {
    throw new CommerceError(422, "ARTWORK_ASSET_REQUIRED", "Each uploaded image must be stored privately before checkout.", {
      productId: input.productId,
      layerId: missingClaim.layer.id,
    });
  }
  const ids = imageLayers.map(({ layer }) => layer.asset!.id);
  if (new Set(ids).size !== ids.length) {
    throw new CommerceError(422, "ARTWORK_ASSET_DUPLICATED", "An uploaded asset can only be used once in a product design.", {
      productId: input.productId,
    });
  }

  const assets = await getPrisma().artworkAsset.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      productId: true,
      orderItemId: true,
      ownerUserId: true,
      surfaceId: true,
      claimTokenHash: true,
      mimeType: true,
      sizeBytes: true,
      width: true,
      height: true,
      hasTransparency: true,
      sha256: true,
      status: true,
      expiresAt: true,
    },
  });
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const now = new Date();
  const claims: VerifiedArtworkAssetClaim[] = [];
  const sanitizedById = new Map<string, {
    id: string;
    mimeType: "image/jpeg" | "image/png" | "image/webp";
    sizeBytes: number;
    width: number;
    height: number;
    hasTransparency: boolean;
    sha256: string;
  }>();

  for (const { surfaceId, layer } of imageLayers) {
    const reference = layer.asset!;
    const asset = byId.get(reference.id);
    const mimeType = asset && safeMimeTypes([asset.mimeType])[0];
    const valid = Boolean(
      asset &&
      mimeType &&
      asset.productId === input.productId &&
      asset.surfaceId === surfaceId &&
      asset.status === "UPLOADED" &&
      asset.orderItemId === null &&
      asset.expiresAt > now &&
      (!asset.ownerUserId || !input.ownerUserId || asset.ownerUserId === input.ownerUserId) &&
      reference.claimToken && tokenMatches(reference.claimToken, asset.claimTokenHash) &&
      reference.mimeType === mimeType &&
      reference.sizeBytes === asset.sizeBytes &&
      reference.width === asset.width &&
      reference.height === asset.height &&
      (reference.sha256 === undefined || reference.sha256 === asset.sha256)
    );
    if (!valid || !asset || !mimeType) {
      throw new CommerceError(422, "ARTWORK_ASSET_INVALID", "An uploaded artwork claim is invalid or has expired.", {
        productId: input.productId,
        layerId: layer.id,
      });
    }
    claims.push({ id: asset.id, claimTokenHash: asset.claimTokenHash });
    sanitizedById.set(asset.id, {
      id: asset.id,
      mimeType,
      sizeBytes: asset.sizeBytes,
      width: asset.width,
      height: asset.height,
      hasTransparency: asset.hasTransparency,
      sha256: asset.sha256,
    });
  }

  return {
    claims,
    artwork: {
      ...input.artwork,
      surfaces: input.artwork.surfaces.map((surface) => ({
        ...surface,
        layers: surface.layers.map((layer) => layer.type === "image"
          ? {
              ...layer,
              src: undefined,
              asset: sanitizedById.get(layer.asset!.id),
            }
          : layer),
      })),
    },
  };
}
