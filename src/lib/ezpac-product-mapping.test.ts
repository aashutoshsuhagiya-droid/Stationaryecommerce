import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { parseEzpacBodyHtml } from "./admin-structured-description";
import {
  ezpacMappingCategory,
  EZPAC_SHOPIFY_PRODUCT_MAPPING,
} from "./ezpac-product-mapping";
import { EZPAC_PACKAGING_PRODUCT_TYPE_PRESETS } from "./ezpac-packaging-presets";

interface EzpacExportProduct {
  handle: string;
  title: string;
  body_html: string;
  variants: Array<{ price: string }>;
  images: Array<{ src: string }>;
}

const exportProducts = (JSON.parse(
  readFileSync(join(process.cwd(), "docs", "research", "ezpac", "products.json"), "utf8"),
) as { products: EzpacExportProduct[] }).products;

test("maps every EzPac export row exactly once", () => {
  assert.equal(EZPAC_SHOPIFY_PRODUCT_MAPPING.length, 55);

  const mappedHandles = EZPAC_SHOPIFY_PRODUCT_MAPPING.map((mapping) => mapping.shopifyHandle);
  assert.equal(new Set(mappedHandles).size, 55);
  assert.deepEqual(
    [...mappedHandles].sort(),
    exportProducts.map((product) => product.handle).sort(),
  );

  assert.deepEqual(
    EZPAC_SHOPIFY_PRODUCT_MAPPING
      .filter((mapping) => mapping.unmapped)
      .map((mapping) => mapping.shopifyHandle)
      .sort(),
    [
      "cake-box-with-handle-box-with-handle",
      "display-tray",
      "money-cover-envelope",
    ],
  );

  const presetIds = new Set(EZPAC_PACKAGING_PRODUCT_TYPE_PRESETS.map((preset) => preset.id));
  for (const mapping of EZPAC_SHOPIFY_PRODUCT_MAPPING) {
    if (!mapping.unmapped) {
      assert.ok(mapping.presetId && presetIds.has(mapping.presetId));
    }
  }
});

test("preserves the export's pricing, images, and parsed description prefills", () => {
  const productByHandle = new Map(exportProducts.map((product) => [product.handle, product]));

  for (const mapping of EZPAC_SHOPIFY_PRODUCT_MAPPING) {
    const source = productByHandle.get(mapping.shopifyHandle);
    if (!source) {
      throw new Error("Missing export product for " + mapping.shopifyHandle);
    }
    assert.equal(mapping.shopifyTitle, source.title);
    assert.equal(mapping.prefills.priceRupees, Number(source.variants[0]?.price));
    assert.deepEqual(
      mapping.prefills.imageUrls,
      source.images.slice(0, 6).map((image) => image.src),
    );

    const parsed = parseEzpacBodyHtml(source.body_html);
    assert.equal(mapping.prefills.intro, parsed.intro);
    assert.deepEqual(mapping.prefills.bestFor, parsed.bestFor);
    assert.deepEqual(mapping.prefills.featureBullets, parsed.featureBullets);
  }
});

test("retains the product-specific Ziplock and thick-wall details", () => {
  const ziplock = EZPAC_SHOPIFY_PRODUCT_MAPPING.find(
    (mapping) => mapping.shopifyHandle === "25-grams-ziplock-pouch",
  );
  const thickWall = EZPAC_SHOPIFY_PRODUCT_MAPPING.find(
    (mapping) => mapping.shopifyHandle === "slider-style-box",
  );

  assert.equal(ziplock?.prefills.materialHint, "outside paper, inside food-grade aluminium lining");
  assert.ok(ziplock?.prefills.featureBullets?.includes("food-grade-lining"));
  assert.ok(ziplock?.prefills.featureBullets?.includes("no-designer-needed"));
  assert.ok(thickWall?.prefills.featureBullets?.includes("thick-wall"));
});

test("returns preset category placement only for mapped starters", () => {
  assert.deepEqual(ezpacMappingCategory(), undefined);
  assert.deepEqual(ezpacMappingCategory("food-tray"), {
    primarySubcategoryId: "food-trays-delivery",
    collectionIds: ["food-packaging"],
  });
});
