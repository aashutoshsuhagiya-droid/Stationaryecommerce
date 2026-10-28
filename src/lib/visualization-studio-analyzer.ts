import {
  buildManualVisualizationAnalysis,
  normalizeExternalVisualizationAnalysis,
  visualizationAnalyzerResponseSchema,
  VisualizationStudioError,
  type ManualAnalysisInput,
  type VisualizationAnalysisModeInput,
} from "@/lib/visualization-studio-domain";
import type { PreparedArtworkUpload } from "@/lib/artwork-upload";

const RESPONSE_LIMIT_BYTES = 256 * 1024;
const DEFAULT_TIMEOUT_MS = 10_000;

export interface VisualizationAnalyzerEnvironment {
  IMAGE_TO_3D_ANALYSIS_ENDPOINT?: string;
  IMAGE_TO_3D_ANALYSIS_API_KEY?: string;
  NODE_ENV?: string;
}

interface AnalyzerConfiguration {
  configured: boolean;
  mode: "external" | "manual";
  endpoint?: string;
  apiKey?: string;
  issue?: string;
}

export function getVisualizationAnalyzerConfiguration(
  environment: VisualizationAnalyzerEnvironment = process.env,
): AnalyzerConfiguration {
  const endpointValue = environment.IMAGE_TO_3D_ANALYSIS_ENDPOINT?.trim();
  const apiKey = environment.IMAGE_TO_3D_ANALYSIS_API_KEY?.trim();
  if (!endpointValue && !apiKey) return { configured: false, mode: "manual" };
  if (!endpointValue || !apiKey) {
    return { configured: false, mode: "manual", issue: "Both analyzer endpoint and API key are required." };
  }

  try {
    const endpoint = new URL(endpointValue);
    const localhost = endpoint.hostname === "localhost" || endpoint.hostname === "127.0.0.1" || endpoint.hostname === "::1";
    const protocolAllowed = endpoint.protocol === "https:" || environment.NODE_ENV !== "production" && localhost && endpoint.protocol === "http:";
    if (!protocolAllowed || endpoint.username || endpoint.password) {
      return { configured: false, mode: "manual", issue: "The analyzer endpoint must be a credential-free HTTPS URL." };
    }
    return { configured: true, mode: "external", endpoint: endpoint.toString(), apiKey };
  } catch {
    return { configured: false, mode: "manual", issue: "The analyzer endpoint is not a valid URL." };
  }
}

export function getPublicVisualizationAnalyzerState(environment: VisualizationAnalyzerEnvironment = process.env) {
  const configuration = getVisualizationAnalyzerConfiguration(environment);
  return {
    configured: configuration.configured,
    mode: configuration.mode,
    issue: configuration.issue,
  };
}

export interface AnalyzeVisualizationInput extends ManualAnalysisInput {
  upload: PreparedArtworkUpload;
  requestedMode: VisualizationAnalysisModeInput;
  productId: string;
}

interface AnalyzeVisualizationOptions {
  environment?: VisualizationAnalyzerEnvironment;
  fetchImplementation?: typeof fetch;
  timeoutMs?: number;
}

function safeExternalError(status: number) {
  if (status === 401 || status === 403) return "The configured analyzer rejected its server credentials.";
  if (status === 429) return "The configured analyzer is temporarily rate limited.";
  return "The configured analyzer could not process the source image.";
}

export async function analyzeVisualizationSource(
  input: AnalyzeVisualizationInput,
  options: AnalyzeVisualizationOptions = {},
) {
  const configuration = getVisualizationAnalyzerConfiguration(options.environment);
  const useExternal = input.requestedMode === "external" || input.requestedMode === "auto" && configuration.configured;
  if (!useExternal || input.requestedMode === "manual") {
    return {
      mode: "MANUAL" as const,
      providerName: null,
      providerRequestId: null,
      analysis: buildManualVisualizationAnalysis(input),
      generatedAssets: [],
    };
  }
  if (!configuration.configured || !configuration.endpoint || !configuration.apiKey) {
    throw new VisualizationStudioError(
      503,
      "VISUALIZATION_ANALYZER_NOT_CONFIGURED",
      "External analysis is not configured. Retry in manual mode or configure the analyzer.",
    );
  }

  const timeoutMs = Math.min(30_000, Math.max(1_000, options.timeoutMs ?? DEFAULT_TIMEOUT_MS));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const formData = new FormData();
  formData.append("file", new Blob([input.upload.content], { type: input.upload.mimeType }), input.upload.originalName);
  formData.append("context", JSON.stringify({
    schemaVersion: 1,
    productId: input.productId,
    productType: input.productType,
    geometryKind: input.geometryKind,
    dimensions: input.dimensions,
    source: {
      mimeType: input.upload.mimeType,
      width: input.upload.width,
      height: input.upload.height,
      sha256: input.upload.sha256,
    },
  }));

  try {
    const response = await (options.fetchImplementation ?? fetch)(configuration.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${configuration.apiKey}`,
        Accept: "application/json",
      },
      body: formData,
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new VisualizationStudioError(502, "VISUALIZATION_ANALYZER_REJECTED", safeExternalError(response.status));
    }
    if (!response.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
      throw new VisualizationStudioError(502, "VISUALIZATION_ANALYZER_RESPONSE_INVALID", "The analyzer returned an invalid response type.");
    }
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > RESPONSE_LIMIT_BYTES) {
      throw new VisualizationStudioError(502, "VISUALIZATION_ANALYZER_RESPONSE_TOO_LARGE", "The analyzer response is too large.");
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > RESPONSE_LIMIT_BYTES) {
      throw new VisualizationStudioError(502, "VISUALIZATION_ANALYZER_RESPONSE_TOO_LARGE", "The analyzer response is too large.");
    }
    let payload: unknown;
    try {
      payload = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new VisualizationStudioError(502, "VISUALIZATION_ANALYZER_RESPONSE_INVALID", "The analyzer returned invalid JSON.");
    }
    const parsed = visualizationAnalyzerResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new VisualizationStudioError(502, "VISUALIZATION_ANALYZER_RESPONSE_INVALID", "The analyzer response does not match schema version 1.");
    }
    return {
      mode: "EXTERNAL" as const,
      providerName: new URL(configuration.endpoint).hostname.slice(0, 120),
      providerRequestId: parsed.data.requestId ?? null,
      analysis: normalizeExternalVisualizationAnalysis(parsed.data),
      generatedAssets: parsed.data.generatedAssets,
    };
  } catch (error) {
    if (error instanceof VisualizationStudioError) throw error;
    if (controller.signal.aborted || error instanceof DOMException && error.name === "AbortError") {
      throw new VisualizationStudioError(504, "VISUALIZATION_ANALYZER_TIMEOUT", "The analyzer timed out. Retry or use manual mode.");
    }
    throw new VisualizationStudioError(502, "VISUALIZATION_ANALYZER_UNAVAILABLE", "The analyzer is unavailable. Retry or use manual mode.");
  } finally {
    clearTimeout(timeout);
  }
}
