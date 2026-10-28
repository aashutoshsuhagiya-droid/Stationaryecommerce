import { apiError } from "@/lib/http";
import {
  getProductImageAssetForServing,
  isProductImageAssetId,
  ProductImageAssetError,
} from "@/lib/product-image-assets";
import { consumeRateLimit, requestIdentifier } from "@/lib/rate-limit";

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
      namespace: "public-product-image",
      identifier: requestIdentifier(request),
      limit: 120,
      windowMs: 60_000,
    });
    if (!rateLimit.allowed) {
      const response = apiError(429, "RATE_LIMITED", "Too many product image requests. Please wait and try again.");
      response.headers.set("Cache-Control", "private, no-store");
      response.headers.set("Retry-After", String(rateLimit.retryAfterSeconds));
      return response;
    }

    const { id } = await context.params;
    if (!isProductImageAssetId(id)) {
      return apiError(404, "PRODUCT_IMAGE_NOT_FOUND", "Product image not found.");
    }
    const result = await getProductImageAssetForServing({
      id,
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
    if (error instanceof ProductImageAssetError) {
      return apiError(error.status, error.code, error.message);
    }
    console.error("Unexpected product image serving error", error);
    return apiError(500, "PRODUCT_IMAGE_UNAVAILABLE", "The product image is unavailable.");
  }
}
