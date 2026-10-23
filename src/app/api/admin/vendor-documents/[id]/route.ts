import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { assertSameOrigin } from "@/lib/auth-session";
import { requireRequestActor } from "@/lib/auth-session";
import { readJson, validationError } from "@/lib/http";
import { onboardingApiError } from "@/lib/onboarding-api";
import { getVendorDocument, reviewVendorDocument } from "@/lib/vendor-onboarding";
import { adminVendorDocumentReviewSchema } from "@/lib/vendor-onboarding-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRequestActor(request, "vendors.documents.read");
    const { id } = await context.params;
    const document = await getVendorDocument({ documentId: id, actorUserId: actor.userId, admin: true });
    return new Response(new Blob([document.content], { type: document.mimeType }), {
      headers: {
        "Content-Type": document.mimeType,
        "Content-Disposition": `attachment; filename="${document.originalName.replaceAll('"', "")}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return onboardingApiError(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const actor = await requireRequestActor(request, "vendors.review");
    const body = await readJson(request);
    const parsed = adminVendorDocumentReviewSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);
    const { id } = await context.params;
    const document = await reviewVendorDocument({
      documentId: id,
      actorId: actor.userId,
      requestId: request.headers.get("x-request-id")?.slice(0, 120) || randomUUID(),
      review: parsed.data,
    });
    return NextResponse.json({ data: document }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return onboardingApiError(error);
  }
}
