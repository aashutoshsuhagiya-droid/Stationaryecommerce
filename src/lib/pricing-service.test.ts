import assert from "node:assert/strict";
import test from "node:test";

import { CommerceError } from "./commerce-error";
import { getProductById } from "./data";
import { createDemoOrder } from "./order-service";
import { createCatalogQuote, priceCatalogItem, priceProductItem } from "./pricing-service";
import { catalogQuoteSchema } from "./validation";
import type { Product, ProductArtworkPolicy } from "./types";

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

test("configured fields and dropdown choices change the authoritative runtime price", () => {
  const source = getProductById("prod-everyday-name-slips");
  assert.ok(source);
  const configuredProduct = {
    ...source,
    id: "runtime-configured-product",
    name: "Configured paper bag",
    slug: "configured-paper-bag",
    customizable: true,
    templateIds: [],
    variants: [{
      ...source.variants[0],
      id: "runtime-configured-variant",
      sku: "RUNTIME-BAG-001",
      name: "Standard bag",
      price: 100,
      stockStatus: "made_to_order" as const,
    }],
    customizationFields: [
      {
        id: "paper",
        label: "Paper type",
        type: "select" as const,
        required: true,
        priceDelta: 10,
        options: [
          { id: "kraft", label: "Kraft", value: "kraft", priceDelta: 0 },
          { id: "art", label: "Art paper", value: "art", priceDelta: 25 },
        ],
      },
      {
        id: "gsm",
        label: "Paper GSM",
        type: "number" as const,
        required: true,
        minValue: 80,
        maxValue: 300,
        step: 10,
        priceDelta: 5,
      },
    ],
    configurator: {
      allow2D: true,
      allow3D: false,
      quantityMin: 5,
      quantityMax: 500,
      quantityTiers: [{ minimum: 5, priceDelta: -20, label: "Five or more" }],
      setupCharge: 50,
      printAreas: [{ id: "front", label: "Front" }],
    },
  };

  const price = priceProductItem(configuredProduct, {
    productId: configuredProduct.id,
    variantId: "runtime-configured-variant",
    quantity: 5,
    customization: {
      fields: { paper: "art", gsm: "120" },
      previewVersion: 1,
    },
  });

  assert.equal(price.baseUnitPricePaise, 10_000);
  assert.deepEqual(price.adjustments.map((adjustment) => adjustment.type), ["field_price_delta", "option_price_delta", "field_price_delta", "quantity_tier", "setup_charge"]);
  assert.deepEqual(price.adjustments.map((adjustment) => adjustment.amountPaise), [1_000, 2_500, 500, -2_000, 5_000]);
  assert.deepEqual(price.adjustments.map((adjustment) => adjustment.scope), ["unit", "unit", "unit", "unit", "line"]);
  assert.equal(price.unitPricePaise, 12_000);
  assert.equal(price.lineTotalPaise, 65_000);
});

test("configured numeric rules and product MOQ are enforced on the server", () => {
  const source = getProductById("prod-everyday-name-slips");
  assert.ok(source);
  const configuredProduct = {
    ...source,
    id: "runtime-configured-validation",
    customizable: true,
    variants: [{ ...source.variants[0], id: "runtime-configured-validation-variant", stockStatus: "made_to_order" as const }],
    customizationFields: [{ id: "width", label: "Width", type: "number" as const, required: true, minValue: 10, maxValue: 100, step: 10 }],
    configurator: { allow2D: true, allow3D: false, quantityMin: 10, quantityMax: 100, printAreas: [{ id: "front", label: "Front" }] },
  };

  assert.throws(
    () => priceProductItem(configuredProduct, { productId: configuredProduct.id, variantId: "runtime-configured-validation-variant", quantity: 5, customization: { fields: { width: "20" }, previewVersion: 1 } }),
    (error: unknown) => error instanceof CommerceError && error.code === "QUANTITY_OUT_OF_RANGE",
  );
  assert.throws(
    () => priceProductItem(configuredProduct, { productId: configuredProduct.id, variantId: "runtime-configured-validation-variant", quantity: 10, customization: { fields: { width: "25" }, previewVersion: 1 } }),
    (error: unknown) => error instanceof CommerceError && error.code === "CUSTOMIZATION_NUMBER_STEP_INVALID",
  );
  const negativePriceProduct = {
    ...configuredProduct,
    variants: [{ ...configuredProduct.variants[0], price: 5 }],
    customizationFields: [{ ...configuredProduct.customizationFields[0], priceDelta: -10 }],
  };
  assert.throws(
    () => priceProductItem(negativePriceProduct, { productId: negativePriceProduct.id, variantId: "runtime-configured-validation-variant", quantity: 10, customization: { fields: { width: "20" }, previewVersion: 1 } }),
    (error: unknown) => error instanceof CommerceError && error.code === "CONFIGURATION_PRICE_INVALID",
  );
});

test("conditional and disabled product fields are enforced only when customer-visible", () => {
  const source = getProductById("prod-everyday-name-slips");
  assert.ok(source);
  const configuredProduct = {
    ...source,
    id: "conditional-packaging-product",
    customizable: true,
    templateIds: [],
    variants: [{ ...source.variants[0], id: "conditional-packaging-variant", stockStatus: "made_to_order" as const }],
    customizationFields: [
      {
        id: "finish",
        label: "Finish",
        type: "select" as const,
        required: true,
        options: [
          { id: "matte", label: "Matte", value: "matte" },
          { id: "foil", label: "Foil", value: "foil" },
        ],
      },
      {
        id: "foil-colour",
        label: "Foil colour",
        type: "select" as const,
        required: true,
        visibleWhen: { fieldId: "finish", equals: "foil" },
        priceDelta: 10,
        options: [{ id: "gold", label: "Gold", value: "gold", priceDelta: 5 }],
      },
      {
        id: "internal-capability",
        label: "Internal capability",
        type: "text" as const,
        required: true,
        enabled: false,
      },
    ],
    configurator: { allow2D: true, allow3D: false, quantityMin: 1, quantityMax: 100, printAreas: [{ id: "front", label: "Front" }] },
  };

  const matte = priceProductItem(configuredProduct, {
    productId: configuredProduct.id,
    variantId: "conditional-packaging-variant",
    quantity: 1,
    customization: { fields: { finish: "matte" }, previewVersion: 1 },
  });
  assert.equal(matte.adjustments.length, 0);

  const foil = priceProductItem(configuredProduct, {
    productId: configuredProduct.id,
    variantId: "conditional-packaging-variant",
    quantity: 1,
    customization: { fields: { finish: "foil", "foil-colour": "gold" }, previewVersion: 1 },
  });
  assert.deepEqual(foil.adjustments.map((adjustment) => adjustment.amountPaise), [1_000, 500]);

  assert.throws(
    () => priceProductItem(configuredProduct, {
      productId: configuredProduct.id,
      variantId: "conditional-packaging-variant",
      quantity: 1,
      customization: { fields: { finish: "matte", "foil-colour": "gold" }, previewVersion: 1 },
    }),
    (error: unknown) => error instanceof CommerceError && error.code === "CUSTOMIZATION_FIELDS_INVALID",
  );
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

test("explicit live template links control template availability and price", () => {
  const source = getProductById("prod-everyday-name-slips");
  assert.ok(source);
  const liveTemplate = {
    id: "live-linked-template",
    slug: "live-linked-template",
    name: "Live linked template",
    theme: "Packaging",
    description: "A linked product template.",
    thumbnail: "",
    artwork: "labels",
    premiumPrice: 17.5,
    active: true,
    rightsStatement: "Internal template",
    compatibleProductIds: ["live-linked-product"],
    preview: { background: "#ffffff", foreground: "#111111", accent: "#222222", fontFamily: "Arial", textAlign: "center" as const, safeArea: { x: 10, y: 10, width: 80, height: 80 } },
  };
  const product = {
    ...source,
    id: "live-linked-product",
    customizable: true,
    templateIds: [liveTemplate.id],
    templateLinks: [{ template: liveTemplate, sortOrder: 0, isDefault: true }],
    variants: [{ ...source.variants[0], id: "live-linked-variant", stockStatus: "made_to_order" as const }],
  };

  const priced = priceProductItem(product, {
    productId: product.id,
    variantId: "live-linked-variant",
    quantity: 1,
    customization: { templateId: liveTemplate.id, fields: { name: "Aarav", font: "rounded" }, previewVersion: 1 },
  });
  assert.equal(priced.adjustments.find((adjustment) => adjustment.type === "template_premium")?.amountPaise, 1_750);
  assert.throws(
    () => priceProductItem(product, { productId: product.id, variantId: "live-linked-variant", quantity: 1, customization: { templateId: "tpl-geo-pop", fields: { name: "Aarav", font: "rounded" }, previewVersion: 1 } }),
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

test("saved artwork cannot use a print surface outside the product configuration", () => {
  assert.throws(
    () => priceCatalogItem({
      ...configuredItem,
      customization: {
        ...configuredItem.customization,
        artwork: {
          version: 1,
          activeSurfaceId: "inside",
          updatedAt: "2026-10-24T00:00:00.000Z",
          surfaces: [{
            id: "inside",
            label: "Inside",
            layers: [],
          }],
        },
      },
    }),
    (error: unknown) => error instanceof CommerceError && error.code === "ARTWORK_SURFACE_INVALID",
  );
});

test("server pricing validation enforces product artwork policy without changing price math", () => {
  const source = getProductById("prod-everyday-name-slips");
  assert.ok(source);
  const artworkPolicy: ProductArtworkPolicy = {
    maximumElements: 1,
    surfaces: [{
      id: "front",
      label: "Front",
      coordinateSpace: { width: 200, height: 100 },
      printableBounds: { x: 0, y: 0, width: 200, height: 100 },
      text: {
        enabled: true,
        maximumElements: 1,
        permissions: { move: false, resize: false, rotate: false, color: false, font: false },
        geometry: {
          default: { x: 10, y: 10, width: 100, height: 20, rotation: 0 },
          minimumWidth: 20,
          maximumWidth: 180,
          minimumHeight: 10,
          maximumHeight: 80,
          minimumRotation: 0,
          maximumRotation: 0,
        },
        defaultColor: "#112233",
        allowedColors: ["#112233"],
        defaultFontFamily: "sans",
        allowedFontFamilies: ["sans"],
      },
      image: {
        enabled: false,
        maximumElements: 0,
        permissions: { move: false, resize: false, rotate: false, color: false, font: false },
        geometry: {
          default: { x: 10, y: 10, width: 20, height: 20, rotation: 0 },
          minimumWidth: 20,
          maximumWidth: 180,
          minimumHeight: 20,
          maximumHeight: 80,
          minimumRotation: 0,
          maximumRotation: 0,
        },
        allowedMimeTypes: [],
        maximumBytes: 0,
        minimumSourceWidth: 1,
        maximumSourceWidth: 50_000,
        minimumSourceHeight: 1,
        maximumSourceHeight: 50_000,
        allowedAspectRatios: [],
        aspectRatioTolerance: 0.01,
        allowTransparency: false,
        allowCrop: false,
        required: false,
        approvalRequired: false,
        chargePerImagePaise: 0,
      },
    }],
  };
  const product: Product = {
    ...source,
    id: "policy-priced-product",
    customizable: true,
    templateIds: [],
    templateLinks: [],
    customizationFields: [],
    variants: [{ ...source.variants[0], id: "policy-priced-variant", stockStatus: "made_to_order" }],
    configurator: {
      allow2D: true,
      allow3D: false,
      quantityMin: 1,
      quantityMax: 100,
      printAreas: [{ id: "front", label: "Front" }],
      artworkPolicy,
    },
  };
  const validArtwork = {
    version: 1 as const,
    activeSurfaceId: "front",
    updatedAt: "2026-10-27T00:00:00.000Z",
    surfaces: [{
      id: "front",
      label: "Front",
      layers: [{
        id: "fixed-name",
        type: "text" as const,
        name: "Fixed name",
        x: 10,
        y: 10,
        width: 100,
        height: 20,
        rotation: 0,
        opacity: 1,
        text: "Aarav",
        color: "#112233",
        fontSize: 18,
        fontFamily: "sans" as const,
      }],
    }],
  };
  const priced = priceProductItem(product, {
    productId: product.id,
    variantId: "policy-priced-variant",
    quantity: 1,
    customization: { fields: {}, previewVersion: 1, artwork: validArtwork },
  });
  assert.equal(priced.unitPricePaise, priced.baseUnitPricePaise);
  assert.equal(priced.adjustments.length, 0);

  assert.throws(
    () => priceProductItem(product, {
      productId: product.id,
      variantId: "policy-priced-variant",
      quantity: 1,
      customization: {
        fields: {},
        previewVersion: 1,
        artwork: {
          ...validArtwork,
          surfaces: [{
            ...validArtwork.surfaces[0],
            layers: [{ ...validArtwork.surfaces[0].layers[0], x: 11 }],
          }],
        },
      },
    }),
    (error: unknown) => error instanceof CommerceError && error.code === "ARTWORK_LAYER_PROPERTY_LOCKED",
  );

  artworkPolicy.surfaces[0].text.enabled = false;
  artworkPolicy.surfaces[0].text.maximumElements = 0;
  artworkPolicy.surfaces[0].image.enabled = true;
  artworkPolicy.surfaces[0].image.maximumElements = 1;
  artworkPolicy.surfaces[0].image.allowedMimeTypes = ["image/png"];
  artworkPolicy.surfaces[0].image.maximumBytes = 2_000_000;
  artworkPolicy.surfaces[0].image.chargePerImagePaise = 4_500;
  const imagePriced = priceProductItem(product, {
    productId: product.id,
    variantId: "policy-priced-variant",
    quantity: 3,
    customization: {
      fields: {},
      previewVersion: 1,
      artwork: {
        ...validArtwork,
        surfaces: [{
          ...validArtwork.surfaces[0],
          layers: [{
            id: "logo",
            type: "image",
            name: "Logo",
            x: 10,
            y: 10,
            width: 20,
            height: 20,
            rotation: 0,
            opacity: 1,
            sourceWidth: 600,
            sourceHeight: 600,
            asset: {
              id: "asset-1",
              claimToken: "claim-token-for-test",
              mimeType: "image/png",
              sizeBytes: 12_000,
              width: 600,
              height: 600,
            },
          }],
        }],
      },
    },
  });
  assert.deepEqual(imagePriced.adjustments.filter((adjustment) => adjustment.type === "artwork_image"), [{
    type: "artwork_image",
    scope: "line",
    referenceId: "artwork-image:front",
    label: "Front artwork image",
    amountPaise: 4_500,
  }]);
  assert.equal(imagePriced.lineTotalPaise, imagePriced.unitPricePaise * 3 + 4_500);
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
