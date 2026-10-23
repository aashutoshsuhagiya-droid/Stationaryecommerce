import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCustomSizeQuotePath,
  parseBulkQuotePrefill,
} from "./bulk-quote-prefill";

const options = {
  availableProductIds: new Set(["prod-labels"]),
  minimumQuantity: 1,
  maximumQuantity: 100_000,
};

test("custom-size quote paths carry the selected product, quantity and dimensions", () => {
  const path = buildCustomSizeQuotePath({
    productId: "prod-labels",
    quantity: 37,
    dimensions: "50 × 15 mm",
  });
  const url = new URL(path, "https://example.test");

  assert.equal(url.pathname, "/bulk-orders");
  assert.equal(url.searchParams.get("product"), "prod-labels");
  assert.equal(url.searchParams.get("customSize"), "true");
  assert.equal(url.searchParams.get("quantity"), "37");
  assert.equal(url.searchParams.get("dimensions"), "50 × 15 mm");
});

test("bulk quote prefill accepts bounded scalar values", () => {
  assert.deepEqual(
    parseBulkQuotePrefill(
      {
        product: "prod-labels",
        customSize: "true",
        quantity: "37",
        dimensions: " 75 × 20 mm ",
      },
      options,
    ),
    {
      productId: "prod-labels",
      customSizeRequested: true,
      quantity: 37,
      dimensions: "75 × 20 mm",
    },
  );
});

test("bulk quote prefill ignores unavailable, repeated and out-of-range values", () => {
  assert.deepEqual(
    parseBulkQuotePrefill(
      {
        product: ["prod-labels", "another-product"],
        customSize: ["true", "false"],
        quantity: "100001",
        dimensions: "75 × 20 mm",
      },
      options,
    ),
    {
      productId: undefined,
      customSizeRequested: false,
      quantity: undefined,
      dimensions: undefined,
    },
  );
});
