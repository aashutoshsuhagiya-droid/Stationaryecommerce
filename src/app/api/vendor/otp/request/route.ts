import { NextResponse } from "next/server";

import { assertSameOrigin } from "@/lib/auth-session";
import { apiError, readJson, validationError } from "@/lib/http";
import { onboardingApiError } from "@/lib/onboarding-api";
import { consumeRateLimit, requestIdentifier } from "@/lib/rate-limit";
import { otpRequestSchema } from "@/lib/vendor-onboarding-validation";
import { requestVendorOtp } from "@/lib/vendor-otp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await readJson(request);
    const parsed = otpRequestSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);
    const limit = consumeRateLimit({
      namespace: "vendor-otp",
      identifier: `${requestIdentifier(request)}:${parsed.data.mobile}`,
      limit: 5,
      windowMs: 60 * 60 * 1000,
    });
    if (!limit.allowed) return apiError(429, "RATE_LIMITED", "Too many verification requests. Try again later.");
    const result = await requestVendorOtp(parsed.data.mobile);
    return NextResponse.json({ data: result }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return onboardingApiError(error);
  }
}
