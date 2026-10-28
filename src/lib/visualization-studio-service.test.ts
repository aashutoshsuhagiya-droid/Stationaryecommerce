import assert from "node:assert/strict";
import test from "node:test";
import {
  generatedVisualizationAssetKind,
  publicVisualizationAssetUrl,
  publicVisualizationAnalysis,
  resolveVisualizationSurfaceCrop,
  serializeVisualizationAsset,
  serializeVisualizationJob,
  visualizationRuntimeDescriptor,
} from "./visualization-studio-service-policy";

test("stored public analysis strips signed external asset references", () => {
  const analysis = publicVisualizationAnalysis({
    meshGenerated: true,
    generatedAssets: [{
      kind: "model_glb",
      privateRef: "https://assets.example.test/model.glb?signature=secret",
      mimeType: "model/gltf-binary",
      sizeBytes: 100,
    }],
  });
  assert.equal("privateRef" in analysis.generatedAssets[0], false);
  assert.equal(analysis.generatedAssets[0].kind, "model_glb");
});

test("only database-backed assets receive an authenticated download URL", () => {
  const common = { id: "asset/one", kind: "SOURCE_IMAGE", mimeType: "image/png", sizeBytes: 10 };
  assert.equal(
    serializeVisualizationAsset({ ...common, storage: "DATABASE" }).downloadUrl,
    "/api/admin/visualization-studio/assets/asset%2Fone",
  );
  assert.equal(serializeVisualizationAsset({ ...common, storage: "PRIVATE_REFERENCE" }).downloadUrl, undefined);
});

test("job serialization separates the private source from generated outputs", () => {
  const job = serializeVisualizationJob({
    id: "job-1",
    productId: "product-1",
    status: "NEEDS_CONFIRMATION",
    analysisMode: "MANUAL",
    attempt: 1,
    maxAttempts: 3,
    assets: [
      { id: "source", kind: "SOURCE_IMAGE", storage: "DATABASE", mimeType: "image/png", sizeBytes: 10 },
      { id: "preview", kind: "PREVIEW_IMAGE", storage: "PRIVATE_REFERENCE", mimeType: "image/png", sizeBytes: 20 },
    ],
  });
  assert.equal(job.asset?.id, "source");
  assert.deepEqual(job.outputs.map((asset: { id: string }) => asset.id), ["preview"]);
  assert.equal(job.analysisMode, "manual");
});

test("external asset kinds map only to supported persisted kinds", () => {
  assert.equal(generatedVisualizationAssetKind("model_gltf"), "MODEL_GLTF");
  assert.equal(generatedVisualizationAssetKind("texture"), "TEXTURE");
});

test("published surface crops use normalized bounds and restrict unbounded fallbacks", () => {
  const surfaces = [
    { surfaceId: "front", label: "Front", role: "front" },
    { surfaceId: "back", label: "Back", role: "back", sourceBounds: { x: 0.5, y: 0.25, width: 0.5, height: 0.5 } },
    { surfaceId: "side", label: "Side", role: "left" },
  ];
  assert.deepEqual(resolveVisualizationSurfaceCrop(surfaces, undefined, 1000, 800)?.crop, null);
  assert.deepEqual(resolveVisualizationSurfaceCrop(surfaces, "back", 1000, 800)?.crop, {
    left: 500, top: 200, width: 500, height: 400,
  });
  assert.equal(resolveVisualizationSurfaceCrop(surfaces, "side", 1000, 800), null);
  assert.equal(resolveVisualizationSurfaceCrop(surfaces, "missing", 1000, 800), null);
});

test("runtime visualization data includes source dimensions and mapped asset URLs", () => {
  const runtime = visualizationRuntimeDescriptor({
    templateId: "template-1",
    asset: { id: "asset-1", width: 1200, height: 800, mimeType: "image/png" },
    surfaces: [{ surfaceId: "front", label: "Front", role: "front" }],
  });
  assert.equal(runtime.sourceAsset.width, 1200);
  assert.equal(runtime.sourceAsset.url, "/api/visualization-assets/asset-1");
  assert.equal(runtime.surfaces[0].url, "/api/visualization-assets/asset-1?surfaceId=front");
  assert.equal(
    publicVisualizationAssetUrl("asset/one", "front_panel"),
    "/api/visualization-assets/asset%2Fone?surfaceId=front_panel",
  );
});
