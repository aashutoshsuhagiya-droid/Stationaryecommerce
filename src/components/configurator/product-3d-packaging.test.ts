import assert from "node:assert/strict";
import test from "node:test";

import { normalizeProduct3DDimensions } from "./product-3d-dimensions";
import {
  PACKAGING_3D_PROFILES,
  PRODUCT_3D_MODEL_PROFILES,
  resolveProduct3DProfile,
  type PackagingProduct3DKind,
} from "./product-3d-profile";
import {
  canonicalProduct3DSurface,
  resolveProduct3DSurfaceId,
} from "./product-3d-surfaces";

test("normalizes physical dimensions without losing practical proportions", () => {
  const dimensions = normalizeProduct3DDimensions("rectangular-box", {
    width: 200,
    height: 100,
    depth: 50,
  });
  assert.equal(dimensions.width, 2.7);
  assert.equal(dimensions.width / dimensions.height, 2);
  assert.equal(dimensions.width / dimensions.depth, 4);

  const bag = normalizeProduct3DDimensions("paper-bag", {
    "bag-width": 180,
    "bag-height": 240,
    "gusset-depth": 90,
  });
  assert.equal(bag.height / bag.width, 240 / 180);
  assert.equal(bag.depth / bag.width, 0.5);
});

test("clamps invalid and extreme dimensions to finite scene-safe values", () => {
  const dimensions = normalizeProduct3DDimensions("mailer-box", {
    width: -20,
    height: Number.NaN,
    depth: 100_000,
  });
  for (const value of Object.values(dimensions)) {
    assert.ok(Number.isFinite(value));
    assert.ok(value >= 0.045);
    assert.ok(value <= 2.7);
  }

  const square = normalizeProduct3DDimensions("square-box", {
    width: 140,
    height: 90,
    depth: 30,
  });
  assert.equal(square.width, square.depth);
});

test("maps common face and gusset aliases to canonical surface slots", () => {
  assert.equal(canonicalProduct3DSurface({ id: "front-panel" }), "front");
  assert.equal(canonicalProduct3DSurface({ id: "art-1", label: "Rear face" }), "back");
  assert.equal(canonicalProduct3DSurface({ id: "leftGusset" }), "gusset-left");
  assert.equal(canonicalProduct3DSurface({ id: "rhs-gutter" }), "gusset-right");
  assert.equal(canonicalProduct3DSurface({ id: "lid-artwork" }), "top");
});

test("resolves independent model faces and predictable fallbacks", () => {
  const surfaces = [
    { id: "front-panel", label: "Front" },
    { id: "rear-panel", label: "Back" },
    { id: "left-gusset", label: "Left gusset" },
    { id: "right-gusset", label: "Right gusset" },
    { id: "lid", label: "Top" },
  ];
  assert.equal(resolveProduct3DSurfaceId(surfaces, "front"), "front-panel");
  assert.equal(resolveProduct3DSurfaceId(surfaces, "back"), "rear-panel");
  assert.equal(resolveProduct3DSurfaceId(surfaces, "gusset-left"), "left-gusset");
  assert.equal(resolveProduct3DSurfaceId(surfaces, "gusset-right"), "right-gusset");
  assert.equal(resolveProduct3DSurfaceId(surfaces, "top"), "lid");
  assert.equal(resolveProduct3DSurfaceId(surfaces, "bottom"), "rear-panel");
});

test("publishes a complete profile for every requested packaging model", () => {
  const expected: PackagingProduct3DKind[] = [
    "rectangular-box",
    "square-box",
    "folding-carton",
    "mailer-box",
    "paper-bag",
    "stand-up-pouch",
    "product-sleeve",
  ];
  assert.deepEqual(Object.keys(PACKAGING_3D_PROFILES).sort(), expected.sort());
  for (const kind of expected) {
    assert.equal(PACKAGING_3D_PROFILES[kind].kind, kind);
    assert.equal(PRODUCT_3D_MODEL_PROFILES[kind].kind, kind);
    assert.equal(resolveProduct3DProfile(kind).kind, kind);
  }
});

test("recognizes packaging product names without overriding legacy explicit models", () => {
  assert.equal(resolveProduct3DProfile("", "soap-box").kind, "folding-carton");
  assert.equal(resolveProduct3DProfile("", "paper-shopping-bag").kind, "paper-bag");
  assert.equal(resolveProduct3DProfile("", "stand-up-pouch").kind, "stand-up-pouch");
  assert.equal(resolveProduct3DProfile("", "product-sleeve").kind, "product-sleeve");
  assert.equal(resolveProduct3DProfile("geometry-box-space").kind, "geometry-box");
  assert.equal(resolveProduct3DProfile("gift-ribbon").kind, "gift-ribbon");
});
