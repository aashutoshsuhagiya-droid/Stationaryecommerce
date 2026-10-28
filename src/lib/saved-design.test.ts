import assert from "node:assert/strict";
import test from "node:test";

import {
  artworkForSavedDesign,
  newestSavedDesign,
  parseStoredSavedDesignValues,
  replaceSavedDesignArtworkAssets,
  savedArtworkReuseAction,
  storedSavedDesignValues,
} from "./saved-design";
import { savedDesignInputSchema } from "./validation";

function inputDesign() {
  return savedDesignInputSchema.parse({
    id: "design-test-1",
    productId: "product-test-1",
    title: "Aarav box",
    variantId: "variant-test-1",
    templateId: "template-test-1",
    dimensionPresetId: "size-medium",
    displayUnit: "mm",
    quantity: 2,
    fields: { name: "Aarav" },
    artwork: {
      version: 1,
      activeSurfaceId: "front",
      updatedAt: "2026-10-28T00:00:00.000Z",
      surfaces: [{
        id: "front",
        label: "Front",
        layers: [{
          id: "stored-image",
          type: "image",
          name: "logo.png",
          x: 10,
          y: 10,
          width: 50,
          height: 50,
          rotation: 0,
          opacity: 1,
          src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",
          asset: {
            id: "asset-test-1",
            claimToken: "claim-token-with-at-least-twenty-characters",
            mimeType: "image/png",
            sizeBytes: 68,
            width: 1,
            height: 1,
          },
          sourceWidth: 1,
          sourceHeight: 1,
        }, {
          id: "preview-only-image",
          type: "image",
          name: "local.png",
          x: 70,
          y: 10,
          width: 20,
          height: 20,
          rotation: 0,
          opacity: 1,
          src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",
          sourceWidth: 1,
          sourceHeight: 1,
        }],
      }],
    },
  });
}

test("saved designs retain private assets without persisting browser preview data", () => {
  const input = inputDesign();
  const artwork = artworkForSavedDesign(input.artwork);
  assert.equal(artwork.surfaces[0].layers.length, 1);
  const image = artwork.surfaces[0].layers[0];
  assert.equal(image.type, "image");
  if (image.type !== "image") return;
  assert.equal(image.src, undefined);
  assert.equal(image.asset?.id, "asset-test-1");

  const stored = storedSavedDesignValues(input);
  assert.equal(stored.schemaVersion, 1);
  assert.equal(parseStoredSavedDesignValues(stored).success, true);
});

test("saved-design input rejects unbounded fields and unknown records", () => {
  const input = inputDesign();
  assert.equal(savedDesignInputSchema.safeParse({ ...input, unexpected: true }).success, false);
  assert.equal(savedDesignInputSchema.safeParse({
    ...input,
    fields: Object.fromEntries(Array.from({ length: 21 }, (_, index) => [`field-${index}`, "x"])),
  }).success, false);
});

test("server-issued artwork claims can be replaced without changing the design", () => {
  const artwork = artworkForSavedDesign(inputDesign().artwork);
  const replaced = replaceSavedDesignArtworkAssets(artwork, new Map([[
    "asset-test-1",
    {
      id: "asset-test-2",
      claimToken: "replacement-claim-token-at-least-twenty-characters",
      mimeType: "image/png" as const,
      sizeBytes: 68,
      width: 1,
      height: 1,
    },
  ]]));
  const image = replaced.surfaces[0].layers[0];
  assert.equal(image.type, "image");
  if (image.type !== "image") return;
  assert.equal(image.asset?.id, "asset-test-2");
  assert.equal(image.x, artwork.surfaces[0].layers[0].x);
  assert.equal(image.src, undefined);
});

test("saved-design conflict resolution keeps the newest edit", () => {
  const local = { id: "same", savedAt: "2026-10-28T12:00:00.000Z", title: "local" };
  const remote = { id: "same", savedAt: "2026-10-28T11:00:00.000Z", title: "remote" };
  assert.equal(newestSavedDesign(local, remote), local);
  assert.equal(newestSavedDesign(remote, local), local);
  assert.equal(newestSavedDesign({ ...local, savedAt: "invalid" }, remote), remote);
});

test("saved artwork renews unused claims and copies only consumed safe assets", () => {
  assert.equal(savedArtworkReuseAction("UPLOADED", null), "renew");
  assert.equal(savedArtworkReuseAction("ATTACHED", "order-item-1"), "copy");
  assert.equal(savedArtworkReuseAction("APPROVED", "order-item-1"), "copy");
  assert.equal(savedArtworkReuseAction("REJECTED", "order-item-1"), "unavailable");
  assert.equal(savedArtworkReuseAction("ATTACHED", null), "unavailable");
});
