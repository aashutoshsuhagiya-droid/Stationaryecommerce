import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import {
  ArtworkUploadError,
  inspectArtworkImage,
  validateArtworkUpload,
} from "./artwork-upload";

function pngHeader(width: number, height: number, colorType = 2) {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  bytes[24] = 8;
  bytes[25] = colorType;
  return bytes;
}

function extendedWebp(width: number, height: number, transparent = false) {
  const bytes = new Uint8Array(30);
  bytes.set(new TextEncoder().encode("RIFF"), 0);
  new DataView(bytes.buffer).setUint32(4, 22, true);
  bytes.set(new TextEncoder().encode("WEBPVP8X"), 8);
  bytes[20] = transparent ? 0x10 : 0;
  const encodedWidth = width - 1;
  const encodedHeight = height - 1;
  bytes.set([encodedWidth & 0xff, (encodedWidth >>> 8) & 0xff, (encodedWidth >>> 16) & 0xff], 24);
  bytes.set([encodedHeight & 0xff, (encodedHeight >>> 8) & 0xff, (encodedHeight >>> 16) & 0xff], 27);
  return bytes;
}

async function validPng(width: number, height: number, transparent = false) {
  const bytes = await sharp({
    create: {
      width,
      height,
      channels: transparent ? 4 : 3,
      background: transparent
        ? { r: 24, g: 80, b: 120, alpha: 0.5 }
        : { r: 24, g: 80, b: 120 },
    },
  }).png().toBuffer();
  return Uint8Array.from(bytes) as Uint8Array<ArrayBuffer>;
}

test("artwork inspection reads dimensions and transparency from supported image headers", () => {
  assert.deepEqual(inspectArtworkImage(pngHeader(1200, 600, 6)), {
    mimeType: "image/png",
    width: 1200,
    height: 600,
    hasTransparency: true,
  });
  assert.deepEqual(inspectArtworkImage(extendedWebp(900, 450, true)), {
    mimeType: "image/webp",
    width: 900,
    height: 450,
    hasTransparency: true,
  });
});

test("artwork validation sniffs MIME and enforces product dimensions, ratio and transparency", async () => {
  const constraints = {
    allowedMimeTypes: ["image/png"] as const,
    maximumBytes: 50_000,
    minimumWidth: 100,
    minimumHeight: 50,
    aspectRatio: 2,
    aspectRatioTolerance: 0.01,
    allowTransparency: false,
  };
  const validBytes = await validPng(120, 60);
  const valid = new File([validBytes], "logo.png", { type: "image/png" });
  const prepared = await validateArtworkUpload(valid, constraints);
  assert.equal(prepared.width, 120);
  assert.equal(prepared.height, 60);
  assert.equal(prepared.sha256.length, 64);

  const disguised = new File([new TextEncoder().encode("not an image")], "fake.png", { type: "image/png" });
  await assert.rejects(
    validateArtworkUpload(disguised, constraints),
    (error) => error instanceof ArtworkUploadError && error.code === "ARTWORK_SIGNATURE_INVALID",
  );

  const transparent = new File([await validPng(120, 60, true)], "transparent.png", { type: "image/png" });
  await assert.rejects(
    validateArtworkUpload(transparent, constraints),
    (error) => error instanceof ArtworkUploadError && error.code === "ARTWORK_TRANSPARENCY_NOT_ALLOWED",
  );

  const wrongRatio = new File([await validPng(120, 80)], "wide.png", { type: "image/png" });
  await assert.rejects(
    validateArtworkUpload(wrongRatio, constraints),
    (error) => error instanceof ArtworkUploadError && error.code === "ARTWORK_ASPECT_RATIO_INVALID",
  );

  const truncated = new File([validBytes.slice(0, -12)], "truncated.png", { type: "image/png" });
  await assert.rejects(
    validateArtworkUpload(truncated, constraints),
    (error) => error instanceof ArtworkUploadError && error.code === "ARTWORK_DECODE_INVALID",
  );
});
