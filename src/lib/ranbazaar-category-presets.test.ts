import assert from "node:assert/strict";
import test from "node:test";

import {
  findRanBazaarCategoryMatch,
  flattenRanBazaarTaxonomy,
  RANBAZAAR_CATEGORY_PRESETS,
} from "./ranbazaar-category-presets";

const EXPECTED_CATEGORY_NAMES = [
  "Name Slips & Labels",
  "Premium Name Slips",
  "Name Slips Customize",
  "Waterproof Stickers",
  "School Supplies & Stationery",
  "Pen/Pencil Custom",
  "Exam Board",
  "Note Books",
  "Geometry Box",
  "Kids School Bag & Kit",
  "Kids Utilities",
  "Tracing Name Board",
  "Personalised Accessories",
  "Bag/Luggage Tag",
  "Mouse Pad",
  "Kids Bottle & Tiffin Box",
  "Customize Bottles",
  "Customize Handkerchief",
  "Key Chain",
  "Personalised Gifts & Decorations",
  "Decorative Items",
  "Shagun Envelopes",
  "Gift Slip for Gifts",
  "Name Plate",
  "Vinyl Poster",
  "Wrapping Paper",
  "T-shirts",
  "Paper Bag",
  "Bulk Orders",
  "Bulk Buy",
] as const;

test("RanBazaar taxonomy covers every requested category and entrypoint exactly once", () => {
  const entries = flattenRanBazaarTaxonomy();
  assert.deepEqual(
    entries.map((entry) => entry.name).sort(),
    [...EXPECTED_CATEGORY_NAMES].sort(),
  );
  assert.equal(new Set(entries.map((entry) => entry.id)).size, entries.length);
  assert.equal(new Set(entries.map((entry) => entry.slug)).size, entries.length);
  assert.equal(RANBAZAAR_CATEGORY_PRESETS.length, 5);
});

test("every category has an explicit reuse-or-create decision", () => {
  const categories = flattenRanBazaarTaxonomy().filter((entry) => entry.kind === "category");
  assert.ok(categories.every((entry) => ["reuse", "create"].includes(entry.mapping.strategy)));
  assert.ok(
    categories.every((entry) =>
      entry.mapping.strategy === "create"
        ? entry.mapping.reuseExactMatch
        : entry.mapping.targets.length > 0 && entry.mapping.otherwise === "create",
    ),
  );
});

test("presets require admin cross-listing or browse existing products without auto-assignment", () => {
  const entries = flattenRanBazaarTaxonomy();
  assert.ok(
    entries.every(
      (entry) =>
        entry.productHandling === "admin-cross-listed-products" ||
        entry.productHandling === "browse-existing-products",
    ),
  );
  assert.equal(entries.filter((entry) => entry.kind === "entrypoint").length, 1);
  const bulkBuy = entries.find((entry) => entry.name === "Bulk Buy");
  assert.deepEqual(bulkBuy, {
    kind: "entrypoint",
    id: "bulk-buy",
    name: "Bulk Buy",
    slug: "bulk-buy",
    href: "/bulk-orders",
    categoryPresetId: "bulk-orders",
    productHandling: "browse-existing-products",
  });
});

test("matching preserves a known existing name and URL before creating a category", () => {
  const preset = RANBAZAAR_CATEGORY_PRESETS[0].children[1];
  assert.equal(preset.kind, "category");
  if (preset.kind !== "category") return;
  const existing = {
    id: "existing-name-slips",
    name: "Customized Name Slips",
    slug: "customized-name-slips",
    parentId: null,
  };
  assert.equal(findRanBazaarCategoryMatch(preset, [existing]), existing);
  assert.equal(findRanBazaarCategoryMatch(preset, []), undefined);
});

test("distinct product categories are not collapsed into label or parent rows", () => {
  const accessoryChildren = RANBAZAAR_CATEGORY_PRESETS.find((group) => group.id === "personalised-accessories")?.children ?? [];
  const giftChildren = RANBAZAAR_CATEGORY_PRESETS.find((group) => group.id === "personalised-gifts-decorations")?.children ?? [];
  for (const id of ["kids-bottle-tiffin-box", "customize-bottles", "decorative-items"]) {
    const preset = [...accessoryChildren, ...giftChildren].find((entry) => entry.id === id);
    assert.equal(preset?.kind, "category");
    if (preset?.kind === "category") assert.equal(preset.mapping.strategy, "create");
  }
});
