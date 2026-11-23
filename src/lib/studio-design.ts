/**
 * A product's 2D designs as the admin edits them, and the stored template
 * shape shared with the Ranbazaar importer.
 *
 * A design is one `PersonalizationTemplate` whose `previewConfig.studio` (see
 * studio-template.ts) places customer text and photo slots on a mockup. Text
 * layers bind to the product's text personalization fields by key, so one
 * field ("Your name") can appear on several designs and keeps its value when
 * the customer switches designs.
 */
import { z } from "zod";

import { isStudioFontId } from "./studio-fonts";
import { STUDIO_LINE_HEIGHT, type StudioConfig, type StudioPhotoLayer, type StudioTextLayer } from "./studio-template";

/** Every design canvas is its mockup fitted into this square, anchored top-left (as on the reference site). */
export const STUDIO_CANVAS_PX = 600;
/** The canvas rendered at print resolution. */
export const STUDIO_PRODUCTION_DPI = 300;
export const STUDIO_MAX_DESIGNS = 12;
export const STUDIO_MAX_TEXTS = 20;
export const STUDIO_MAX_PHOTOS = 10;
export const STUDIO_MAX_FIELDS = 20;

/** Pixels at the production DPI → millimetres, one decimal. */
export const studioPxToMm = (px: number): number => Math.round((px / STUDIO_PRODUCTION_DPI) * 25.4 * 10) / 10;

/** The canvas for a mockup: the image fitted into 600 × 600. Unknown size → the full square. */
export function studioCanvasForImage(size: { width: number; height: number } | null | undefined): { width: number; height: number } {
  if (!size || !(size.width > 0) || !(size.height > 0)) return { width: STUDIO_CANVAS_PX, height: STUDIO_CANVAS_PX };
  const scale = Math.min(STUDIO_CANVAS_PX / size.width, STUDIO_CANVAS_PX / size.height);
  return {
    width: Math.max(1, Math.min(STUDIO_CANVAS_PX, Math.round(size.width * scale))),
    height: Math.max(1, Math.min(STUDIO_CANVAS_PX, Math.round(size.height * scale))),
  };
}

/**
 * Upload settings a product with photo slots needs, in the stored configurator
 * format (the keys the admin product form saves and the runtime catalog reads).
 */
export const STUDIO_PHOTO_UPLOAD = {
  artworkUpload: true,
  acceptedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  maximumArtworkBytes: 10 * 1024 * 1024,
};

/**
 * Set on `Product.metadata` when an admin saves the product's designs. The
 * importer and backfill then leave that product's designs and their fields
 * alone (unless forced), so a re-import never silently undoes admin work.
 */
export const STUDIO_EDITED_AT_KEY = "studioEditedAt";
export function studioEditedInAdmin(metadata: unknown): boolean {
  return Boolean(metadata && typeof metadata === "object" && typeof (metadata as Record<string, unknown>)[STUDIO_EDITED_AT_KEY] === "string");
}

/** Imported designs are "rb-…", admin-made ones "st-…"; neither belongs in the reusable theme library. */
export const STUDIO_TEMPLATE_SLUG_PREFIXES = ["rb-", "st-"] as const;
export const isStudioTemplateSlug = (slug: string) => STUDIO_TEMPLATE_SLUG_PREFIXES.some((prefix) => slug.startsWith(prefix));
export const adminStudioTemplateSlug = (productId: string, suffix: string) => `st-${productId}-${suffix}`.slice(0, 160);

/** The `studio` block as stored (importer output carries a few audit-only extras). */
export interface StudioJson {
  version: 1;
  canvas: { width: number; height: number };
  background: { url: string; color: string | null };
  texts: ReadonlyArray<{ placeholder?: string | null; color?: string; textAlign?: string }>;
  photos: ReadonlyArray<unknown>;
}

/**
 * The template columns for a studio design. The flat preview keys around the
 * `studio` block are the legacy contract every template must satisfy to be
 * listed at all; production renders the same canvas at 300 DPI.
 */
export function studioTemplateData(studio: StudioJson) {
  const firstText = studio.texts[0];
  const surface = {
    id: "primary",
    label: "Design",
    baseImageUrl: studio.background.url,
    widthPx: studio.canvas.width,
    heightPx: studio.canvas.height,
    dpi: STUDIO_PRODUCTION_DPI,
  };
  const color = studio.background.color;
  return {
    thumbnailUrl: studio.background.url,
    previewConfig: {
      schemaVersion: 1,
      defaultSurfaceId: "primary",
      background: color && /^#[\da-f]{3,8}$/iu.test(color) ? color : "#ffffff",
      foreground: firstText?.color ?? "#111418",
      accent: "#e5e7eb",
      fontFamily: "Montserrat",
      textAlign: firstText?.textAlign ?? "center",
      safeArea: { x: 0, y: 0, width: 100, height: 100 },
      sampleText: firstText?.placeholder ?? "",
      baseImageUrl: studio.background.url,
      surfaces: [surface],
      studio,
    },
    productionConfig: {
      schemaVersion: 1,
      renderer: "studio-v1",
      defaultSurfaceId: "primary",
      surfaces: [surface],
      studio,
    },
    productionWidthPx: studio.canvas.width,
    productionHeightPx: studio.canvas.height,
    productionDpi: STUDIO_PRODUCTION_DPI,
  };
}

// ---- the admin save payload ------------------------------------------------------------------

const keySchema = z.string().regex(/^[a-z][a-z0-9-]{0,79}$/u, "Use lowercase letters, numbers and hyphens, starting with a letter.");
const hexSchema = z.string().regex(/^#[\da-f]{3,8}$/iu, "Use a hex colour such as #111418.");
const coordinate = z.number().finite().min(-2_000).max(2_000);

/** Uploaded product images or https images (mockups and demo photos). */
export function isStudioImageUrl(value: string): boolean {
  if (/^\/api\/product-images\/[A-Za-z0-9_-]{1,100}$/u.test(value)) return true;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
const imageUrlSchema = z.string().trim().max(2_000).refine(isStudioImageUrl, "Use an uploaded image or an https image URL.");

export const studioTextLayerSchema = z.object({
  fieldKey: keySchema,
  x: coordinate,
  y: coordinate,
  width: z.number().finite().min(4).max(2_000),
  height: z.number().finite().min(1).max(2_000).nullable(),
  placeholder: z.string().max(120),
  fontId: z.string().refine(isStudioFontId, "Choose one of the studio fonts."),
  sourceFont: z.string().max(80).nullable().optional(),
  fontSize: z.number().finite().min(4).max(400),
  fontWeight: z.number().int().min(100).max(900),
  color: hexSchema,
  textAlign: z.enum(["left", "center", "right"]),
  rotation: z.number().finite().min(-360).max(360),
  textTransform: z.enum(["none", "uppercase", "capitalize"]),
  letterSpacing: z.number().finite().min(-50).max(200),
  autoFit: z.boolean(),
}).strict();

export const studioPhotoSlotSchema = z.object({
  fieldKey: keySchema,
  x: coordinate,
  y: coordinate,
  width: z.number().finite().min(8).max(2_000),
  height: z.number().finite().min(8).max(2_000),
  shape: z.enum(["rect", "circle"]),
  stacking: z.enum(["under", "over"]),
  sampleUrl: imageUrlSchema.optional(),
  label: z.string().trim().max(60).optional(),
  required: z.boolean().optional(),
}).strict();

const studioConfigSchema = z.object({
  version: z.literal(1),
  canvas: z.object({ width: z.number().int().min(16).max(STUDIO_CANVAS_PX), height: z.number().int().min(16).max(STUDIO_CANVAS_PX) }).strict(),
  background: z.object({ url: imageUrlSchema, color: hexSchema.nullable() }).strict(),
  texts: z.array(studioTextLayerSchema).max(STUDIO_MAX_TEXTS),
  photos: z.array(studioPhotoSlotSchema).max(STUDIO_MAX_PHOTOS),
}).strict();

export const studioDesignInputSchema = z.object({
  templateId: z.string().trim().min(1).max(100).optional(),
  name: z.string().trim().min(1).max(80),
  isDefault: z.boolean(),
  studio: studioConfigSchema,
}).strict();

export const studioFieldInputSchema = z.object({
  key: keySchema,
  label: z.string().trim().min(1).max(120),
  required: z.boolean(),
  // The product form allows up to 500 characters on a text field.
  maxLength: z.number().int().min(1).max(500).nullable(),
  placeholder: z.string().trim().max(240),
}).strict();

export type StudioDesignInput = z.infer<typeof studioDesignInputSchema>;
export type StudioFieldInput = z.infer<typeof studioFieldInputSchema>;

/** One line of text at the layer's size: the box the storefront centres on. */
export const studioTextBoxHeight = (layer: Pick<StudioTextLayer, "height" | "fontSize">) => layer.height ?? layer.fontSize * STUDIO_LINE_HEIGHT;

export const studioSaveSchema = z.object({
  productId: z.string().trim().regex(/^[A-Za-z0-9_-]{1,100}$/u),
  designs: z.array(studioDesignInputSchema).max(STUDIO_MAX_DESIGNS),
  fields: z.array(studioFieldInputSchema).max(STUDIO_MAX_FIELDS),
}).strict().superRefine((value, context) => {
  const fieldKeys = new Set<string>();
  value.fields.forEach((field, index) => {
    if (fieldKeys.has(field.key)) context.addIssue({ code: "custom", path: ["fields", index, "key"], message: `Two fields use the key "${field.key}".` });
    fieldKeys.add(field.key);
  });
  const used = new Set<string>();
  const templateIds = new Set<string>();
  let defaults = 0;
  value.designs.forEach((design, designIndex) => {
    const where = `"${design.name}"`;
    if (design.isDefault) defaults += 1;
    if (design.templateId) {
      if (templateIds.has(design.templateId)) context.addIssue({ code: "custom", path: ["designs", designIndex, "templateId"], message: `${where} is listed twice.` });
      templateIds.add(design.templateId);
    }
    // A design with nothing to fill in is allowed: the reference shows such samples in its design picker.
    const { canvas, texts, photos } = design.studio;
    texts.forEach((layer, index) => {
      used.add(layer.fieldKey);
      if (!fieldKeys.has(layer.fieldKey)) {
        context.addIssue({ code: "custom", path: ["designs", designIndex, "studio", "texts", index, "fieldKey"], message: `Text on ${where} uses a field that does not exist ("${layer.fieldKey}").` });
      }
      const centreX = layer.x + layer.width / 2;
      const centreY = layer.y + studioTextBoxHeight(layer) / 2;
      if (centreX < 0 || centreX > canvas.width || centreY < 0 || centreY > canvas.height) {
        context.addIssue({ code: "custom", path: ["designs", designIndex, "studio", "texts", index], message: `Text "${layer.placeholder || layer.fieldKey}" on ${where} is outside the design. Move it back onto the canvas.` });
      }
    });
    const photoKeys = new Set<string>();
    photos.forEach((slot, index) => {
      if (photoKeys.has(slot.fieldKey)) context.addIssue({ code: "custom", path: ["designs", designIndex, "studio", "photos", index, "fieldKey"], message: `Two photo slots on ${where} share the key "${slot.fieldKey}".` });
      photoKeys.add(slot.fieldKey);
      if (slot.x >= canvas.width || slot.y >= canvas.height || slot.x + slot.width <= 0 || slot.y + slot.height <= 0) {
        context.addIssue({ code: "custom", path: ["designs", designIndex, "studio", "photos", index], message: `A photo slot on ${where} is outside the design. Move it back onto the canvas.` });
      }
    });
  });
  if (defaults > 1) context.addIssue({ code: "custom", path: ["designs"], message: "Choose one design to show first." });
  value.fields.forEach((field, index) => {
    if (!used.has(field.key)) context.addIssue({ code: "custom", path: ["fields", index, "key"], message: `"${field.label}" is not shown on any design. Add it to a design or remove it.` });
  });
});

export type StudioSaveInput = z.infer<typeof studioSaveSchema>;

/** Exactly one design is shown first (the first one when none is chosen). */
export function withOneDefaultDesign<T extends { isDefault: boolean }>(designs: readonly T[]): T[] {
  const chosen = designs.findIndex((design) => design.isDefault);
  return designs.map((design, index) => ({ ...design, isDefault: index === (chosen >= 0 ? chosen : 0) }));
}

/** Field keys the designs' text layers show. */
export function boundFieldKeys(designs: ReadonlyArray<{ studio: { texts: ReadonlyArray<{ fieldKey: string }> } }>): string[] {
  return [...new Set(designs.flatMap((design) => design.studio.texts.map((layer) => layer.fieldKey)))];
}

/**
 * How a save changes the product's personalization fields. Only fields the
 * designs bind are managed here: a field no design shows any more is deleted
 * if a design used to show it, and fields the admin made elsewhere (dropdowns,
 * notes) are never touched. A key that already belongs to a non-text field is a
 * conflict, not an overwrite.
 */
export function planStudioFields(input: {
  existing: ReadonlyArray<{ key: string; inputType: string }>;
  previouslyBound: Iterable<string>;
  fields: readonly StudioFieldInput[];
}) {
  const existing = new Map(input.existing.map((field) => [field.key, field.inputType]));
  const wanted = new Set(input.fields.map((field) => field.key));
  return {
    upserts: [...input.fields],
    deletes: [...new Set(input.previouslyBound)].filter((key) => !wanted.has(key) && existing.get(key) === "text"),
    conflicts: input.fields.filter((field) => existing.has(field.key) && existing.get(field.key) !== "text").map((field) => field.key),
  };
}

// ---- editing helpers (pure, shared by the editor and its tests) ------------------------------

/** "Your Name!" → "your-name"; falls back when nothing usable is left. */
export function studioKeyFromLabel(label: string, fallback: string): string {
  const key = label.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "").replace(/^[^a-z]+/u, "").slice(0, 60);
  return key || fallback;
}

/** `base`, else `base-2`, `base-3`, … — whichever is free. */
export function uniqueStudioKey(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let index = 2; ; index += 1) {
    const candidate = `${base.slice(0, 74)}-${index}`;
    if (!used.has(candidate)) return candidate;
  }
}

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

/** A new text box: 60% of the width, centred, sized for the canvas, shrinking long text to fit. */
export function newStudioTextLayer(canvas: { width: number; height: number }, fieldKey: string, placeholder: string): StudioTextLayer {
  const fontSize = clamp(Math.round(Math.min(canvas.width, canvas.height) * 0.07), 14, 64);
  return {
    fieldKey,
    x: Math.round(canvas.width * 0.2),
    y: Math.round(canvas.height / 2 - (fontSize * STUDIO_LINE_HEIGHT) / 2),
    width: Math.round(canvas.width * 0.6),
    height: null,
    placeholder,
    fontId: "montserrat",
    fontSize,
    fontWeight: 700,
    color: "#111418",
    textAlign: "center",
    rotation: 0,
    textTransform: "none",
    letterSpacing: 0,
    autoFit: true,
  };
}

/** A new photo slot: a centred square, drawn over the mockup (an opaque mockup would hide a slot under it). */
export function newStudioPhotoSlot(canvas: { width: number; height: number }, fieldKey: string): StudioPhotoLayer {
  const size = Math.round(Math.min(canvas.width, canvas.height) * 0.4);
  return {
    fieldKey,
    x: Math.round((canvas.width - size) / 2),
    y: Math.round((canvas.height - size) / 2),
    width: size,
    height: size,
    shape: "rect",
    stacking: "over",
  };
}

export const DEFAULT_STUDIO_FIELD: StudioFieldInput = { key: "your-name", label: "Your name", required: true, maxLength: 20, placeholder: "Your name" };

/** A first design from a product photo: the photo as the mockup and one centred "Your name" box. */
export function defaultStudioDesign(imageUrl: string, imageSize: { width: number; height: number } | null, field: StudioFieldInput = DEFAULT_STUDIO_FIELD): StudioConfig {
  const canvas = studioCanvasForImage(imageSize);
  return {
    version: 1,
    canvas,
    background: { url: imageUrl, color: null },
    texts: [newStudioTextLayer(canvas, field.key, (field.placeholder || field.label).slice(0, 120))],
    photos: [],
  };
}

/**
 * The first design a newly listed personalised product gets: its photo with the
 * first customer-visible text field centred on it (the admin fine-tunes it in the
 * design editor). Null when there is no usable text field or photo.
 */
export function defaultDesignPayload(input: {
  productId: string;
  imageUrl: string;
  imageSize: { width: number; height: number } | null;
  fields: ReadonlyArray<{ key: string; label: string; inputType: string; required: boolean; maxLength: number | null; placeholder?: string | null; enabled?: boolean; customerVisible?: boolean }>;
}): StudioSaveInput | null {
  const source = input.fields.find((field) => field.inputType === "text" && field.enabled !== false && field.customerVisible !== false && /^[a-z][a-z0-9-]{0,79}$/u.test(field.key));
  // "/api/product-images/pending" is the listing wizard's placeholder until the photo uploads.
  if (!source || !isStudioImageUrl(input.imageUrl) || input.imageUrl.endsWith("/pending")) return null;
  const label = source.label.trim().slice(0, 120) || DEFAULT_STUDIO_FIELD.label;
  const field: StudioFieldInput = {
    key: source.key,
    label,
    required: source.required,
    maxLength: source.maxLength && source.maxLength >= 1 && source.maxLength <= 500 ? source.maxLength : null,
    placeholder: (source.placeholder?.trim() || label).slice(0, 240),
  };
  return { productId: input.productId, designs: [{ name: "Design 1", isDefault: true, studio: defaultStudioDesign(input.imageUrl, input.imageSize, field) }], fields: [field] };
}

/** Drops fields no design shows; returns the ones removed so the editor can say so. */
export function pruneUnusedStudioFields<T extends { key: string }>(fields: readonly T[], designs: ReadonlyArray<{ studio: { texts: ReadonlyArray<{ fieldKey: string }> } }>) {
  const bound = new Set(boundFieldKeys(designs));
  return { fields: fields.filter((field) => bound.has(field.key)), removed: fields.filter((field) => !bound.has(field.key)).map((field) => field.key) };
}

/** Fields that would disappear if `designIndex` lost its text layer `layerIndex` (not shown on any other layer). */
export function fieldOnlyOnLayer(designs: ReadonlyArray<{ studio: { texts: ReadonlyArray<{ fieldKey: string }> } }>, designIndex: number, layerIndex: number): string | null {
  const key = designs[designIndex]?.studio.texts[layerIndex]?.fieldKey;
  if (!key) return null;
  const uses = designs.reduce((count, design) => count + design.studio.texts.filter((layer) => layer.fieldKey === key).length, 0);
  return uses === 1 ? key : null;
}

/** A replaced mockup with a different canvas: every layer keeps its relative place and size. */
export function rescaleStudioConfig(config: StudioConfig, canvas: { width: number; height: number }): StudioConfig {
  const sx = canvas.width / config.canvas.width;
  const sy = canvas.height / config.canvas.height;
  const round = (value: number) => Math.round(value * 10) / 10;
  return {
    ...config,
    canvas,
    texts: config.texts.map((layer) => ({
      ...layer,
      x: round(layer.x * sx),
      y: round(layer.y * sy),
      width: round(layer.width * sx),
      height: layer.height === null ? null : round(layer.height * sy),
      fontSize: round(clamp(layer.fontSize * Math.min(sx, sy), 4, 400)),
    })),
    photos: config.photos.map((slot) => ({ ...slot, x: round(slot.x * sx), y: round(slot.y * sy), width: round(slot.width * sx), height: round(slot.height * sy) })),
  };
}

/** Snaps a box to the canvas centre line when its centre is within `threshold` px of it. */
export function snapToCentre(start: number, size: number, canvasSize: number, threshold = 4): { value: number; snapped: boolean } {
  const centred = canvasSize / 2 - size / 2;
  return Math.abs(start - centred) <= threshold ? { value: centred, snapped: true } : { value: start, snapped: false };
}
