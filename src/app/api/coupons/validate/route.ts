import { NextResponse } from "next/server";
import { z } from "zod";

import { consumeRateLimit, requestIdentifier } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const couponRequestSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .min(3, "Coupon codes must contain at least 3 characters.")
      .max(40, "Coupon codes cannot exceed 40 characters.")
      .regex(/^[A-Z0-9][A-Z0-9_-]*$/, "Use only letters, numbers, hyphens, or underscores."),
  })
  .strict();

function couponError(
  status: number,
  code: string,
  message: string,
  options: { details?: unknown; retryAfter?: number; remaining?: number } = {},
) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        ...(typeof options.details === "undefined" ? {} : { details: options.details }),
      },
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        ...(typeof options.retryAfter === "number"
          ? { "Retry-After": String(options.retryAfter) }
          : {}),
        ...(typeof options.remaining === "number"
          ? { "X-RateLimit-Remaining": String(options.remaining) }
          : {}),
      },
    },
  );
}

export async function POST(request: Request) {
  const rateLimit = consumeRateLimit({
    namespace: "coupon-validation",
    identifier: requestIdentifier(request),
    limit: 10,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return couponError(
      429,
      "RATE_LIMITED",
      "Too many coupon checks. Please wait and try again.",
      { retryAfter: rateLimit.retryAfterSeconds, remaining: rateLimit.remaining },
    );
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return couponError(415, "UNSUPPORTED_MEDIA_TYPE", "Submit coupon checks as JSON.", {
      remaining: rateLimit.remaining,
    });
  }

  try {
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > 2_048) {
      return couponError(413, "REQUEST_TOO_LARGE", "The coupon request is too large.", {
        remaining: rateLimit.remaining,
      });
    }

    const parsed = couponRequestSchema.safeParse(JSON.parse(rawBody) as unknown);
    if (!parsed.success) {
      return couponError(
        400,
        "VALIDATION_ERROR",
        "Enter a valid coupon code.",
        {
          details: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
            code: issue.code,
          })),
          remaining: rateLimit.remaining,
        },
      );
    }

    return couponError(
      422,
      "COUPON_NOT_CONFIGURED",
      "This demo catalog has no active coupon codes.",
      { remaining: rateLimit.remaining },
    );
  } catch (error) {
    if (error instanceof SyntaxError) {
      return couponError(400, "INVALID_JSON", "The request body must be valid JSON.", {
        remaining: rateLimit.remaining,
      });
    }
    console.error("Unexpected coupon validation error", error);
    return couponError(500, "COUPON_VALIDATION_FAILED", "The coupon could not be checked.", {
      remaining: rateLimit.remaining,
    });
  }
}
