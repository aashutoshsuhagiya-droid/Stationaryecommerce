import assert from "node:assert/strict";
import test from "node:test";

import { bulkRequestPolicy, bulkRequestSchema } from "./bulk-request-validation";
import { bulkPersonalizationPolicy } from "./bulk-personalization";

const validRequest = {
  customerName: "Test Customer",
  businessName: "Test School",
  email: "TEST@EXAMPLE.COM",
  phone: "+91 98765 43210",
  productId: "prod-everyday-name-slips",
  customSizeRequested: false,
  requestedDimensions: "50 x 15 mm",
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

test("bulk request preserves custom-size intent, requested dimensions and quantity", () => {
  const parsed = bulkRequestSchema.parse({
    ...validRequest,
    customSizeRequested: true,
    requestedDimensions: " 75 x 20 mm ",
    quantity: 275,
  });

  assert.equal(parsed.customSizeRequested, true);
  assert.equal(parsed.requestedDimensions, "75 x 20 mm");
  assert.equal(parsed.quantity, 275);
});

test("bulk request normalizes the legacy dimensions field", () => {
  const { requestedDimensions: _requestedDimensions, ...legacyRequest } = validRequest;
  const parsed = bulkRequestSchema.parse({
    ...legacyRequest,
    dimensions: "60 x 20 mm",
  });

  assert.equal(parsed.requestedDimensions, "60 x 20 mm");
  assert.equal("dimensions" in parsed, false);
});

test("bulk request rejects quantities outside configured policy", () => {
  const result = bulkRequestSchema.safeParse({
    ...validRequest,
    quantity: bulkRequestPolicy.minimumQuantity - 1,
  });
  assert.equal(result.success, false);
});

test("bulk request accepts validated personalization rows", () => {
  const result = bulkRequestSchema.parse({
    ...validRequest,
    quantity: 3,
    personalizationRows: [
      { rowNumber: 2, name: "Aarav", details: "Class 4", quantity: 2 },
      { rowNumber: 3, name: "Mira", details: "", quantity: 1 },
    ],
    allowDuplicateNames: false,
  });
  assert.equal(result.personalizationRows.length, 2);
});

test("bulk request rejects personalization quantities above the requested quantity", () => {
  const result = bulkRequestSchema.safeParse({
    ...validRequest,
    quantity: 2,
    personalizationRows: [
      { rowNumber: 2, name: "Aarav", details: "", quantity: 2 },
      { rowNumber: 3, name: "Mira", details: "", quantity: 1 },
    ],
  });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.ok(result.error.issues.some((issue) => issue.path.join(".") === "personalizationRows"));
  }
});

test("bulk request applies the duplicate-name policy on normalized names", () => {
  const rows = [
    { rowNumber: 2, name: "Aarav  Mehta", details: "", quantity: 1 },
    { rowNumber: 3, name: " aarav mehta ", details: "", quantity: 1 },
  ];
  const rejected = bulkRequestSchema.safeParse({
    ...validRequest,
    quantity: 2,
    personalizationRows: rows,
    allowDuplicateNames: false,
  });
  const accepted = bulkRequestSchema.safeParse({
    ...validRequest,
    quantity: 2,
    personalizationRows: rows,
    allowDuplicateNames: true,
  });
  assert.equal(rejected.success, false);
  assert.equal(accepted.success, true);
});

test("bulk request revalidates row lengths, quantities and row count", () => {
  const invalidRow = bulkRequestSchema.safeParse({
    ...validRequest,
    quantity: bulkPersonalizationPolicy.maximumRowQuantity,
    personalizationRows: [{
      rowNumber: 2,
      name: "N".repeat(bulkPersonalizationPolicy.maxNameLength + 1),
      details: "",
      quantity: bulkPersonalizationPolicy.maximumRowQuantity + 1,
    }],
  });
  const tooManyRows = bulkRequestSchema.safeParse({
    ...validRequest,
    quantity: bulkRequestPolicy.maximumQuantity,
    personalizationRows: Array.from(
      { length: bulkPersonalizationPolicy.maxRows + 1 },
      (_, index) => ({ rowNumber: index + 2, name: `Name ${index}`, details: "", quantity: 1 }),
    ),
    allowDuplicateNames: false,
  });
  assert.equal(invalidRow.success, false);
  assert.equal(tooManyRows.success, false);
});
