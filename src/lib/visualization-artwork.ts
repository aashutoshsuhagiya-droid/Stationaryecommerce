/**
 * Server-only image work for packaging 3D previews (uses sharp).
 *
 * A packaging hero is often a lifestyle scene — a bathroom counter, a towel,
 * the box somewhere in it. Wrapping that whole scene onto a box makes a cube
 * of photo. This module finds the box's own front artwork where it can and
 * says honestly when it cannot.
 */

type ImageMime = "image/jpeg" | "image/png" | "image/webp";

interface Rgb { r: number; g: number; b: number }

/** Bytes above this are downscaled before upload; a texture needs no print resolution. */
export const VISUALIZATION_SOURCE_DOWNSCALE_BYTES = 500 * 1024;
export const VISUALIZATION_SOURCE_MAX_EDGE = 1600;

/** Border strips quieter than this (per-channel stdev) count as a plain backdrop. */
const UNIFORM_STDEV = 14;
/** Border strips whose mean colours differ by more than this are not one backdrop. */
const UNIFORM_SPREAD = 30;
const TRIM_THRESHOLD = 28;

async function loadSharp() {
  const { default: sharp } = await import("sharp");
  return sharp;
}

const toHex = ({ r, g, b }: Rgb) =>
  `#${[r, g, b].map((value) => Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, "0")).join("")}`;

const distance = (left: Rgb, right: Rgb) =>
  Math.sqrt((left.r - right.r) ** 2 + (left.g - right.g) ** 2 + (left.b - right.b) ** 2);

const average = (colors: readonly Rgb[]): Rgb => ({
  r: colors.reduce((sum, color) => sum + color.r, 0) / colors.length,
  g: colors.reduce((sum, color) => sum + color.g, 0) / colors.length,
  b: colors.reduce((sum, color) => sum + color.b, 0) / colors.length,
});

async function borderStats(input: Buffer, width: number, height: number) {
  const sharp = await loadSharp();
  const band = Math.max(2, Math.round(Math.min(width, height) * 0.04));
  const regions = [
    { left: 0, top: 0, width, height: band },
    { left: 0, top: height - band, width, height: band },
    { left: 0, top: 0, width: band, height },
    { left: width - band, top: 0, width: band, height },
  ];
  return Promise.all(regions.map(async (region) => {
    // stats() reads the input image, not the pipeline output, so the strip is
    // materialised first.
    const strip = await sharp(input).extract(region).png().toBuffer();
    const { channels } = await sharp(strip).stats();
    const [r, g, b] = channels;
    return {
      mean: { r: r.mean, g: g.mean, b: b.mean },
      stdev: Math.max(r.stdev, g.stdev, b.stdev),
    };
  }));
}

export interface FrontArtworkResult {
  bytes: Uint8Array;
  mimeType: ImageMime;
  width: number;
  height: number;
  /** "high": a plain backdrop was trimmed away, or the image is flat artwork already. */
  confidence: "high" | "low";
  /** Colour at the artwork's edge, for painting unprinted panels to match. */
  edgeColor?: string;
}

/**
 * Isolates a packaging photo's front artwork.
 *
 * 1. A plain or transparent backdrop is trimmed away, leaving the subject;
 *    confidence is high and the subject's own edge colour is reported.
 * 2. A busy backdrop (lifestyle scene) cannot be separated without guessing,
 *    so the most salient region in the front face's proportions is kept and
 *    confidence is reported as low, prompting the admin for flat artwork.
 */
export async function cropFrontArtwork(
  input: Uint8Array,
  options: { targetAspect?: number } = {},
): Promise<FrontArtworkResult> {
  const sharp = await loadSharp();
  const source = Buffer.from(input);
  const metadata = await sharp(source).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (!width || !height) throw new Error("The product photo has no readable dimensions.");

  // Transparent edges are a plain backdrop too: flatten them onto white first.
  const flat = metadata.hasAlpha
    ? await sharp(source).flatten({ background: "#ffffff" }).png().toBuffer()
    : await sharp(source).png().toBuffer();

  const strips = await borderStats(flat, width, height);
  const means = strips.map((strip) => strip.mean);
  const backdrop = average(means);
  const spread = Math.max(...means.map((mean) => distance(mean, backdrop)));
  const uniform = strips.every((strip) => strip.stdev < UNIFORM_STDEV) && spread < UNIFORM_SPREAD;

  if (uniform) {
    const { data, info } = await sharp(flat)
      .trim({ background: toHex(backdrop), threshold: TRIM_THRESHOLD })
      .png()
      .toBuffer({ resolveWithObject: true });
    const areaRatio = (info.width * info.height) / (width * height);
    if (areaRatio > 0.02) {
      const edge = await borderStats(data, info.width, info.height);
      return {
        bytes: new Uint8Array(data),
        mimeType: "image/png",
        width: info.width,
        height: info.height,
        confidence: "high",
        edgeColor: toHex(average(edge.map((strip) => strip.mean))),
      };
    }
  }

  // Busy backdrop: keep the most salient region shaped like the front panel.
  const aspect = options.targetAspect && Number.isFinite(options.targetAspect) && options.targetAspect > 0
    ? Math.min(4, Math.max(0.25, options.targetAspect))
    : width / height;
  const cropWidth = Math.max(1, Math.round(Math.min(width, height * aspect)));
  const cropHeight = Math.max(1, Math.round(cropWidth / aspect));
  const { data, info } = await sharp(flat)
    .resize({ width: cropWidth, height: Math.min(height, cropHeight), fit: "cover", position: sharp.strategy.attention })
    .png()
    .toBuffer({ resolveWithObject: true });
  return {
    bytes: new Uint8Array(data),
    mimeType: "image/png",
    width: info.width,
    height: info.height,
    confidence: "low",
  };
}

/** Edge colour of an image that is already flat artwork (no backdrop to trim). */
export async function artworkEdgeColor(input: Uint8Array): Promise<string | undefined> {
  const sharp = await loadSharp();
  const source = Buffer.from(input);
  const { width, height } = await sharp(source).metadata();
  if (!width || !height) return undefined;
  const flat = await sharp(source).flatten({ background: "#ffffff" }).png().toBuffer();
  const strips = await borderStats(flat, width, height);
  return toHex(average(strips.map((strip) => strip.mean)));
}

/**
 * Keeps a hero image small enough to insert inside the studio's short
 * interactive transaction. Returns the original bytes when already small.
 */
export async function downscaleVisualizationSource(
  bytes: Uint8Array,
  mimeType: ImageMime,
): Promise<{ bytes: Uint8Array; mimeType: ImageMime }> {
  if (bytes.byteLength <= VISUALIZATION_SOURCE_DOWNSCALE_BYTES) return { bytes, mimeType };
  const sharp = await loadSharp();
  const resized = await sharp(Buffer.from(bytes))
    .resize({
      width: VISUALIZATION_SOURCE_MAX_EDGE,
      height: VISUALIZATION_SOURCE_MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 85 })
    .toBuffer();
  return { bytes: new Uint8Array(resized), mimeType: "image/webp" };
}
