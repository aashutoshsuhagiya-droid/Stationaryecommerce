/**
 * The admin 2D design editor's API: a product's studio designs (one
 * PersonalizationTemplate each) and the text fields they bind.
 *
 * GET  ?productId=…  → the designs in order, the text fields, the product photo.
 * PUT  { productId, designs, fields } → saves everything in one transaction:
 *      templates (created as "st-…" or updated in place), their links and
 *      order, the bound fields, and the product's design surface. The product
 *      is marked as edited in admin so a re-import keeps these designs.
 */
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { assertSameOrigin } from "@/lib/auth-session";
import { requireCatalogAdmin } from "@/lib/catalog-admin";
import { apiError, readJson, validationError } from "@/lib/http";
import { onboardingApiError } from "@/lib/onboarding-api";
import { getPrisma } from "@/lib/prisma";
import { studioSaveSchema } from "@/lib/studio-design";
import { loadStudio, saveStudioDesigns } from "@/lib/studio-design-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRODUCT_ID = /^[A-Za-z0-9_-]{1,100}$/u;

export async function GET(request: Request) {
  try {
    await requireCatalogAdmin(request);
    const productId = new URL(request.url).searchParams.get("productId") ?? "";
    if (!PRODUCT_ID.test(productId)) return apiError(400, "PRODUCT_ID_INVALID", "Choose a valid product.");
    const studio = await loadStudio(getPrisma(), productId);
    if (!studio) return apiError(404, "PRODUCT_NOT_FOUND", "The product was not found.");
    return NextResponse.json({ data: studio }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return onboardingApiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    await requireCatalogAdmin(request);
    const parsed = studioSaveSchema.safeParse(await readJson(request));
    if (!parsed.success) return validationError(parsed.error);
    const input = parsed.data;
    const { warnings } = await saveStudioDesigns(input);

    revalidatePath("/", "layout");
    const studio = await loadStudio(getPrisma(), input.productId);
    return NextResponse.json({ data: { ...studio, warnings } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return onboardingApiError(error);
  }
}
