import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, AuthenticationError, requireRequestActor } from "@/lib/auth-session";
import { readJson, validationError } from "@/lib/http";
import { onboardingApiError } from "@/lib/onboarding-api";
import { getVendorRegistrationOptions, saveVendorRegistrationOptions } from "@/lib/vendor-registration-options";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const schema = z.object({ printingServices: z.array(z.string().trim().min(2).max(120)).min(1).max(30), equipment: z.array(z.string().trim().min(2).max(120)).min(1).max(30) }).strict();
async function requireAdmin(request: Request) { const actor = await requireRequestActor(request, "vendors.manage"); if (!actor.roles.includes("admin")) throw new AuthenticationError(403, "FORBIDDEN", "Super Admin access is required."); }
export async function GET(request: Request) { try { await requireAdmin(request); return NextResponse.json({ data: await getVendorRegistrationOptions() }, { headers: { "Cache-Control": "no-store" } }); } catch (error) { return onboardingApiError(error); } }
export async function PUT(request: Request) { try { assertSameOrigin(request); await requireAdmin(request); const parsed = schema.safeParse(await readJson(request)); if (!parsed.success) return validationError(parsed.error); await saveVendorRegistrationOptions(parsed.data); return NextResponse.json({ data: parsed.data }); } catch (error) { return onboardingApiError(error); } }
