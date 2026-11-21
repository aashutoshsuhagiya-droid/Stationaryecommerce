import assert from "node:assert/strict";
import test from "node:test";

import {
  BLANK_SOURCE,
  buildListingSources,
  draftFromExistingProduct,
  essentialsComplete,
  previewPrice,
  quickListProductPayload,
  searchListingSources,
} from "./listing-wizard";

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

test("preview price formats Indian rupees and rejects junk", () => {
  assert.equal(previewPrice("199"), "₹199");
  assert.equal(previewPrice(1499.5).includes("1,499.5"), true);
  assert.equal(previewPrice(""), "");
  assert.equal(previewPrice("abc"), "");
});
