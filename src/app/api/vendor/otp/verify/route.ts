import { NextResponse } from "next/server";

import { assertSameOrigin } from "@/lib/auth-session";
import { readJson, validationError } from "@/lib/http";
import { onboardingApiError } from "@/lib/onboarding-api";
import { consumeRateLimit, requestIdentifier } from "@/lib/rate-limit";
import { otpVerifySchema } from "@/lib/vendor-onboarding-validation";
import { verifyVendorOtp } from "@/lib/vendor-otp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await readJson(request);
    const parsed = otpVerifySchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);
    const limit = consumeRateLimit({
      namespace: "vendor-otp-verify",
      identifier: `${requestIdentifier(request)}:${parsed.data.challengeId}:${parsed.data.mobile}`,
      limit: 10,
      windowMs: 15 * 60 * 1000,
    });
    if (!limit.allowed) {
      return NextResponse.json(
        { error: { code: "RATE_LIMITED", message: "Too many verification attempts. Try again later." } },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
      );
    }
    const result = await verifyVendorOtp({
      challengeId: parsed.data.challengeId,
      phone: parsed.data.mobile,
      code: parsed.data.code,
    });
    return NextResponse.json({ data: result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return onboardingApiError(error);
  }
}
