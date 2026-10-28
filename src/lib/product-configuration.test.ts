import assert from "node:assert/strict";
import test from "node:test";

import { getProductById, products } from "./data";
import { buildProductConfiguration } from "./product-configuration";

test("configuration exposes exact catalog dimensions without enabling custom sizes", () => {
  const product = getProductById("prod-waterproof-adventure");
  assert.ok(product);

  const configuration = buildProductConfiguration(product);
  assert.deepEqual(configuration.dimensions.presets[0].dimensionsMm, {
    width: 50,
    height: 15,
  });
  assert.deepEqual(configuration.dimensions.supportedDisplayUnits, ["mm", "cm", "in"]);
  assert.equal(configuration.dimensions.custom.supported, false);
  assert.equal(configuration.dimensions.custom.purchaseMode, "quote_only");
  const quoteUrl = new URL(configuration.dimensions.custom.quotePath, "https://example.test");
  assert.equal(quoteUrl.searchParams.get("product"), "prod-waterproof-adventure");
  assert.equal(quoteUrl.searchParams.get("customSize"), "true");
  assert.equal(quoteUrl.searchParams.get("quantity"), String(configuration.quantity.default));
  assert.equal(quoteUrl.searchParams.get("dimensions"), configuration.dimensions.presets[0].label);
});

test("configuration does not manufacture numeric dimensions from descriptive sizes", () => {
  const product = getProductById("prod-everyday-name-slips");
  assert.ok(product);

  const configuration = buildProductConfiguration(product);
  assert.equal(configuration.dimensions.presets[0].dimensionsMm, null);
  assert.deepEqual(configuration.dimensions.supportedDisplayUnits, []);
});

test("configuration uses an exact catalog dimension behind a named paper size", () => {
  const product = getProductById("prod-story-notebook");
  assert.ok(product);

  const configuration = buildProductConfiguration(product);
  assert.deepEqual(configuration.dimensions.presets[0].dimensionsMm, {
    width: 148,
    height: 210,
  });
});

test("configuration exposes multi-name capability only for supported products", () => {
  const bulkProduct = getProductById("prod-classroom-bulk");
  const singleNameProduct = getProductById("prod-waterproof-adventure");
  assert.ok(bulkProduct);
  assert.ok(singleNameProduct);

  assert.equal(buildProductConfiguration(bulkProduct).personalization.supportsMultipleNames, true);
  assert.equal(buildProductConfiguration(singleNameProduct).personalization.supportsMultipleNames, false);
});

test("configuration exposes only the composable customization modes supported by each product", () => {
  const standardProduct = getProductById("prod-waterproof-adventure");
  const bulkProduct = getProductById("prod-classroom-bulk");
  assert.ok(standardProduct);
  assert.ok(bulkProduct);

  assert.deepEqual(buildProductConfiguration(standardProduct).modes, [
    "standard",
    "specification_based",
    "personalized",
    "design_studio",
  ]);
  assert.deepEqual(buildProductConfiguration(bulkProduct).modes, [
    "standard",
    "specification_based",
    "personalized",
    "design_studio",
    "bulk_order",
  ]);
});

test("every catalog product has valid dimension and quantity defaults", () => {
  for (const product of products) {
    const configuration = buildProductConfiguration(product);
    assert.ok(configuration.dimensions.presets.length > 0, `${product.id} needs a dimension preset`);
    assert.ok(
      configuration.dimensions.presets.some(
        (preset) => preset.id === configuration.dimensions.defaultPresetId,
      ),
      `${product.id} needs a valid default dimension preset`,
    );
    assert.ok(
      Number.isSafeInteger(configuration.quantity.default) &&
        configuration.quantity.default >= configuration.quantity.minimum &&
        configuration.quantity.default <= configuration.quantity.maximum,
      `${product.id} needs a bounded integer quantity default`,
    );
    assert.equal(
      (configuration.quantity.default - configuration.quantity.minimum) %
        configuration.quantity.increment,
      0,
      `${product.id} quantity default must follow its increment`,
    );
    assert.ok(configuration.artwork.policy.maximumElements > 0);
    assert.deepEqual(
      configuration.artwork.policy.surfaces.map((surface) => surface.id),
      configuration.artwork.surfaces.map((surface) => surface.id),
    );
  }
});
