import { NextResponse } from "next/server";

import { apiError, readJson, validationError } from "@/lib/http";
import { getDemoOrder } from "@/lib/order-service";
import { verifyRazorpaySignature } from "@/lib/payment";
import { razorpayVerificationSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    const parsed = razorpayVerificationSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);

    const order = getDemoOrder(parsed.data.orderNumber);
    if (!order) return apiError(404, "ORDER_NOT_FOUND", "Order not found.");

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
    if (error instanceof SyntaxError) return apiError(400, "INVALID_JSON", error.message);
    console.error("Unexpected Razorpay verification error", error);
    return apiError(500, "PAYMENT_VERIFICATION_FAILED", "Payment verification failed safely.");
  }
}
