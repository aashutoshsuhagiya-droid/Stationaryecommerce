import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";

import {
  assertSameOrigin,
  AuthenticationError,
  requireRequestActor,
} from "@/lib/auth-session";
import {
  hashArtworkClaimToken,
  verifyArtworkAssetsForOrder,
} from "@/lib/artwork-assets";
import { CommerceError } from "@/lib/commerce-error";
import {
  apiError,
  hasJsonContentType,
  readJson,
  RequestTooLargeError,
  validationError,
} from "@/lib/http";
import { DatabaseConfigurationError, getPrisma } from "@/lib/prisma";
import { consumeRateLimit, requestIdentifier } from "@/lib/rate-limit";
import {
  parseStoredSavedDesignValues,
  replaceSavedDesignArtworkAssets,
  savedArtworkReuseAction,
  storedSavedDesignValues,
  type SavedArtworkAsset,
} from "@/lib/saved-design";
import { savedDesignInputSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAXIMUM_SAVED_DESIGN_BYTES = 4 * 1024 * 1024;
const MAXIMUM_SAVED_DESIGNS_PER_USER = 50;
const SAVED_DESIGN_ASSET_TTL_MS = 365 * 24 * 60 * 60 * 1_000;
const privateHeaders = { "Cache-Control": "private, no-store" } as const;
const reusableArtworkInputSchema = savedDesignInputSchema
  .pick({ id: true, productId: true })
  .strict();

type SavedDesignRecord = {
  id: string;
  productId: string;
  templateId: string | null;
  values: unknown;
  updatedAt: Date;
};

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function designResponse(record: SavedDesignRecord) {
  const parsed = parseStoredSavedDesignValues(record.values);
  if (!parsed.success) return null;
  return {
    id: record.id,
    productId: record.productId,
    ...(record.templateId ? { templateId: record.templateId } : { templateId: "" }),
    ...parsed.data,
    savedAt: record.updatedAt.toISOString(),
  };
}

async function refreshReusableArtworkClaims(
  record: SavedDesignRecord,
  userId: string,
) {
  const parsedValues = parseStoredSavedDesignValues(record.values);
  if (!parsedValues.success) {
    throw new CommerceError(409, "SAVED_DESIGN_INVALID", "This saved design can no longer be restored.");
  }
  const response = designResponse(record);
  if (!response) {
    throw new CommerceError(409, "SAVED_DESIGN_INVALID", "This saved design can no longer be restored.");
  }
  const references = response.artwork.surfaces.flatMap((surface) =>
    surface.layers.flatMap((layer) =>
      layer.type === "image" && layer.asset
        ? [{ surfaceId: surface.id, asset: layer.asset }]
        : []));
  if (!references.length) return response;
  const ids = references.map((reference) => reference.asset.id);
  if (new Set(ids).size !== ids.length) {
    throw new CommerceError(409, "SAVED_DESIGN_ARTWORK_INVALID", "This saved design has duplicate artwork references.");
  }

  const reusableUntil = new Date(Date.now() + SAVED_DESIGN_ASSET_TTL_MS);
  const prisma = getPrisma();
  return prisma.$transaction(async (transaction) => {
    const assets = await transaction.artworkAsset.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        productId: true,
        orderItemId: true,
        ownerUserId: true,
        surfaceId: true,
        claimTokenHash: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        width: true,
        height: true,
        hasTransparency: true,
        sha256: true,
        content: true,
        status: true,
      },
    });
    const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
    const replacements = new Map<string, SavedArtworkAsset>();

    for (const reference of references) {
      const asset = assetsById.get(reference.asset.id);
      const metadataMatches = Boolean(
        asset
        && asset.productId === record.productId
        && asset.ownerUserId === userId
        && asset.surfaceId === reference.surfaceId
        && asset.mimeType === reference.asset.mimeType
        && asset.sizeBytes === reference.asset.sizeBytes
        && asset.width === reference.asset.width
        && asset.height === reference.asset.height
        && (!reference.asset.sha256 || reference.asset.sha256 === asset.sha256)
        && reference.asset.claimToken
        && hashArtworkClaimToken(reference.asset.claimToken) === asset.claimTokenHash
      );
      if (!asset || !metadataMatches) {
        throw new CommerceError(409, "SAVED_DESIGN_ARTWORK_UNAVAILABLE", "Saved artwork is unavailable or no longer belongs to this design.");
      }

      const reuseAction = savedArtworkReuseAction(asset.status, asset.orderItemId);
      if (reuseAction === "renew") {
        const renewed = await transaction.artworkAsset.updateMany({
          where: {
            id: asset.id,
            productId: record.productId,
            ownerUserId: userId,
            status: "UPLOADED",
            orderItemId: null,
          },
          data: { expiresAt: reusableUntil },
        });
        if (renewed.count !== 1) {
          throw new CommerceError(409, "SAVED_DESIGN_ARTWORK_CHANGED", "Saved artwork changed while the design was loading. Try again.");
        }
        continue;
      }

      if (reuseAction !== "copy") {
        throw new CommerceError(409, "SAVED_DESIGN_ARTWORK_UNAVAILABLE", "Saved artwork must be uploaded again before this design can be ordered.");
      }

      const claimToken = randomBytes(32).toString("base64url");
      const copy = await transaction.artworkAsset.create({
        data: {
          productId: asset.productId,
          surfaceId: asset.surfaceId,
          ownerUserId: userId,
          claimTokenHash: hashArtworkClaimToken(claimToken),
          originalName: asset.originalName,
          mimeType: asset.mimeType,
          sizeBytes: asset.sizeBytes,
          width: asset.width,
          height: asset.height,
          hasTransparency: asset.hasTransparency,
          sha256: asset.sha256,
          content: asset.content,
          expiresAt: reusableUntil,
        },
        select: { id: true },
      });
      replacements.set(asset.id, {
        ...reference.asset,
        id: copy.id,
        claimToken,
      });
    }

    const artwork = replaceSavedDesignArtworkAssets(response.artwork, replacements);
    if (replacements.size) {
      const updated = await transaction.customizationConfiguration.updateMany({
        where: {
          id: record.id,
          userId,
          productId: record.productId,
          updatedAt: record.updatedAt,
        },
        data: {
          values: asJson({ ...parsedValues.data, artwork }),
          updatedAt: record.updatedAt,
        },
      });
      if (updated.count !== 1) {
        throw new CommerceError(409, "SAVED_DESIGN_CHANGED", "This saved design changed while it was loading. Try again.");
      }
    }
    return { ...response, artwork };
  }, { isolationLevel: "Serializable" });
}

function customizationError(error: unknown) {
  if (error instanceof CommerceError) return apiError(error.status, error.code, error.message, error.details);
  if (error instanceof AuthenticationError) return apiError(error.status, error.code, error.message);
  if (error instanceof RequestTooLargeError) {
    return apiError(413, "SAVED_DESIGN_TOO_LARGE", "The saved design is too large to sync safely.");
  }
  if (error instanceof SyntaxError) return apiError(400, "INVALID_JSON", error.message);
  if (error instanceof DatabaseConfigurationError) {
    return apiError(503, "SAVED_DESIGNS_UNAVAILABLE", "Account design storage is not configured.");
  }
  console.error("Unexpected saved-design error", error);
  return apiError(500, "SAVED_DESIGN_FAILED", "The saved design could not be processed.");
}

export async function GET(request: Request) {
  try {
    const actor = await requireRequestActor(request);
    const productId = new URL(request.url).searchParams.get("productId")?.trim();
    if (productId && (productId.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(productId))) {
      return apiError(400, "PRODUCT_ID_INVALID", "Choose a valid product.");
    }
    const records = await getPrisma().customizationConfiguration.findMany({
      where: { userId: actor.userId, ...(productId ? { productId } : {}) },
      orderBy: { updatedAt: "desc" },
      take: MAXIMUM_SAVED_DESIGNS_PER_USER,
      select: { id: true, productId: true, templateId: true, values: true, updatedAt: true },
    });
    return NextResponse.json(
      { data: records.flatMap((record) => designResponse(record) ?? []) },
      { headers: privateHeaders },
    );
  } catch (error) {
    return customizationError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await requireRequestActor(request);
    if (!hasJsonContentType(request)) {
      return apiError(415, "JSON_REQUIRED", "Saved designs must use application/json.");
    }
    const limit = consumeRateLimit({
      namespace: "saved-design-write",
      identifier: `${actor.userId}:${requestIdentifier(request)}`,
      limit: 120,
      windowMs: 60 * 60 * 1_000,
    });
    if (!limit.allowed) {
      const response = apiError(429, "RATE_LIMITED", "Too many saved-design changes. Please wait and try again.");
      response.headers.set("Retry-After", String(limit.retryAfterSeconds));
      return response;
    }
    const parsed = savedDesignInputSchema.safeParse(
      await readJson(request, MAXIMUM_SAVED_DESIGN_BYTES),
    );
    if (!parsed.success) return validationError(parsed.error);
    const input = parsed.data;
    const prisma = getPrisma();
    const product = await prisma.product.findFirst({
      where: { id: input.productId, status: "ACTIVE" },
      select: {
        customizable: true,
        variants: {
          where: { id: input.variantId, isActive: true },
          select: { id: true },
        },
      },
    });
    if (!product || !product.customizable) {
      return apiError(422, "PRODUCT_NOT_CUSTOMIZABLE", "This product cannot store account designs.");
    }
    if (product.variants.length !== 1) {
      return apiError(422, "VARIANT_INVALID", "The selected product option is no longer available.");
    }
    if (input.templateId) {
      const templateLink = await prisma.productTemplate.findUnique({
        where: {
          productId_templateId: {
            productId: input.productId,
            templateId: input.templateId,
          },
        },
        select: { template: { select: { status: true } } },
      });
      if (templateLink?.template.status !== "ACTIVE") {
        return apiError(422, "TEMPLATE_INVALID", "The selected design template is no longer available.");
      }
    }
    const verifiedArtwork = await verifyArtworkAssetsForOrder({
      productId: input.productId,
      artwork: input.artwork,
      ownerUserId: actor.userId,
    });

    const existing = await prisma.customizationConfiguration.findUnique({
      where: { id: input.id },
      select: { id: true, userId: true, productId: true, cartItem: { select: { id: true } } },
    });
    if (existing && (existing.userId !== actor.userId || existing.productId !== input.productId)) {
      return apiError(404, "SAVED_DESIGN_NOT_FOUND", "The saved design could not be found.");
    }
    if (existing?.cartItem) {
      return apiError(409, "SAVED_DESIGN_IN_USE", "Save this cart design as a new copy before changing it.");
    }
    if (!existing) {
      const count = await prisma.customizationConfiguration.count({ where: { userId: actor.userId } });
      if (count >= MAXIMUM_SAVED_DESIGNS_PER_USER) {
        return apiError(409, "SAVED_DESIGN_LIMIT", "Your account can store up to 50 saved designs.");
      }
    }

    const values = storedSavedDesignValues(input);
    if (verifiedArtwork?.claims.length) {
      const claimed = await prisma.artworkAsset.updateMany({
        where: {
          id: { in: verifiedArtwork.claims.map((claim) => claim.id) },
          productId: input.productId,
          status: "UPLOADED",
          orderItemId: null,
          expiresAt: { gt: new Date() },
          OR: [{ ownerUserId: null }, { ownerUserId: actor.userId }],
        },
        data: {
          ownerUserId: actor.userId,
          expiresAt: new Date(Date.now() + SAVED_DESIGN_ASSET_TTL_MS),
        },
      });
      if (claimed.count !== verifiedArtwork.claims.length) {
        throw new CommerceError(409, "SAVED_DESIGN_ARTWORK_CHANGED", "Artwork changed while this design was saving. Try again.");
      }
    }
    const data = {
      productId: input.productId,
      templateId: input.templateId || null,
      values: asJson(values),
      previewVersion: 1,
      artworkStatus: "DRAFT" as const,
    };
    const record = existing
      ? await prisma.customizationConfiguration.update({
          where: { id: existing.id },
          data,
          select: { id: true, productId: true, templateId: true, values: true, updatedAt: true },
        })
      : await prisma.customizationConfiguration.create({
          data: { id: input.id, userId: actor.userId, ...data },
          select: { id: true, productId: true, templateId: true, values: true, updatedAt: true },
        });
    return NextResponse.json(
      { data: designResponse(record) },
      { status: existing ? 200 : 201, headers: privateHeaders },
    );
  } catch (error) {
    return customizationError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await requireRequestActor(request);
    if (!hasJsonContentType(request)) {
      return apiError(415, "JSON_REQUIRED", "Saved designs must use application/json.");
    }
    const limit = consumeRateLimit({
      namespace: "saved-design-artwork-refresh",
      identifier: `${actor.userId}:${requestIdentifier(request)}`,
      limit: 60,
      windowMs: 60 * 60 * 1_000,
    });
    if (!limit.allowed) {
      const response = apiError(429, "RATE_LIMITED", "Too many saved-design loads. Please wait and try again.");
      response.headers.set("Retry-After", String(limit.retryAfterSeconds));
      return response;
    }
    const parsed = reusableArtworkInputSchema.safeParse(
      await readJson(request, 8 * 1024),
    );
    if (!parsed.success) return validationError(parsed.error);
    const record = await getPrisma().customizationConfiguration.findFirst({
      where: {
        id: parsed.data.id,
        productId: parsed.data.productId,
        userId: actor.userId,
      },
      select: {
        id: true,
        productId: true,
        templateId: true,
        values: true,
        updatedAt: true,
        cartItem: { select: { id: true } },
      },
    });
    if (!record) {
      return apiError(404, "SAVED_DESIGN_NOT_FOUND", "The saved design could not be found.");
    }
    if (record.cartItem) {
      return apiError(409, "SAVED_DESIGN_IN_USE", "This cart design cannot issue reusable artwork.");
    }
    return NextResponse.json(
      { data: await refreshReusableArtworkClaims(record, actor.userId) },
      { headers: privateHeaders },
    );
  } catch (error) {
    return customizationError(error);
  }
}
