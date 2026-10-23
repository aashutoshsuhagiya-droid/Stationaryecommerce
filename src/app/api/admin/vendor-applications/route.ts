import { NextResponse } from "next/server";

import { requireRequestActor } from "@/lib/auth-session";
import { onboardingApiError } from "@/lib/onboarding-api";
import { listVendorApplications } from "@/lib/vendor-onboarding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireRequestActor(request, "vendors.review");
    const url = new URL(request.url);
    const applications = await listVendorApplications({
      query: url.searchParams.get("q") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
    });
    return NextResponse.json({ data: applications }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return onboardingApiError(error);
  }
}
