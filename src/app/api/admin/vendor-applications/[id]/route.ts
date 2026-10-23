import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { assertSameOrigin, requireRequestActor } from "@/lib/auth-session";
import { readJson, validationError } from "@/lib/http";
import { onboardingApiError } from "@/lib/onboarding-api";
import { decideVendorApplication } from "@/lib/vendor-onboarding";
import { adminVendorDecisionSchema } from "@/lib/vendor-onboarding-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const actor = await requireRequestActor(request, "vendors.approve");
    const body = await readJson(request);
    const parsed = adminVendorDecisionSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);
    const { id } = await context.params;
    const application = await decideVendorApplication({
      applicationId: id,
      actorId: actor.userId,
      requestId: request.headers.get("x-request-id")?.slice(0, 120) || randomUUID(),
      decision: parsed.data,
    });
    return NextResponse.json({ data: application }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return onboardingApiError(error);
  }
}
