import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeProductCategoryIds,
  vendorCoversProductCategories,
  vendorProductCategoryScope,
} from "./product-category-links";

test("category cross-listing keeps one product identity and unique category links", () => {
  assert.deepEqual(
    normalizeProductCategoryIds("primary", ["secondary", "primary", "secondary"]),
    ["primary", "secondary"],
  );
});

test("the legacy primary category is always retained", () => {
  assert.deepEqual(normalizeProductCategoryIds("legacy-primary", []), ["legacy-primary"]);
});

test("vendor fulfillment uses the primary category and ignores discovery cross-lists", () => {
  const required = normalizeProductCategoryIds("primary", ["secondary", "primary"]);
  assert.equal(vendorCoversProductCategories(["primary", "secondary"], []), false);
  assert.equal(vendorCoversProductCategories(["primary"], required), true);
  assert.equal(vendorCoversProductCategories(["secondary", "primary"], required), true);
  assert.equal(vendorCoversProductCategories(["secondary"], required), false);
  assert.deepEqual(vendorProductCategoryScope(["primary", "secondary", "primary"]), {
    categoryId: { in: ["primary", "secondary"] },
  });
});
