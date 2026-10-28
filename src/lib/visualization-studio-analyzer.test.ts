import assert from "node:assert/strict";
import test from "node:test";
import { analyzeVisualizationSource } from "./visualization-studio-analyzer";
import { VisualizationStudioError } from "./visualization-studio-domain";

const upload = {
  originalName: "source.png",
  mimeType: "image/png" as const,
  sizeBytes: 4,
  width: 100,
  height: 200,
  hasTransparency: false,
  sha256: "a".repeat(64),
  content: new Uint8Array([1, 2, 3, 4]) as Uint8Array<ArrayBuffer>,
};

const input = {
  upload,
  source: { width: 100, height: 200, mimeType: "image/png" },
  productId: "product-1",
  requestedMode: "auto" as const,
};

function analyzerPayload(extra: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    requestId: "request-1",
    classification: { kind: "flat_artwork", confidence: 0.75 },
    productType: { value: "carton", confidence: 0.7 },
    geometry: { kind: "box", confidence: 0.65 },
    orientation: { value: "portrait", confidence: 0.99 },
    dimensions: null,
    surfaces: [],
    dieline: null,
    requiredInputs: ["dimensions", "surface_mapping"],
    warnings: [],
    nextAction: "Confirm the dimensions.",
    generatedAssets: [],
    ...extra,
  };
}

test("auto mode safely falls back to manual analysis without credentials", async () => {
  const result = await analyzeVisualizationSource(input, { environment: {} });
  assert.equal(result.mode, "MANUAL");
  assert.equal(result.analysis.classification.confidence, null);
  assert.equal(result.analysis.requiresConfirmation, true);
});

test("explicit external mode fails closed when analyzer credentials are missing", async () => {
  await assert.rejects(
    analyzeVisualizationSource({ ...input, requestedMode: "external" }, { environment: {} }),
    (error: unknown) => error instanceof VisualizationStudioError && error.code === "VISUALIZATION_ANALYZER_NOT_CONFIGURED",
  );
});

test("external analyzer calls are authenticated and strictly parsed", async () => {
  let authorization = "";
  const result = await analyzeVisualizationSource(input, {
    environment: {
      NODE_ENV: "test",
      IMAGE_TO_3D_ANALYSIS_ENDPOINT: "https://analyzer.example.test/v1/analyze",
      IMAGE_TO_3D_ANALYSIS_API_KEY: "secret-key",
    },
    fetchImplementation: (async (_url: RequestInfo | URL, init?: RequestInit) => {
      authorization = new Headers(init?.headers).get("authorization") ?? "";
      return new Response(JSON.stringify(analyzerPayload()), {
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch,
  });
  assert.equal(authorization, "Bearer secret-key");
  assert.equal(result.mode, "EXTERNAL");
  assert.equal(result.providerRequestId, "request-1");
  assert.equal(result.analysis.meshGenerated, false);
});

test("unknown analyzer response fields are rejected", async () => {
  await assert.rejects(
    analyzeVisualizationSource(input, {
      environment: {
        NODE_ENV: "test",
        IMAGE_TO_3D_ANALYSIS_ENDPOINT: "https://analyzer.example.test/v1/analyze",
        IMAGE_TO_3D_ANALYSIS_API_KEY: "secret-key",
      },
      fetchImplementation: (async () => new Response(JSON.stringify(analyzerPayload({ unexpected: true })), {
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch,
    }),
    (error: unknown) => error instanceof VisualizationStudioError && error.code === "VISUALIZATION_ANALYZER_RESPONSE_INVALID",
  );
});
