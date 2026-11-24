import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { assertSameOrigin } from "@/lib/auth-session";
import { requireCatalogAdmin } from "@/lib/catalog-admin";
import { apiError, readJson, validationError } from "@/lib/http";
import { discardListing, ListingPublishError, listingRequestSchema, prepareListing, publishListing, timedListingDeps } from "@/lib/listing-publish";
import { listingPublishDeps } from "@/lib/listing-publish-server";
import { onboardingApiError } from "@/lib/onboarding-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Publishing may build a 3D preview from the photo (same budget as the quick-3d route).
export const maxDuration = 60;

/**
 * The admin listing wizard's one server flow, keyed by a client-generated
 * `listingId` so retries resume instead of duplicating (see `listing-publish.ts`).
 *
 * POST { phase: "prepare", listingId, product }            → { productId, slug, uploadedAssetIds }
 * POST { phase: "publish", listingId, product, imageAssetIds, publish, textPosition }
 *                                                          → { productId, slug, published, design2D, threeD }
 * POST { phase: "discard", listingId }                     → { discarded } (never-published drafts only)
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await requireCatalogAdmin(request);
    const parsed = listingRequestSchema.safeParse(await readJson(request));
    if (!parsed.success) return validationError(parsed.error);
    const { deps, serverTiming } = timedListingDeps(listingPublishDeps(actor.userId));
    const data = parsed.data.phase === "prepare"
      ? await prepareListing(deps, parsed.data)
      : parsed.data.phase === "discard"
        ? await discardListing(deps, parsed.data)
        : await publishListing(deps, parsed.data);
    revalidatePath("/", "layout");
    return NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store", "Server-Timing": serverTiming() } });
  } catch (error) {
    if (error instanceof ListingPublishError) return apiError(error.status, error.code, error.message);
    return onboardingApiError(error);
  }
}
