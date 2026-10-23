import { NextResponse } from "next/server";

import { assertSameOrigin, requireRequestActor } from "@/lib/auth-session";
import { acceptOrderOffer } from "@/lib/marketplace-assignment";
import { PrismaAssignmentClaimStore } from "@/lib/marketplace-assignment-store";
import { onboardingApiError } from "@/lib/onboarding-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const actor = await requireRequestActor(request, "vendor.offers.respond");
    const { id } = await context.params;
    const result = await acceptOrderOffer(new PrismaAssignmentClaimStore(), {
      offerId: id,
      vendorUserId: actor.userId,
    });
    return NextResponse.json({ data: result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return onboardingApiError(error);
  }
}
