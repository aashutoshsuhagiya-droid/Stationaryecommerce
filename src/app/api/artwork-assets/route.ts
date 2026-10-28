import { NextResponse } from "next/server";

import { assertSameOrigin, AuthenticationError, getRequestActor } from "@/lib/auth-session";
import { createPrivateArtworkAsset } from "@/lib/artwork-assets";
import { ArtworkUploadError, readLimitedArtworkFormData } from "@/lib/artwork-upload";
import { CommerceError } from "@/lib/commerce-error";
import { apiError } from "@/lib/http";
import { DatabaseConfigurationError } from "@/lib/prisma";
import { consumeRateLimit, requestIdentifier } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAXIMUM_ARTWORK_REQUEST_BYTES = 21 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const limit = consumeRateLimit({
      namespace: "artwork-upload",
      identifier: requestIdentifier(request),
      limit: 20,
      windowMs: 60 * 60 * 1_000,
    });
    if (!limit.allowed) {
      const response = apiError(429, "RATE_LIMITED", "Too many artwork uploads. Please wait and try again.");
      response.headers.set("Retry-After", String(limit.retryAfterSeconds));
      response.headers.set("Cache-Control", "no-store");
      return response;
    }

    const form = await readLimitedArtworkFormData(request, MAXIMUM_ARTWORK_REQUEST_BYTES);
    const productId = String(form.get("productId") ?? "").trim();
    const surfaceId = String(form.get("surfaceId") ?? "").trim();
    const file = form.get("file");
    if (!productId || productId.length > 100 || !/^[a-zA-Z0-9_-]+$/.test(productId)) {
      return apiError(400, "PRODUCT_ID_INVALID", "Choose a valid product before uploading artwork.");
    }
    if (!surfaceId || surfaceId.length > 80 || !/^[a-z][a-z0-9-]*$/.test(surfaceId)) {
      return apiError(400, "SURFACE_ID_INVALID", "Choose a valid product surface before uploading artwork.");
    }
    if (!(file instanceof File)) return apiError(400, "ARTWORK_FILE_REQUIRED", "Choose an artwork image to upload.");

    const actor = await getRequestActor(request).catch(() => null);
    const asset = await createPrivateArtworkAsset({
      productId,
      surfaceId,
      file,
      ...(actor ? { ownerUserId: actor.userId } : {}),
    });
    return NextResponse.json(
      { data: { ...asset, expiresAt: asset.expiresAt.toISOString() } },
      { status: 201, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } },
    );
  } catch (error) {
    if (error instanceof ArtworkUploadError) return apiError(error.status, error.code, error.message);
    if (error instanceof CommerceError) return apiError(error.status, error.code, error.message, error.details);
    if (error instanceof AuthenticationError) return apiError(error.status, error.code, error.message);
    if (error instanceof DatabaseConfigurationError) return apiError(503, "ARTWORK_STORAGE_UNAVAILABLE", "Private artwork storage is not configured.");
    console.error("Unexpected artwork upload error", error);
    return apiError(500, "ARTWORK_UPLOAD_FAILED", "The artwork could not be stored safely.");
  }
}
