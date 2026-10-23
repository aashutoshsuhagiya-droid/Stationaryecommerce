import assert from "node:assert/strict";
import test from "node:test";

import {
  readLimitedMultipartFormData,
  validateVendorDocument,
  VendorDocumentError,
} from "./vendor-documents";

test("document validation checks file signatures instead of trusting MIME metadata", async () => {
  const validPdf = new File([new TextEncoder().encode("%PDF-1.7\nfixture")], "registration.pdf", { type: "application/pdf" });
  const prepared = await validateVendorDocument(validPdf);
  assert.equal(prepared.mimeType, "application/pdf");
  assert.equal(prepared.sha256.length, 64);

  const disguised = new File([new TextEncoder().encode("not a PDF")], "fake.pdf", { type: "application/pdf" });
  await assert.rejects(
    validateVendorDocument(disguised),
    (error) => error instanceof VendorDocumentError && error.code === "DOCUMENT_SIGNATURE_INVALID",
  );
});

test("bounded multipart parsing accepts valid forms and rejects streamed over-limit bodies", async () => {
  const form = new FormData();
  form.append("payload", JSON.stringify({ ok: true }));
  const parsed = await readLimitedMultipartFormData(new Request("https://example.test/upload", {
    method: "POST",
    body: form,
  }), 10_000);
  assert.equal(parsed.get("payload"), JSON.stringify({ ok: true }));

  const oversized = new Request("https://example.test/upload", {
    method: "POST",
    headers: { "Content-Type": "multipart/form-data; boundary=fixture" },
    body: new Uint8Array(128),
  });
  await assert.rejects(
    readLimitedMultipartFormData(oversized, 64),
    (error) => error instanceof VendorDocumentError && error.status === 413,
  );
});
