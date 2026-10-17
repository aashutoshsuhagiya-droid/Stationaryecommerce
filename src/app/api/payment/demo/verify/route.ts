import { NextResponse } from "next/server";

import { apiError, readJson, validationError } from "@/lib/http";
import { CommerceError, getDemoOrder, markDemoOrderPaid } from "@/lib/order-service";
import { verifyDemoPaymentSignature } from "@/lib/payment";
import { demoPaymentVerificationSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    const parsed = demoPaymentVerificationSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);

    const order = getDemoOrder(parsed.data.orderNumber);
    if (!order) return apiError(404, "ORDER_NOT_FOUND", "Order not found.");

    const result = verifyDemoPaymentSignature(parsed.data);
    if (!result.configured) {
      return apiError(
        503,
        "DEMO_PAYMENT_NOT_CONFIGURED",
        "Set DEMO_PAYMENT_SECRET to enable this demonstration endpoint in production.",
      );
    }
    if (!result.verified) {
      return apiError(401, "PAYMENT_SIGNATURE_INVALID", "Payment verification failed.");
    }

    const updatedOrder = markDemoOrderPaid(parsed.data.orderNumber);
    return NextResponse.json(
      {
        data: {
          orderNumber: updatedOrder.orderNumber,
          paymentStatus: updatedOrder.paymentStatus,
          verified: true,
        },
        meta: {
          mode: "demo",
          developmentFallbackSecret: result.usingDevelopmentFallback,
          notice:
            "Demo verification is not a payment gateway. Live status must be reconciled through a signed provider webhook.",
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof SyntaxError) return apiError(400, "INVALID_JSON", error.message);
    if (error instanceof CommerceError) {
      return apiError(error.status, error.code, error.message, error.details);
    }
    console.error("Unexpected demo payment verification error", error);
    return apiError(500, "PAYMENT_VERIFICATION_FAILED", "Payment verification failed safely.");
  }
}
