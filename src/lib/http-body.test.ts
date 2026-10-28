import assert from "node:assert/strict";
import test from "node:test";

import {
  maximumCouponJsonBytes,
  POST as postCouponValidation,
} from "../app/api/coupons/validate/route";
import {
  maximumBulkRequestJsonBytes,
  POST as postBulkRequest,
} from "../app/api/bulk-requests/route";
import {
  maximumOrderJsonBytes,
  POST as postOrder,
} from "../app/api/orders/route";
import {
  maximumDemoPaymentVerificationJsonBytes,
  POST as postDemoPaymentVerification,
} from "../app/api/payment/demo/verify/route";
import {
  maximumPaymentVerificationJsonBytes,
  POST as postPaymentVerification,
} from "../app/api/payments/verify/route";
import {
  maximumQuoteJsonBytes,
  POST as postQuote,
} from "../app/api/quotes/route";
import {
  hasJsonContentType,
  maximumDefaultJsonBytes,
  readJson,
  readLimitedJson,
  RequestTooLargeError,
} from "./http";
import { CommerceError } from "./commerce-error";
import { onboardingApiError } from "./onboarding-api";

type PostHandler = (request: Request) => Promise<Response>;

function streamingRequest(
  url: string,
  bodyText: string,
  contentType = "application/json",
  additionalHeaders: Record<string, string> = {},
) {
  const bytes = new TextEncoder().encode(bodyText);
  const splitAt = Math.max(1, Math.floor(bytes.byteLength / 2));
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes.slice(0, splitAt));
      controller.enqueue(bytes.slice(splitAt));
      controller.close();
    },
  });

  return new Request(url, {
    method: "POST",
    headers: {
      "Content-Type": contentType,
      "X-Forwarded-For": "http-body-test-" + crypto.randomUUID(),
      ...additionalHeaders,
    },
    body,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

test("limited JSON parsing accepts streamed UTF-8 JSON and media type parameters", async () => {
  const request = streamingRequest(
    "https://example.test/api/test",
    JSON.stringify({ message: "Namaste \u2713" }),
    "Application/JSON; charset=utf-8",
  );

  assert.equal(hasJsonContentType(request), true);
  assert.equal(request.headers.has("content-length"), false);
  assert.deepEqual(await readLimitedJson(request, 128), { message: "Namaste \u2713" });
});

test("shared JSON parsing applies a bounded default to protected mutation routes", async () => {
  const request = streamingRequest(
    "https://example.test/api/admin/catalog",
    JSON.stringify({ padding: "x".repeat(maximumDefaultJsonBytes) }),
  );

  await assert.rejects(
    () => readJson(request),
    (error: unknown) =>
      error instanceof RequestTooLargeError &&
      error.maximumBytes === maximumDefaultJsonBytes,
  );
});

test("shared API errors preserve domain status, code, message, and details", async () => {
  const response = onboardingApiError(new CommerceError(
    422,
    "PACKAGING_3D_UNAVAILABLE",
    "Validated packaging geometry is unavailable.",
    { productType: "soap-box" },
  ));
  const payload = await response.json();

  assert.equal(response.status, 422);
  assert.deepEqual(payload, {
    error: {
      code: "PACKAGING_3D_UNAVAILABLE",
      message: "Validated packaging geometry is unavailable.",
      details: { productType: "soap-box" },
    },
  });
});

const limitedRoutes: Array<{
  name: string;
  url: string;
  maximumBytes: number;
  post: PostHandler;
  headers?: Record<string, string>;
}> = [
  {
    name: "order",
    url: "https://example.test/api/orders",
    maximumBytes: maximumOrderJsonBytes,
    post: postOrder,
    headers: { "Idempotency-Key": "http-body-order-test" },
  },
  {
    name: "bulk request",
    url: "https://example.test/api/bulk-requests",
    maximumBytes: maximumBulkRequestJsonBytes,
    post: postBulkRequest,
  },
  {
    name: "quote",
    url: "https://example.test/api/quotes",
    maximumBytes: maximumQuoteJsonBytes,
    post: postQuote,
  },
  {
    name: "coupon",
    url: "https://example.test/api/coupons/validate",
    maximumBytes: maximumCouponJsonBytes,
    post: postCouponValidation,
  },
  {
    name: "payment",
    url: "https://example.test/api/payments/verify",
    maximumBytes: maximumPaymentVerificationJsonBytes,
    post: postPaymentVerification,
  },
  {
    name: "demo payment",
    url: "https://example.test/api/payment/demo/verify",
    maximumBytes: maximumDemoPaymentVerificationJsonBytes,
    post: postDemoPaymentVerification,
  },
];

for (const route of limitedRoutes) {
  test(route.name + " route rejects an oversized stream without Content-Length", async () => {
    const request = streamingRequest(
      route.url,
      JSON.stringify({ padding: "x".repeat(route.maximumBytes) }),
      "application/json",
      route.headers,
    );
    assert.equal(request.headers.has("content-length"), false);

    const response = await route.post(request);
    const payload = await response.json() as { error: { code: string } };

    assert.equal(response.status, 413);
    assert.equal(payload.error.code, "REQUEST_TOO_LARGE");
  });

  test(route.name + " route requires the application/json media type", async () => {
    const response = await route.post(
      streamingRequest(route.url, "{}", "application/jsonp", route.headers),
    );
    const payload = await response.json() as { error: { code: string } };

    assert.equal(response.status, 415);
    assert.equal(payload.error.code, "UNSUPPORTED_MEDIA_TYPE");
  });
}
