import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { apiError } from "@/lib/http";
import { recoverExpiredVendorAssignments } from "@/lib/marketplace-dispatch";
import { onboardingApiError } from "@/lib/onboarding-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const configured = process.env.ASSIGNMENT_RECOVERY_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!configured || configured.length < 32 || !supplied) return false;
  const expected = Buffer.from(configured);
  const actual = Buffer.from(supplied);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function POST(request: Request) {
  try {
    if (!authorized(request)) return apiError(401, "INVALID_RECOVERY_CREDENTIAL", "Recovery authorization failed.");
    const result = await recoverExpiredVendorAssignments();
    return NextResponse.json({ data: result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return onboardingApiError(error);
  }
}
