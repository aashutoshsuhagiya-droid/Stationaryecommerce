import assert from "node:assert/strict";
import test from "node:test";

import { buildDefaultAdminArtworkPolicy, reconcileAdminArtworkPolicy } from "./admin-artwork-policy";
import { productArtworkPolicySchema } from "./artwork-policy-schema";

const areas = [{ id: "front", label: "Front", widthMm: 100, heightMm: 50, safeInsetMm: 3 }];

test("admin policy defaults use physical surface ratios and enable only safe raster uploads", () => {
  const policy = buildDefaultAdminArtworkPolicy(areas, {
    uploadsEnabled: true,
    allowedMimeTypes: ["image/png", "image/webp", "application/pdf"],
  });
  assert.equal(policy.surfaces[0].coordinateSpace.width, 600);
  assert.equal(policy.surfaces[0].coordinateSpace.height, 300);
  assert.deepEqual(policy.surfaces[0].image.allowedMimeTypes, ["image/png", "image/webp"]);
  assert.equal(productArtworkPolicySchema.safeParse(policy).success, true);
});

test("admin policy reconciliation adds surfaces and disables upload capabilities authoritatively", () => {
  const policy = buildDefaultAdminArtworkPolicy(areas, {
    uploadsEnabled: true,
    allowedMimeTypes: ["image/png"],
  });
  const next = reconcileAdminArtworkPolicy(policy, [...areas, { id: "back", label: "Back", widthMm: 100, heightMm: 50, safeInsetMm: 3 }], {
    uploadsEnabled: false,
    allowedMimeTypes: ["image/png"],
  });
  assert.equal(next.surfaces.length, 2);
  assert.equal(next.surfaces[0].image.enabled, false);
  assert.equal(next.surfaces[0].image.maximumElements, 0);
  assert.deepEqual(next.surfaces[0].image.allowedMimeTypes, []);
});
