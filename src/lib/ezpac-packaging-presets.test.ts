import assert from "node:assert/strict";
import test from "node:test";

import {
  ezpacIndustryCollectionCategorySlug,
  getEzpacPackagingFieldsForProductType,
  listEzpacIndustryCollections,
  listEzpacPackagingCategories,
  listEzpacPackagingProductTypes,
} from "./ezpac-packaging-presets";

test("EZPAC category starters remain a two-level, non-duplicating taxonomy", () => {
  const categories = listEzpacPackagingCategories();
  assert.equal(new Set(categories.map((category) => category.slug)).size, categories.length);
  assert.ok(categories.every((category) => category.subcategories.length > 0));
  const subcategorySlugs = categories.flatMap((category) => category.subcategories.map((subcategory) => subcategory.slug));
  assert.equal(new Set(subcategorySlugs).size, subcategorySlugs.length);
  assert.equal(
    new Set([...categories.map((category) => category.slug), ...subcategorySlugs]).size,
    categories.length + subcategorySlugs.length,
  );

  const productTypes = listEzpacPackagingProductTypes();
  assert.equal(new Set(productTypes.map((productType) => productType.id)).size, productTypes.length);
  assert.ok(productTypes.every((productType) => subcategorySlugs.includes(productType.primarySubcategoryId)));

  const collections = listEzpacIndustryCollections();
  const collectionIds = new Set(collections.map((collection) => collection.id));
  assert.equal(collectionIds.size, collections.length);
  assert.ok(productTypes.every((productType) => productType.collectionIds.every((id) => collectionIds.has(id))));
  assert.ok(collections.every((collection) =>
    subcategorySlugs.includes(ezpacIndustryCollectionCategorySlug(collection.slug))));
});

test("product-type starters do not invent option pricing or unsupported manufacturing choices", () => {
  const fields = getEzpacPackagingFieldsForProductType("soap-box");
  assert.ok(fields.some((field) => field.key === "material" && field.optionSource === "admin_configured"));
  assert.ok(fields.filter((field) => field.optionSource === "admin_configured").every((field) => !field.options?.length));
  assert.ok(fields.flatMap((field) => field.options ?? []).every((option) => option.priceDelta === undefined));
});
