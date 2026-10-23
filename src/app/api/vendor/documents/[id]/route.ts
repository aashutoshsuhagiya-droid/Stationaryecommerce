import { requireRequestActor } from "@/lib/auth-session";
import { onboardingApiError } from "@/lib/onboarding-api";
import { getVendorDocument } from "@/lib/vendor-onboarding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRequestActor(request, "vendor.documents.manage");
    const { id } = await context.params;
    const document = await getVendorDocument({ documentId: id, actorUserId: actor.userId, admin: false });
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
