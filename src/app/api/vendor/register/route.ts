import { NextResponse } from "next/server";

import { assertSameOrigin, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth-session";
import { apiError, validationError } from "@/lib/http";
import { onboardingApiError } from "@/lib/onboarding-api";
import { readLimitedMultipartFormData, validateVendorDocument } from "@/lib/vendor-documents";
import { registerVendorApplication } from "@/lib/vendor-onboarding";
import { vendorRegistrationSchema } from "@/lib/vendor-onboarding-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_REQUEST_BYTES = 22 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const form = await readLimitedMultipartFormData(request, MAX_REQUEST_BYTES);
    const rawPayload = form.get("payload");
    if (typeof rawPayload !== "string") return apiError(400, "PAYLOAD_REQUIRED", "Application details are required.");
    let payload: unknown;
    try { payload = JSON.parse(rawPayload); } catch { throw new SyntaxError("The application payload must be valid JSON."); }
    const parsed = vendorRegistrationSchema.safeParse(payload);
    if (!parsed.success) return validationError(parsed.error);

    const files = form.getAll("documents").filter((value): value is File => value instanceof File && value.size > 0);
    if (files.length !== parsed.data.documentTypes.length) {
      return apiError(400, "DOCUMENT_METADATA_MISMATCH", "Each uploaded document must have a document type.");
    }
    const documents = await Promise.all(files.map(async (file, index) => ({
      ...await validateVendorDocument(file),
      type: parsed.data.documentTypes[index],
    })));
    const result = await registerVendorApplication(parsed.data, documents);
    const response = NextResponse.json({ data: result.application, meta: { redirectTo: "/vendor" } }, { status: 201 });
    response.cookies.set(SESSION_COOKIE, result.session.token, sessionCookieOptions(result.session.expiresAt));
    return response;
  } catch (error) {
    return onboardingApiError(error);
  }
}
