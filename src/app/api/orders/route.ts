import { NextResponse } from "next/server";

import { apiError, hasJsonContentType, readLimitedJson, RequestTooLargeError, validationError } from "@/lib/http";
import { CommerceError, createDemoOrder, getDemoOrder, toOrderTrackingSummary } from "@/lib/order-service";
import { consumeRateLimit, requestIdentifier } from "@/lib/rate-limit";
import { createOrderSchema, orderLookupSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maximumOrderJsonBytes = 3_500_000;

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

    if (!hasJsonContentType(request)) {
      return apiError(415, "UNSUPPORTED_MEDIA_TYPE", "Submit the order request as JSON.");
    }

    const body = await readLimitedJson(request, maximumOrderJsonBytes);
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
  const rateLimit = consumeRateLimit({
    namespace: "order-lookup",
    identifier: requestIdentifier(request),
    limit: 20,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    const response = apiError(429, "RATE_LIMITED", "Too many order lookups. Please wait and try again.");
    response.headers.set("Retry-After", String(rateLimit.retryAfterSeconds));
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
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
    { data: toOrderTrackingSummary(order), meta: { persistence: "process-memory-demo" } },
    { headers: { "Cache-Control": "no-store" } },
  );
}
