import assert from "node:assert/strict";
import test from "node:test";

import {
  BLANK_SOURCE,
  buildListingSources,
  draftFromExistingProduct,
  essentialsComplete,
  previewPrice,
  quickListProductPayload,
  recipeForCategorySlug,
  searchListingSources,
  unconfiguredOptionLabels,
} from "./listing-wizard";
import { getCategoryListingRecipe } from "./category-listing-playbook";

const sources = buildListingSources({
  starters: [
    { id: "name-slips", name: "Name slips & stickers", description: "School name slips", fieldCount: 2 },
    { id: "bottle-tiffin", name: "Bottle & tiffin labels", description: "Waterproof labels", fieldCount: 1 },
  ],
  packagingTypes: [
    { id: "soap-box", name: "Soap Box" },
    { id: "brand-ziplock-pouch", name: "Brand Ziplock Pouch" },
  ],
  products: [
    { id: "p1", name: "Avenger Name Slip" },
    { id: "p2", name: "Golden Glitter Topper" },
  ],
});

test("empty search shows the starter suggestions plus the blank option, nothing else", () => {
  const suggested = searchListingSources(sources, "");
  assert.deepEqual(suggested.map((source) => source.kind), ["ranbazaar", "ranbazaar", "blank"]);
  assert.ok(suggested.includes(BLANK_SOURCE));
});

test("search ranks name matches across starters, packaging, and existing products", () => {
  const forName = searchListingSources(sources, "name slip");
  assert.equal(forName[0]?.id, "name-slips");
  assert.ok(forName.some((source) => source.kind === "similar" && source.id === "p1"));
  assert.ok(!forName.some((source) => source.id === "soap-box"));

  const forBox = searchListingSources(sources, "soap");
  assert.deepEqual(forBox.map((source) => source.id), ["soap-box"]);

  assert.deepEqual(searchListingSources(sources, "zzz-no-match"), []);
});

test("essentials gate requires name, non-negative numeric price, category, and sku", () => {
  const base = { name: "Test", price: "199", categoryId: "c1", sku: "TEST-1" };
  assert.equal(essentialsComplete(base), true);
  assert.equal(essentialsComplete({ ...base, name: "  " }), false);
  assert.equal(essentialsComplete({ ...base, price: "-5" }), false);
  assert.equal(essentialsComplete({ ...base, price: "abc" }), false);
  assert.equal(essentialsComplete({ ...base, categoryId: "" }), false);
});

test("payload builder applies every default the admin never sees", () => {
  const draft = draftFromExistingProduct("Source", {
    configurationFields: [{ key: "kid-name", label: "Kid Name", required: true, maxLength: 32 }],
    printAreas: [{ id: "front", label: "Front", widthMm: 90, heightMm: 50 }],
    artworkUpload: true,
    acceptedArtworkTypes: ["image/png"],
  });
  const payload = quickListProductPayload({
    name: "  New Product  ",
    sku: "NEW-1",
    categoryId: "cat-1",
    price: "249",
    description: "",
    productType: "",
    draft: draft.draft,
    published: true,
    imageUrl: "/api/product-images/pending",
  });
  assert.equal(payload.name, "New Product");
  assert.equal(payload.price, 249);
  assert.equal(payload.productType, undefined);
  assert.equal(payload.customizable, true);
  assert.deepEqual(
    { allow2D: payload.allow2D, allow3D: payload.allow3D, quantityMin: payload.quantityMin, quantityMax: payload.quantityMax, tiers: payload.quantityTiers, setupCharge: payload.setupCharge },
    { allow2D: true, allow3D: false, quantityMin: 1, quantityMax: 100, tiers: [], setupCharge: 0 },
  );
  const field = payload.configurationFields[0];
  assert.deepEqual(
    { key: field?.key, required: field?.required, maxLength: field?.maxLength, priceDelta: field?.priceDelta, visibleWhen: field?.visibleWhen },
    { key: "kid-name", required: true, maxLength: 32, priceDelta: 0, visibleWhen: null },
  );
});

test("list-similar copies configuration but never identity, and fills safe fallbacks", () => {
  const result = draftFromExistingProduct("Avenger Name Slip", {
    productType: "",
    categoryId: "cat-9",
    price: 219,
    description: "<p>Original</p>",
    configurationFields: [
      { key: "enter-your-name", label: "ENTER YOUR NAME", required: true, maxLength: 32 },
      { label: "missing key is dropped" },
    ],
  });
  assert.equal(result.draft.id, "similar");
  assert.equal(result.draft.configurationFields.length, 1);
  assert.equal(result.draft.configurationFields[0]?.inputType, "text");
  assert.deepEqual(result.draft.printAreas, [{ id: "primary", label: "Primary print area", widthMm: null, heightMm: null, safeInsetMm: null }]);
  assert.deepEqual(result.draft.acceptedArtworkTypes, ["image/png", "image/jpeg"]);
  assert.ok(result.draft.artworkPolicy.surfaces.length >= 1);
  assert.deepEqual(
    { categoryId: result.categoryId, priceText: result.priceText, description: result.description },
    { categoryId: "cat-9", priceText: "219", description: "<p>Original</p>" },
  );
});

const starterDraft = () => draftFromExistingProduct("Source", {
  configurationFields: [{ key: "name", label: "Name", required: true, maxLength: 40 }],
}).draft;

test("a shelf's recipe fills GST, MRP, tags and SEO so admin rows match imported rows", () => {
  const recipe = recipeForCategorySlug("customized-name-slips");
  assert.ok(recipe);
  const payload = quickListProductPayload({
    name: "Rocket Name Slip",
    sku: "ROCKET-1",
    categoryId: "cat-1",
    price: "249",
    compareAtPrice: "349",
    description: "",
    productType: "",
    draft: starterDraft(),
    published: true,
    imageUrl: "/api/product-images/pending",
    recipe,
    categoryName: "Customized Name Slips",
  });
  assert.equal(payload.gstPercent, 18);
  assert.equal(payload.compareAtPrice, 349);
  assert.ok((payload.tags ?? []).length >= 3);
  assert.equal(payload.seoTitle, "Rocket Name Slip · Customized Name Slips");
  assert.ok((payload.seoDescription ?? "").includes("Rocket Name Slip"));
});

test("an MRP at or below the selling price is dropped rather than shown as a fake discount", () => {
  const base = {
    name: "Slip", sku: "S-1", categoryId: "c", price: "249", description: "", productType: "",
    draft: starterDraft(), published: false, imageUrl: "/api/product-images/pending",
    recipe: recipeForCategorySlug("customized-name-slips"), categoryName: "Customized Name Slips",
  };
  assert.equal(quickListProductPayload({ ...base, compareAtPrice: "199" }).compareAtPrice, undefined);
  assert.equal(quickListProductPayload({ ...base, compareAtPrice: "249" }).compareAtPrice, undefined);
  assert.equal(quickListProductPayload({ ...base, compareAtPrice: "" }).compareAtPrice, undefined);
  assert.equal(quickListProductPayload({ ...base, compareAtPrice: "399" }).compareAtPrice, 399);
});

test("built-in 3D is set only where the playbook vouches for the shape, and obeys the admin's opt-out", () => {
  const build = (slug: string, enable3D?: boolean) => quickListProductPayload({
    name: "Thing", sku: "T-1", categoryId: "c", price: "100", description: "", productType: "",
    draft: starterDraft(), published: false, imageUrl: "/api/product-images/pending",
    recipe: getCategoryListingRecipe(slug), categoryName: slug, enable3D,
  });

  const builtin = build("customized-name-slips");
  assert.equal(builtin.allow3D, true);
  assert.equal(builtin.productModel, "label-pack");

  assert.equal(build("customized-name-slips", false).allow3D, false, "admin can switch it off");
  assert.equal(build("customized-name-slips", false).productModel, undefined);

  // Packaging needs a published template first; flat print has no honest model.
  assert.equal(build("soap-boxes").allow3D, false);
  assert.equal(build("soap-boxes").productModel, undefined);
  assert.equal(build("business-cards").allow3D, false);

  // The admin API refuses allow3D without a model, so the pairing must always hold.
  for (const slug of ["customized-name-slips", "soap-boxes", "business-cards", "bottle-tiffin-labels"]) {
    const payload = build(slug);
    assert.equal(payload.allow3D, Boolean(payload.productModel), `${slug} must pair allow3D with a model`);
  }
});

test("collections are merged into categoryIds without dropping the primary shelf", () => {
  const payload = quickListProductPayload({
    name: "Gift", sku: "G-1", categoryId: "primary", price: "199", description: "", productType: "",
    draft: starterDraft(), published: false, imageUrl: "/api/product-images/pending",
    categoryIds: ["collection-a", "primary"], categoryName: "Personalized Gifts",
    recipe: getCategoryListingRecipe("personalized-gifts"),
  });
  assert.deepEqual(payload.categoryIds, ["primary", "collection-a"]);
});

test("unconfigured packaging selects are reported so they do not silently vanish", () => {
  const draft = draftFromExistingProduct("Box", {
    configurationFields: [
      { key: "material", label: "Material", inputType: "select", options: [] },
      { key: "name", label: "Name", inputType: "text" },
      { key: "finish", label: "Lamination", inputType: "select", options: [{ label: "Matte", value: "matte", priceDelta: 0 }] },
    ],
  }).draft;
  assert.deepEqual(unconfiguredOptionLabels(draft), ["Material"]);
});

test("preview price formats Indian rupees and rejects junk", () => {
  assert.equal(previewPrice("199"), "₹199");
  assert.equal(previewPrice(1499.5).includes("1,499.5"), true);
  assert.equal(previewPrice(""), "");
  assert.equal(previewPrice("abc"), "");
});
