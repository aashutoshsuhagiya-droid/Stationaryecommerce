import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { assertSameOrigin, requireRequestActor } from "@/lib/auth-session";
import { dispatchCapturedOrderToVendors } from "@/lib/marketplace-dispatch";
import { onboardingApiError } from "@/lib/onboarding-api";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const actor = await requireRequestActor(request, "assignments.manage");
    const { id } = await context.params;
    const result = await dispatchCapturedOrderToVendors(id);
    await getPrisma().auditLog.create({
      data: {
        actorId: actor.userId,
        action: "vendor.assignment.dispatch",
        entityType: "Order",
        entityId: id,
        after: {
          assignmentId: result.assignment.id,
          status: result.assignment.status,
          offerCount: result.assignment.offers.length,
          replayed: result.replayed,
        },
        requestId: request.headers.get("x-request-id")?.slice(0, 120) || randomUUID(),
      },
    });
    return NextResponse.json({ data: result }, { status: result.replayed ? 200 : 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return onboardingApiError(error);
  }
}
