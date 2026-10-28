import { requireVisualizationStudioAdmin, visualizationStudioApiError } from "@/lib/visualization-studio-api";
import { VisualizationStudioError } from "@/lib/visualization-studio-domain";
import { getVisualizationAssetForDownload } from "@/lib/visualization-studio-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeDownloadName(value: string | null) {
  return (value ?? "visualization-source").replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 200);
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireVisualizationStudioAdmin(request);
    const { id } = await context.params;
    if (!id || id.length > 120) {
      throw new VisualizationStudioError(404, "VISUALIZATION_ASSET_NOT_FOUND", "The visualization asset is unavailable.");
    }
    const asset = await getVisualizationAssetForDownload(id);
    return new Response(new Uint8Array(asset.content), {
      headers: {
        "Content-Type": asset.mimeType,
        "Content-Length": String(asset.sizeBytes),
        "Content-Disposition": `inline; filename="${safeDownloadName(asset.originalName)}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    return visualizationStudioApiError(error);
  }
}
