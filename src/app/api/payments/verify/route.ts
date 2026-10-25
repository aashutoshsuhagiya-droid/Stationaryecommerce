import { NextResponse } from "next/server";

import {
  apiError,
  hasJsonContentType,
  readLimitedJson,
  RequestTooLargeError,
  validationError,
} from "@/lib/http";
import { getDemoOrder, providerOrderMatches } from "@/lib/order-service";
import { verifyRazorpaySignature } from "@/lib/payment";
import { consumeRateLimit, requestIdentifier } from "@/lib/rate-limit";
import { razorpayVerificationSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maximumPaymentVerificationJsonBytes = 8_192;

export async function POST(request: Request) {
  try {
    const rateLimit = consumeRateLimit({
      namespace: "payment-verification",
      identifier: requestIdentifier(request),
      limit: 10,
      windowMs: 60_000,
    });
    if (!rateLimit.allowed) {
      const response = apiError(429, "RATE_LIMITED", "Too many payment verification attempts. Please wait and try again.");
      response.headers.set("Retry-After", String(rateLimit.retryAfterSeconds));
      response.headers.set("Cache-Control", "no-store");
      return response;
    }
    if (!hasJsonContentType(request)) {
      return apiError(415, "UNSUPPORTED_MEDIA_TYPE", "Submit payment verification as JSON.");
    }
    const body = await readLimitedJson(request, maximumPaymentVerificationJsonBytes);
    const parsed = razorpayVerificationSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);

    const result = verifyRazorpaySignature(parsed.data);
    if (!result.configured) {
      return apiError(
        503,
        "PAYMENT_PROVIDER_NOT_CONFIGURED",
        "Razorpay verification is unavailable until server credentials are configured.",
      );
    }
    if (!result.verified) {
      return apiError(401, "PAYMENT_SIGNATURE_INVALID", "Payment verification failed.");
    }
    const order = getDemoOrder(parsed.data.orderNumber);
    if (!order) return apiError(404, "ORDER_NOT_FOUND", "Order not found.");
    if (!providerOrderMatches(order.orderNumber, parsed.data.razorpayOrderId)) {
      return apiError(
        409,
        "PAYMENT_ORDER_MISMATCH",
        "The verified provider order is not bound to this Naamly order.",
      );
    }

    // Browser verification is evidence, not final settlement. A signed, idempotent webhook
    // must reconcile the provider order and amount before the database Order becomes PAID.
    return NextResponse.json(
      {
        data: {
          orderNumber: order.orderNumber,
          signatureVerified: true,
          paymentStatus: "pending_webhook_reconciliation",
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof RequestTooLargeError) {
      return apiError(413, "REQUEST_TOO_LARGE", "The payment verification request is too large.");
    }
    if (error instanceof SyntaxError) return apiError(400, "INVALID_JSON", error.message);
    console.error("Unexpected Razorpay verification error", error);
    return apiError(500, "PAYMENT_VERIFICATION_FAILED", "Payment verification failed safely.");
  }
}
