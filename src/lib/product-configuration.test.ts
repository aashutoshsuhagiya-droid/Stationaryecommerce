import assert from "node:assert/strict";
import test from "node:test";

import { getProductById } from "./data";
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
  assert.match(configuration.dimensions.custom.quotePath, /product=prod-waterproof-adventure/);
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
