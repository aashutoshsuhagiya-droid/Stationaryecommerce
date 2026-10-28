import { createHash } from "node:crypto";
import sharp from "sharp";

export const supportedArtworkMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type SupportedArtworkMimeType = (typeof supportedArtworkMimeTypes)[number];

export interface ArtworkUploadConstraints {
  allowedMimeTypes: readonly SupportedArtworkMimeType[];
  maximumBytes: number;
  minimumWidth?: number;
  minimumHeight?: number;
  maximumWidth?: number;
  maximumHeight?: number;
  aspectRatio?: number;
  aspectRatioTolerance?: number;
  allowTransparency?: boolean;
}

export interface PreparedArtworkUpload {
  originalName: string;
  mimeType: SupportedArtworkMimeType;
  sizeBytes: number;
  width: number;
  height: number;
  hasTransparency: boolean;
  sha256: string;
  content: Uint8Array<ArrayBuffer>;
}

export class ArtworkUploadError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) {
    super(message);
    this.name = "ArtworkUploadError";
  }
}

const MAXIMUM_DECODED_PIXELS = 40_000_000;
const sharpMimeTypes = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
} as const;

function uint32BigEndian(bytes: Uint8Array, offset: number) {
  return (
    bytes[offset] * 0x1000000 +
    bytes[offset + 1] * 0x10000 +
    bytes[offset + 2] * 0x100 +
    bytes[offset + 3]
  );
}

function uint32LittleEndian(bytes: Uint8Array, offset: number) {
  return (
    bytes[offset] +
    bytes[offset + 1] * 0x100 +
    bytes[offset + 2] * 0x10000 +
    bytes[offset + 3] * 0x1000000
  ) >>> 0;
}

function ascii(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function containsAscii(bytes: Uint8Array, value: string) {
  const target = [...value].map((character) => character.charCodeAt(0));
  for (let offset = 0; offset <= bytes.length - target.length; offset += 1) {
    if (target.every((byte, index) => bytes[offset + index] === byte)) return true;
  }
  return false;
}

function pngMetadata(bytes: Uint8Array) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 33 || !signature.every((value, index) => bytes[index] === value)) return null;
  if (ascii(bytes, 12, 4) !== "IHDR" || uint32BigEndian(bytes, 8) !== 13) return null;
  const width = uint32BigEndian(bytes, 16);
  const height = uint32BigEndian(bytes, 20);
  const colorType = bytes[25];
  if (!width || !height || ![0, 2, 3, 4, 6].includes(colorType)) return null;
  return {
    mimeType: "image/png" as const,
    width,
    height,
    hasTransparency: colorType === 4 || colorType === 6 || containsAscii(bytes, "tRNS"),
  };
}

const jpegStartOfFrameMarkers = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function jpegMetadata(bytes: Uint8Array) {
  if (bytes.length < 12 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 1 >= bytes.length) return null;
    const length = bytes[offset] * 0x100 + bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) return null;
    if (jpegStartOfFrameMarkers.has(marker)) {
      if (length < 7) return null;
      const height = bytes[offset + 3] * 0x100 + bytes[offset + 4];
      const width = bytes[offset + 5] * 0x100 + bytes[offset + 6];
      if (!width || !height) return null;
      return { mimeType: "image/jpeg" as const, width, height, hasTransparency: false };
    }
    offset += length;
  }
  return null;
}

function webpMetadata(bytes: Uint8Array) {
  if (
    bytes.length < 30 ||
    ascii(bytes, 0, 4) !== "RIFF" ||
    ascii(bytes, 8, 4) !== "WEBP" ||
    uint32LittleEndian(bytes, 4) + 8 > bytes.length
  ) return null;

  const chunk = ascii(bytes, 12, 4);
  if (chunk === "VP8X") {
    const flags = bytes[20];
    const width = 1 + bytes[24] + bytes[25] * 0x100 + bytes[26] * 0x10000;
    const height = 1 + bytes[27] + bytes[28] * 0x100 + bytes[29] * 0x10000;
    return { mimeType: "image/webp" as const, width, height, hasTransparency: Boolean(flags & 0x10) };
  }

  if (chunk === "VP8 " && bytes.length >= 30) {
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return null;
    const width = (bytes[26] + bytes[27] * 0x100) & 0x3fff;
    const height = (bytes[28] + bytes[29] * 0x100) & 0x3fff;
    if (!width || !height) return null;
    return { mimeType: "image/webp" as const, width, height, hasTransparency: false };
  }

  if (chunk === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
    const bits = bytes[21] + bytes[22] * 0x100 + bytes[23] * 0x10000 + bytes[24] * 0x1000000;
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >>> 14) & 0x3fff) + 1;
    const hasTransparency = Boolean((bits >>> 28) & 1);
    return { mimeType: "image/webp" as const, width, height, hasTransparency };
  }

  return null;
}

export function inspectArtworkImage(bytes: Uint8Array) {
  return pngMetadata(bytes) ?? jpegMetadata(bytes) ?? webpMetadata(bytes);
}

function hasCompleteRasterContainer(bytes: Uint8Array, mimeType: SupportedArtworkMimeType) {
  if (mimeType === "image/jpeg") {
    return bytes.length >= 4 && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
  }
  if (mimeType === "image/webp") {
    return bytes.length >= 12 && uint32LittleEndian(bytes, 4) + 8 === bytes.length;
  }

  let offset = 8;
  let sawImageData = false;
  while (offset + 12 <= bytes.length) {
    const chunkLength = uint32BigEndian(bytes, offset);
    const chunkEnd = offset + 12 + chunkLength;
    if (!Number.isSafeInteger(chunkEnd) || chunkEnd > bytes.length) return false;
    const chunkType = ascii(bytes, offset + 4, 4);
    if (chunkType === "IDAT") sawImageData = true;
    if (chunkType === "IEND") {
      return chunkLength === 0 && sawImageData && chunkEnd === bytes.length;
    }
    offset = chunkEnd;
  }
  return false;
}

async function decodeArtworkImage(content: Uint8Array<ArrayBuffer>) {
  try {
    const image = sharp(content, {
      failOn: "error",
      limitInputPixels: MAXIMUM_DECODED_PIXELS,
      sequentialRead: true,
    });
    const metadata = await image.metadata();
    const mimeType = metadata.format && metadata.format in sharpMimeTypes
      ? sharpMimeTypes[metadata.format as keyof typeof sharpMimeTypes]
      : undefined;
    if (!mimeType || !metadata.width || !metadata.height || metadata.pages && metadata.pages !== 1) {
      throw new Error("Unsupported or incomplete raster metadata.");
    }

    // Metadata reads can succeed for a truncated file. Force libvips to decode the
    // complete raster while producing only a tiny throwaway output.
    await image
      .clone()
      .resize({ width: 1, height: 1, fit: "inside", withoutEnlargement: true })
      .timeout({ seconds: 5 })
      .toBuffer();

    return {
      mimeType,
      width: metadata.width,
      height: metadata.height,
      hasTransparency: metadata.hasAlpha === true,
    };
  } catch {
    throw new ArtworkUploadError(
      "ARTWORK_DECODE_INVALID",
      "The artwork is corrupted, truncated or too complex to process safely.",
    );
  }
}

function safeInteger(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

export async function validateArtworkUpload(
  file: File,
  constraints: ArtworkUploadConstraints,
): Promise<PreparedArtworkUpload> {
  const maximumBytes = safeInteger(constraints.maximumBytes, 5 * 1024 * 1024);
  if (file.size < 1 || file.size > maximumBytes) {
    throw new ArtworkUploadError(
      "ARTWORK_SIZE_INVALID",
      `Artwork must be between 1 byte and ${maximumBytes} bytes.`,
      413,
    );
  }
  if (!supportedArtworkMimeTypes.includes(file.type as SupportedArtworkMimeType)) {
    throw new ArtworkUploadError("ARTWORK_TYPE_NOT_SUPPORTED", "Artwork must be a JPG, PNG or WEBP image.");
  }
  if (!constraints.allowedMimeTypes.includes(file.type as SupportedArtworkMimeType)) {
    throw new ArtworkUploadError("ARTWORK_TYPE_NOT_ALLOWED", "This product does not accept that artwork file type.");
  }

  const content = new Uint8Array(await file.arrayBuffer()) as Uint8Array<ArrayBuffer>;
  const inspectedMetadata = inspectArtworkImage(content);
  if (!inspectedMetadata || inspectedMetadata.mimeType !== file.type) {
    throw new ArtworkUploadError(
      "ARTWORK_SIGNATURE_INVALID",
      "The artwork contents do not match the declared image type.",
    );
  }
  if (!hasCompleteRasterContainer(content, inspectedMetadata.mimeType)) {
    throw new ArtworkUploadError(
      "ARTWORK_DECODE_INVALID",
      "The artwork is truncated or contains data outside its image container.",
    );
  }
  if (inspectedMetadata.width * inspectedMetadata.height > MAXIMUM_DECODED_PIXELS) {
    throw new ArtworkUploadError(
      "ARTWORK_PIXEL_COUNT_INVALID",
      "The artwork has too many pixels to process safely.",
    );
  }
  const metadata = await decodeArtworkImage(content);
  if (
    metadata.mimeType !== inspectedMetadata.mimeType ||
    metadata.width !== inspectedMetadata.width ||
    metadata.height !== inspectedMetadata.height
  ) {
    throw new ArtworkUploadError(
      "ARTWORK_SIGNATURE_INVALID",
      "The artwork header does not match its decoded image data.",
    );
  }

  const minimumWidth = safeInteger(constraints.minimumWidth, 1);
  const minimumHeight = safeInteger(constraints.minimumHeight, 1);
  const maximumWidth = safeInteger(constraints.maximumWidth, 50_000);
  const maximumHeight = safeInteger(constraints.maximumHeight, 50_000);
  if (
    metadata.width < minimumWidth || metadata.height < minimumHeight ||
    metadata.width > maximumWidth || metadata.height > maximumHeight
  ) {
    throw new ArtworkUploadError(
      "ARTWORK_DIMENSIONS_INVALID",
      `Artwork dimensions must be between ${minimumWidth} x ${minimumHeight} and ${maximumWidth} x ${maximumHeight} pixels.`,
    );
  }

  if (constraints.aspectRatio && Number.isFinite(constraints.aspectRatio) && constraints.aspectRatio > 0) {
    const tolerance = Math.max(0, Math.min(1, constraints.aspectRatioTolerance ?? 0.02));
    const difference = Math.abs(metadata.width / metadata.height - constraints.aspectRatio) / constraints.aspectRatio;
    if (difference > tolerance) {
      throw new ArtworkUploadError("ARTWORK_ASPECT_RATIO_INVALID", "The artwork aspect ratio does not match this product.");
    }
  }
  if (constraints.allowTransparency === false && metadata.hasTransparency) {
    throw new ArtworkUploadError("ARTWORK_TRANSPARENCY_NOT_ALLOWED", "Transparent artwork is not allowed for this product.");
  }

  const originalName = file.name.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 200) || "artwork";
  return {
    originalName,
    ...metadata,
    sizeBytes: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex"),
    content,
  };
}

export async function readLimitedArtworkFormData(request: Request, maximumBytes: number) {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new ArtworkUploadError("ARTWORK_REQUEST_TOO_LARGE", "The artwork upload request is too large.", 413);
  }
  const contentType = request.headers.get("content-type");
  if (!contentType?.toLowerCase().startsWith("multipart/form-data")) {
    throw new ArtworkUploadError("MULTIPART_REQUIRED", "The artwork upload must use multipart form data.", 415);
  }
  if (!request.body) throw new ArtworkUploadError("ARTWORK_BODY_REQUIRED", "The artwork upload is empty.");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        throw new ArtworkUploadError("ARTWORK_REQUEST_TOO_LARGE", "The artwork upload request is too large.", 413);
      }
      chunks.push(value);
    }
    const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
    const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return await new Response(body, { headers: { "Content-Type": contentType } }).formData();
  } catch (error) {
    if (error instanceof ArtworkUploadError) throw error;
    throw new ArtworkUploadError("MULTIPART_INVALID", "The artwork upload could not be parsed.");
  }
}
