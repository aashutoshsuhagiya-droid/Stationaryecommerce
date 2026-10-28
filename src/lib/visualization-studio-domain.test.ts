import assert from "node:assert/strict";
import test from "node:test";
import {
  buildManualVisualizationAnalysis,
  canRetryVisualizationJob,
  dimensionsInMillimetres,
  nextVisualizationTemplateVersion,
  normalizeExternalVisualizationAnalysis,
  visualizationConfirmationSchema,
  visualizationAnalyzerResponseSchema,
  visualizationDimensionsSchema,
  visualizationSourceBoundsSchema,
  visualizationSurfaceMappingsSchema,
} from "./visualization-studio-domain";
import {
  activateVisualizationProductMetadata,
  deactivateVisualizationProductMetadata,
  resolveVisualizationProductModel,
} from "./visualization-studio-service-policy";

test("manual analysis asks for confirmation without inventing confidence", () => {
  const analysis = buildManualVisualizationAnalysis({
    source: { width: 1200, height: 800, mimeType: "image/png" },
  });
  assert.equal(analysis.classification.confidence, null);
  assert.equal(analysis.productType.confidence, null);
  assert.equal(analysis.orientation.confidence, null);
  assert.equal(analysis.meshGenerated, false);
  assert.equal(analysis.requiresConfirmation, true);
  assert.deepEqual(analysis.generatedAssets, []);
  assert.ok(analysis.requiredInputs.includes("dimensions"));
});

test("physical dimensions are canonicalized to millimetres", () => {
  assert.equal(visualizationDimensionsSchema.safeParse({ unit: "mm", diameter: 75, height: 240 }).success, true);
  assert.equal(visualizationDimensionsSchema.safeParse({ unit: "mm" }).success, false);
  assert.deepEqual(dimensionsInMillimetres({ unit: "in", width: 2, height: 1.5, labelWidth: 1 }), {
    unit: "mm",
    width: 50.8,
    height: 38.1,
    labelWidth: 25.4,
  });
});

test("confirmed geometry requires its shape-specific dimensions", () => {
  const base = {
    productType: "bottle",
    geometry: { kind: "cylinder" as const },
    surfaceMappings: [{ surfaceId: "label", label: "Label", role: "wrap" as const }],
  };
  assert.equal(visualizationConfirmationSchema.safeParse({
    ...base,
    dimensions: { unit: "mm", diameter: 75, height: 240, labelWidth: 180, labelHeight: 90 },
  }).success, true);
  assert.equal(visualizationConfirmationSchema.safeParse({
    ...base,
    dimensions: { unit: "mm", diameter: 75, height: 240 },
  }).success, false);
});

test("surface bounds and duplicate surface IDs are rejected", () => {
  assert.equal(visualizationSourceBoundsSchema.safeParse({ x: 0.8, y: 0, width: 0.3, height: 1 }).success, false);
  const confirmation = visualizationConfirmationSchema.safeParse({
    productType: "carton",
    geometry: { kind: "box" },
    dimensions: { unit: "mm", width: 100 },
    surfaceMappings: [
      { surfaceId: "front", label: "Front", role: "front" },
      { surfaceId: "FRONT", label: "Duplicate", role: "back" },
    ],
  });
  assert.equal(confirmation.success, false);
  assert.equal(visualizationSurfaceMappingsSchema.safeParse([
    { surfaceId: "front", label: "Front", role: "front", unexpected: true },
  ]).success, false);
  assert.equal(visualizationConfirmationSchema.safeParse({
    productType: "carton",
    geometry: { kind: "box" },
    dimensions: { unit: "mm", width: 100, height: 80, depth: 40 },
    surfaceMappings: [
      { surfaceId: "front", label: "Front", role: "front" },
      { surfaceId: "back", label: "Back", role: "back" },
    ],
  }).success, false);
});

test("mesh status requires an actual model asset from the external response", () => {
  const base = {
    schemaVersion: 1 as const,
    classification: { kind: "photograph" as const, confidence: 0.8 },
    productType: { value: "carton", confidence: 0.7 },
    geometry: { kind: "box" as const, confidence: 0.6 },
    orientation: { value: "portrait" as const, confidence: 0.9 },
    dimensions: null,
    surfaces: [],
    dieline: null,
    requiredInputs: ["dimensions" as const, "surface_mapping" as const],
    warnings: [],
    nextAction: "Confirm dimensions.",
  };
  const previewOnly = normalizeExternalVisualizationAnalysis({
    ...base,
    generatedAssets: [{
      kind: "preview_image",
      privateRef: "https://assets.example.test/preview.png",
      mimeType: "image/png",
      sizeBytes: 123,
    }],
  });
  const withModel = normalizeExternalVisualizationAnalysis({
    ...base,
    generatedAssets: [{
      kind: "model_glb",
      privateRef: "https://assets.example.test/model.glb",
      mimeType: "model/gltf-binary",
      sizeBytes: 456,
    }],
  });
  assert.equal(previewOnly.meshGenerated, false);
  assert.equal(withModel.meshGenerated, true);
  assert.equal(visualizationAnalyzerResponseSchema.safeParse({ ...base, generatedAssets: [], extra: true }).success, false);
});

test("retry and template versions are bounded", () => {
  assert.equal(canRetryVisualizationJob({ status: "FAILED", attempt: 2, maxAttempts: 3 }), true);
  assert.equal(canRetryVisualizationJob({ status: "FAILED", attempt: 3, maxAttempts: 3 }), false);
  assert.equal(canRetryVisualizationJob({ status: "PROCESSING", attempt: 1, maxAttempts: 3 }), false);
  assert.equal(nextVisualizationTemplateVersion(undefined), 1);
  assert.equal(nextVisualizationTemplateVersion(7), 8);
});

test("product model resolution is conservative and publish metadata is versioned", () => {
  assert.equal(resolveVisualizationProductModel({ productType: "soap-box", geometry: { kind: "box" } }), "folding-carton");
  assert.equal(resolveVisualizationProductModel({ productType: "", geometry: { kind: "pouch" } }), "stand-up-pouch");
  assert.equal(resolveVisualizationProductModel({ productType: "bottle", geometry: { kind: "cylinder" } }), "bottle-label");
  assert.equal(resolveVisualizationProductModel({ productType: "sticker-sheet", geometry: { kind: "plane" } }), "waterproof-sheet");
  assert.equal(resolveVisualizationProductModel({ productType: "product-label", geometry: { kind: "label" } }), "label-pack");
  assert.equal(resolveVisualizationProductModel({ productType: "product-label", geometry: { kind: "cylinder" } }), "bottle-label");
  assert.equal(resolveVisualizationProductModel({ productType: "bottle", geometry: { kind: "box" } }), "rectangular-box");
  assert.equal(resolveVisualizationProductModel({ productType: "unknown", geometry: { kind: "custom" } }), null);

  const activated = activateVisualizationProductMetadata({
    untouched: "kept",
    configurator: { allow2D: true, quantityMin: 5, configurationVersion: "8" },
  }, { templateId: "template-1", productModel: "folding-carton" });
  const activatedRecord = activated as Record<string, any>;
  assert.equal(activatedRecord.untouched, "kept");
  assert.equal(activatedRecord.configurator.allow2D, true);
  assert.equal(activatedRecord.configurator.quantityMin, 5);
  assert.equal(activated.configurator.allow3D, true);
  assert.equal(activated.configurator.previewTemplate, "visualization:template-1");
  assert.equal(activated.configurator.configurationVersion, "9");

  assert.equal(deactivateVisualizationProductMetadata(activated, "other-template"), activated);
  const deactivated = deactivateVisualizationProductMetadata(activated, "template-1") as Record<string, any>;
  assert.equal(deactivated.configurator.allow3D, false);
  assert.equal(deactivated.configurator.configurationVersion, "10");
});
