import { NextResponse } from "next/server";

import { requireRequestActor } from "@/lib/auth-session";
import { onboardingApiError } from "@/lib/onboarding-api";
import { getVendorOperations } from "@/lib/vendor-operations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const actor = await requireRequestActor(request, "vendor.offers.read");
    const workspace = await getVendorOperations(actor.userId);
    return NextResponse.json({ data: workspace }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return onboardingApiError(error);
  }
}
