import { NextResponse } from "next/server";

import { assertSameOrigin, requireRequestActor } from "@/lib/auth-session";
import { recoverExpiredVendorAssignments } from "@/lib/marketplace-dispatch";
import { onboardingApiError } from "@/lib/onboarding-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await requireRequestActor(request, "assignments.manage");
    const result = await recoverExpiredVendorAssignments();
    return NextResponse.json({ data: result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return onboardingApiError(error);
  }
}
