import assert from "node:assert/strict";
import test from "node:test";

import { designTemplates, getProductById } from "./data";
import type { AuthoritativePriceLine } from "./pricing-service";
import {
  createOrderTemplateSnapshot,
  normalizePersistentOrderCustomization,
} from "./runtime-order-snapshot";
import { normalizeTemplateProduction, safeTemplateBaseImageUrl } from "./template-production";
import type { ArtworkDocumentSnapshot, PersonalizationTemplate, Product } from "./types";
import type { OrderItemInput } from "./validation";

const previewConfig = {
  schemaVersion: 1,
  defaultSurfaceId: "front",
  background: "#fff4ce",
  foreground: "#17324d",
  accent: "#ee6f57",
  fontFamily: "Manrope",
  textAlign: "center",
  safeArea: { x: 12, y: 14, width: 76, height: 72 },
  baseImageUrl: "https://cdn.example.com/templates/front-preview.png",
  surfaces: [
    { id: "front", label: "Front", baseImageUrl: "https://cdn.example.com/templates/front-preview.png" },
    { id: "back", label: "Back", baseImageUrl: "https://cdn.example.com/templates/back-preview.png" },
  ],
};

const productionConfig = {
  schemaVersion: 1,
  renderer: "svg-v1",
  defaultSurfaceId: "front",
  fontScaling: { minPx: 24, maxPx: 72, overflow: "shrink-to-fit" },
  surfaces: [
    { id: "front", label: "Front output", widthPx: 1772, heightPx: 591, dpi: 300 },
    { id: "back", label: "Back output", widthPx: 1800, heightPx: 600, dpi: 300 },
  ],
};

function liveTemplate(): PersonalizationTemplate {
  const base = designTemplates.find((template) => template.id === "tpl-geo-pop");
  assert.ok(base);
  return {
    ...base,
    compatibleProductIds: ["runtime-snapshot-product"],
    production: normalizeTemplateProduction({
      previewConfig,
      productionConfig,
      productionWidthPx: 1772,
      productionHeightPx: 591,
      productionDpi: 300,
    }),
  };
}

function liveProduct(): Product {
  const source = getProductById("prod-everyday-name-slips");
  assert.ok(source);
  const template = liveTemplate();
  return {
    ...source,
    id: "runtime-snapshot-product",
    templateIds: [template.id],
    templateLinks: [{ template, sortOrder: 0, isDefault: true }],
  };
}

const artwork = {
  version: 1,
  activeSurfaceId: "primary",
  updatedAt: "2026-10-28T00:00:00.000Z",
  surfaces: [{
    id: "primary",
    label: "Primary print area",
    layers: [{
      id: "personalization-name",
      type: "text",
      name: "Personalized name",
      x: 120,
      y: 145,
      width: 360,
      height: 70,
      rotation: 0,
      opacity: 1,
      text: "Aarav Mehta",
      color: "#123456",
      fontSize: 40,
      fontFamily: "rounded",
    }],
  }],
} satisfies ArtworkDocumentSnapshot;

const priced: AuthoritativePriceLine = {
  productId: "runtime-snapshot-product",
  variantId: "var-everyday-72",
  productName: "Runtime product",
  productSlug: "runtime-product",
  sku: "RUNTIME-1",
  image: "/product.png",
  quantity: 1,
  baseUnitPricePaise: 34_900,
  adjustments: [],
  unitPricePaise: 34_900,
  lineTotalPaise: 34_900,
  productSnapshot: {
    name: "Runtime product",
    sku: "RUNTIME-1",
    variantName: "72 labels · Mixed sizes",
    material: "Matte vinyl",
    dimensions: "Mixed size pack",
  },
};

test("production metadata preserves raw configs and exposes normalized surface base images", () => {
  const production = normalizeTemplateProduction({
    previewConfig,
    productionConfig,
    productionWidthPx: 1772,
    productionHeightPx: 591,
    productionDpi: 300,
  });

  assert.deepEqual(production.previewConfig, previewConfig);
  assert.deepEqual(production.productionConfig, productionConfig);
  assert.equal(production.defaultSurfaceId, "front");
  assert.deepEqual(production.surfaces, [
    {
      id: "front",
      label: "Front",
      baseImageUrl: "https://cdn.example.com/templates/front-preview.png",
      widthPx: 1772,
      heightPx: 591,
      dpi: 300,
    },
    {
      id: "back",
      label: "Back",
      baseImageUrl: "https://cdn.example.com/templates/back-preview.png",
      widthPx: 1800,
      heightPx: 600,
      dpi: 300,
    },
  ]);
  assert.notEqual(production.previewConfig, previewConfig);
  assert.notEqual(production.productionConfig, productionConfig);
});

test("normalized base images reject active or unsupported URL schemes", () => {
  assert.equal(safeTemplateBaseImageUrl("data:image/svg+xml,<svg onload='alert(1)'/>"), undefined);
  assert.equal(safeTemplateBaseImageUrl("javascript:alert(1)"), undefined);
  assert.equal(safeTemplateBaseImageUrl("/relative/image.png"), undefined);
  assert.equal(
    safeTemplateBaseImageUrl("/api/product-images/asset-123"),
    "/api/product-images/asset-123",
  );
  assert.equal(
    safeTemplateBaseImageUrl("data:image/png;base64,iVBORw0KGgo="),
    "data:image/png;base64,iVBORw0KGgo=",
  );
  assert.equal(
    safeTemplateBaseImageUrl("https://cdn.example.com/surface.webp"),
    "https://cdn.example.com/surface.webp",
  );
});

test("persistent summaries ignore browser presentation fields", () => {
  const product = liveProduct();
  const input: OrderItemInput = {
    productId: product.id,
    variantId: "var-everyday-72",
    quantity: 1,
    customization: {
      templateId: "tpl-geo-pop",
      fields: { name: "Aarav Mehta", font: "rounded" },
      previewVersion: 1,
      artwork,
      presentation: {
        name: "Aarav Mehta",
        templateLabel: "Forged template",
        fontLabel: "Forged font",
        textColor: "#abcdef",
        backgroundColor: "#fedcba",
        packLabel: "Forged pack",
        materialLabel: "Forged material",
      },
      quote: {
        id: "browser-quote",
        pricingVersion: "browser-pricing",
        calculatedAt: "2026-10-28T00:00:00.000Z",
        unitPricePaise: 1,
      },
    },
  };

  const normalized = normalizePersistentOrderCustomization(product, input, priced, artwork);
  assert.ok(normalized?.presentation);
  assert.equal(normalized.presentation.name, "Aarav Mehta");
  assert.equal(normalized.presentation.templateLabel, "Geo Pop");
  assert.equal(normalized.presentation.fontLabel, "Friendly rounded");
  assert.equal(normalized.presentation.textColor, "#123456");
  assert.equal(normalized.presentation.backgroundColor, liveTemplate().preview.background);
  assert.equal(normalized.presentation.packLabel, "72 labels · Mixed sizes");
  assert.equal(normalized.presentation.materialLabel, "Matte vinyl");
  assert.equal(normalized.quote, undefined);
});

test("order template snapshots retain the complete production specification", () => {
  const product = liveProduct();
  const template = product.templateLinks?.[0].template;
  assert.ok(template?.production);
  const snapshot = createOrderTemplateSnapshot(product, {
    templateId: template.id,
    fields: {},
    previewVersion: 1,
  });
  assert.ok(snapshot);

  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.thumbnail, template.thumbnail);
  assert.equal(snapshot.artwork, template.artwork);
  assert.deepEqual(snapshot.previewConfig, template.production.previewConfig);
  assert.deepEqual(snapshot.productionConfig, template.production.productionConfig);
  assert.deepEqual(snapshot.productionOutput, { widthPx: 1772, heightPx: 591, dpi: 300 });
  assert.equal(snapshot.defaultSurfaceId, "front");
  assert.equal(snapshot.surfaces[1].baseImageUrl, "https://cdn.example.com/templates/back-preview.png");

  const mutablePreview = template.production.previewConfig as Record<string, unknown>;
  mutablePreview.background = "#000000";
  assert.equal((snapshot.previewConfig as Record<string, unknown>).background, "#fff4ce");
});
