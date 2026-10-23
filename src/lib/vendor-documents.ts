import { createHash } from "node:crypto";

const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;
const allowedMimeTypes = new Set(["application/pdf", "image/png", "image/jpeg"]);

export class VendorDocumentError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) {
    super(message);
    this.name = "VendorDocumentError";
  }
}

export async function readLimitedMultipartFormData(request: Request, maxBytes: number) {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new VendorDocumentError("REQUEST_TOO_LARGE", "The upload request is too large.", 413);
  }
  const contentType = request.headers.get("content-type");
  if (!contentType?.toLowerCase().startsWith("multipart/form-data")) {
    throw new VendorDocumentError("MULTIPART_REQUIRED", "The request must contain multipart form data.");
  }
  if (!request.body) throw new VendorDocumentError("REQUEST_BODY_REQUIRED", "The upload request is empty.");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new VendorDocumentError("REQUEST_TOO_LARGE", "The upload request is too large.", 413);
      }
      chunks.push(value);
    }
    const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
    const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return await new Response(body, { headers: { "Content-Type": contentType } }).formData();
  } catch (error) {
    if (error instanceof VendorDocumentError) throw error;
    throw new VendorDocumentError("MULTIPART_INVALID", "The multipart upload could not be parsed.");
  }
}

function detectedMime(bytes: Uint8Array) {
  if (bytes.length >= 5 && new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-") return "application/pdf";
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= png.length && png.every((value, index) => bytes[index] === value)) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  return null;
}

export async function validateVendorDocument(file: File) {
  if (!allowedMimeTypes.has(file.type)) {
    throw new VendorDocumentError("DOCUMENT_TYPE_NOT_ALLOWED", "Documents must be PDF, PNG or JPEG files.");
  }
  if (file.size < 1 || file.size > MAX_DOCUMENT_BYTES) {
    throw new VendorDocumentError("DOCUMENT_SIZE_INVALID", "Each document must be between 1 byte and 4 MB.");
  }
  const content = new Uint8Array(await file.arrayBuffer());
  const actualMime = detectedMime(content);
  if (!actualMime || actualMime !== file.type) {
    throw new VendorDocumentError("DOCUMENT_SIGNATURE_INVALID", "The document contents do not match its declared file type.");
  }
  const safeName = file.name.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 200) || "document";
  return {
    originalName: safeName,
    mimeType: actualMime,
    sizeBytes: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex"),
    content,
  };
}
