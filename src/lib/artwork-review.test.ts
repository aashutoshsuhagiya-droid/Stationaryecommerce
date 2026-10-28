import assert from "node:assert/strict";
import test from "node:test";

import { artworkRequiresManualReview, capturedCustomOrderStatus } from "./artwork-review";
import type { ArtworkDocumentSnapshot, ProductArtworkPolicy } from "./types";

const policy = {
  maximumElements: 5,
  surfaces: [
    { id: "front", image: { enabled: true, approvalRequired: true } },
    { id: "back", image: { enabled: true, approvalRequired: false } },
  ],
} as ProductArtworkPolicy;

function artwork(surfaceId: string, type: "text" | "image"): ArtworkDocumentSnapshot {
  const base = {
    id: "layer-1",
    name: "Layer",
    x: 0,
    y: 0,
    width: 20,
    height: 20,
    rotation: 0,
    opacity: 1,
  };
  return {
    version: 1,
    activeSurfaceId: surfaceId,
    updatedAt: "2026-10-27T00:00:00.000Z",
    surfaces: [{
      id: surfaceId,
      label: surfaceId,
      layers: type === "image"
        ? [{ ...base, type, sourceWidth: 100, sourceHeight: 100 }]
        : [{ ...base, type, text: "Aarav", color: "#112233", fontSize: 16, fontFamily: "sans" }],
    }],
  };
}

test("manual review is required only for images on approval-required surfaces", () => {
  assert.equal(artworkRequiresManualReview(undefined, policy), false);
  assert.equal(artworkRequiresManualReview(artwork("front", "text"), policy), false);
  assert.equal(artworkRequiresManualReview(artwork("back", "image"), policy), false);
  assert.equal(artworkRequiresManualReview(artwork("front", "image"), policy), true);
});

test("captured custom orders advance only after every personalization is approved", () => {
  assert.equal(capturedCustomOrderStatus("PENDING", ["APPROVED"]), undefined);
  assert.equal(capturedCustomOrderStatus("CAPTURED", []), undefined);
  assert.equal(capturedCustomOrderStatus("CAPTURED", ["APPROVED", "APPROVED"]), "PRODUCTION_APPROVED");
  assert.equal(capturedCustomOrderStatus("CAPTURED", ["APPROVED", "PENDING_REVIEW"]), "CUSTOMIZATION_REVIEW");
  assert.equal(capturedCustomOrderStatus("CAPTURED", ["REJECTED"]), "CUSTOMIZATION_REVIEW");
});
