import { NextResponse } from "next/server";

import { CommerceError } from "@/lib/commerce-error";
import { apiError, readJson, validationError } from "@/lib/http";
import { createCatalogQuote } from "@/lib/pricing-service";
import { consumeRateLimit, requestIdentifier } from "@/lib/rate-limit";
import { catalogQuoteSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const rateLimit = consumeRateLimit({
      namespace: "catalog-quotes",
      identifier: requestIdentifier(request),
      limit: 60,
      windowMs: 60_000,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: { code: "RATE_LIMITED", message: "Too many quote requests. Please wait and try again." } },
        { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(rateLimit.retryAfterSeconds) } },
      );
    }
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return apiError(415, "UNSUPPORTED_MEDIA_TYPE", "Submit quote requests as JSON.");
    }
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > 262_144) {
      return apiError(413, "REQUEST_TOO_LARGE", "The quote request is too large.");
    }
    const body = await readJson(request);
    const parsed = catalogQuoteSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);

    return NextResponse.json(
      { data: createCatalogQuote(parsed.data) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof SyntaxError) {
      return apiError(400, "INVALID_JSON", error.message);
    }
    if (error instanceof CommerceError) {
      return apiError(error.status, error.code, error.message, error.details);
    }
    console.error("Unexpected catalog quote error", error);
    return apiError(500, "QUOTE_FAILED", "The current catalog price could not be calculated.");
  }
}
