import { NextResponse } from "next/server";
import { z } from "zod";

import { assertSameOrigin } from "@/lib/auth-session";
import { requireCatalogAdmin } from "@/lib/catalog-admin";
import { readJson } from "@/lib/http";
import { createQuick3DPreview } from "@/lib/quick-3d-service";
import { visualizationStudioApiError } from "@/lib/visualization-studio-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const schema = z.object({ productId: z.string().trim().regex(/^[A-Za-z0-9_-]{1,100}$/) }).strict();

/**
 * One-click 3D preview for packaging products (see `createQuick3DPreview`).
 * Publishing, not this route, writes `allow3D`/`productModel`/`previewTemplate`.
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await requireCatalogAdmin(request);
    const parsed = schema.parse(await readJson(request));
    const result = await createQuick3DPreview({ actorId: actor.userId, productId: parsed.productId });
    if (result.alreadyLinked) {
      return NextResponse.json(
        { data: { templateId: result.templateId, alreadyLinked: true } },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const { alreadyLinked: _alreadyLinked, ...data } = result;
    return NextResponse.json(
      { data },
      { status: 201, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } },
    );
  } catch (error) {
    return visualizationStudioApiError(error);
  }
}
