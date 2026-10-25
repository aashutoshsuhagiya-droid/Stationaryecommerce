import assert from "node:assert/strict";
import test from "node:test";

import { CommerceError } from "./commerce-error";
import { createDemoOrder } from "./order-service";
import { createCatalogQuote, priceCatalogItem } from "./pricing-service";
import { catalogQuoteSchema } from "./validation";

const configuredItem = {
  productId: "prod-everyday-name-slips",
  variantId: "var-everyday-72",
  quantity: 2,
  customization: {
    templateId: "tpl-geo-pop",
    fields: { name: "Aarav Mehta", font: "rounded" },
    previewVersion: 1,
  },
};

test("quote uses catalog variant and template rates in integer paise", () => {
  const quote = createCatalogQuote({ items: [configuredItem] });
  assert.equal(quote.items[0].baseUnitPricePaise, 34_900);
  assert.equal(quote.items[0].adjustments[0].amountPaise, 4_000);
  assert.equal(quote.items[0].unitPricePaise, 38_900);
  assert.equal(quote.subtotalPaise, 77_800);
  assert.equal(quote.totalPaise, null);
  assert.equal(quote.requiresCheckoutRevalidation, true);
});

test("order creation uses the same authoritative item price as quoting", () => {
  const quote = createCatalogQuote({ items: [configuredItem] });
  const { order } = createDemoOrder(
    {
      items: [configuredItem],
      shippingAddress: {
        fullName: "Aarav Parent",
        mobile: "9876543210",
        email: "parent@example.com",
        addressLine1: "24 Example Road",
        city: "Pune",
        state: "Maharashtra",
        postalCode: "411001",
        country: "IN",
      },
      shippingMethod: "standard",
      acceptedTerms: true,
    },
    `test-${crypto.randomUUID()}`,
  );
  assert.equal(order.items[0].unitPricePaise, quote.items[0].unitPricePaise);
  assert.equal(order.subtotalPaise, quote.subtotalPaise);
});

test("unsupported templates are rejected", () => {
  assert.throws(
    () =>
      priceCatalogItem({
        ...configuredItem,
        customization: { ...configuredItem.customization, templateId: "tpl-clean-school" },
      }),
    (error: unknown) => error instanceof CommerceError && error.code === "INVALID_TEMPLATE",
  );
});

test("quote input rejects browser-supplied prices", () => {
  const result = catalogQuoteSchema.safeParse({
    items: [{ ...configuredItem, unitPricePaise: 1 }],
  });
  assert.equal(result.success, false);
});

test("preview-only image uploads cannot enter an order snapshot", () => {
  assert.throws(
    () => priceCatalogItem({
      ...configuredItem,
      customization: {
        ...configuredItem.customization,
        artwork: {
          version: 1,
          activeSurfaceId: "primary",
          updatedAt: "2026-10-24T00:00:00.000Z",
          surfaces: [{
            id: "primary",
            label: "Primary",
            layers: [{
              id: "preview-upload",
              type: "image",
              name: "preview.png",
              x: 0,
              y: 0,
              width: 100,
              height: 100,
              rotation: 0,
              opacity: 1,
              src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",
              sourceWidth: 1,
              sourceHeight: 1,
            }],
          }],
        },
      },
    }),
    (error: unknown) => error instanceof CommerceError && error.code === "ARTWORK_UPLOAD_NOT_SUPPORTED",
  );
});

test("saved artwork must match the validated personalization name", () => {
  assert.throws(
    () => priceCatalogItem({
      ...configuredItem,
      customization: {
        ...configuredItem.customization,
        artwork: {
          version: 1,
          activeSurfaceId: "primary",
          updatedAt: "2026-10-24T00:00:00.000Z",
          surfaces: [{
            id: "primary",
            label: "Primary",
            layers: [{
              id: "personalization-name",
              type: "text",
              name: "Personalized name",
              x: 10,
              y: 10,
              width: 100,
              height: 30,
              rotation: 0,
              opacity: 1,
              text: "Different Name",
              color: "#17324d",
              fontSize: 24,
              fontFamily: "rounded",
            }],
          }],
        },
      },
    }),
    (error: unknown) => error instanceof CommerceError && error.code === "ARTWORK_PERSONALIZATION_MISMATCH",
  );
});

test("saved artwork font must match the validated font option", () => {
  assert.throws(
    () => priceCatalogItem({
      ...configuredItem,
      customization: {
        ...configuredItem.customization,
        artwork: {
          version: 1,
          activeSurfaceId: "primary",
          updatedAt: "2026-10-24T00:00:00.000Z",
          surfaces: [{
            id: "primary",
            label: "Primary",
            layers: [{
              id: "personalization-name",
              type: "text",
              name: "Personalized name",
              x: 10,
              y: 10,
              width: 100,
              height: 30,
              rotation: 0,
              opacity: 1,
              text: "Aarav Mehta",
              color: "#17324d",
              fontSize: 24,
              fontFamily: "serif",
            }],
          }],
        },
      },
    }),
    (error: unknown) => error instanceof CommerceError && error.code === "ARTWORK_FONT_MISMATCH",
  );
});

test("order presentation name must match the validated personalization", () => {
  assert.throws(
    () => priceCatalogItem({
      ...configuredItem,
      customization: {
        ...configuredItem.customization,
        presentation: {
          name: "Different Name",
          templateLabel: "Geo Pop",
          fontLabel: "Friendly rounded",
          textColor: "#17324d",
          backgroundColor: "#fff4ce",
          packLabel: "72 labels",
          materialLabel: "Matte vinyl",
        },
      },
    }),
    (error: unknown) => error instanceof CommerceError && error.code === "PRESENTATION_PERSONALIZATION_MISMATCH",
  );
});
