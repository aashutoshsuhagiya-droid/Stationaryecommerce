import assert from "node:assert/strict";
import test from "node:test";

import { CommerceError } from "./commerce-error";
import { getProductById } from "./data";
import { isPackagingDielineKind } from "./packaging-dieline";
import {
  PackagingPriceError,
  formatPackagingSize,
  packagingTierFor,
  pricePackagingConfiguration,
  readPackagingQuoteSpec,
  type PackagingQuoteSpec,
} from "./packaging-quote";
import { priceProductItem } from "./pricing-service";
import { buildProductConfiguration } from "./product-configuration";
import { catalogQuoteSchema } from "./validation";

/**
 * ezpac.in "Paan Box" as quoted by the source's Pacdora engine on 2026-11-23
 * (model 181060, 100.6 × 199.6 mm). Every expectation below is a price the
 * source page itself returned.
 */
const ladder = [
  [10, 22_131], [25, 18_442], [50, 14_754], [75, 12_910], [100, 11_065],
  [200, 10_328], [300, 9_590], [500, 9_221], [750, 8_115], [1_000, 7_377],
] as const;
const fractions: Record<number, number> = { 10: 1, 25: 5 / 6, 50: 2 / 3, 75: 7 / 12, 100: 1 / 2, 200: 7 / 15, 300: 13 / 30, 500: 5 / 12, 750: 11 / 30, 1_000: 1 / 3 };

const paanBox: PackagingQuoteSpec = {
  source: "pacdora",
  modelCode: "181060",
  capturedAt: "2026-11-23T14:30:00.000Z",
  dieline: "pyramid-box",
  referenceSizeMm: { length: 100.6, width: 0, height: 199.6 },
  sizeAxes: ["length", "height"],
  minSizeMm: { length: 0, width: 0, height: 0 },
  maxSizeMm: { length: 2_000, width: 2_000, height: 2_000 },
  customSize: true,
  defaultUnit: "in",
  quantity: { options: [10, 25, 50, 75, 100, 200, 300, 500, 750], default: 10, minimum: 10, maximum: 1_000, custom: true },
  // Exact source price: real_total_price(750 pcs) / (750 × 11/30). Rounded
  // first-tier prices are not precise enough (₹215.405 must round down).
  baseUnitPaise: 22_130.6036,
  tiers: ladder.map(([minimum, unitPaise]) => ({ minimum, unitPaise, multiplier: fractions[minimum] })),
  selections: [
    { id: "material", name: "Material", hidden: false, defaultOptionId: "white-card", options: [{ id: "white-card", name: "White card board 220- 300 gsm", deltaPaise: 0 }] },
    { id: "print", name: "Print", hidden: true, defaultOptionId: "full-color", options: [{ id: "full-color", name: "Full Color", deltaPaise: 0 }] },
    {
      id: "finishing", name: "Finishing", hidden: false, defaultOptionId: "matte",
      options: [
        { id: "matte", name: "Matte Lamination", deltaPaise: 0 },
        { id: "gloss", name: "Gloss Lamination", deltaPaise: 21_540.4545 - 22_130.6036 },
        { id: "velvet", name: "Velvett Lamination", deltaPaise: 25_081.3527 - 22_130.6036 },
      ],
    },
    {
      id: "sides", name: "Printing sides", hidden: false, defaultOptionId: "outside",
      options: [
        { id: "outside", name: "Outside", deltaPaise: 0 },
        { id: "both", name: "Outside & Inside", deltaPaise: 28_032.0982 - 22_130.6036 },
      ],
    },
    {
      id: "effects", name: "Special Effects", hidden: false, defaultOptionId: "none",
      options: [
        { id: "none", name: "No Effect", deltaPaise: 0 },
        { id: "gold", name: "Gold Foil Stamping", deltaPaise: 51_638.0764 - 22_130.6036 },
        { id: "uv", name: "UV Effect", deltaPaise: 57_539.5709 - 22_130.6036 },
      ],
    },
  ],
};

test("default specification reproduces every source price on the quantity ladder", () => {
  for (const [quantity, unitPaise] of ladder) {
    const priced = pricePackagingConfiguration(paanBox, quantity);
    assert.equal(priced.unitPaise, unitPaise, `${quantity} pcs`);
    assert.equal(priced.lineTotalPaise, unitPaise * quantity);
    assert.deepEqual(priced.adjustments, []);
  }
});

test("each option reproduces the source price at the first tier and scales with quantity", () => {
  const cases: Array<[Record<string, string>, number, number]> = [
    [{ finishing: "gloss" }, 10, 21_540],
    [{ finishing: "velvet" }, 10, 25_081],
    [{ sides: "both" }, 10, 28_032],
    [{ effects: "gold" }, 10, 51_638],
    [{ effects: "uv" }, 10, 57_540],
    // Measured at 25 pcs too: gold ₹430.32, UV ₹479.50, gloss ₹179.50, both sides ₹233.60.
    [{ effects: "gold" }, 25, 43_032],
    [{ effects: "uv" }, 25, 47_950],
    [{ finishing: "gloss" }, 25, 17_950],
    [{ sides: "both" }, 25, 23_360],
  ];
  for (const [selections, quantity, expected] of cases) {
    const priced = pricePackagingConfiguration(paanBox, quantity, { selections });
    assert.equal(priced.unitPaise, expected, JSON.stringify({ selections, quantity }));
    assert.equal(
      priced.baseUnitPaise + priced.adjustments.reduce((total, adjustment) => total + adjustment.amountPaise, 0),
      priced.unitPaise,
      "adjustments explain the whole difference from the default",
    );
  }
});

test("a custom quantity is priced at the highest tier at or below it", () => {
  // Source: 11 and 24 pcs cost the 10-pc price; 60 the 50-pc price; 150 the 100-pc price.
  assert.equal(pricePackagingConfiguration(paanBox, 11).unitPaise, 22_131);
  assert.equal(pricePackagingConfiguration(paanBox, 24).unitPaise, 22_131);
  assert.equal(pricePackagingConfiguration(paanBox, 60).unitPaise, 14_754);
  assert.equal(pricePackagingConfiguration(paanBox, 150).unitPaise, 11_065);
  assert.equal(packagingTierFor(paanBox, 999).minimum, 750);
});

test("quantities outside the source's online range are refused", () => {
  for (const quantity of [0, 9, 1_001, 2.5]) {
    assert.throws(() => pricePackagingConfiguration(paanBox, quantity), (error: unknown) =>
      error instanceof PackagingPriceError && error.issue.code === "QUANTITY_OUT_OF_RANGE");
  }
  const listedOnly = { ...paanBox, quantity: { ...paanBox.quantity, custom: false } };
  assert.throws(() => pricePackagingConfiguration(listedOnly, 60), PackagingPriceError);
  assert.equal(pricePackagingConfiguration(listedOnly, 50).unitPaise, 14_754);
});

test("unknown or hidden selections cannot change the price", () => {
  assert.throws(() => pricePackagingConfiguration(paanBox, 10, { selections: { finishing: "chrome" } }), (error: unknown) =>
    error instanceof PackagingPriceError && error.issue.code === "SELECTION_INVALID");
  assert.throws(() => pricePackagingConfiguration(paanBox, 10, { selections: { invented: "x" } }), PackagingPriceError);
  // A hidden group is always its default, whatever the request says.
  assert.equal(pricePackagingConfiguration(paanBox, 10, { selections: { print: "full-color" } }).unitPaise, 22_131);
});

test("custom sizes are validated and priced from the dieline sheet area", () => {
  const reference = pricePackagingConfiguration(paanBox, 10, { sizeMm: { length: 100.6, height: 199.6 } });
  assert.equal(reference.isCustomSize, false);
  assert.equal(reference.sizeFactor, 1);

  const larger = pricePackagingConfiguration(paanBox, 10, { sizeMm: { length: 201.2, height: 399.2 } });
  assert.equal(larger.isCustomSize, true);
  // The source charged ×3.994 for doubling both sides; any sane sheet model is near ×4.
  assert.ok(larger.sizeFactor > 3.4 && larger.sizeFactor < 4.6, `factor ${larger.sizeFactor}`);
  assert.equal(larger.unitPaise, Math.round(22_130.6036 * larger.sizeFactor));

  const smaller = pricePackagingConfiguration(paanBox, 10, { sizeMm: { length: 50.3 } });
  assert.ok(smaller.unitPaise < reference.unitPaise);

  for (const sizeMm of [{ length: 5 }, { height: 2_001 }, { length: Number.NaN }]) {
    assert.throws(() => pricePackagingConfiguration(paanBox, 10, { sizeMm }), (error: unknown) =>
      error instanceof PackagingPriceError && error.issue.code === "SIZE_INVALID");
  }
  const fixed = { ...paanBox, customSize: false };
  assert.throws(() => pricePackagingConfiguration(fixed, 10, { sizeMm: { length: 120 } }), (error: unknown) =>
    error instanceof PackagingPriceError && error.issue.code === "CUSTOM_SIZE_NOT_SUPPORTED");
});

test("sizes read like the source: inches to four decimals", () => {
  assert.equal(formatPackagingSize(paanBox, paanBox.referenceSizeMm, "in"), "3.9606 x 7.8583 in");
  assert.equal(formatPackagingSize(paanBox, paanBox.referenceSizeMm, "mm"), "100.6 x 199.6 mm");
  assert.equal(formatPackagingSize(paanBox, paanBox.referenceSizeMm, "cm"), "10.06 x 19.96 cm");
});

test("stored specs are read defensively", () => {
  const roundTrip = readPackagingQuoteSpec(JSON.parse(JSON.stringify(paanBox)), isPackagingDielineKind);
  assert.deepEqual(roundTrip, paanBox);
  const broken: unknown[] = [
    null,
    { ...paanBox, source: "other" },
    { ...paanBox, dieline: "sphere" },
    { ...paanBox, tiers: [] },
    { ...paanBox, quantity: { ...paanBox.quantity, maximum: 5_000 } },
    { ...paanBox, selections: [{ ...paanBox.selections[2], defaultOptionId: "missing" }] },
    { ...paanBox, sizeAxes: ["depth"] },
  ];
  for (const value of broken) assert.equal(readPackagingQuoteSpec(value, isPackagingDielineKind), undefined);
});

function packagingProduct() {
  const source = getProductById("prod-everyday-name-slips");
  assert.ok(source);
  return {
    ...source,
    customizable: false,
    customizationFields: [],
    templateIds: [],
    templateLinks: [],
    configurator: {
      ...(source.configurator ?? { allow2D: true, allow3D: false, quantityMin: 1, quantityMax: 100, printAreas: [] }),
      quantityTiers: [{ minimum: 25, priceDelta: -50 }],
      packagingQuote: paanBox,
    },
  };
}

test("server pricing uses the packaging table instead of the catalog variant price", () => {
  const product = packagingProduct();
  const variantId = product.variants[0].id;
  const line = priceProductItem(product, {
    productId: product.id,
    variantId,
    quantity: 25,
    packaging: { selections: { effects: "gold" }, displayUnit: "in" },
  });
  assert.equal(line.unitPricePaise, 43_032);
  assert.equal(line.lineTotalPaise, 43_032 * 25);
  assert.equal(line.baseUnitPricePaise, 18_442);
  // Catalog quantity tiers never stack on the source table.
  assert.ok(line.adjustments.every((adjustment) => adjustment.type === "packaging_option"));
  assert.equal(line.packaging?.sizeLabel, "3.9606 x 7.8583 in");
  assert.equal(line.packaging?.tierMinimum, 25);
  assert.equal(line.productSnapshot.dimensions, "3.9606 x 7.8583 in");
  assert.deepEqual(
    line.packaging?.selections.filter((selection) => selection.selectionId === "effects"),
    [{ selectionId: "effects", selectionName: "Special Effects", optionId: "gold", optionName: "Gold Foil Stamping" }],
  );
});

test("server pricing rejects packaging requests the product cannot take", () => {
  const product = packagingProduct();
  const variantId = product.variants[0].id;
  assert.throws(() => priceProductItem(product, { productId: product.id, variantId, quantity: 5 }), (error: unknown) =>
    error instanceof CommerceError && error.code === "QUANTITY_OUT_OF_RANGE");
  assert.throws(() => priceProductItem(product, { productId: product.id, variantId, quantity: 10, packaging: { selections: { finishing: "chrome" } } }), (error: unknown) =>
    error instanceof CommerceError && error.code === "PACKAGING_SELECTION_INVALID");
  assert.throws(() => priceProductItem(product, { productId: product.id, variantId, quantity: 10, packaging: { selections: {}, sizeMm: { length: 3 } } }), (error: unknown) =>
    error instanceof CommerceError && error.code === "PACKAGING_SIZE_INVALID");
  const plain = getProductById("prod-everyday-name-slips");
  assert.ok(plain);
  assert.throws(() => priceProductItem(plain, { productId: plain.id, variantId: plain.variants[0].id, quantity: 2, packaging: { selections: {} } }), (error: unknown) =>
    error instanceof CommerceError && error.code === "PACKAGING_NOT_SUPPORTED");
});

test("the order schema carries packaging choices strictly", () => {
  const item = { productId: "p", variantId: "v", quantity: 10, packaging: { selections: { finishing: "gloss" }, sizeMm: { length: 120, height: 220 }, displayUnit: "cm" } };
  assert.equal(catalogQuoteSchema.safeParse({ items: [item] }).success, true);
  assert.equal(catalogQuoteSchema.safeParse({ items: [{ ...item, packaging: { ...item.packaging, price: 1 } }] }).success, false);
  assert.equal(catalogQuoteSchema.safeParse({ items: [{ ...item, packaging: { selections: {}, sizeMm: { length: -1 } } }] }).success, false);
});

test("product configuration takes quantity limits from the packaging table", () => {
  const configuration = buildProductConfiguration(packagingProduct());
  assert.equal(configuration.packaging?.modelCode, "181060");
  assert.equal(configuration.quantity.minimum, 10);
  assert.equal(configuration.quantity.maximum, 1_000);
  assert.equal(configuration.quantity.default, 10);
  assert.deepEqual(configuration.quantity.tiers, []);
});

test("every option matches the source at every quantity tier", () => {
  const quantities = [10, 25, 50, 75, 100, 200, 300, 500, 750];
  // unit prices (₹) ezpac.in returned for paan-box, one row per option.
  const measured: Array<[Record<string, string>, number[]]> = [
    [{ finishing: "gloss" }, [215.4, 179.5, 143.6, 125.65, 107.7, 100.52, 93.34, 89.75, 78.98]],
    [{ finishing: "velvet" }, [250.81, 209.01, 167.21, 146.31, 125.41, 117.05, 108.69, 104.51, 91.96]],
    [{ sides: "both" }, [280.32, 233.6, 186.88, 163.52, 140.16, 130.82, 121.47, 116.8, 102.78]],
    [{ effects: "gold" }, [516.38, 430.32, 344.25, 301.22, 258.19, 240.98, 223.76, 215.16, 189.34]],
    [{ effects: "uv" }, [575.4, 479.5, 383.6, 335.65, 287.7, 268.52, 249.34, 239.75, 210.98]],
  ];
  for (const [selections, prices] of measured) {
    quantities.forEach((quantity, index) => {
      assert.equal(
        pricePackagingConfiguration(paanBox, quantity, { selections }).unitPaise,
        Math.round(prices[index] * 100),
        `${JSON.stringify(selections)} at ${quantity} pcs`,
      );
    });
  }
});
