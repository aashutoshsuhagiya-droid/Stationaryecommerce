import assert from "node:assert/strict";
import test from "node:test";

import {
  applyPrintOptions,
  buildCategoryOptions,
  fileNameWords,
  hasListingInput,
  listingFieldErrors,
  missingForPublish,
  missingSummary,
  newListingId,
  parseListingDraft,
  photoQualityWarnings,
  positionStudioText,
  printOptionsFor,
  priceRangeWarning,
  quickListProductPayload,
  recipeChangePrompt,
  recipeDraftFor,
  searchCategoryOptions,
  serializeListingDraft,
  sizeDescriptionFor,
  sizePresetsFor,
  suggestCategories,
  suggestProductName,
  togglePrintOption,
  writeDescription,
  type PersistedListingDraft,
} from "./listing-wizard";
import { getCategoryListingRecipe, gstNoteFor } from "./category-listing-playbook";
import { parseExactDimensions } from "./product-configuration";
import { LISTING_ID_PATTERN } from "./listing-publish";

const categories = [
  { id: "c-slips", slug: "customized-name-slips", name: "Customized Name Slips", parentId: null },
  { id: "c-pens", slug: "personalized-pencils-pens", name: "Personalized Pencils & Pens", parentId: null },
  { id: "c-boxes", slug: "boxes", name: "Boxes", parentId: null },
  { id: "c-soap", slug: "soap-boxes", name: "Soap Boxes", parentId: "c-boxes" },
  { id: "c-gift-box", slug: "gift-event-boxes", name: "Gift & Event Boxes", parentId: "c-boxes" },
  { id: "c-bags", slug: "paper-bags", name: "Paper Bags", parentId: null },
  { id: "c-dcut", slug: "d-cut-paper-bags", name: "D-Cut Paper Bags", parentId: "c-bags" },
  { id: "c-cards", slug: "business-cards", name: "Business Cards", parentId: null },
  { id: "c-inserts", slug: "printed-inserts", name: "Printed Inserts", parentId: null },
  { id: "c-import", slug: "imported-ezpac", name: "Imported EzPac", parentId: null },
];
const products = [
  { categoryId: "c-slips", imageUrl: "/api/product-images/slip-1" },
  { categoryId: "c-slips", imageUrl: "/api/product-images/slip-2" },
  { categoryId: "c-slips" },
  { categoryId: "c-soap", imageUrl: "/api/product-images/pending" },
];
const options = buildCategoryOptions(categories, products);
const byId = (id: string) => options.find((option) => option.categoryId === id)!;

test("one merged list: shelves with recipes in playbook order, then simple leaf shelves; no groups or import buckets", () => {
  const ids = options.map((option) => option.categoryId);
  assert.ok(!ids.includes("c-boxes"), "group headings are not sellable");
  assert.ok(!ids.includes("c-import"), "import buckets are hidden");
  assert.ok(ids.includes("c-bags"), "a parent with its own recipe is still offered");
  assert.equal(ids.at(-1), "c-inserts", "shelves without a recipe come last as simple products");
  assert.equal(byId("c-inserts").has3D, false);
  assert.equal(byId("c-slips").label, "Name slips");
  assert.equal(byId("c-slips").imageUrl, "/api/product-images/slip-1", "first real product photo represents the shelf");
  assert.equal(byId("c-slips").productCount, 3);
  assert.equal(byId("c-soap").imageUrl, "", "pending placeholders never become card pictures");
  assert.equal(byId("c-soap").has3D, true);
  assert.equal(byId("c-cards").has3D, false);
});

test("category suggestions come from photo file names and typed text", () => {
  assert.deepEqual(fileNameWords(["IMG_2041.JPG", "rose-soap-box_02.jpeg", "WhatsApp Image 2026.png"]), ["rose", "soap", "box"]);
  assert.equal(suggestCategories(options, { fileNames: ["rose-soap-box.jpg"] })[0].categoryId, "c-soap");
  assert.equal(suggestCategories(options, { fileNames: ["blue_pen_set.jpg"] })[0].categoryId, "c-pens");
  assert.equal(suggestCategories(options, { fileNames: ["IMG_1.jpg"], text: "kids name slip" })[0].categoryId, "c-slips");
  assert.equal(suggestCategories(options, { fileNames: ["dcut-bag.jpg"] })[0].categoryId, "c-dcut");
  assert.equal(suggestCategories(options, { fileNames: ["wedding-hamper.jpg"] })[0].categoryId, "c-gift-box");
  const noSignal = suggestCategories(options, { fileNames: ["IMG_0001.jpg"] });
  assert.equal(noSignal.length, 3, "always three cards");
  assert.equal(noSignal[0].categoryId, "c-slips", "falls back to the busiest shelf");
  assert.deepEqual(searchCategoryOptions(options, "soap").map((option) => option.categoryId)[0], "c-soap");
  assert.deepEqual(searchCategoryOptions(options, ""), []);
});

test("recipes apply their fields; switching asks before replacing personalisation fields", () => {
  const slips = recipeDraftFor(getCategoryListingRecipe("customized-name-slips"));
  const soap = recipeDraftFor(getCategoryListingRecipe("soap-boxes"));
  assert.ok(slips.configurationFields.some((field) => field.inputType === "text"));
  assert.ok(soap.configurationFields.some((field) => field.key === "material"));
  assert.equal(recipeDraftFor(undefined).configurationFields.length, 0);

  const prompt = recipeChangePrompt({ currentDraft: slips, nextDraft: soap, nextLabel: "Soap box" });
  assert.equal(prompt, `Replace the ${slips.configurationFields.length} personalisation fields with the Soap box defaults?`);
  assert.equal(recipeChangePrompt({ currentDraft: slips, nextDraft: recipeDraftFor(getCategoryListingRecipe("waterproof-stickers")), nextLabel: "Stickers" }), null, "same fields: nothing to confirm");
  assert.equal(recipeChangePrompt({ currentDraft: recipeDraftFor(undefined), nextDraft: soap, nextLabel: "Soap box" }), null, "nothing to lose");
});

test("packaging print options are pre-filled chips that customers see as ₹0 choices", () => {
  const recipe = getCategoryListingRecipe("soap-boxes");
  const draft = recipeDraftFor(recipe);
  const chips = printOptionsFor(draft, recipe);
  const keys = chips.map((chip) => chip.key);
  for (const key of ["material", "box-construction", "printing-type", "print-colours", "lamination", "finishing", "insert-holder", "window-option"]) {
    assert.ok(keys.includes(key), `${key} has chips`);
  }
  assert.deepEqual(chips.find((chip) => chip.key === "material")?.selected, ["White board 350 GSM"]);
  assert.deepEqual(chips.find((chip) => chip.key === "printing-type")?.selected, ["Offset CMYK"]);
  assert.ok(chips.find((chip) => chip.key === "lamination")?.selected.includes("Matte"));

  let next = togglePrintOption(chips, "lamination", "Gloss");
  assert.ok(!next.find((chip) => chip.key === "lamination")?.selected.includes("Gloss"), "tapping an on chip turns it off");
  next = togglePrintOption(next, "lamination", "Velvet touch");
  assert.ok(next.find((chip) => chip.key === "lamination")?.choices.includes("Velvet touch"), "typed values are added");
  assert.ok(next.find((chip) => chip.key === "lamination")?.selected.includes("Velvet touch"), "and switched on");
  next = togglePrintOption(next, "window-option", "No window");

  const fields = applyPrintOptions(draft.configurationFields, next);
  const lamination = fields.find((field) => field.key === "lamination")!;
  assert.equal(lamination.enabled, true);
  assert.equal(lamination.customerVisible, true);
  assert.ok(lamination.options.every((option) => option.priceDelta === 0));
  assert.deepEqual(lamination.options.map((option) => option.label), ["Matte", "Velvet touch"]);
  assert.equal(new Set(lamination.options.map((option) => option.value)).size, lamination.options.length, "option values are unique");
  const windowField = fields.find((field) => field.key === "window-option")!;
  assert.equal(windowField.enabled, false, "a print option with nothing selected stays hidden");

  const payload = quickListProductPayload({
    name: "Rose Soap Box", sku: "ROSE-1", categoryId: "c-soap", price: "0", description: "", productType: "", draft,
    published: true, imageUrl: "/api/product-images/pending", recipe, printOptions: next,
  });
  assert.ok(payload.configurationFields.find((field) => field.key === "material")?.enabled);
  assert.equal(payload.allow3D, false, "packaging 3D comes only from publishing its template");
});

test("price warnings fire outside 0.5×–2× of what similar products sell for", () => {
  const recipe = getCategoryListingRecipe("customized-name-slips"); // ₹219–₹499
  assert.equal(priceRangeWarning(recipe, "249"), null);
  assert.equal(priceRangeWarning(recipe, "110"), null, "just inside half the minimum");
  assert.equal(priceRangeWarning(recipe, "998"), null, "just inside twice the maximum");
  assert.match(priceRangeWarning(recipe, "100") ?? "", /looks low/);
  assert.match(priceRangeWarning(recipe, "1000") ?? "", /looks high.*₹219–₹499/);
  assert.equal(priceRangeWarning(recipe, ""), null);
  assert.equal(priceRangeWarning(getCategoryListingRecipe("soap-boxes"), "5"), null, "quote shelves have no band");
});

test("Publish lists what is missing in plain words instead of silently disabling", () => {
  assert.deepEqual(missingForPublish({ photoCount: 0, categoryId: "", name: "", price: "" }), ["a photo", "what it is", "a name", "a price"]);
  assert.deepEqual(missingForPublish({ photoCount: 1, categoryId: "c", name: "Rose Soap Box", price: "249" }), []);
  assert.deepEqual(missingForPublish({ photoCount: 1, categoryId: "c", name: "Rose", price: "abc" }), ["a price"]);
  assert.equal(missingSummary(["a photo", "a price"]), "Add a photo and a price to publish.");
  assert.equal(missingSummary(["a photo", "a name", "a price"]), "Add a photo, a name and a price to publish.");
  assert.equal(missingSummary([]), "");
  assert.deepEqual(listingFieldErrors({ name: "", price: "" }), { name: "Add a name", price: "Add a price" });
  assert.deepEqual(listingFieldErrors({ name: "A", price: "-3" }), { name: "Use at least 2 letters", price: "Use numbers only, like 249" });
});

test("names and descriptions are suggested without any AI", () => {
  assert.equal(suggestProductName("Soap box", ["rose-soap-box.jpg"]), "Rose Soap Box");
  assert.equal(suggestProductName("Soap box", ["IMG_2041.jpg"]), "Custom Soap Box");
  assert.equal(suggestProductName("Pens & pencils", ["unicorn.jpg"]), "Unicorn Pens & Pencils");
  assert.match(writeDescription(getCategoryListingRecipe("soap-boxes"), "Rose Soap Box"), /^Rose Soap Box, custom printed/);
  assert.match(writeDescription(undefined, "", "Inserts"), /^Inserts, made to order/);
});

test("3D size presets and the size text the 3D model reads back", () => {
  const soap = sizePresetsFor(getCategoryListingRecipe("soap-boxes"));
  assert.deepEqual(soap.map((preset) => preset.id), ["small", "medium", "large"]);
  assert.deepEqual(soap[1], { id: "medium", label: "Medium", width: 90, height: 60, depth: 30 });
  assert.ok(soap[0].width < soap[1].width && soap[2].width > soap[1].width);
  assert.deepEqual(sizePresetsFor(getCategoryListingRecipe("business-cards")), [], "no 3D, no sizes");
  assert.ok(sizePresetsFor(getCategoryListingRecipe("personalized-pencils-pens")).length === 3, "built-in models get sizes too");
  const text = sizeDescriptionFor({ width: 90, height: 60, depth: 30 });
  assert.equal(text, "90 × 60 × 30 mm");
  assert.deepEqual(parseExactDimensions(text), { width: 90, height: 60, depth: 30 });
});

test("the wizard autosaves without file blobs and restores only what is safe", () => {
  const now = 1_800_000_000_000;
  const base: Omit<PersistedListingDraft, "version" | "savedAt"> = {
    listingId: "lst_abcdef123456", step: 3, productId: "prod_1", categoryId: "c-soap", name: "Rose Soap Box", nameEdited: true,
    price: "249", description: "Lovely", compareAtPrice: "", sku: "ROSE-1", skuEdited: false, gstPercent: 18, stockOnHand: "",
    productionDaysMin: "2", productionDaysMax: "4", quantityMin: "", quantityMax: "", extraCategoryIds: ["c-x"],
    printOptions: [{ key: "material", label: "Material", choices: ["A", "B"], selected: ["A"] }],
    sizeMm: { width: 90, height: 60, depth: 30 }, textPosition: "top", sampleText: "Aarav",
    photos: [
      { id: "p1", fileName: "rose.jpg", width: 1600, height: 1200, assetId: "asset_1" },
      { id: "p2", fileName: "not-uploaded.jpg", width: 10, height: 10, assetId: "" },
    ],
  };
  const raw = serializeListingDraft({ ...base, photos: [...base.photos, { previewUrl: "blob:x", blob: "bytes" } as never] }, now);
  assert.ok(!raw.includes("blob:"), "object URLs are never stored");
  const restored = parseListingDraft(raw, now + 1000);
  assert.ok(restored);
  assert.equal(restored.name, "Rose Soap Box");
  assert.equal(restored.step, 3);
  assert.deepEqual(restored.photos.map((photo) => photo.assetId), ["asset_1"], "only uploaded photos come back");
  assert.deepEqual(restored.sizeMm, { width: 90, height: 60, depth: 30 });
  assert.deepEqual(restored.printOptions[0]?.selected, ["A"]);
  assert.equal(parseListingDraft(raw, now + 8 * 24 * 3600 * 1000), null, "week-old drafts expire");
  assert.equal(parseListingDraft("{nope", now), null);
  assert.equal(parseListingDraft(JSON.stringify({ version: 2 }), now), null);
  assert.equal(parseListingDraft(raw.replace("lst_abcdef123456", "../../etc"), now), null, "foreign ids are refused");
  assert.equal(hasListingInput({ name: "", price: "", description: "", categoryId: "", photoCount: 0 }), false);
  assert.equal(hasListingInput({ name: "", price: "", description: "", categoryId: "", photoCount: 1 }), true);
  assert.match(newListingId(() => "123e4567-e89b-12d3-a456-426614174000"), LISTING_ID_PATTERN);
});

test("photo checks warn in friendly words and never block", () => {
  assert.deepEqual(photoQualityWarnings({ width: 2000, height: 1500, meanLuma: 140, borderBusyness: 0.02 }), []);
  const warnings = photoQualityWarnings({ width: 600, height: 400, meanLuma: 30, borderBusyness: 0.4 });
  assert.deepEqual(warnings, [
    "Photo is small (600 px) — prints may look blurry",
    "Very dark photo",
    "Busy background — a plain background looks cleaner on the product card and in the customiser",
  ]);
});

test("the default design's name can sit at the top, middle or bottom of the photo", () => {
  const config = { canvas: { width: 600, height: 400 }, texts: [{ y: 180, fontSize: 28, height: null }] };
  assert.equal(positionStudioText(config, "middle"), config);
  assert.equal(positionStudioText(config, "top").texts[0].y, 40);
  assert.equal(positionStudioText(config, "bottom").texts[0].y, 318);
});

test("the GST tooltip is plain language", () => {
  assert.match(gstNoteFor(getCategoryListingRecipe("personalized-notebooks")), /18% GST/);
  assert.match(gstNoteFor(getCategoryListingRecipe("soap-boxes")), /no GST/);
});

test("specific words beat generic ones: a pencil box is a pen product, not a box", () => {
  assert.equal(suggestCategories(options, { fileNames: ["pencil-box-set.webp"] })[0].categoryId, "c-pens");
  assert.equal(suggestCategories(options, { fileNames: ["custom-pens-pack-of-10.jpg"] })[0].categoryId, "c-pens");
  assert.equal(suggestCategories(options, { fileNames: ["soap.jpg"] })[0].categoryId, "c-soap");
  assert.equal(suggestCategories(options, { fileNames: ["paper-bag.jpg"] })[0].categoryId, "c-bags");
  assert.equal(suggestCategories(options, { fileNames: ["visiting-card.jpg"] })[0].categoryId, "c-cards");
});

test("category cards prefer a real product photo to a demo stock photo", () => {
  const picked = buildCategoryOptions(categories, [
    { categoryId: "c-pens", imageUrl: "https://images.unsplash.com/photo-desk" },
    { categoryId: "c-pens", imageUrl: "https://dyuh5x5qbqu9p.cloudfront.net/pen.webp" },
  ]).find((option) => option.categoryId === "c-pens");
  assert.equal(picked?.imageUrl, "https://dyuh5x5qbqu9p.cloudfront.net/pen.webp");
});
