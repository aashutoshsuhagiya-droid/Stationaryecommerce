import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  assertSameOrigin,
  AuthenticationError,
  requireRequestActor,
} from "@/lib/auth-session";
import { readJson, validationError } from "@/lib/http";
import {
  getMarketplaceSettings,
  updateMarketplaceSettings,
} from "@/lib/marketplace-settings";
import {
  MAX_VENDORS_PER_ORDER,
  MIN_VENDORS_PER_ORDER,
} from "@/lib/marketplace-settings-domain";
import { onboardingApiError } from "@/lib/onboarding-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateSchema = z.object({
  maxVendorsPerOrder: z.number().int().min(MIN_VENDORS_PER_ORDER).max(MAX_VENDORS_PER_ORDER),
}).strict();

function assertSameOriginRead(request: Request) {
  if (request.headers.get("origin")) {
    assertSameOrigin(request);
    return;
  }
  const referer = request.headers.get("referer");
  let refererOrigin: string | undefined;
  try {
    refererOrigin = referer ? new URL(referer).origin : undefined;
  } catch {
    refererOrigin = undefined;
  }
  if (refererOrigin !== new URL(request.url).origin) {
    throw new AuthenticationError(403, "FORBIDDEN", "The request origin could not be verified.");
  }
}

async function requireSuperAdmin(request: Request) {
  const actor = await requireRequestActor(request, "settings.manage");
  if (!actor.roles.includes("admin")) {
    throw new AuthenticationError(403, "FORBIDDEN", "Super Admin access is required.");
  }
  return actor;
}

export async function GET(request: Request) {
  try {
    assertSameOriginRead(request);
    await requireSuperAdmin(request);
    const settings = await getMarketplaceSettings();
    return NextResponse.json({ data: settings }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return onboardingApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await requireSuperAdmin(request);
    const parsed = updateSchema.safeParse(await readJson(request));
    if (!parsed.success) return validationError(parsed.error);
    const result = await updateMarketplaceSettings({
      maxVendorsPerOrder: parsed.data.maxVendorsPerOrder,
      actorId: actor.userId,
      requestId: request.headers.get("x-request-id")?.slice(0, 120) || randomUUID(),
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 64),
      userAgent: request.headers.get("user-agent")?.slice(0, 500),
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return onboardingApiError(error);
  }
}
