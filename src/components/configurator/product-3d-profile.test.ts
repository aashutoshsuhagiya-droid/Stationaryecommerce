import assert from "node:assert/strict";
import test from "node:test";

import { resolveProduct3DProfile } from "./product-3d-profile";

test("resolves catalog products to product-specific 3D models", () => {
  assert.equal(resolveProduct3DProfile("personal-story-notebook").kind, "notebook");
  assert.equal(resolveProduct3DProfile("bottle-tiffin-duo").kind, "bottle-label");
  assert.equal(resolveProduct3DProfile("personalized-pencil-row").kind, "pencil-set");
  assert.equal(resolveProduct3DProfile("geometry-box-space").kind, "geometry-box");
  assert.equal(resolveProduct3DProfile("initial-keychain-duo").kind, "keychain-duo");
  assert.equal(resolveProduct3DProfile("backpack-tag").kind, "tag");
  assert.equal(resolveProduct3DProfile("waterproof-whale").kind, "label-pack");
});
