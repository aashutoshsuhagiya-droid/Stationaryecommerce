import { NextResponse } from "next/server";

import { assertSameOrigin, requireRequestActor } from "@/lib/auth-session";
import { apiError } from "@/lib/http";
import { onboardingApiError } from "@/lib/onboarding-api";
import { readLimitedMultipartFormData, validateVendorDocument } from "@/lib/vendor-documents";
import { addVendorDocuments } from "@/lib/vendor-onboarding";

const documentTypes = new Set(["BUSINESS_REGISTRATION", "GST_CERTIFICATE", "SHOP_LICENSE", "IDENTITY_PROOF", "ADDRESS_PROOF", "OTHER"] as const);
const MAX_REQUEST_BYTES = 21 * 1024 * 1024;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await requireRequestActor(request, "vendor.documents.manage");
    const form = await readLimitedMultipartFormData(request, MAX_REQUEST_BYTES);
    const files = form.getAll("documents").filter((value): value is File => value instanceof File && value.size > 0);
    const rawTypes = form.getAll("documentTypes").filter((value): value is string => typeof value === "string");
    if (!files.length || files.length > 5 || files.length !== rawTypes.length) {
      return apiError(400, "DOCUMENT_METADATA_MISMATCH", "Upload one to five documents and select a type for each.");
    }
    if (rawTypes.some((value) => !documentTypes.has(value as typeof documentTypes extends Set<infer T> ? T : never))) {
      return apiError(400, "DOCUMENT_TYPE_INVALID", "One or more document types are invalid.");
    }
    const documents = await Promise.all(files.map(async (file, index) => ({
      ...await validateVendorDocument(file),
      type: rawTypes[index] as "BUSINESS_REGISTRATION" | "GST_CERTIFICATE" | "SHOP_LICENSE" | "IDENTITY_PROOF" | "ADDRESS_PROOF" | "OTHER",
    })));
    const application = await addVendorDocuments(actor.userId, documents);
    return NextResponse.json({ data: application }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return onboardingApiError(error);
  }
}
