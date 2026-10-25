import { NextResponse } from "next/server";

import { bulkRequestSchema } from "@/lib/bulk-request-validation";
import { storeBulkRequest } from "@/lib/bulk-request-store";
import { products } from "@/lib/data";
import { apiError, hasJsonContentType, readLimitedJson, RequestTooLargeError, validationError } from "@/lib/http";
import { productSupportsMultipleNames } from "@/lib/product-configuration";
import { consumeRateLimit, requestIdentifier } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const maximumBulkRequestJsonBytes = 512_000;

function createReference() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = crypto.randomUUID().slice(0, 8).toUpperCase();
  return `BLK-${date}-${suffix}`;
}

export async function POST(request: Request) {
  try {
    const rateLimit = consumeRateLimit({
      namespace: "bulk-requests",
      identifier: requestIdentifier(request),
      limit: 5,
      windowMs: 10 * 60_000,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: { code: "RATE_LIMITED", message: "Too many quote requests. Please wait before submitting another." } },
        { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(rateLimit.retryAfterSeconds) } },
      );
    }
    if (!hasJsonContentType(request)) {
      return apiError(415, "UNSUPPORTED_MEDIA_TYPE", "Submit the quote request as JSON.");
    }

    const parsed = bulkRequestSchema.safeParse(
      await readLimitedJson(request, maximumBulkRequestJsonBytes),
    );
    if (!parsed.success) return validationError(parsed.error);

    const product = products.find(
      (candidate) => candidate.id === parsed.data.productId && candidate.stockStatus !== "out_of_stock",
    );
    if (!product) {
      return apiError(400, "PRODUCT_UNAVAILABLE", "Select an available product from the current catalog.");
    }
    if (parsed.data.personalizationRows.length > 0 && !productSupportsMultipleNames(product)) {
      return apiError(
        422,
        "MULTI_NAME_NOT_SUPPORTED",
        "The selected product does not support a multi-name personalization list.",
      );
    }

    const reference = createReference();
    const createdAt = new Date().toISOString();
    storeBulkRequest(parsed.data, {
      id: crypto.randomUUID(),
      reference,
      productName: product.name,
      productSku: product.sku,
      status: "received",
      createdAt,
    });

    return NextResponse.json(
      {
        data: { reference, status: "received", receivedAt: createdAt },
        meta: {
          persistence: "process-memory-demo",
          notice: "This demo record is temporary. Connect durable storage and an operational notification workflow before launch.",
        },
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof RequestTooLargeError) {
      return apiError(413, "REQUEST_TOO_LARGE", "The quote request is too large.");
    }
    if (error instanceof SyntaxError) {
      return apiError(400, "INVALID_JSON", error.message);
    }
    console.error("Unexpected bulk request error", error);
    return apiError(500, "BULK_REQUEST_FAILED", "The quote request could not be saved. Please try again.");
  }
}
