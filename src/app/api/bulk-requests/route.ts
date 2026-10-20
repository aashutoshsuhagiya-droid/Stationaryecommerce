import { NextResponse } from "next/server";

import { bulkRequestSchema, type BulkRequestInput } from "@/lib/bulk-request-validation";
import { products } from "@/lib/data";
import { apiError, validationError } from "@/lib/http";
import { productSupportsMultipleNames } from "@/lib/product-configuration";
import { consumeRateLimit, requestIdentifier } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface StoredBulkRequest extends BulkRequestInput {
  id: string;
  reference: string;
  productName: string;
  productSku: string;
  status: "received";
  createdAt: string;
}

type DemoGlobal = typeof globalThis & {
  __naamlyBulkRequests?: Map<string, StoredBulkRequest>;
};

const demoGlobal = globalThis as DemoGlobal;
const demoRequests = demoGlobal.__naamlyBulkRequests ?? new Map<string, StoredBulkRequest>();
demoGlobal.__naamlyBulkRequests = demoRequests;
const maximumJsonBytes = 512_000;

class RequestTooLargeError extends Error {}

async function readLimitedJson(request: Request): Promise<unknown> {
  if (!request.body) throw new SyntaxError("The request body must be valid JSON.");
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let totalBytes = 0;
  let text = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumJsonBytes) {
        await reader.cancel();
        throw new RequestTooLargeError();
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof RequestTooLargeError) throw error;
    throw new SyntaxError("The request body must be valid UTF-8 JSON.");
  } finally {
    reader.releaseLock();
  }
}

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
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return apiError(415, "UNSUPPORTED_MEDIA_TYPE", "Submit the quote request as JSON.");
    }

    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > maximumJsonBytes) {
      return apiError(413, "REQUEST_TOO_LARGE", "The quote request is too large.");
    }

    const parsed = bulkRequestSchema.safeParse(await readLimitedJson(request));
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
    demoRequests.set(reference, {
      ...parsed.data,
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
