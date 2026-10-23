import assert from "node:assert/strict";
import test from "node:test";

import { POST } from "../app/api/bulk-requests/route";
import { getStoredBulkRequest } from "./bulk-request-store";

test("bulk request route stores custom-size dimensions and the selected quantity", async () => {
  const response = await POST(new Request("https://example.test/api/bulk-requests", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": `bulk-store-test-${crypto.randomUUID()}`,
    },
    body: JSON.stringify({
      customerName: "Test Customer",
      businessName: "Test School",
      email: "test@example.com",
      phone: "+91 98765 43210",
      productId: "prod-waterproof-adventure",
      customSizeRequested: true,
      requestedDimensions: "75 x 20 mm",
      quantity: 275,
      material: "Waterproof vinyl",
      printing: "full-colour",
      finishing: "matte",
      postcode: "411001",
      notes: "Custom-size test",
      acceptedPrivacy: true,
    }),
  }));
  const payload = await response.json() as {
    data?: { reference: string };
    error?: { message?: string };
  };

  assert.equal(response.status, 201, payload.error?.message ?? "bulk request should be accepted");
  assert.ok(payload.data);
  const stored = getStoredBulkRequest(payload.data.reference);
  assert.ok(stored);
  assert.equal(stored.customSizeRequested, true);
  assert.equal(stored.requestedDimensions, "75 x 20 mm");
  assert.equal(stored.quantity, 275);
});
