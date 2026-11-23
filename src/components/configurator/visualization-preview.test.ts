import assert from "node:assert/strict";
import test from "node:test";

import type { ProductVisualizationTemplate } from "../../lib/types";
import { fitImageRect } from "./artwork-canvas-renderer";
import type { ArtworkDocument, PrintableSurfaceDefinition } from "./artwork-types";
import { buildVisualization3DPreview } from "./visualization-preview";

test("cover keeps a 4:3 photo's proportions on a tall 1:2 panel instead of stretching it", () => {
  // A 400×300 photo onto a 100×200 carton front.
  const sameAspect = (width: number, height: number) =>
    assert.ok(Math.abs(width / height - 400 / 300) < 1e-9, `aspect ${width / height} drifted from 4:3`);

  const cover = fitImageRect(400, 300, 100, 200, "cover");
  sameAspect(cover.width, cover.height);
  assert.equal(cover.height, 200, "fills the panel height");
  assert.ok(cover.width > 100, "overflows sideways, to be clipped");
  assert.equal(cover.x, (100 - cover.width) / 2, "stays centred");

  const contain = fitImageRect(400, 300, 100, 200, "contain");
  sameAspect(contain.width, contain.height);
  assert.equal(contain.width, 100, "fits inside without cropping");
  assert.ok(contain.height < 200);

  const stretch = fitImageRect(400, 300, 100, 200, "stretch");
  assert.deepEqual(stretch, { x: 0, y: 0, width: 100, height: 200 });
});

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
  assert.equal(result.document.surfaces[0].layers[0]?.imageFit, "cover", "panels are filled, never squashed");
  assert.equal(result.document.surfaces[0].layers[0]?.aspectLocked, true);
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

test("an editor canvas is reshaped to the 3D face it is painted on, so the print is not squashed", () => {
  const definitions: PrintableSurfaceDefinition[] = [{ id: "primary", label: "Primary", width: 600, height: 360, safeInset: 24 }];
  const document: ArtworkDocument = {
    version: 1,
    activeSurfaceId: "primary",
    surfaces: [{
      id: "primary",
      label: "Primary",
      layers: [{ id: "name", type: "text", name: "Name", x: 60, y: 36, width: 120, height: 72, rotation: 0, opacity: 1, text: "Aarav" }],
    }],
  } as ArtworkDocument;
  const visualization = {
    id: "vis-soap",
    version: 1,
    name: "Soap Box 3D",
    productType: "folding-carton",
    geometryKind: "box",
    dimensionsMm: { width: 150, height: 100, depth: 50 },
    surfaces: [{ surfaceId: "front", label: "Front", role: "front", textureUrl: "/front" }],
    manufacturingValidated: false,
  } as ProductVisualizationTemplate;

  // The model renders the shelf's 90 × 60 mm soap box, not the template placeholder.
  const result = buildVisualization3DPreview(document, definitions, visualization, { width: 90, height: 60, depth: 30 });
  const front = result.surfaces[0];
  assert.equal(front.width, 600);
  assert.equal(front.height, 400, "600 × 400 matches the 90 × 60 face");
  assert.equal(front.physicalWidthMm, 90);
  assert.equal(front.physicalHeightMm, 60);
  const name = result.document.surfaces[0].layers.find((layer) => layer.id === "name");
  assert.deepEqual(
    { x: name?.x, y: name?.y, width: name?.width, height: name?.height },
    { x: 60, y: 40, width: 120, height: 80 },
    "customer layers keep their place on the reshaped canvas",
  );
});
