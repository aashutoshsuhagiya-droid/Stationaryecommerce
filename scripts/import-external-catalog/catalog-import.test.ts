import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  deriveExternalKey,
  mapRanbazaarProductPage,
  mapRanbazaarProductRecord,
  nextAvailableSlug,
  priceToPaise,
  sanitizeSourceHtml,
} from "./catalog-import";

test("price conversion preserves zero and exact two-decimal paise", () => {
  assert.equal(priceToPaise("0.00"), 0);
  assert.equal(priceToPaise("109.99"), 10_999);
  assert.equal(priceToPaise("109.999"), null);
});

test("slug collision resolution is stable and leaves the preferred slug untouched when free", () => {
  assert.equal(nextAvailableSlug("personalized-bottle", new Set()), "personalized-bottle");
  assert.equal(
    nextAvailableSlug("personalized-bottle", new Set(["personalized-bottle", "personalized-bottle-2"])),
    "personalized-bottle-3",
  );
});

test("external import keys remain source-scoped", () => {
  assert.equal(deriveExternalKey("ezpac", "15419663876325"), "ezpac:15419663876325");
  assert.equal(deriveExternalKey("ranbazaar", "personalized-bottle"), "ranbazaar:personalized-bottle");
});

test("source descriptions only remove executable scripts", () => {
  assert.equal(
    sanitizeSourceHtml("<h2>Heading</h2><p>Keep <strong>all</strong> markup.</p><script>track()</script>"),
    "<h2>Heading</h2><p>Keep <strong>all</strong> markup.</p>",
  );
});

test("Ranbazaar __NEXT_DATA__ fixture maps title, images, price, variants and source specs", () => {
  const fixture = readFileSync("docs/research/ranbazaar/fixtures/next-data-product.html", "utf8");
  const product = mapRanbazaarProductPage(fixture, "personalized-bottle");
  assert.equal(product.title, "Personalized Bottle");
  assert.equal(product.description, "<p>Steel bottle</p>");
  assert.equal(product.basePricePaise, 10_999);
  assert.equal(product.compareAtPricePaise, 14_900);
  assert.equal(product.images.length, 1);
  assert.equal(product.images[0]?.url, "https://ranbazaar.com/_next/image?url=bottle-1.jpg");
  assert.equal(product.variants.length, 1);
  assert.equal(product.variants[0]?.name, "Blue");
  assert.deepEqual(product.variants[0]?.optionValues, { Color: "Blue" });
  assert.deepEqual(product.dimensions, { specs: [{ label: "Capacity", value: "500 ml" }] });
});

test("Ranbazaar API record maps title, customizeDetails images, sale price, mrp and package specs", () => {
  const rawRecord = {
    id: "66fe6ad4a436c566ac1925c1",
    name: "SAFARI / JUNGLE THEME NAME SIGN | ACRYLIC NAME PLATE",
    slug: "safari_jungle_theme_name_sign_acrylic_name_plate",
    sku: "225",
    description: "<ul><li>Unique Design</li></ul>",
    sale: 1598,
    mrp: 3999,
    weight: 100,
    package: { length: 30, width: 20, height: 40 },
    images: [],
    customizeDetails: [
      { name: "Sample_1", productImg: "https://dyuh5x5qbqu9p.cloudfront.net/productimages/sample-1.webp" },
      { name: "Sample_2", productImg: "https://dyuh5x5qbqu9p.cloudfront.net/productimages/sample-2.webp" },
    ],
    categories: { name: "Name Plate ", slug: "name_plate" },
  };

  const product = mapRanbazaarProductRecord(rawRecord, "safari_jungle_theme_name_sign_acrylic_name_plate");
  assert.equal(product.title, "SAFARI / JUNGLE THEME NAME SIGN | ACRYLIC NAME PLATE");
  assert.equal(product.externalId, "66fe6ad4a436c566ac1925c1");
  assert.equal(product.basePricePaise, 159_800);
  assert.equal(product.compareAtPricePaise, 399_900);
  assert.equal(product.images.length, 2);
  assert.equal(product.images[0]?.url, "https://dyuh5x5qbqu9p.cloudfront.net/productimages/sample-1.webp");
  assert.equal(product.images[1]?.url, "https://dyuh5x5qbqu9p.cloudfront.net/productimages/sample-2.webp");
  assert.equal(product.variants.length, 1);
  assert.equal(product.variants[0]?.sku, "EXT-RANBAZAAR-66fe6ad4a436c566ac1925c1-1");
  assert.equal(product.variants[0]?.pricePaise, 159_800);
  assert.equal(product.variants[0]?.compareAtPricePaise, 399_900);
  assert.deepEqual(product.categoryHints, ["Name Plate", "name_plate"]);
  assert.deepEqual(product.dimensions, { package: { length: 30, width: 20, height: 40 } });
});
