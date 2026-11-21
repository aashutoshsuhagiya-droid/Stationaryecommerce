import assert from "node:assert/strict";
import test from "node:test";

import { searchCatalog } from "./catalog";
import type { Category, Product } from "./types";

const productFixture = (overrides: Partial<Product>): Product => ({
  id: "p1",
  slug: "fixture",
  sku: "SKU-1",
  name: "Fixture",
  category: "Fixtures",
  categorySlug: "fixtures",
  price: 100,
  customizable: false,
  description: "",
  shortDescription: "",
  material: "paper",
  dimensions: "",
  packSize: 1,
  artwork: "labels",
  image: "",
  images: [],
  stockStatus: "in_stock",
  featured: false,
  newArrival: false,
  tags: [],
  features: [],
  productionDays: { min: 1, max: 2 },
  variants: [],
  customizationFields: [],
  templateIds: [],
  ...overrides,
} as Product);

const categoryFixture = (overrides: Partial<Category>): Category => ({
  id: "c1",
  parentId: null,
  slug: "fixtures",
  name: "Fixtures",
  shortName: "Fixtures",
  description: "",
  image: "",
  artwork: "labels",
  accent: "mint",
  sortOrder: 0,
  featured: false,
  productCount: 1,
  ...overrides,
} as Category);

test("searchCatalog searches the injected runtime catalog, not the demo arrays", () => {
  const catalog = {
    products: [
      productFixture({ id: "rb1", name: "Avenger Name Slip", slug: "avenger-name-slip" }),
      productFixture({ id: "rb2", name: "Golden Glitter Topper", slug: "golden-glitter-topper" }),
    ],
    categories: [categoryFixture({ name: "Name Slips", slug: "name-slips", description: "School name slips" })],
  };

  const result = searchCatalog("avenger", 8, catalog);
  assert.equal(result.total, 1);
  assert.equal(result.products[0]?.id, "rb1");

  const categoryHit = searchCatalog("name slips", 8, catalog);
  assert.equal(categoryHit.categories[0]?.slug, "name-slips");
});

test("searchCatalog ranks exact and prefix name matches above fuzzy matches", () => {
  const catalog = {
    products: [
      productFixture({ id: "fuzzy", name: "Avengr Sticker", slug: "avengr-sticker" }),
      productFixture({ id: "exact", name: "Avenger", slug: "avenger" }),
      productFixture({ id: "prefix", name: "Avenger Name Slip", slug: "avenger-name-slip-2" }),
    ],
    categories: [],
  };

  const result = searchCatalog("avenger", 8, catalog);
  assert.deepEqual(result.products.map((product) => product.id), ["exact", "prefix", "fuzzy"]);
});
