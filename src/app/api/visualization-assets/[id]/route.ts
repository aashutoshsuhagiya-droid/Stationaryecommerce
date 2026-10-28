import { apiError } from "@/lib/http";
import { consumeRateLimit, requestIdentifier } from "@/lib/rate-limit";
import {
  getPublishedVisualizationAsset,
  PublishedVisualizationAssetError,
} from "@/lib/visualization-studio-public-assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

const cacheHeaders = {
  "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Content-Security-Policy": "default-src 'none'; sandbox",
};

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const rateLimit = consumeRateLimit({
      namespace: "public-visualization-asset",
      identifier: requestIdentifier(request),
      limit: 120,
      windowMs: 60_000,
    });
    if (!rateLimit.allowed) {
      const response = apiError(429, "RATE_LIMITED", "Too many visualization requests. Please wait and try again.");
      response.headers.set("Cache-Control", "private, no-store");
      response.headers.set("Retry-After", String(rateLimit.retryAfterSeconds));
      return response;
    }
    const { id } = await context.params;
    const url = new URL(request.url);
    const surfaceIds = url.searchParams.getAll("surfaceId");
    if (!id || id.length > 120 || surfaceIds.length > 1) {
      return apiError(404, "VISUALIZATION_ASSET_NOT_FOUND", "Visualization asset not found.");
    }
    const surfaceId = surfaceIds[0];
    if (surfaceId !== undefined && !/^[a-z0-9][a-z0-9_-]{0,79}$/i.test(surfaceId)) {
      return apiError(404, "VISUALIZATION_ASSET_NOT_FOUND", "Visualization asset not found.");
    }
    const result = await getPublishedVisualizationAsset({
      assetId: id,
      surfaceId,
      ifNoneMatch: request.headers.get("if-none-match"),
    });
    const headers = { ...cacheHeaders, ETag: result.etag, "Last-Modified": result.lastModified };
    if (result.notModified) return new Response(null, { status: 304, headers });
    return new Response(new Uint8Array(result.content), {
      headers: {
        ...headers,
        "Content-Type": result.mimeType,
        "Content-Length": String(result.content.byteLength),
      },
    });
  } catch (error) {
    if (error instanceof PublishedVisualizationAssetError) {
      return apiError(error.status, error.code, error.message);
    }
    console.error("Unexpected published visualization asset error", error);
    return apiError(500, "VISUALIZATION_ASSET_FAILED", "The published visualization asset is unavailable.");
  }
}
