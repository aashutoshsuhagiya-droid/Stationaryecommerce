import assert from "node:assert/strict";
import test from "node:test";

import { normalizeProduct3DDimensions } from "./product-3d-dimensions";
import {
  isPackagingProduct3DKind,
  PACKAGING_3D_PROFILES,
  packagingBoardColor,
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

test("packaging faces without their own artwork resolve to plain board, never the front photo", () => {
  const frontOnly = [{ id: "front", label: "Front" }];
  assert.equal(resolveProduct3DSurfaceId(frontOnly, "front", { packaging: true }), "front");
  for (const face of ["top", "left", "right", "back", "bottom", "side", "gusset", "gusset-left", "gusset-right"] as const) {
    assert.equal(resolveProduct3DSurfaceId(frontOnly, face, { packaging: true }), undefined, `${face} must stay plain`);
  }
  // A lone unnamed surface is still the front, and only the front.
  const unnamed = [{ id: "artwork-1" }];
  assert.equal(resolveProduct3DSurfaceId(unnamed, "front", { packaging: true }), "artwork-1");
  assert.equal(resolveProduct3DSurfaceId(unnamed, "top", { packaging: true }), undefined);
  // A real top panel is used when it exists.
  const withLid = [{ id: "front", label: "Front" }, { id: "lid", label: "Top" }];
  assert.equal(resolveProduct3DSurfaceId(withLid, "top", { packaging: true }), "lid");
});

test("the back repeats the front only when the admin opts in", () => {
  const frontOnly = [{ id: "front", label: "Front" }];
  assert.equal(resolveProduct3DSurfaceId(frontOnly, "back", { packaging: true }), undefined);
  assert.equal(resolveProduct3DSurfaceId(frontOnly, "back", { packaging: true, mirrorBack: true }), "front");
  assert.equal(resolveProduct3DSurfaceId(frontOnly, "left", { packaging: true, mirrorBack: true }), undefined);
});

test("built-in label and school models keep printing every face from the front", () => {
  const frontOnly = [{ id: "front", label: "Front" }];
  for (const face of ["top", "left", "right", "back", "bottom"] as const) {
    assert.equal(resolveProduct3DSurfaceId(frontOnly, face), "front", `${face} keeps the legacy fallback`);
  }
});

test("unprinted board takes the named stock colour first, then the artwork's edge colour", () => {
  assert.equal(packagingBoardColor("Kraft paper 300 GSM"), "#c9a777");
  assert.equal(packagingBoardColor("SBS board"), "#f6f4ee");
  assert.equal(packagingBoardColor("Matte black rigid"), "#23272e");
  assert.equal(packagingBoardColor("Vinyl Matte"), undefined);

  const sampled = resolveProduct3DProfile("folding-carton", "soap-boxes", { sampledBaseColor: "#2e7d4f" });
  assert.equal(sampled.categoryTheme.baseColor, "#2e7d4f");
  const named = resolveProduct3DProfile("folding-carton", "soap-boxes", { materialName: "Kraft", sampledBaseColor: "#2e7d4f" });
  assert.equal(named.categoryTheme.baseColor, "#c9a777", "the material that ships beats a sampled colour");
});

test("carton board is satin, kraft is matte, and only gloss lamination earns a clearcoat", () => {
  const carton = resolveProduct3DProfile("folding-carton", "soap-boxes");
  assert.equal(carton.categoryTheme.roughness, 0.55);
  assert.equal(carton.categoryTheme.clearcoat, 0);
  const gloss = resolveProduct3DProfile("folding-carton", "soap-boxes", { materialName: "SBS gloss lamination" });
  assert.ok(gloss.categoryTheme.clearcoat > 0.5);
  const kraft = resolveProduct3DProfile("folding-carton", "soap-boxes", { materialName: "kraft" });
  assert.ok(kraft.categoryTheme.roughness >= 0.82);
  assert.equal(kraft.categoryTheme.clearcoat, 0);
});

test("shipping cartons get the corrugated kraft look that other rectangular boxes do not", () => {
  const shipping = resolveProduct3DProfile("rectangular-box", "shipping-boxes");
  assert.ok(shipping.categoryTheme.flags.includes("corrugated"));
  assert.equal(shipping.categoryTheme.baseColor, "#c49a6c");
  const specialty = resolveProduct3DProfile("rectangular-box", "specialty-boxes");
  assert.equal(specialty.categoryTheme.flags.includes("corrugated"), false);
});

test("packaging kinds are told apart from printed label and school models", () => {
  assert.equal(isPackagingProduct3DKind("folding-carton"), true);
  assert.equal(isPackagingProduct3DKind("rigid-lid-box"), true);
  assert.equal(isPackagingProduct3DKind("mailer-envelope"), true);
  assert.equal(isPackagingProduct3DKind("label-pack"), false);
  assert.equal(isPackagingProduct3DKind("school-kit"), false);
  assert.equal(resolveProduct3DProfile("", "courier-mailer-bag").kind, "mailer-envelope");
  assert.equal(resolveProduct3DProfile("", "rigid-hamper-box").kind, "rigid-lid-box");
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
    "rigid-lid-box",
    "mailer-envelope",
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
