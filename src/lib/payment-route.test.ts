import assert from "node:assert/strict";
import test from "node:test";

import { POST } from "../app/api/payments/verify/route";
import { bindProviderOrder, createDemoOrder, getDemoOrder } from "./order-service";
import { sha256Hmac } from "./payment";
import { createOrderSchema } from "./validation";

const orderInput = createOrderSchema.parse({
  items: [{
    productId: "prod-everyday-name-slips",
    variantId: "var-everyday-72",
    quantity: 1,
    customization: {
      templateId: "tpl-geo-pop",
      fields: { name: "Payment QA", font: "rounded" },
      previewVersion: 1,
    },
  }],
  shippingAddress: {
    fullName: "Payment Tester",
    mobile: "9876543210",
    email: "payment@example.com",
    addressLine1: "24 Example Road",
    city: "Pune",
    state: "Maharashtra",
    postalCode: "411001",
    country: "IN",
  },
  shippingMethod: "standard",
  acceptedTerms: true,
});

test("Razorpay verification is bound to the matching local order", async () => {
  const previousSecret = process.env.RAZORPAY_KEY_SECRET;
  process.env.RAZORPAY_KEY_SECRET = "qa-razorpay-secret";
  try {
    const { order } = createDemoOrder(orderInput, `payment-${crypto.randomUUID()}`);
    const boundProviderOrder = "order_bound_qa";
    const otherProviderOrder = "order_other_qa";
    const paymentId = "pay_qa_123";
    bindProviderOrder(order.orderNumber, boundProviderOrder);

    const verify = (razorpayOrderId: string) => POST(new Request("http://localhost/api/payments/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderNumber: order.orderNumber,
        razorpayOrderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: sha256Hmac(`${razorpayOrderId}|${paymentId}`, process.env.RAZORPAY_KEY_SECRET!),
      }),
    }));

    const mismatch = await verify(otherProviderOrder);
    assert.equal(mismatch.status, 409);
    assert.equal((await mismatch.json() as { error: { code: string } }).error.code, "PAYMENT_ORDER_MISMATCH");

    const matched = await verify(boundProviderOrder);
    assert.equal(matched.status, 200);
    const payload = await matched.json() as {
      data: { signatureVerified: boolean; paymentStatus: string };
    };
    assert.equal(payload.data.signatureVerified, true);
    assert.equal(payload.data.paymentStatus, "pending_webhook_reconciliation");
    assert.equal(getDemoOrder(order.orderNumber)?.paymentStatus, "pending");
  } finally {
    if (typeof previousSecret === "string") process.env.RAZORPAY_KEY_SECRET = previousSecret;
    else delete process.env.RAZORPAY_KEY_SECRET;
  }
});
