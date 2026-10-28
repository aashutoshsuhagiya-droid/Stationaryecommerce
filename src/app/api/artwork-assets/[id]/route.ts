import { getRequestActor } from "@/lib/auth-session";
import { getPrivateArtworkAsset } from "@/lib/artwork-assets";
import { CommerceError } from "@/lib/commerce-error";
import { apiError } from "@/lib/http";
import { DatabaseConfigurationError } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const actor = await getRequestActor(request).catch(() => null);
    const asset = await getPrivateArtworkAsset({
      id,
      claimToken: request.headers.get("x-artwork-claim-token") ?? undefined,
      actor,
    });
    return new Response(new Blob([asset.content], { type: asset.mimeType }), {
      headers: {
        "Content-Type": asset.mimeType,
        "Content-Length": String(asset.sizeBytes),
        "Content-Disposition": `attachment; filename="${asset.originalName.replaceAll('"', "")}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof CommerceError) return apiError(error.status, error.code, error.message, error.details);
    if (error instanceof DatabaseConfigurationError) return apiError(503, "ARTWORK_STORAGE_UNAVAILABLE", "Private artwork storage is not configured.");
    console.error("Unexpected artwork asset download error", error);
    return apiError(500, "ARTWORK_ASSET_DOWNLOAD_FAILED", "The artwork could not be downloaded safely.");
  }
}
