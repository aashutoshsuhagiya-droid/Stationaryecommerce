/**
 * Reads a Ranbazaar product's `customizeDetails` into a normalised 2D-studio
 * model: its design samples (mockup, text inputs, photo slots) and the
 * personalization fields those samples share.
 *
 * One parser feeds both the imported fields and the imported templates, so a
 * template's bound text layer always names a field that exists.
 *
 * Source geometry is raw pixels, top-left origin, inside the reference
 * editor's canvas: the mockup fitted into a 600 × 600 box and anchored
 * top-left, so a wide mockup gives a 600 × (600·h/w) canvas and a tall one a
 * (600·w/h) × 600 canvas (measured on the live site, see
 * docs/research/ranbazaar-2d-coordinate-model.md).
 */
import { studioFontForSource } from "../../src/lib/studio-fonts";
import { STUDIO_PRODUCTION_DPI, studioCanvasForImage, studioPxToMm, studioTemplateData } from "../../src/lib/studio-design";
import type { MockupSize } from "./mockup-sizes";

export const SOURCE_CANVAS_PX = 600;
export const STUDIO_FIELD_LIMIT = 20;
/** The longest limit the source itself uses; nothing longer fits its print areas. */
export const SOURCE_MAX_LENGTH_CAP = 45;
const FALLBACK_MAX_LENGTH = 32;

type UnknownRecord = Record<string, unknown>;

const record = (value: unknown): UnknownRecord =>
  value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};

const text = (value: unknown): string | null => {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
};

/** "424px", "200", 342 → 424 / 200 / 342; blank or junk → null. */
export function sourcePx(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = text(value);
  if (!raw) return null;
  const parsed = Number(raw.replace(/px$/iu, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function slugKey(value: string): string {
  const slug = value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return /^[a-z]/.test(slug) ? slug.slice(0, 76) : `field-${slug}`.slice(0, 76);
}

/**
 * A label a customer can read. Source inputs are often labelled with their own
 * placeholder ("ENTER YOUR NAME"); that text stays on the mockup as the
 * placeholder, and the form shows "Your name".
 */
export function readableFieldLabel(sourceName: string | null, fallback: string | null): string {
  const cleaned = (sourceName ?? "")
    .replace(/^\s*(?:enter|enetr|type|write)\s+/iu, "")
    .replace(/\s+/gu, " ")
    .trim();
  const base = cleaned || (fallback ?? "").trim();
  if (!base) return "Your text";
  const lower = base.toLowerCase();
  return (lower.charAt(0).toUpperCase() + lower.slice(1)).slice(0, 120);
}

export type SourceTextTransform = "none" | "uppercase" | "capitalize";

export interface StudioTextInput {
  fieldKey: string;
  x: number;
  y: number;
  width: number;
  /** Null when the source leaves height to the text (≈ 1.5 × font size). */
  height: number | null;
  placeholder: string;
  style: {
    sourceFont: string | null;
    fontSize: number;
    fontWeight: number;
    color: string;
    textAlign: "left" | "center" | "right";
    /**
     * What the reference storefront renders: always 0. Its editor stores a
     * rotation on a few inputs but draws every field with `rotate(0deg)`.
     */
    rotation: number;
    /** The stored source value, kept for the parity report. */
    sourceRotation: number;
    textTransform: SourceTextTransform;
    letterSpacing: number;
  };
}

export interface StudioPhotoSlot {
  fieldKey: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** The reference site's demo photo for the slot (never a customer's). */
  sampleImageUrl: string | null;
}

export interface StudioSample {
  /** Position in the source `customizeDetails` array. */
  index: number;
  name: string;
  mockupUrl: string;
  backgroundColor: string | null;
  texts: StudioTextInput[];
  photos: StudioPhotoSlot[];
}

export interface StudioField {
  key: string;
  label: string;
  inputType: "text" | "image";
  required: boolean;
  /** Text fields only: the tightest limit any sample needs, so a name fits every design. */
  maxLength: number | null;
  placeholder: string | null;
  sourceLabel: string | null;
  style: StudioTextInput["style"] | null;
}

export interface RanbazaarStudio {
  samples: StudioSample[];
  fields: StudioField[];
  /** Index into `samples` (not the source array) of the default design. */
  defaultSampleIndex: number;
  autoFit: boolean;
  /** Fields beyond the admin's 20-field cap (reported, not imported). */
  overflow: number;
}

// "lighter" is 400, not 300: the source's single-face fonts (e.g. "Aleo Regular") cannot render
// thinner than their one face, so the reference shows them at regular weight (measured on the
// shagun envelope). Our variable fonts would honour 300 and look visibly lighter.
const FONT_WEIGHTS: Record<string, number> = { normal: 400, bold: 700, bolder: 700, lighter: 400 };

function weightOf(value: unknown): number {
  const raw = text(value)?.toLowerCase();
  if (!raw) return 400;
  if (raw in FONT_WEIGHTS) return FONT_WEIGHTS[raw];
  const numeric = Number(raw);
  return Number.isFinite(numeric) && numeric >= 100 && numeric <= 900 ? numeric : 400;
}

function transformOf(value: unknown): SourceTextTransform {
  const raw = text(value)?.toLowerCase();
  return raw === "uppercase" || raw === "capitalize" ? raw : "none";
}

function alignOf(value: unknown): "left" | "center" | "right" {
  const raw = text(value)?.toLowerCase();
  return raw === "left" || raw === "right" ? raw : "center";
}

function colorOf(value: unknown): string {
  const raw = text(value);
  return raw && /^#[\da-f]{3,8}$/iu.test(raw) ? raw.toLowerCase() : "#111418";
}

function maxLengthOf(value: unknown): number {
  const parsed = sourcePx(value);
  if (!parsed || parsed < 1) return FALLBACK_MAX_LENGTH;
  return Math.min(SOURCE_MAX_LENGTH_CAP, Math.round(parsed));
}

/** Counts repeated keys inside one sample, so two "name" inputs stay two fields. */
function occurrenceKey(base: string, seen: Map<string, number>): string {
  const count = (seen.get(base) ?? 0) + 1;
  seen.set(base, count);
  return count === 1 ? base : `${base}-${count}`;
}

export function parseRanbazaarStudio(rawProduct: unknown): RanbazaarStudio {
  const product = record(rawProduct);
  const details = Array.isArray(product.customizeDetails) ? product.customizeDetails : [];
  const fields = new Map<string, StudioField>();
  const samples: StudioSample[] = [];
  let overflow = 0;

  const admit = (key: string, build: () => StudioField): boolean => {
    if (fields.has(key)) return true;
    if (fields.size >= STUDIO_FIELD_LIMIT) {
      overflow += 1;
      return false;
    }
    fields.set(key, build());
    return true;
  };

  details.forEach((rawDetail, index) => {
    const detail = record(rawDetail);
    const mockupUrl = text(detail.productImg);
    const seen = new Map<string, number>();
    const texts: StudioTextInput[] = [];
    const photos: StudioPhotoSlot[] = [];

    for (const rawInput of Array.isArray(detail.inputFields) ? detail.inputFields : []) {
      const input = record(rawInput);
      const name = text(input.name);
      const slug = text(input.slug);
      const sourceLabel = text(record(input.label).name);
      if (!name && !slug && !sourceLabel) continue;
      const key = occurrenceKey(slugKey(slug ?? name ?? sourceLabel ?? "text"), seen);
      const style = record(input.style);
      const fontSize = sourcePx(style.fontSize) ?? 24;
      const textStyle: StudioTextInput["style"] = {
        sourceFont: text(style.fontFamily),
        fontSize,
        fontWeight: weightOf(style.fontWeight),
        color: colorOf(style.color),
        textAlign: alignOf(style.textAlignment),
        rotation: 0,
        sourceRotation: sourcePx(style.rotation) ?? 0,
        textTransform: transformOf(style.textType),
        letterSpacing: sourcePx(style.letterSpacing) ?? 0,
      };
      const placeholder = text(input.value) ?? name ?? sourceLabel ?? "Your text";
      const maxLength = maxLengthOf(input.maxLength);
      const required = input.required !== false;
      const kept = admit(key, () => ({
        key,
        label: readableFieldLabel(name, sourceLabel),
        inputType: "text",
        required,
        maxLength,
        placeholder,
        sourceLabel: name,
        style: textStyle,
      }));
      if (!kept) continue;
      const shared = fields.get(key)!;
      shared.required ||= required;
      shared.maxLength = Math.min(shared.maxLength ?? maxLength, maxLength);
      texts.push({
        fieldKey: key,
        x: sourcePx(input.x) ?? 0,
        y: sourcePx(input.y) ?? 0,
        width: sourcePx(input.width) ?? SOURCE_CANVAS_PX,
        height: sourcePx(input.height),
        placeholder,
        style: textStyle,
      });
    }

    for (const rawSlot of Array.isArray(detail.customerImg) ? detail.customerImg : []) {
      const slot = record(rawSlot);
      const width = sourcePx(slot.width);
      const height = sourcePx(slot.height);
      if (!width || !height) continue;
      const key = occurrenceKey("photo", seen);
      const ordinal = key === "photo" ? "" : ` ${key.split("-").pop()}`;
      const kept = admit(key, () => ({
        key,
        label: `Your photo${ordinal}`,
        inputType: "image",
        required: true,
        maxLength: null,
        placeholder: null,
        sourceLabel: text(slot.name),
        style: null,
      }));
      if (!kept) continue;
      photos.push({
        fieldKey: key,
        x: sourcePx(slot.x) ?? 0,
        y: sourcePx(slot.y) ?? 0,
        width,
        height,
        sampleImageUrl: text(slot.imageUrl),
      });
    }

    // A sample with no mockup is a gallery photo, not an editable design.
    if (!mockupUrl) return;
    samples.push({
      index,
      name: text(detail.name) ?? `Design ${samples.length + 1}`,
      mockupUrl,
      backgroundColor: text(detail.productbgColor),
      texts,
      photos,
    });
  });

  const sourceDefault = typeof product.defaultSample === "number" ? product.defaultSample : 0;
  const defaultPosition = samples.findIndex((sample) => sample.index === sourceDefault);
  return {
    samples,
    fields: [...fields.values()],
    defaultSampleIndex: defaultPosition >= 0 ? defaultPosition : 0,
    autoFit: record(product.categories).autoFontSize === true,
    overflow,
  };
}

// The canvas, DPI and template shape are shared with the admin design editor (src/lib/studio-design.ts).
export { STUDIO_PRODUCTION_DPI, studioPxToMm };

/**
 * The reference canvas for a mockup: the image fitted into 600 × 600, anchored
 * top-left. Unknown size → the full square (the reference's own box).
 */
export function studioCanvasForMockup(size: MockupSize | null | undefined): { width: number; height: number } {
  return studioCanvasForImage(size);
}

export interface StudioTemplateRecord {
  slug: string;
  name: string;
  thumbnailUrl: string;
  previewConfig: Record<string, unknown>;
  productionConfig: Record<string, unknown>;
  productionWidthPx: number;
  productionHeightPx: number;
  productionDpi: number;
  sortOrder: number;
  isDefault: boolean;
}

/**
 * One design sample as a PersonalizationTemplate. The `studio` block is the
 * layout the storefront draws; the flat keys around it are the legacy preview
 * contract every template must satisfy to be listed at all.
 */
export function studioTemplateRecord(input: {
  externalId: string;
  studio: RanbazaarStudio;
  position: number;
  includePhotos: boolean;
  /** The mockup's natural size; decides the canvas aspect (see studioCanvasForMockup). */
  mockupSize?: MockupSize | null;
}): StudioTemplateRecord {
  const sample = input.studio.samples[input.position];
  const canvas = studioCanvasForMockup(input.mockupSize);
  const studio = {
    version: 1,
    canvas,
    background: { url: sample.mockupUrl, color: sample.backgroundColor },
    texts: sample.texts.map((layer) => ({
      fieldKey: layer.fieldKey,
      x: layer.x,
      y: layer.y,
      width: layer.width,
      height: layer.height,
      placeholder: layer.placeholder,
      fontId: studioFontForSource(layer.style.sourceFont),
      sourceFont: layer.style.sourceFont,
      fontSize: layer.style.fontSize,
      fontWeight: layer.style.fontWeight,
      color: layer.style.color,
      textAlign: layer.style.textAlign,
      rotation: layer.style.rotation,
      textTransform: layer.style.textTransform,
      letterSpacing: layer.style.letterSpacing,
      autoFit: input.studio.autoFit,
    })),
    photos: input.includePhotos
      ? sample.photos.map((slot) => ({
          fieldKey: slot.fieldKey,
          x: slot.x,
          y: slot.y,
          width: slot.width,
          height: slot.height,
          shape: "rect",
          stacking: "under",
          // The reference shows its demo photo in the empty slot until the customer uploads.
          ...(slot.sampleImageUrl?.startsWith("https://") ? { sampleUrl: slot.sampleImageUrl } : {}),
        }))
      : [],
  };
  return {
    slug: `rb-${input.externalId}-s${sample.index}`.slice(0, 160),
    name: `Design ${input.position + 1}`,
    ...studioTemplateData({ ...studio, version: 1 }),
    sortOrder: input.position,
    isDefault: input.position === input.studio.defaultSampleIndex,
  };
}
