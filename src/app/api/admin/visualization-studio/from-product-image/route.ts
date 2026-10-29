import { after, NextResponse } from "next/server";
import { z } from "zod";

import { assertSameOrigin } from "@/lib/auth-session";
import { requireCatalogAdmin } from "@/lib/catalog-admin";
import { readJson } from "@/lib/http";
import { getPrisma } from "@/lib/prisma";
import { visualizationStudioApiError } from "@/lib/visualization-studio-api";
import { processVisualizationJob, startVisualizationAnalysis } from "@/lib/visualization-studio-service";
import { VisualizationStudioError } from "@/lib/visualization-studio-domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const schema = z.object({ productId: z.string().trim().regex(/^[A-Za-z0-9_-]{1,100}$/) }).strict();

function scheduleVisualizationJob(jobId: string) {
  after(() => processVisualizationJob(jobId).catch((error) => {
    console.error("Background visualization analysis failed", { jobId, error });
  }));
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await requireCatalogAdmin(request);
    const parsed = schema.parse(await readJson(request));
    const prisma = getPrisma() as any;
    const product = await prisma.product.findUnique({
      where: { id: parsed.productId },
      include: {
        images: { where: { sortOrder: 0 }, take: 1, select: { url: true } },
        imageAssets: {
          where: { kind: "primary" }, orderBy: { createdAt: "desc" },
          select: { id: true, mimeType: true, sizeBytes: true, width: true, height: true, sha256: true, content: true, altText: true },
        },
      },
    });
    if (!product) throw new VisualizationStudioError(404, "PRODUCT_NOT_FOUND", "The selected product no longer exists.");
    const primaryUrl = product.images[0]?.url;
    const source = product.imageAssets.find((asset: any) => `/api/product-images/${asset.id}` === primaryUrl)
      ?? product.imageAssets[0];
    if (!source?.content || !source.sha256 || !source.width || !source.height) {
      throw new VisualizationStudioError(404, "PRODUCT_IMAGE_NOT_FOUND", "Upload a primary product image before reusing it in the visualization studio.");
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(source.mimeType) || source.sizeBytes > 12 * 1024 * 1024) {
      throw new VisualizationStudioError(422, "PRODUCT_IMAGE_INVALID", "The product image must be a JPG, PNG or WEBP up to 12 MB.");
    }
    const job = await startVisualizationAnalysis({
      actorId: actor.userId,
      productId: product.id,
      analysisMode: "manual",
      upload: {
        originalName: source.altText || `${product.slug}-product-image`,
        mimeType: source.mimeType,
        sizeBytes: source.sizeBytes,
        width: source.width,
        height: source.height,
        hasTransparency: false,
        sha256: source.sha256,
        content: new Uint8Array(source.content),
      },
    });
    scheduleVisualizationJob(job.id);
    return NextResponse.json({ data: { asset: job.asset, job } }, {
      status: 201,
      headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch (error) {
    return visualizationStudioApiError(error);
  }
}
