import assert from "node:assert/strict";
import test from "node:test";

import type { ProductVisualizationTemplate } from "../../lib/types";
import { fitImageRect, surfaceHasArtwork } from "./artwork-canvas-renderer";
import { createArtworkDocument, type ArtworkDocument, type ArtworkLayer, type PrintableSurfaceDefinition } from "./artwork-types";
import { PACKAGING_3D_PROFILES, type PackagingProduct3DKind } from "./product-3d-profile";
import { buildVisualization3DPreview } from "./visualization-preview";

const imageLayers = (document: ArtworkDocument) =>
  document.surfaces.flatMap((surface) => surface.layers.filter((layer) => layer.type === "image"));

test("a customer's image keeps its proportions on a tall 1:2 panel instead of stretching", () => {
  // A 400×300 upload onto a 100×200 carton front.
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

test("published faces carry only the customer's artwork, never the template photo", () => {
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

  // Face assignment: the customer's surface lands on the front, every mapped face exists.
  assert.deepEqual(result.surfaces.map((surface) => surface.id), ["front", "back", "left"]);
  assert.deepEqual(result.document.surfaces.map((surface) => surface.id), ["front", "back", "left"]);
  assert.deepEqual(result.document.surfaces[0].layers.map((layer) => layer.id), ["custom-name"]);
  assert.deepEqual(result.document.surfaces[1].layers, [], "the back is blank board");
  assert.deepEqual(result.document.surfaces[2].layers, [], "the side is blank board");
  assert.deepEqual(imageLayers(result.document), [], "no face shows the photo");
  for (const surface of result.document.surfaces) {
    assert.ok(!surface.layers.some((layer) => layer.src && ["/front", "/back", "/left"].includes(layer.src)), `${surface.id} shows no texture`);
  }
  assert.equal(result.document.activeSurfaceId, "front");

  // Each canvas still takes its face's proportions.
  assert.equal(result.surfaces[0].width, 600);
  assert.equal(result.surfaces[0].height, 300, "600 × 300 matches the 200 × 100 front");
  assert.equal(result.surfaces[1].width, 600);
  assert.equal(result.surfaces[1].height, 300);
  assert.equal(result.surfaces[2].width, 300);
  assert.equal(result.surfaces[2].height, 600);

  // The editor's document is never mutated.
  assert.equal(document.activeSurfaceId, "primary");
  assert.equal(document.surfaces[0].id, "primary");
  assert.equal(definitions[0].id, "primary");
});

test("a mapped face shapes the model even without a photo of its own", () => {
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
  assert.deepEqual(result.surfaces.map((surface) => surface.id), ["front"]);
  assert.equal(result.surfaces[0].physicalWidthMm, 100);
  assert.equal(result.surfaces[0].physicalHeightMm, 60);
  assert.deepEqual(result.document.surfaces[0].layers, []);

  const noFaces = buildVisualization3DPreview(document, definitions, { ...visualization, surfaces: [] });
  assert.equal(noFaces.document, document, "a template without faces leaves the artwork as it is");
  assert.equal(noFaces.surfaces, definitions);
  assert.equal(buildVisualization3DPreview(document, definitions, undefined).document, document);
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
  assert.deepEqual(imageLayers(result.document), [], "the label is blank until the customer prints on it");
});

test("an editor canvas is reshaped to the 3D face it is painted on, so the print is not squashed", () => {
  const definitions: PrintableSurfaceDefinition[] = [{ id: "primary", label: "Primary", width: 600, height: 360, safeInset: 24 }];
  const document: ArtworkDocument = {
    version: 1,
    activeSurfaceId: "primary",
    surfaces: [{
      id: "primary",
      label: "Primary",
      layers: [{ id: "name", type: "text", name: "Name", x: 60, y: 36, width: 120, height: 72, rotation: 0, opacity: 1, text: "Aarav", fontSize: 32 }],
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
  assert.deepEqual(result.document.surfaces[0].layers.map((layer) => layer.id), ["name"], "the name is the only thing on the front");
  const name = result.document.surfaces[0].layers[0];
  assert.deepEqual(
    { x: name?.x, y: name?.y, width: name?.width, height: name?.height },
    { x: 60, y: 40, width: 120, height: 80 },
    "customer layers keep their place on the reshaped canvas",
  );
  assert.equal(name?.fontSize, 32, "glyphs are never stretched");
});

test("every packaging model: an empty design leaves every face blank; one name is all the front shows", () => {
  const geometryFor: Record<PackagingProduct3DKind, ProductVisualizationTemplate["geometryKind"]> = {
    "rectangular-box": "box",
    "square-box": "box",
    "folding-carton": "box",
    "mailer-box": "box",
    "rigid-lid-box": "box",
    "product-sleeve": "box",
    "paper-bag": "bag",
    "stand-up-pouch": "pouch",
    "mailer-envelope": "custom",
    "pyramid-box": "box",
  };
  const definitions: PrintableSurfaceDefinition[] = [
    { id: "print-area", label: "Print area", width: 600, height: 360, safeInset: 24 },
  ];
  const name: ArtworkLayer = {
    id: "customer-name", type: "text", name: "Name", x: 120, y: 140, width: 360, height: 80,
    rotation: 0, opacity: 1, text: "Aarav", fontSize: 48, color: "#111418",
  };

  for (const kind of Object.keys(PACKAGING_3D_PROFILES) as PackagingProduct3DKind[]) {
    const visualization: ProductVisualizationTemplate = {
      id: `vis-${kind}`,
      version: 1,
      name: kind,
      productType: kind,
      geometryKind: geometryFor[kind],
      dimensionsMm: { width: 120, height: 180, depth: 60 },
      sourceAsset: { id: `asset-${kind}`, width: 1_600, height: 1_200, mimeType: "image/jpeg" },
      manufacturingValidated: false,
      surfaces: [
        { surfaceId: "front", label: "Front", role: "front", textureUrl: `/photo/${kind}?surfaceId=front` },
        { surfaceId: "back", label: "Back", role: "back", sourceBounds: { x: 0.5, y: 0, width: 0.5, height: 1 }, textureUrl: `/photo/${kind}?surfaceId=back` },
        { surfaceId: "side", label: "Side", role: "gusset", sourceBounds: { x: 0, y: 0, width: 0.2, height: 1 }, textureUrl: `/photo/${kind}?surfaceId=side` },
      ],
    };

    const empty = buildVisualization3DPreview(createArtworkDocument(definitions), definitions, visualization, visualization.dimensionsMm);
    assert.deepEqual(imageLayers(empty.document), [], `${kind}: no image layer on any face`);
    for (const surface of empty.document.surfaces) {
      assert.deepEqual(surface.layers, [], `${kind}: ${surface.id} is blank`);
      assert.equal(surfaceHasArtwork(empty.document, surface.id), false, `${kind}: ${surface.id} renders as plain board`);
    }

    const designed = createArtworkDocument(definitions);
    designed.surfaces[0].layers = [name];
    const withName = buildVisualization3DPreview(designed, definitions, visualization, visualization.dimensionsMm);
    const [front, ...others] = withName.document.surfaces;
    assert.equal(front.id, "front", `${kind}: the first print area is the front`);
    assert.deepEqual(front.layers.map((layer) => layer.id), ["customer-name"], `${kind}: the name is the only thing on the front`);
    assert.equal(front.layers[0].text, "Aarav");
    assert.equal(front.layers[0].fontSize, 48, `${kind}: the name is never resized`);
    assert.equal(surfaceHasArtwork(withName.document, "front"), true);
    for (const surface of others) {
      assert.deepEqual(surface.layers, [], `${kind}: ${surface.id} stays blank`);
      assert.equal(surfaceHasArtwork(withName.document, surface.id), false);
    }
    assert.deepEqual(imageLayers(withName.document), [], `${kind}: still no photo`);
  }
});

test("only visible text or an image counts as artwork on a face", () => {
  const document = createArtworkDocument([
    { id: "front", label: "Front", width: 600, height: 360, safeInset: 24 },
    { id: "back", label: "Back", width: 600, height: 360, safeInset: 24 },
  ]);
  const base = { name: "Layer", x: 0, y: 0, width: 100, height: 40, rotation: 0, opacity: 1 };
  document.surfaces[0].layers = [
    { ...base, id: "blank", type: "text", text: "   " },
    { ...base, id: "hidden", type: "text", text: "Hidden", opacity: 0 },
    { ...base, id: "unloaded", type: "image" },
  ];
  assert.equal(surfaceHasArtwork(document, "front"), false);
  document.surfaces[1].layers = [{ ...base, id: "logo", type: "image", src: "data:image/png;base64,AAAA" }];
  assert.equal(surfaceHasArtwork(document, "back"), true);
});
