import { NextResponse } from "next/server";

import { assertSameOrigin, requireRequestActor } from "@/lib/auth-session";
import { apiError, readJson, validationError } from "@/lib/http";
import { onboardingApiError } from "@/lib/onboarding-api";
import { getVendorApplicationForUser, updateVendorApplication } from "@/lib/vendor-onboarding";
import { vendorApplicationUpdateSchema } from "@/lib/vendor-onboarding-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const actor = await requireRequestActor(request, "vendor.application.read");
    const application = await getVendorApplicationForUser(actor.userId);
    if (!application) return apiError(404, "VENDOR_APPLICATION_NOT_FOUND", "Vendor application not found.");
    return NextResponse.json({ data: application }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return onboardingApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await requireRequestActor(request, "vendor.application.update");
    const body = await readJson(request);
    const parsed = vendorApplicationUpdateSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);
    const application = await updateVendorApplication(actor.userId, parsed.data);
    return NextResponse.json({ data: application }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return onboardingApiError(error);
  }
}
