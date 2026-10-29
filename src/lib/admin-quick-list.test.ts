import assert from "node:assert/strict";
import test from "node:test";

import {
  autoSku,
  checkProductPublishReadiness,
  createRanBazaarStarterDraft,
} from "./admin-quick-list";

test("RanBazaar quick-list draft shares starter fields and suggested dimensions", () => {
  const draft = createRanBazaarStarterDraft("notebook");
  assert.ok(draft);
  assert.deepEqual(draft.printAreas[0], {
    id: "primary", label: "Primary print area", widthMm: 210, heightMm: 297, safeInsetMm: null,
  });
  assert.equal(draft.artworkUpload, true);
  assert.equal(draft.artworkPolicy.surfaces[0].image.enabled, true);
});

test("autoSku produces an uppercase slug with a stable three-character suffix", () => {
  assert.equal(autoSku("My Notebook", () => 0), "MY-NOTEBOOK-000");
  assert.equal(autoSku("", () => 0.99999), "PRODUCT-ZZZ");
});

test("publish readiness blocks missing upload dimensions but only hints about packaging visualization", () => {
  const draft = createRanBazaarStarterDraft("notebook");
  assert.ok(draft);
  const blocked = checkProductPublishReadiness({
    artworkUpload: true,
    acceptedArtworkTypes: draft.acceptedArtworkTypes,
    printAreas: [{ ...draft.printAreas[0], widthMm: null, heightMm: null }],
    artworkPolicy: draft.artworkPolicy,
    packagingRequiresVisualization: true,
    hasPublishedVisualization: false,
  });
  assert.equal(blocked.canPublish, false);
  assert.equal(blocked.items.find((item) => item.id === "physical-dimensions")?.ready, false);
  assert.equal(blocked.items.find((item) => item.id === "packaging-visualization")?.blocking, false);
});
