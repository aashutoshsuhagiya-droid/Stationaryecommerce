import { NextResponse } from "next/server";

import { assertSameOrigin, requireRequestActor } from "@/lib/auth-session";
import { readJson, validationError } from "@/lib/http";
import { onboardingApiError } from "@/lib/onboarding-api";
import { updateVendorAvailability } from "@/lib/vendor-operations";
import { vendorAvailabilitySchema } from "@/lib/vendor-operations-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await requireRequestActor(request, "vendor.profile.manage");
    const parsed = vendorAvailabilitySchema.safeParse(await readJson(request));
    if (!parsed.success) return validationError(parsed.error);
    const profile = await updateVendorAvailability(actor.userId, parsed.data);
    return NextResponse.json({ data: profile }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return onboardingApiError(error);
  }
}
