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

test("Ranbazaar customize details map to readable, source-limited fields with source styling", () => {
  const product = mapRanbazaarProductRecord({
    id: "abc123",
    name: "Name Slip",
    sale: 219,
    quantity: 24,
    tax_class: { percentage: "18" },
    metaTitle: "A".repeat(200),
    metaDescription: "B".repeat(400),
    price: { "2": "175" },
    customizeDetails: [
      {
        name: "Sample_1",
        customerImg: [{ id: 1, imageUrl: "https://example.test/upload-slot.webp", x: 10, y: 10, width: "200px", height: "200px" }],
        inputFields: [
          {
            type: "customize",
            name: "ENTER YOUR NAME",
            slug: "enetr_your_name",
            style: { color: "#000000", fontSize: "28", fontFamily: "Gilroy Extrabold" },
          },
          { type: "text", name: "Enter Your School Name ", slug: "enter_your_school_name", style: {} },
          { type: "customize", name: "Duplicate", slug: "enetr_your_name" },
        ],
      },
    ],
  }, "name-slip");

  assert.equal(product.customizable, true);
  assert.equal(product.personalizationFields?.length, 3);
  const [first, second, third] = product.personalizationFields ?? [];
  assert.deepEqual(
    { key: first?.key, label: first?.label, inputType: first?.inputType, required: first?.required, maxLength: first?.maxLength },
    { key: "enetr-your-name", label: "Your name", inputType: "text", required: true, maxLength: 32 },
  );
  // The source text stays as the placeholder; Gilroy maps to its open substitute.
  assert.deepEqual(first?.validation, { placeholder: "ENTER YOUR NAME", sourceLabel: "ENTER YOUR NAME", fontId: "montserrat", color: "#000000", fontSize: 28 });
  assert.deepEqual(
    { key: second?.key, label: second?.label, validation: second?.validation, sortOrder: second?.sortOrder },
    { key: "enter-your-school-name", label: "Your school name", validation: { placeholder: "Enter Your School Name", sourceLabel: "Enter Your School Name", fontId: "montserrat", color: "#111418", fontSize: 24 }, sortOrder: 1 },
  );
  assert.equal(third?.key, "enetr-your-name-2");
  // This fixture's photo input sits on a sample without a mockup, so there is no design to place it on.
  assert.equal(product.skippedPhotoSlots, 1);
  assert.equal(product.studioPlan?.acceptsPhotos, false);
  assert.equal(product.personalizationOverflow, 0);

  assert.deepEqual(product.bulkPriceTiers, [{ minimum: 2, pricePaise: 17_500 }]);
  assert.equal(product.taxRateBasisPoints, 1_800);
  assert.equal(product.taxCode, "IN-GST-18");
  assert.equal(product.seoTitle, "A".repeat(160));
  assert.equal(product.seoDescription, "B".repeat(320));
  assert.equal(product.seoTruncated, true);
  assert.equal(product.variants[0]?.inventoryPolicy, "CONTINUE");
  assert.equal(product.variants[0]?.onHand, 24);
});

test("a photo-only Ranbazaar product (no text inputs) is still customizable", () => {
  const source = JSON.parse(readFileSync("docs/research/ranbazaar/products/customizable-kids-notebooks-perfect-for-school-and-play---pack-of-5.json", "utf8")).product;
  const product = mapRanbazaarProductRecord(source, "customizable-kids-notebooks-perfect-for-school-and-play---pack-of-5");
  assert.deepEqual(product.personalizationFields, [], "no text fields");
  assert.equal(product.studioPlan?.acceptsPhotos, true);
  assert.equal(product.customizable, true, "the customer uploads into its photo slots");
});

test("Ranbazaar products without stock or customize inputs stay orderable made-to-order", () => {
  const product = mapRanbazaarProductRecord({
    id: "no-stock",
    name: "Normal Product",
    sale: 100,
    quantity: -1,
    tax_class: { percentage: "0" },
    metaTitle: "Normal Product",
  }, "normal-product");

  assert.equal(product.customizable, false);
  assert.deepEqual(product.personalizationFields, []);
  assert.deepEqual(product.bulkPriceTiers, []);
  assert.equal(product.taxRateBasisPoints, 0);
  assert.equal(product.taxCode, null);
  assert.equal(product.seoTruncated, false);
  assert.equal(product.variants[0]?.inventoryPolicy, "MADE_TO_ORDER");
  assert.equal(product.variants[0]?.onHand, undefined);
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
