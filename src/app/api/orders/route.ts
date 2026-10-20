import { NextResponse } from "next/server";

import { apiError, validationError } from "@/lib/http";
import { CommerceError, createDemoOrder, getDemoOrder } from "@/lib/order-service";
import { createOrderSchema, orderLookupSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maximumOrderJsonBytes = 3_500_000;

class RequestTooLargeError extends Error {}

async function readLimitedJson(request: Request): Promise<unknown> {
  if (!request.body) throw new SyntaxError("The request body must be valid JSON.");
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let totalBytes = 0;
  let body = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumOrderJsonBytes) {
        await reader.cancel();
        throw new RequestTooLargeError();
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    return JSON.parse(body) as unknown;
  } catch (error) {
    if (error instanceof RequestTooLargeError) throw error;
    throw new SyntaxError("The request body must be valid UTF-8 JSON.");
  } finally {
    reader.releaseLock();
  }
}

export async function POST(request: Request) {
  try {
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();
    if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 128) {
      return apiError(
        400,
        "IDEMPOTENCY_KEY_REQUIRED",
        "Provide a unique 8–128 character Idempotency-Key header.",
      );
    }

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return apiError(415, "UNSUPPORTED_MEDIA_TYPE", "Submit the order request as JSON.");
    }

    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > maximumOrderJsonBytes) {
      return apiError(
        413,
        "REQUEST_TOO_LARGE",
        "The order request is too large. Reduce embedded preview artwork and try again.",
      );
    }

    const body = await readLimitedJson(request);
    const parsed = createOrderSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);

    const result = createDemoOrder(parsed.data, idempotencyKey);
    return NextResponse.json(
      {
        data: result.order,
        meta: {
          replayed: result.replayed,
          persistence: "process-memory-demo",
          notice:
            "The server recalculated catalog prices. Configure PostgreSQL transactions before accepting live orders.",
        },
      },
      {
        status: result.replayed ? 200 : 201,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    if (error instanceof RequestTooLargeError) {
      return apiError(
        413,
        "REQUEST_TOO_LARGE",
        "The order request is too large. Reduce embedded preview artwork and try again.",
      );
    }
    if (error instanceof SyntaxError) {
      return apiError(400, "INVALID_JSON", error.message);
    }
    if (error instanceof CommerceError) {
      return apiError(error.status, error.code, error.message, error.details);
    }
    console.error("Unexpected order creation error", error);
    return apiError(500, "ORDER_CREATION_FAILED", "The order could not be created safely.");
  }
}

export function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = orderLookupSchema.safeParse({
    orderNumber: url.searchParams.get("orderNumber"),
    email: url.searchParams.get("email"),
  });
  if (!parsed.success) return validationError(parsed.error);

  const order = getDemoOrder(parsed.data.orderNumber, parsed.data.email);
  if (!order) {
    return apiError(
      404,
      "ORDER_NOT_FOUND",
      "No order matched that order number and email address.",
    );
  }
  return NextResponse.json(
    { data: order, meta: { persistence: "process-memory-demo" } },
    { headers: { "Cache-Control": "no-store" } },
  );
}
