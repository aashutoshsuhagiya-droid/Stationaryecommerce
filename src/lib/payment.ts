import { createHmac, timingSafeEqual } from "node:crypto";

const DEVELOPMENT_DEMO_SECRET = "local-demo-secret-do-not-use-in-production";
const EXAMPLE_DEMO_SECRET = "replace-for-local-payment-signature-tests";

export function sha256Hmac(value: string, secret: string) {
  return createHmac("sha256", secret).update(value, "utf8").digest("hex");
}

export function signaturesMatch(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual.toLowerCase(), "hex");
  const expectedBuffer = Buffer.from(expected.toLowerCase(), "hex");
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

export function verifyDemoPaymentSignature(input: {
  orderNumber: string;
  paymentReference: string;
  signature: string;
}) {
  const configuredSecret = process.env.DEMO_PAYMENT_SECRET;
  if (
    process.env.NODE_ENV === "production" &&
    (!configuredSecret || configuredSecret === EXAMPLE_DEMO_SECRET)
  ) {
    return { configured: false as const, verified: false as const };
  }
  const secret = configuredSecret ?? DEVELOPMENT_DEMO_SECRET;
  const expected = sha256Hmac(`${input.orderNumber}|${input.paymentReference}`, secret);
  return {
    configured: true as const,
    verified: signaturesMatch(input.signature, expected),
    usingDevelopmentFallback: !configuredSecret,
  };
}

export function verifyRazorpaySignature(input: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}) {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return { configured: false as const, verified: false as const };
  const expected = sha256Hmac(
    `${input.razorpayOrderId}|${input.razorpayPaymentId}`,
    secret,
  );
  return {
    configured: true as const,
    verified: signaturesMatch(input.razorpaySignature, expected),
  };
}
