import type { ArtworkDocumentSnapshot, ProductArtworkPolicy } from "./types";

export type ArtworkReviewStatus = "DRAFT" | "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "GENERATED" | "FAILED";
export type CapturedCustomOrderStatus = "CUSTOMIZATION_REVIEW" | "PRODUCTION_APPROVED";

/** True only when a submitted image is placed on a surface configured for manual approval. */
export function artworkRequiresManualReview(
  artwork: ArtworkDocumentSnapshot | undefined,
  policy: ProductArtworkPolicy,
) {
  if (!artwork) return false;
  const approvalSurfaceIds = new Set(
    policy.surfaces
      .filter((surface) => surface.image.enabled && surface.image.approvalRequired)
      .map((surface) => surface.id),
  );
  return artwork.surfaces.some((surface) =>
    approvalSurfaceIds.has(surface.id) && surface.layers.some((layer) => layer.type === "image"));
}

/** Returns undefined when artwork review must not move the order before payment capture. */
export function capturedCustomOrderStatus(
  paymentStatus: string,
  personalizationStatuses: readonly ArtworkReviewStatus[],
): CapturedCustomOrderStatus | undefined {
  if (paymentStatus !== "CAPTURED" || personalizationStatuses.length === 0) return undefined;
  return personalizationStatuses.every((status) => status === "APPROVED")
    ? "PRODUCTION_APPROVED"
    : "CUSTOMIZATION_REVIEW";
}
