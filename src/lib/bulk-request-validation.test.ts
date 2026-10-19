import assert from "node:assert/strict";
import test from "node:test";

import { bulkRequestPolicy, bulkRequestSchema } from "./bulk-request-validation";

const validRequest = {
  customerName: "Test Customer",
  businessName: "Test School",
  email: "TEST@EXAMPLE.COM",
  phone: "+91 98765 43210",
  productId: "prod-everyday-name-slips",
  dimensions: "50 x 15 mm",
  quantity: bulkRequestPolicy.minimumQuantity,
  material: "Matte vinyl",
  printing: "full-colour" as const,
  finishing: "matte" as const,
  postcode: "411001",
  notes: "",
  acceptedPrivacy: true as const,
};

test("bulk quote policy has a valid configurable quantity range", () => {
  assert.ok(bulkRequestPolicy.minimumQuantity >= 1);
  assert.ok(bulkRequestPolicy.maximumQuantity >= bulkRequestPolicy.minimumQuantity);
});

test("bulk request normalizes contact fields", () => {
  const parsed = bulkRequestSchema.parse(validRequest);
  assert.equal(parsed.email, "test@example.com");
  assert.equal(parsed.phone, "9876543210");
});

test("bulk request rejects quantities outside configured policy", () => {
  const result = bulkRequestSchema.safeParse({
    ...validRequest,
    quantity: bulkRequestPolicy.minimumQuantity - 1,
  });
  assert.equal(result.success, false);
});
