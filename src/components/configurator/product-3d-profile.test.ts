import assert from "node:assert/strict";
import test from "node:test";

import { categories, products } from "../../lib/data";
import {
  CATEGORY_3D_PROFILES,
  resolveProduct3DProfile,
  type Product3DKind,
} from "./product-3d-profile";

const EXPECTED_CATEGORY_PROFILES = {
  "customized-name-slips": {
    kind: "label-pack",
    label: "Printed name-slip pack",
    cameraDistance: 3.4,
  },
  "waterproof-stickers": {
    kind: "waterproof-sheet",
    label: "Waterproof sticker sheet",
    cameraDistance: 3.6,
  },
  "personalized-pencils-pens": {
    kind: "pencil-set",
    label: "Personalized pencil set",
    cameraDistance: 4,
  },
  "school-labels": {
    kind: "school-kit",
    label: "Mixed school label kit",
    cameraDistance: 3.8,
  },
  "personalized-notebooks": {
    kind: "notebook",
    label: "Personalized notebook",
    cameraDistance: 3.8,
  },
  "bottle-tiffin-labels": {
    kind: "bottle-label",
    label: "Bottle label preview",
    cameraDistance: 4,
  },
  "school-accessories": {
    kind: "geometry-box",
    label: "Metal geometry box",
    cameraDistance: 3.7,
  },
  "personalized-gifts": {
    kind: "gift-ribbon",
    label: "Personalized gift box",
    cameraDistance: 3.9,
  },
  "name-plates-keychains": {
    kind: "keychain-duo",
    label: "Acrylic keychain pair",
    cameraDistance: 3.5,
  },
  "bulk-orders": {
    kind: "bulk-grid",
    label: "Institutional label grid",
    cameraDistance: 4.2,
  },
} as const satisfies Record<string, {
  kind: Product3DKind;
  label: string;
  cameraDistance: number;
}>;

test("maps every catalog category to one explicit non-colliding 3D kind", () => {
  const catalogSlugs = categories.map((category) => category.slug).sort();
  const mappedSlugs = Object.keys(EXPECTED_CATEGORY_PROFILES).sort();
  assert.deepEqual(mappedSlugs, catalogSlugs);
  assert.deepEqual(Object.keys(CATEGORY_3D_PROFILES).sort(), catalogSlugs);

  const resolvedKinds: Product3DKind[] = [];
  for (const category of categories) {
    const profile = resolveProduct3DProfile(category.artwork, category.slug);
    const expected = EXPECTED_CATEGORY_PROFILES[category.slug as keyof typeof EXPECTED_CATEGORY_PROFILES];
    assert.deepEqual({
      kind: profile.kind,
      label: profile.label,
      cameraDistance: profile.cameraDistance,
    }, expected);
    resolvedKinds.push(profile.kind);
  }

  assert.equal(new Set(resolvedKinds).size, categories.length);
});

test("resolves every current product through its stable category slug", () => {
  for (const product of products) {
    const expected = EXPECTED_CATEGORY_PROFILES[
      product.categorySlug as keyof typeof EXPECTED_CATEGORY_PROFILES
    ];
    assert.ok(expected, `Missing 3D profile for ${product.categorySlug}`);

    const profile = resolveProduct3DProfile(product.artwork, product.categorySlug, {
      materialName: product.material,
      colors: product.colors,
    });
    assert.equal(profile.kind, expected.kind, product.slug);
  }
});

test("uses an explicit validated product model ahead of the category default", () => {
  const profile = resolveProduct3DProfile("notebook", "customized-name-slips");
  assert.equal(profile.kind, "notebook");
});

test("provides bounded, category-differentiated physical themes", () => {
  const themeSignatures = new Set<string>();

  for (const category of categories) {
    const theme = resolveProduct3DProfile("", category.slug).categoryTheme;
    for (const color of [theme.baseColor, theme.tintColor, theme.accentColor]) {
      assert.match(color, /^#[\da-f]{6}$/iu, `${category.slug} has an invalid color`);
    }
    for (const value of [
      theme.roughness,
      theme.metalness,
      theme.clearcoat,
      theme.clearcoatRoughness,
      theme.iridescence,
    ]) {
      assert.ok(value >= 0 && value <= 1, `${category.slug} has an invalid PBR value`);
    }
    assert.ok(theme.flags.length > 0, `${category.slug} needs a presentation flag`);
    themeSignatures.add([
      theme.baseColor,
      theme.tintColor,
      theme.accentColor,
      theme.finish,
      theme.flags.join(","),
    ].join("|"));
  }

  assert.equal(themeSignatures.size, categories.length);
  const waterproof = resolveProduct3DProfile("", "waterproof-stickers").categoryTheme;
  assert.ok(waterproof.flags.includes("waterproof"));
  assert.ok(waterproof.flags.includes("iridescent"));
});

test("combines category presentation with material finish and supplied colors", () => {
  const matte = resolveProduct3DProfile("", "customized-name-slips", {
    materialName: "Matte self-adhesive vinyl",
    colors: ["Navy", "Teal"],
  }).categoryTheme;
  const metallic = resolveProduct3DProfile("", "customized-name-slips", {
    materialName: "Metallic polyester label stock",
    colors: ["Champagne", "Silver"],
  }).categoryTheme;
  const acrylic = resolveProduct3DProfile("", "name-plates-keychains", {
    materialName: "Printed acrylic",
  }).categoryTheme;

  assert.equal(matte.tintColor, "#17324d");
  assert.equal(matte.accentColor, "#0f766e");
  assert.equal(matte.finish, "matte");
  assert.equal(metallic.finish, "metallic");
  assert.ok(metallic.metalness > matte.metalness);
  assert.ok(metallic.roughness < matte.roughness);
  assert.equal(acrylic.finish, "acrylic");
  assert.ok(acrylic.flags.includes("translucent"));
});

test("keeps all seven legacy geometry fallbacks with token-safe matching", () => {
  assert.equal(resolveProduct3DProfile("personal-story-notebook").kind, "notebook");
  assert.equal(resolveProduct3DProfile("bottle-tiffin-duo").kind, "bottle-label");
  assert.equal(resolveProduct3DProfile("personalized-pencil-row").kind, "pencil-set");
  assert.equal(resolveProduct3DProfile("geometry-box-space").kind, "geometry-box");
  assert.equal(resolveProduct3DProfile("initial-keychain-duo").kind, "keychain-duo");
  assert.equal(resolveProduct3DProfile("backpack-tag").kind, "tag");
  assert.equal(resolveProduct3DProfile("unclassified-product").kind, "label-pack");

  assert.equal(resolveProduct3DProfile("vintage-badge").kind, "label-pack");
  assert.equal(resolveProduct3DProfile("peninsula-map").kind, "label-pack");
});
