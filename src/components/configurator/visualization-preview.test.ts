import assert from "node:assert/strict";
import test from "node:test";

import type { ProductVisualizationTemplate } from "../../lib/types";
import type { ArtworkDocument, PrintableSurfaceDefinition } from "./artwork-types";
import { buildVisualization3DPreview } from "./visualization-preview";

test("published visualization panels form a preview-only union with existing artwork", () => {
  const definitions: PrintableSurfaceDefinition[] = [{
    id: "primary",
    label: "Primary",
    width: 600,
    height: 400,
    safeInset: 24,
  }];
  const document: ArtworkDocument = {
    version: 1,
    activeSurfaceId: "primary",
    updatedAt: "2026-10-28T00:00:00.000Z",
    surfaces: [{
      id: "primary",
      label: "Primary",
      layers: [{
        id: "custom-name",
        type: "text",
        name: "Name",
        x: 20,
        y: 20,
        width: 100,
        height: 40,
        rotation: 0,
        opacity: 1,
        text: "Asha",
      }],
    }],
  };
  const visualization: ProductVisualizationTemplate = {
    id: "visual-1",
    version: 2,
    name: "Carton",
    productType: "rectangular-box",
    geometryKind: "box",
    dimensionsMm: { width: 200, height: 100, depth: 50 },
    sourceAsset: { id: "asset-1", width: 1_200, height: 800, mimeType: "image/png" },
    manufacturingValidated: false,
    surfaces: [
      { surfaceId: "panel-front", label: "Front", role: "front", textureUrl: "/front" },
      {
        surfaceId: "panel-back",
        label: "Back",
        role: "back",
        sourceBounds: { x: 0.5, y: 0, width: 0.5, height: 0.25 },
        textureUrl: "/back",
      },
      {
        surfaceId: "panel-left",
        label: "Left",
        role: "left",
        sourceBounds: { x: 0, y: 0.25, width: 0.25, height: 0.5 },
        textureUrl: "/left",
      },
    ],
  };

  const result = buildVisualization3DPreview(document, definitions, visualization);

  assert.deepEqual(result.surfaces.map((surface) => surface.id), ["front", "back", "left"]);
  assert.deepEqual(result.document.surfaces.map((surface) => surface.id), ["front", "back", "left"]);
  assert.deepEqual(result.document.surfaces[0].layers.map((layer) => layer.id), [
    "visualization-base-visual-1-panel-front",
    "custom-name",
  ]);
  assert.equal(result.document.surfaces[1].layers[0]?.src, "/back");
  assert.equal(result.document.surfaces[2].layers[0]?.src, "/left");
  assert.equal(result.document.surfaces[0].layers[0]?.imageFit, "stretch");
  assert.equal(result.document.activeSurfaceId, "front");
  assert.equal(result.surfaces[1].width, 600);
  assert.equal(result.surfaces[1].height, 300);
  assert.equal(result.surfaces[2].width, 300);
  assert.equal(result.surfaces[2].height, 600);
  assert.equal(document.activeSurfaceId, "primary");
  assert.equal(document.surfaces[0].id, "primary");
  assert.equal(definitions[0].id, "primary");
});

test("returns existing preview references when no public texture is available", () => {
  const document: ArtworkDocument = {
    version: 1,
    activeSurfaceId: "primary",
    updatedAt: "2026-10-28T00:00:00.000Z",
    surfaces: [{ id: "primary", label: "Primary", layers: [] }],
  };
  const definitions: PrintableSurfaceDefinition[] = [{
    id: "primary", label: "Primary", width: 600, height: 360, safeInset: 24,
  }];
  const visualization: ProductVisualizationTemplate = {
    id: "visual-1",
    version: 1,
    name: "Draft",
    productType: "rectangular-box",
    geometryKind: "box",
    dimensionsMm: { width: 100, height: 60, depth: 40 },
    manufacturingValidated: false,
    surfaces: [{ surfaceId: "front", label: "Front", role: "front" }],
  };

  const result = buildVisualization3DPreview(document, definitions, visualization);
  assert.equal(result.document, document);
  assert.equal(result.surfaces, definitions);
});

test("cylindrical wrap previews use the confirmed label dimensions", () => {
  const document: ArtworkDocument = {
    version: 1,
    activeSurfaceId: "primary",
    updatedAt: "2026-10-28T00:00:00.000Z",
    surfaces: [],
  };
  const visualization: ProductVisualizationTemplate = {
    id: "bottle-visual",
    version: 1,
    name: "Bottle label",
    productType: "bottle",
    geometryKind: "cylinder",
    dimensionsMm: { diameter: 75, height: 240, labelWidth: 180, labelHeight: 90 },
    sourceAsset: { id: "asset-2", width: 1_800, height: 900, mimeType: "image/png" },
    manufacturingValidated: false,
    surfaces: [{ surfaceId: "label", label: "Label", role: "wrap", textureUrl: "/label" }],
  };

  const result = buildVisualization3DPreview(document, [], visualization);
  assert.equal(result.surfaces[0].physicalWidthMm, 180);
  assert.equal(result.surfaces[0].physicalHeightMm, 90);
  assert.equal(result.surfaces[0].width, 600);
  assert.equal(result.surfaces[0].height, 300);
});
