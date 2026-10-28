import { after, NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/auth-session";
import { hasJsonContentType, readLimitedJson } from "@/lib/http";
import { consumeRateLimit, requestIdentifier } from "@/lib/rate-limit";
import { requireVisualizationStudioAdmin, visualizationStudioApiError } from "@/lib/visualization-studio-api";
import { visualizationPatchActionSchema, VisualizationStudioError } from "@/lib/visualization-studio-domain";
import {
  changeVisualizationTemplateStatus,
  confirmVisualizationAnalysis,
  listVisualizationStudioState,
  processVisualizationJob,
  recoverVisualizationQueue,
  retryVisualizationAnalysis,
  saveVisualizationTemplate,
  startVisualizationAnalysis,
} from "@/lib/visualization-studio-service";
import { readVisualizationUpload } from "@/lib/visualization-studio-upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function scheduleVisualizationJob(jobId: string) {
  after(() => processVisualizationJob(jobId).catch((error) => {
    console.error("Background visualization analysis failed", { jobId, error });
  }));
}

const privateHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(request: Request) {
  try {
    await requireVisualizationStudioAdmin(request);
    const rawProductId = new URL(request.url).searchParams.get("productId")?.trim();
    if (rawProductId && !/^[a-zA-Z0-9_-]{1,120}$/.test(rawProductId)) {
      throw new VisualizationStudioError(400, "PRODUCT_ID_INVALID", "Choose a valid product.");
    }
    const productId = rawProductId || undefined;
    const queuedJobIds = await recoverVisualizationQueue(productId);
    queuedJobIds.forEach(scheduleVisualizationJob);
    return NextResponse.json(
      { data: await listVisualizationStudioState(productId) },
      { headers: privateHeaders },
    );
  } catch (error) {
    return visualizationStudioApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await requireVisualizationStudioAdmin(request);
    const rateLimit = consumeRateLimit({
      namespace: "admin-visualization-upload",
      identifier: `${actor.userId}:${requestIdentifier(request)}`,
      limit: 20,
      windowMs: 60 * 60 * 1_000,
    });
    if (!rateLimit.allowed) {
      const response = NextResponse.json(
        { error: { code: "RATE_LIMITED", message: "Too many visualization uploads. Please wait and try again." } },
        { status: 429, headers: { ...privateHeaders, "Retry-After": String(rateLimit.retryAfterSeconds) } },
      );
      return response;
    }
    const input = await readVisualizationUpload(request);
    const job = await startVisualizationAnalysis({
      actorId: actor.userId,
      productId: input.productId,
      upload: input.upload,
      analysisMode: input.analysisMode,
      productType: input.productType,
      geometryKind: input.geometryKind,
      dimensions: input.dimensions,
    });
    scheduleVisualizationJob(job.id);
    return NextResponse.json({ data: { asset: job.asset, job } }, { status: 201, headers: privateHeaders });
  } catch (error) {
    return visualizationStudioApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await requireVisualizationStudioAdmin(request);
    if (!hasJsonContentType(request)) {
      throw new VisualizationStudioError(415, "JSON_REQUIRED", "This request must use application/json.");
    }
    const action = visualizationPatchActionSchema.parse(await readLimitedJson(request, 128 * 1024));
    switch (action.action) {
      case "retry": {
        const job = await retryVisualizationAnalysis(action.jobId, action.analysisMode);
        scheduleVisualizationJob(job.id);
        return NextResponse.json({ data: { job } }, { headers: privateHeaders });
      }
      case "confirm-analysis": {
        const job = await confirmVisualizationAnalysis(action.jobId, action.confirmation);
        return NextResponse.json({ data: { job } }, { headers: privateHeaders });
      }
      case "save-template": {
        const template = await saveVisualizationTemplate(actor.userId, action.sourceJobId, action.template);
        return NextResponse.json({ data: { template } }, { status: 201, headers: privateHeaders });
      }
      case "publish-template":
      case "archive-template": {
        const template = await changeVisualizationTemplateStatus(
          action.templateId,
          action.action === "publish-template" ? "publish" : "archive",
        );
        return NextResponse.json({ data: { template } }, { headers: privateHeaders });
      }
    }
  } catch (error) {
    return visualizationStudioApiError(error);
  }
}
