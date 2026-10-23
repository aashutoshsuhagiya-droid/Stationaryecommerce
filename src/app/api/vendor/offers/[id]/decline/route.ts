import { NextResponse } from "next/server";

import { assertSameOrigin, requireRequestActor } from "@/lib/auth-session";
import { readJson, validationError } from "@/lib/http";
import { onboardingApiError } from "@/lib/onboarding-api";
import { declineVendorOffer } from "@/lib/vendor-operations";
import { vendorOfferDeclineSchema } from "@/lib/vendor-operations-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const actor = await requireRequestActor(request, "vendor.offers.respond");
    const parsed = vendorOfferDeclineSchema.safeParse(await readJson(request));
    if (!parsed.success) return validationError(parsed.error);
    const { id } = await context.params;
    const result = await declineVendorOffer(actor.userId, id, parsed.data.reason);
    return NextResponse.json({ data: result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return onboardingApiError(error);
  }
}
