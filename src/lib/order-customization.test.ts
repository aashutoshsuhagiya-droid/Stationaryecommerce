import assert from "node:assert/strict";
import test from "node:test";

import { maximumOrderJsonBytes, POST } from "../app/api/orders/route";
import { createDemoOrder } from "./order-service";
import { artworkDocumentSchema, createOrderSchema } from "./validation";

const artwork = {
  version: 1 as const,
  activeSurfaceId: "primary",
  updatedAt: "2026-10-19T08:00:00.000Z",
  surfaces: [{
    id: "primary",
    label: "Primary print area",
    layers: [
      {
        id: "personalization-name",
        type: "text" as const,
        name: "Personalized name",
        x: 120,
        y: 145,
        width: 360,
        height: 70,
        rotation: 0,
        opacity: 1,
        text: "Aarav Mehta",
        color: "#17324d",
        fontSize: 40,
        fontFamily: "rounded" as const,
      },
      {
        id: "customer-logo",
        type: "image" as const,
        name: "logo.png",
        x: 40,
        y: 40,
        width: 80,
        height: 80,
        rotation: 0,
        opacity: 0.9,
        src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",
        sourceWidth: 1,
        sourceHeight: 1,
      },
    ],
  }],
};

const completeOrder = {
  items: [{
    productId: "prod-everyday-name-slips",
    variantId: "var-everyday-72",
    quantity: 2,
    customization: {
      templateId: "tpl-geo-pop",
      fields: { name: "Aarav Mehta", font: "rounded" },
      previewVersion: 1,
      configurationId: "configuration-test-1",
      dimensionPresetId: "size-1-45-x-12-mm",
      dimensionLabel: "45 x 12 mm",
      displayUnit: "mm" as const,
      artwork,
      presentation: {
        name: "Aarav Mehta",
        detail: "Class 4 B",
        templateLabel: "Geo Pop",
        fontLabel: "Friendly rounded",
        textColor: "#17324d",
        backgroundColor: "#fff4ce",
        packLabel: "72 labels",
        materialLabel: "Matte vinyl",
      },
      quote: {
        id: "quote-test-1",
        pricingVersion: "catalog-test",
        calculatedAt: "2026-10-19T08:00:00.000Z",
        unitPricePaise: 1,
      },
    },
  }],
  shippingAddress: {
    fullName: "Aarav Parent",
    mobile: "9876543210",
    email: "parent@example.com",
    addressLine1: "24 Example Road",
    city: "Pune",
    state: "Maharashtra",
    postalCode: "411001",
    country: "IN" as const,
  },
  shippingMethod: "standard" as const,
  acceptedTerms: true as const,
};

test("validated customization metadata survives the authoritative order snapshot", () => {
  const parsed = createOrderSchema.parse(completeOrder);
  const { order } = createDemoOrder(parsed, `metadata-${crypto.randomUUID()}`);
  const item = order.items[0];

  assert.deepEqual(item.customization, parsed.items[0].customization);
  assert.equal(item.customization?.configurationId, "configuration-test-1");
  assert.equal(item.customization?.artwork?.surfaces[0].layers.length, 2);
  assert.equal(item.customization?.presentation?.templateLabel, "Geo Pop");
  assert.equal(item.customization?.quote?.unitPricePaise, 1);
  assert.equal(item.unitPricePaise, 38_900);
  assert.notEqual(item.unitPricePaise, item.customization?.quote?.unitPricePaise);
});

test("artwork layers are strict discriminated records with validated image data URLs", () => {
  const textWithImageSource = structuredClone(artwork);
  Object.assign(textWithImageSource.surfaces[0].layers[0], { src: artwork.surfaces[0].layers[1].src });
  const invalidImage = structuredClone(artwork);
  invalidImage.surfaces[0].layers[1].src = "data:image/png;base64,not-a-png";

  assert.equal(artworkDocumentSchema.safeParse(textWithImageSource).success, false);
  assert.equal(artworkDocumentSchema.safeParse(invalidImage).success, false);
});

test("artwork documents enforce surface and layer limits", () => {
  const tooManyLayers = structuredClone(artwork);
  tooManyLayers.surfaces[0].layers = Array.from(
    { length: 41 },
    (_, index) => ({ ...artwork.surfaces[0].layers[0], id: `text-${index}` }),
  );
  const missingActiveSurface = { ...artwork, activeSurfaceId: "missing" };

  assert.equal(artworkDocumentSchema.safeParse(tooManyLayers).success, false);
  assert.equal(artworkDocumentSchema.safeParse(missingActiveSurface).success, false);
});

test("order route rejects declared oversized bodies with a clear 413", async () => {
  const response = await POST(new Request("http://localhost/api/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": String(maximumOrderJsonBytes + 1),
      "Idempotency-Key": "oversized-test-request",
    },
    body: "{}",
  }));
  const payload = await response.json() as { error: { code: string } };

  assert.equal(response.status, 413);
  assert.equal(payload.error.code, "REQUEST_TOO_LARGE");
});
