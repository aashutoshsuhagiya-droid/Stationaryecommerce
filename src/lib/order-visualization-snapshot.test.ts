import assert from "node:assert/strict";
import test from "node:test";

import { getProductById } from "./data";
import { createOrderVisualizationSnapshot } from "./order-visualization-snapshot";
import { buildProductConfiguration } from "./product-configuration";

test("order visualization snapshots use trusted catalog geometry and versions", () => {
  const source = getProductById("prod-everyday-name-slips");
  assert.ok(source);
  const product = {
    ...source,
    dimensions: "20 x 10 x 5 cm",
    sizes: ["20 x 10 x 5 cm"],
    configurator: {
      ...source.configurator,
      allow2D: true,
      allow3D: true,
      quantityMin: source.configurator?.quantityMin ?? 1,
      quantityMax: source.configurator?.quantityMax ?? 100,
      printAreas: source.configurator?.printAreas ?? [{ id: "front", label: "Front" }],
      productModel: "rectangular-box",
      configurationVersion: "visual-v3",
      visualizationTemplate: {
        id: "visual-template-1",
        version: 3,
        name: "Versioned carton",
        productType: "rectangular-box",
        geometryKind: "box" as const,
        dimensionsMm: { width: 200, height: 100, depth: 50 },
        sourceAsset: {
          id: "visual-source-1",
          width: 1_200,
          height: 800,
          mimeType: "image/png" as const,
        },
        surfaces: [{ surfaceId: "front", label: "Front", role: "front" as const }],
        manufacturingValidated: false,
      },
    },
  };
  const configuration = buildProductConfiguration(product);
  const preset = configuration.dimensions.presets[0];
  const snapshot = createOrderVisualizationSnapshot(product, configuration, preset, "Kraft board");

  assert.ok(snapshot);
  assert.equal(snapshot.model, "rectangular-box");
  assert.equal(snapshot.configurationVersion, "visual-v3");
  assert.deepEqual(snapshot.dimensionsMm, { width: 200, height: 100, depth: 50 });
  assert.equal(snapshot.material, "Kraft board");
  assert.equal(snapshot.templateId, "visual-template-1");
  assert.equal(snapshot.templateVersion, 3);
  assert.equal(snapshot.sourceAssetId, "visual-source-1");
  assert.deepEqual(snapshot.surfaceIds, configuration.artwork.surfaces.map((surface) => surface.id));
});

test("orders omit a visualization snapshot when 3D is not catalog-enabled", () => {
  const product = getProductById("prod-everyday-name-slips");
  assert.ok(product);
  const configuration = buildProductConfiguration(product);
  assert.equal(
    createOrderVisualizationSnapshot(
      product,
      configuration,
      configuration.dimensions.presets[0],
      product.material,
    ),
    undefined,
  );
});
