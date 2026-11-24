/**
 * Browser rendering for 2D studio designs (mockup + bound text).
 *
 * The editor (SVG) and the canvas paths (downloaded proof, production render)
 * all lay text out with `layoutStudioText` and measure it here with the same
 * canvas font, so what the customer sees is what gets exported.
 */
import { layoutStudioText, type StudioConfig, type StudioPhotoLayer, type StudioTextLayer } from "../../lib/studio-template";
import { photoContainRect, photoPivot, type StudioPhotoTransform } from "../../lib/studio-photo";
import { studioFontStack } from "../../lib/studio-fonts";

function resolveCssVariable(name: string): string {
  if (typeof window === "undefined") return "";
  return window.getComputedStyle(window.document.documentElement).getPropertyValue(name);
}

/** The CSS font-family for a studio font id, with the next/font family resolved. */
export function studioFontFamily(fontId: string): string {
  return studioFontStack(fontId, resolveCssVariable);
}

export function studioCanvasFont(layer: StudioTextLayer, fontSize: number): string {
  return `${layer.fontWeight} ${fontSize}px ${studioFontFamily(layer.fontId)}`;
}

let measureContext: CanvasRenderingContext2D | null = null;

/** Canvas text width at a size, letter spacing included. Falls back to an estimate off-DOM. */
export function measureStudioText(text: string, fontSize: number, layer: StudioTextLayer): number {
  const spacing = Math.max(0, text.length - 1) * layer.letterSpacing;
  if (typeof window === "undefined") return text.length * fontSize * 0.58 + spacing;
  measureContext ??= window.document.createElement("canvas").getContext("2d");
  if (!measureContext) return text.length * fontSize * 0.58 + spacing;
  measureContext.font = studioCanvasFont(layer, fontSize);
  return measureContext.measureText(text).width + spacing;
}

/**
 * Waits for every font a design uses, so the first frame is never drawn (or
 * measured) in a fallback face. Resolves even if a font fails to load.
 */
export async function ensureStudioFonts(config: StudioConfig): Promise<void> {
  if (typeof window === "undefined" || !("fonts" in window.document)) return;
  const requests = new Set(config.texts.map((layer) => `${layer.fontWeight} ${layer.fontSize}px ${studioFontFamily(layer.fontId)}`));
  await Promise.all([...requests].map((font) => window.document.fonts.load(font).catch(() => [])));
}

const imageCache = new Map<string, Promise<HTMLImageElement>>();

/**
 * Same-origin URL for drawing a remote mockup onto a canvas. The source CDN
 * sends no CORS headers, so a direct draw would taint the canvas and block the
 * PNG export; Next's image optimizer proxies only hosts allowlisted in
 * next.config, which is exactly the set our catalogue images come from.
 */
export function canvasSafeImageUrl(url: string): string {
  // Same-origin sources never taint the canvas; blob: is a photo picked in this tab (admin listing preview).
  if (url.startsWith("/") || url.startsWith("data:image/") || url.startsWith("blob:")) return url;
  return `/_next/image?url=${encodeURIComponent(url)}&w=1200&q=75`;
}

export function loadStudioImage(url: string): Promise<HTMLImageElement> {
  const source = canvasSafeImageUrl(url);
  let pending = imageCache.get(source);
  if (!pending) {
    pending = new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => resolve(image);
      image.onerror = () => {
        imageCache.delete(source);
        reject(new Error("The product mockup could not be loaded."));
      };
      image.src = source;
    });
    imageCache.set(source, pending);
  }
  return pending;
}

/** Contain-fit of the mockup inside the canvas, as the reference editor draws it. */
export function containRect(imageWidth: number, imageHeight: number, width: number, height: number) {
  const scale = Math.min(width / imageWidth, height / imageHeight);
  const drawWidth = imageWidth * scale;
  const drawHeight = imageHeight * scale;
  return { x: (width - drawWidth) / 2, y: (height - drawHeight) / 2, width: drawWidth, height: drawHeight };
}

function drawText(ctx: CanvasRenderingContext2D, layer: StudioTextLayer, value: string | undefined) {
  const layout = layoutStudioText(layer, value, measureStudioText);
  ctx.save();
  ctx.translate(layout.pivot.x, layout.pivot.y);
  if (layer.rotation) ctx.rotate((layer.rotation * Math.PI) / 180);
  ctx.translate(-layer.width / 2, -layout.boxHeight / 2);
  ctx.font = studioCanvasFont(layer, layout.fontSize);
  ctx.fillStyle = layer.color;
  ctx.textAlign = layer.textAlign;
  ctx.textBaseline = "middle";
  if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${layer.letterSpacing}px`;
  layout.lines.forEach((line, index) => ctx.fillText(line, layout.anchorX, layout.lineCenters[index]));
  ctx.restore();
}

/** A customer photo in a studio slot: the image and how the customer adjusted it. */
export interface StudioPhotoValue {
  src: string;
  transform: StudioPhotoTransform;
}

/** Clipped to its slot, contain-fitted, moved, then rotated and scaled about its centre (as the reference draws it). */
function drawPhoto(ctx: CanvasRenderingContext2D, slot: StudioPhotoLayer, image: HTMLImageElement, transform: StudioPhotoTransform) {
  const pivot = photoPivot(slot, transform);
  const rect = photoContainRect({ x: -slot.width / 2, y: -slot.height / 2, width: slot.width, height: slot.height }, image.naturalWidth, image.naturalHeight);
  ctx.save();
  ctx.beginPath();
  if (slot.shape === "circle") ctx.ellipse(slot.x + slot.width / 2, slot.y + slot.height / 2, slot.width / 2, slot.height / 2, 0, 0, Math.PI * 2);
  else ctx.rect(slot.x, slot.y, slot.width, slot.height);
  ctx.clip();
  ctx.translate(pivot.x, pivot.y);
  if (transform.rotation) ctx.rotate((transform.rotation * Math.PI) / 180);
  ctx.scale(transform.scale, transform.scale);
  ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
  ctx.restore();
}

async function drawPhotos(
  ctx: CanvasRenderingContext2D,
  slots: StudioPhotoLayer[],
  photos: Readonly<Record<string, StudioPhotoValue>>,
) {
  for (const slot of slots) {
    const photo = photos[slot.fieldKey];
    if (!photo) continue;
    try {
      drawPhoto(ctx, slot, await loadStudioImage(photo.src), photo.transform);
    } catch {
      // An unreadable photo is skipped; the rest of the proof still renders.
    }
  }
}

/**
 * Draws a studio design in its own canvas coordinates (callers scale the
 * context first): background colour, photos under the mockup, the
 * contain-fitted mockup, photos over it, then bound text.
 */
export async function drawStudioDesign(
  ctx: CanvasRenderingContext2D,
  config: StudioConfig,
  values: Readonly<Record<string, string>>,
  photos: Readonly<Record<string, StudioPhotoValue>> = {},
): Promise<void> {
  await ensureStudioFonts(config);
  const { width, height } = config.canvas;
  ctx.fillStyle = config.background.color ?? "#ffffff";
  ctx.fillRect(0, 0, width, height);
  await drawPhotos(ctx, config.photos.filter((slot) => slot.stacking === "under"), photos);
  try {
    const image = await loadStudioImage(config.background.url);
    const rect = containRect(image.naturalWidth, image.naturalHeight, width, height);
    ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
  } catch {
    // A missing mockup still yields a usable proof of the personalised text.
  }
  await drawPhotos(ctx, config.photos.filter((slot) => slot.stacking === "over"), photos);
  for (const layer of config.texts) drawText(ctx, layer, values[layer.fieldKey]);
}
