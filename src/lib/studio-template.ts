/**
 * A 2D studio design: a product mockup with personalization text (and photo
 * slots) placed exactly on it, as stored in `PersonalizationTemplate.previewConfig.studio`.
 *
 * The template owns the layout; the customer owns the field values. Rendering
 * composes the two, so the editor preview, the downloaded proof and the
 * production render all draw the same thing from the same inputs — and an
 * order (template id + field values) is enough to reproduce the design.
 *
 * Geometry is in canvas pixels, top-left origin. The canvas is the mockup
 * fitted into 600 × 600 and anchored top-left, as in Ranbazaar's reference
 * editor (e.g. 600 × 386 for a wide mockup, 422 × 600 for a tall one).
 */
import { isStudioFontId, studioFontGlyphScale, studioFontGlyphShift, type StudioFontId } from "./studio-fonts";

export type StudioTextTransform = "none" | "uppercase" | "capitalize";

export interface StudioTextLayer {
  fieldKey: string;
  x: number;
  y: number;
  width: number;
  /** Null: height follows the text (line height × lines). */
  height: number | null;
  placeholder: string;
  fontId: StudioFontId;
  /** The source site's font name (audit only; drawing uses fontId). */
  sourceFont?: string | null;
  fontSize: number;
  fontWeight: number;
  color: string;
  textAlign: "left" | "center" | "right";
  rotation: number;
  textTransform: StudioTextTransform;
  letterSpacing: number;
  /** Shrink to fit the box width instead of wrapping onto more lines. */
  autoFit: boolean;
}

export interface StudioPhotoLayer {
  fieldKey: string;
  x: number;
  y: number;
  width: number;
  height: number;
  shape: "rect" | "circle";
  /** "under": the mockup frames the photo; "over": drawn on top, clipped to the slot. */
  stacking: "under" | "over";
  /** Customer-facing name ("Your photo" by default). */
  label?: string;
  /** False: the customer may leave the slot empty. Default true. */
  required?: boolean;
  /** Demo photo shown in the empty slot (preview only; never exported or ordered). */
  sampleUrl?: string;
}

export interface StudioConfig {
  version: 1;
  canvas: { width: number; height: number };
  background: { url: string; color: string | null };
  texts: StudioTextLayer[];
  photos: StudioPhotoLayer[];
}

/** CSS-like line box: the reference renders 24 px text in a 36 px line. */
export const STUDIO_LINE_HEIGHT = 1.5;
const MIN_FIT_FONT_SIZE = 6;

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const safeUrl = (value: unknown): string | undefined => {
  if (typeof value !== "string" || !value.trim()) return undefined;
  if (/^\/api\/product-images\/[A-Za-z0-9_-]{1,100}$/u.test(value)) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : undefined;
  } catch {
    return undefined;
  }
};
const hex = (value: unknown, fallback: string) =>
  typeof value === "string" && /^#[\da-f]{3,8}$/iu.test(value) ? value : fallback;

function readText(raw: unknown): StudioTextLayer | null {
  const layer = object(raw);
  if (typeof layer.fieldKey !== "string" || !/^[a-z][a-z0-9-]{0,79}$/u.test(layer.fieldKey)) return null;
  if (!finite(layer.x) || !finite(layer.y) || !finite(layer.width) || layer.width <= 0) return null;
  return {
    fieldKey: layer.fieldKey,
    x: layer.x,
    y: layer.y,
    width: layer.width,
    height: finite(layer.height) && layer.height > 0 ? layer.height : null,
    placeholder: typeof layer.placeholder === "string" ? layer.placeholder.slice(0, 120) : "",
    fontId: isStudioFontId(layer.fontId) ? layer.fontId : "montserrat",
    ...(typeof layer.sourceFont === "string" && layer.sourceFont.trim() ? { sourceFont: layer.sourceFont.trim().slice(0, 80) } : {}),
    fontSize: finite(layer.fontSize) && layer.fontSize > 0 && layer.fontSize <= 400 ? layer.fontSize : 24,
    fontWeight: finite(layer.fontWeight) && layer.fontWeight >= 100 && layer.fontWeight <= 900 ? layer.fontWeight : 400,
    color: hex(layer.color, "#111418"),
    textAlign: layer.textAlign === "left" || layer.textAlign === "right" ? layer.textAlign : "center",
    rotation: finite(layer.rotation) ? layer.rotation : 0,
    textTransform: layer.textTransform === "uppercase" || layer.textTransform === "capitalize" ? layer.textTransform : "none",
    letterSpacing: finite(layer.letterSpacing) ? layer.letterSpacing : 0,
    autoFit: layer.autoFit === true,
  };
}

function readPhoto(raw: unknown): StudioPhotoLayer | null {
  const layer = object(raw);
  if (typeof layer.fieldKey !== "string" || !/^[a-z][a-z0-9-]{0,79}$/u.test(layer.fieldKey)) return null;
  if (!finite(layer.x) || !finite(layer.y) || !finite(layer.width) || !finite(layer.height)) return null;
  if (layer.width <= 0 || layer.height <= 0) return null;
  const sampleUrl = safeUrl(layer.sampleUrl);
  return {
    fieldKey: layer.fieldKey,
    x: layer.x,
    y: layer.y,
    width: layer.width,
    height: layer.height,
    shape: layer.shape === "circle" ? "circle" : "rect",
    stacking: layer.stacking === "over" ? "over" : "under",
    ...(sampleUrl ? { sampleUrl } : {}),
    ...(typeof layer.label === "string" && layer.label.trim() ? { label: layer.label.trim().slice(0, 60) } : {}),
    ...(layer.required === false ? { required: false } : {}),
  };
}

/** Reads `previewConfig.studio`; anything malformed yields undefined, never a broken canvas. */
export function readStudioConfig(previewConfig: unknown): StudioConfig | undefined {
  const studio = object(object(previewConfig).studio);
  if (studio.version !== 1) return undefined;
  const canvas = object(studio.canvas);
  const background = object(studio.background);
  const url = safeUrl(background.url);
  if (!finite(canvas.width) || !finite(canvas.height) || canvas.width <= 0 || canvas.height <= 0 || !url) return undefined;
  const texts = (Array.isArray(studio.texts) ? studio.texts : []).map(readText).filter((layer): layer is StudioTextLayer => Boolean(layer));
  const photos = (Array.isArray(studio.photos) ? studio.photos : []).map(readPhoto).filter((layer): layer is StudioPhotoLayer => Boolean(layer));
  return {
    version: 1,
    canvas: { width: canvas.width, height: canvas.height },
    background: { url, color: typeof background.color === "string" ? hex(background.color, "#ffffff") : null },
    texts,
    photos,
  };
}

/** CSS text-transform semantics: capitalize raises each word's first letter and leaves the rest. */
export function applyTextTransform(value: string, transform: StudioTextTransform): string {
  if (transform === "uppercase") return value.toLocaleUpperCase("en-IN");
  if (transform === "capitalize") return value.replace(/(^|\s)(\S)/gu, (_match, space: string, letter: string) => space + letter.toLocaleUpperCase("en-IN"));
  return value;
}

/** Width of a string at a font size, letter spacing included (injected so tests need no canvas). */
export type MeasureText = (text: string, fontSize: number, layer: StudioTextLayer) => number;

export interface StudioTextLayout {
  /** What is drawn: the customer's value, or the placeholder while empty. */
  text: string;
  isPlaceholder: boolean;
  /** The size glyphs are drawn at (source size × the font's glyph scale, after auto-fit). */
  fontSize: number;
  lines: string[];
  lineHeight: number;
  boxHeight: number;
  /** Horizontal anchor of every line, relative to the box's left edge. */
  anchorX: number;
  /** Vertical centre of each line, relative to the box's top edge. */
  lineCenters: number[];
  /** Rotation pivot (box centre) in canvas pixels. */
  pivot: { x: number; y: number };
}

function wrapWords(text: string, maxWidth: number, measure: (value: string) => number): string[] {
  const words = text.split(/\s+/u).filter(Boolean);
  if (!words.length) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (!current || measure(candidate) <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  return lines;
}

export function layoutStudioText(layer: StudioTextLayer, value: string | undefined, measure: MeasureText): StudioTextLayout {
  const typed = (value ?? "").trim();
  const isPlaceholder = !typed;
  const text = applyTextTransform(isPlaceholder ? layer.placeholder : typed, layer.textTransform);

  // Line metrics follow the source size; glyphs are drawn (and measured) at the scaled size.
  const glyphScale = studioFontGlyphScale(layer.fontId);
  let fontSize = layer.fontSize;
  let lines: string[];
  if (layer.autoFit) {
    const width = measure(text, fontSize * glyphScale, layer);
    if (width > layer.width && width > 0) fontSize = Math.max(MIN_FIT_FONT_SIZE, fontSize * (layer.width / width));
    lines = [text];
  } else {
    lines = wrapWords(text, layer.width, (candidate) => measure(candidate, fontSize * glyphScale, layer));
  }

  const lineHeight = fontSize * STUDIO_LINE_HEIGHT;
  const drawnSize = fontSize * glyphScale;
  const glyphShift = studioFontGlyphShift(layer.fontId) * drawnSize;
  const boxHeight = layer.height ?? lineHeight * lines.length;
  const anchorX = layer.textAlign === "left" ? 0 : layer.textAlign === "right" ? layer.width : layer.width / 2;
  return {
    text,
    isPlaceholder,
    fontSize: drawnSize,
    lines,
    lineHeight,
    boxHeight,
    anchorX,
    lineCenters: lines.map((_line, index) => (index + 0.5) * lineHeight + glyphShift),
    pivot: { x: layer.x + layer.width / 2, y: layer.y + boxHeight / 2 },
  };
}
