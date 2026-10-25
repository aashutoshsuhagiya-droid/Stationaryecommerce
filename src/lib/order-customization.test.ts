import assert from "node:assert/strict";
import test from "node:test";

import { GET as getOrderByPath } from "../app/api/orders/[orderNumber]/route";
import { GET as getOrderByQuery, maximumOrderJsonBytes, POST } from "../app/api/orders/route";
import { createDemoOrder, toOrderTrackingSummary } from "./order-service";
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
        imageFit: "stretch" as const,
        aspectLocked: false,
      },
    ],
  }],
};

const orderArtwork = {
  ...artwork,
  surfaces: artwork.surfaces.map((surface) => ({
    ...surface,
    layers: surface.layers.filter((layer) => layer.type === "text"),
  })),
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
      dimensionPresetId: "size-1-mixed-size-pack",
      dimensionLabel: "Mixed size pack",
      displayUnit: "mm" as const,
      artwork: orderArtwork,
      presentation: {
        name: "Aarav Mehta",
        detail: "Class 4 B",
        templateLabel: "Geo Pop",
        fontLabel: "Friendly rounded",
        textColor: "#17324d",
        backgroundColor: "#fff4ce",
        packLabel: "Browser-authored pack",
        materialLabel: "Browser-authored material",
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

test("validated customization metadata survives without trusting browser quote audit data", () => {
  const parsed = createOrderSchema.parse(completeOrder);
  const { order } = createDemoOrder(parsed, `metadata-${crypto.randomUUID()}`);
  const item = order.items[0];

  assert.equal(item.customization?.configurationId, "configuration-test-1");
  assert.equal(item.customization?.artwork?.surfaces[0].layers.length, 1);
  assert.equal(item.customization?.presentation?.templateLabel, "Geo Pop");
  assert.equal(item.customization?.dimensionLabel, "Mixed size pack");
  assert.notEqual(item.customization?.presentation?.packLabel, "Browser-authored pack");
  assert.notEqual(item.customization?.presentation?.materialLabel, "Browser-authored material");
  assert.equal(item.customization?.quote, undefined);
  assert.equal(item.unitPricePaise, 38_900);
});

test("public tracking summaries omit contact, address, and artwork data", () => {
  const parsed = createOrderSchema.parse(completeOrder);
  const { order } = createDemoOrder(parsed, `tracking-${crypto.randomUUID()}`);
  const summary = toOrderTrackingSummary(order);

  assert.deepEqual(Object.keys(summary).sort(), [
    "currency",
    "fulfillmentStatus",
    "itemCount",
    "orderNumber",
    "paymentStatus",
    "totalPaise",
    "updatedAt",
  ]);
  assert.equal(summary.itemCount, 1);
  assert.equal("shippingAddress" in summary, false);
  assert.equal("items" in summary, false);
});

test("both public tracking handlers return only the privacy-safe summary", async () => {
  const parsed = createOrderSchema.parse(completeOrder);
  const { order } = createDemoOrder(parsed, `tracking-routes-${crypto.randomUUID()}`);
  const assertPrivateFieldsAreOmitted = async (response: Response) => {
    assert.equal(response.status, 200);
    const payload = await response.json() as { data: Record<string, unknown> };
    assert.equal("shippingAddress" in payload.data, false);
    assert.equal("items" in payload.data, false);
    assert.equal(payload.data.orderNumber, order.orderNumber);
  };

  await assertPrivateFieldsAreOmitted(await getOrderByQuery(new Request(
    `http://localhost/api/orders?orderNumber=${encodeURIComponent(order.orderNumber)}&email=${encodeURIComponent(order.shippingAddress.email)}`,
    { headers: { "X-Forwarded-For": `tracking-query-${crypto.randomUUID()}` } },
  )));
  await assertPrivateFieldsAreOmitted(await getOrderByPath(
    new Request(
      `http://localhost/api/orders/${encodeURIComponent(order.orderNumber)}?email=${encodeURIComponent(order.shippingAddress.email)}`,
      { headers: { "X-Forwarded-For": `tracking-path-${crypto.randomUUID()}` } },
    ),
    { params: Promise.resolve({ orderNumber: order.orderNumber }) },
  ));
});

test("idempotent replay ignores insignificant object key ordering", () => {
  const firstInput = createOrderSchema.parse(completeOrder);
  const replayInput = structuredClone(firstInput);
  replayInput.items[0].customization!.fields = {
    font: firstInput.items[0].customization!.fields.font,
    name: firstInput.items[0].customization!.fields.name,
  };
  const idempotencyKey = `canonical-${crypto.randomUUID()}`;

  const first = createDemoOrder(firstInput, idempotencyKey);
  const replay = createDemoOrder(replayInput, idempotencyKey);
  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(replay.order.orderNumber, first.order.orderNumber);
});

test("accepted order notes are preserved in the order snapshot", () => {
  const parsed = createOrderSchema.parse({ ...completeOrder, notes: "Please verify spelling." });
  const { order } = createDemoOrder(parsed, `notes-${crypto.randomUUID()}`);
  assert.equal(order.notes, "Please verify spelling.");
});

test("artwork layers are strict discriminated records with validated image data URLs", () => {
  const textWithImageSource = structuredClone(artwork);
  Object.assign(textWithImageSource.surfaces[0].layers[0], { src: artwork.surfaces[0].layers[1].src });
  const invalidImage = structuredClone(artwork);
  invalidImage.surfaces[0].layers[1].src = "data:image/png;base64,not-a-png";
  const invalidImageFit = structuredClone(artwork);
  Object.assign(invalidImageFit.surfaces[0].layers[1], { imageFit: "repeat" });

  assert.equal(artworkDocumentSchema.safeParse(textWithImageSource).success, false);
  assert.equal(artworkDocumentSchema.safeParse(invalidImage).success, false);
  assert.equal(artworkDocumentSchema.safeParse(invalidImageFit).success, false);
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
