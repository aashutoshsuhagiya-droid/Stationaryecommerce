import { NextResponse } from "next/server";

import { apiError, validationError } from "@/lib/http";
import { getDemoOrder, toOrderTrackingSummary } from "@/lib/order-service";
import { consumeRateLimit, requestIdentifier } from "@/lib/rate-limit";
import { orderLookupSchema } from "@/lib/validation";

type OrderRouteContext = {
  params: Promise<{ orderNumber: string }>;
};

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: OrderRouteContext) {
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
  const { orderNumber } = await context.params;
  const url = new URL(request.url);
  const parsed = orderLookupSchema.safeParse({
    orderNumber,
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
