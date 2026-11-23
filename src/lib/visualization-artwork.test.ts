import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import { cropFrontArtwork, downscaleVisualizationSource } from "./visualization-artwork";

async function solid(width: number, height: number, color: string, channels: 3 | 4 = 3) {
  return sharp({ create: { width, height, channels, background: color } }).png().toBuffer();
}

/** A product shot: a red box on a seamless white studio backdrop. */
async function plainBackdropFixture() {
  const box = await solid(160, 100, "#c0392b");
  return sharp(await solid(400, 300, "#ffffff"))
    .composite([{ input: box, left: 120, top: 100 }])
    .png()
    .toBuffer();
}

/** A cut-out PNG: a blue carton on a transparent background. */
async function transparentFixture() {
  const box = await solid(100, 150, "#1f4e9c");
  return sharp({ create: { width: 300, height: 300, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: box, left: 100, top: 75 }])
    .png()
    .toBuffer();
}

/** A lifestyle scene: every pixel different, nothing resembling a plain backdrop. */
async function lifestyleFixture() {
  const width = 320;
  const height = 240;
  const pixels = Buffer.alloc(width * height * 3);
  let seed = 1234567;
  for (let index = 0; index < pixels.length; index += 1) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    pixels[index] = seed % 256;
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

const near = (actual: number, expected: number, tolerance = 4) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);

test("a plain studio backdrop is trimmed away, leaving the box and its own edge colour", async () => {
  const result = await cropFrontArtwork(new Uint8Array(await plainBackdropFixture()));
  assert.equal(result.confidence, "high");
  near(result.width, 160);
  near(result.height, 100);
  assert.equal(result.edgeColor, "#c0392b");
  const decoded = await sharp(Buffer.from(result.bytes)).metadata();
  near(decoded.width ?? 0, 160);
});

test("a transparent cut-out counts as a plain backdrop", async () => {
  const result = await cropFrontArtwork(new Uint8Array(await transparentFixture()));
  assert.equal(result.confidence, "high");
  near(result.width, 100);
  near(result.height, 150);
});

test("a lifestyle scene is reported as low confidence and cropped to the front panel's shape", async () => {
  const result = await cropFrontArtwork(new Uint8Array(await lifestyleFixture()), { targetAspect: 0.5 });
  assert.equal(result.confidence, "low");
  assert.equal(result.edgeColor, undefined, "a scene's edge is the room, not the board");
  near(result.width / result.height, 0.5, 0.02);
});

test("downscaling leaves small sources untouched and shrinks large ones to webp", async () => {
  const small = new Uint8Array(await solid(50, 50, "#ffffff"));
  const kept = await downscaleVisualizationSource(small, "image/png");
  assert.equal(kept.bytes, small);
  assert.equal(kept.mimeType, "image/png");

  const large = new Uint8Array(await lifestyleFixture());
  const big = await sharp(Buffer.from(large)).resize(2400, 1800, { kernel: "nearest" }).png({ compressionLevel: 0 }).toBuffer();
  const shrunk = await downscaleVisualizationSource(new Uint8Array(big), "image/png");
  assert.equal(shrunk.mimeType, "image/webp");
  const decoded = await sharp(Buffer.from(shrunk.bytes)).metadata();
  assert.ok((decoded.width ?? 0) <= 1600 && (decoded.height ?? 0) <= 1600);
});
