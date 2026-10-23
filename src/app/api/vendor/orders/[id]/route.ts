import { NextResponse } from "next/server";

import { assertSameOrigin, requireRequestActor } from "@/lib/auth-session";
import { readJson, validationError } from "@/lib/http";
import { onboardingApiError } from "@/lib/onboarding-api";
import { updateAssignedVendorOrder } from "@/lib/vendor-operations";
import { vendorOrderActionSchema } from "@/lib/vendor-operations-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const actor = await requireRequestActor(request, "vendor.orders.manage");
    const parsed = vendorOrderActionSchema.safeParse(await readJson(request));
    if (!parsed.success) return validationError(parsed.error);
    const { id } = await context.params;
    const order = await updateAssignedVendorOrder(actor.userId, id, parsed.data);
    return NextResponse.json({ data: order }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return onboardingApiError(error);
  }
}
