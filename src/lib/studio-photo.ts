/**
 * Customer photos in a studio design's photo slots.
 *
 * Measured on the reference editor (ranbazaar.com): a photo is drawn under
 * the mockup (it shows through the mockup's transparent window), clipped to
 * its slot, fitted with `object-fit: contain`, then moved by a pixel offset and
 * rotated/scaled about its centre. Its controls step rotation by 10°, zoom by
 * 0.1 and position by 3 px.
 *
 * A photo travels in the artwork document as an uploaded image layer (so the
 * private upload, claim and order-attachment pipeline applies unchanged) with
 * id `studio-photo-<fieldKey>`. Its x/y/width/height are only a marker — the
 * slot clamped into the policy space — because the template's slot, not the
 * layer, decides where the photo is drawn. The customer's adjustments live in
 * the optional `photo` transform.
 */
import type { StudioConfig, StudioPhotoLayer } from "./studio-template";

export const STUDIO_PHOTO_LAYER_PREFIX = "studio-photo-";
/** The policy coordinate space for studio products: every studio canvas is anchored inside 600 × 600. */
export const STUDIO_POLICY_SPACE = 600;

export const PHOTO_ROTATE_STEP = 10;
export const PHOTO_ZOOM_STEP = 0.1;
export const PHOTO_MOVE_STEP = 3;
export const PHOTO_MIN_SCALE = 0.2;
export const PHOTO_MAX_SCALE = 5;
export const PHOTO_MAX_OFFSET = 2_000;

export interface StudioPhotoTransform {
  /** Canvas px, applied before rotation/scale (CSS `left`/`top`). */
  offsetX: number;
  offsetY: number;
  /** Degrees, clockwise. */
  rotation: number;
  scale: number;
}

export const DEFAULT_PHOTO_TRANSFORM: StudioPhotoTransform = Object.freeze({ offsetX: 0, offsetY: 0, rotation: 0, scale: 1 });

export type PhotoAction = "rotate-cw" | "rotate-ccw" | "zoom-in" | "zoom-out" | "left" | "right" | "up" | "down" | "reset";

export const studioPhotoLayerId = (fieldKey: string) => `${STUDIO_PHOTO_LAYER_PREFIX}${fieldKey}`;

export function studioPhotoFieldKey(layerId: string): string | null {
  return layerId.startsWith(STUDIO_PHOTO_LAYER_PREFIX) ? layerId.slice(STUDIO_PHOTO_LAYER_PREFIX.length) || null : null;
}

/** The slot's own label, else "photo" → "Your photo", "photo-2" → "Your photo 2". */
export function studioPhotoLabel(fieldKey: string, label?: string | null): string {
  if (label?.trim()) return label.trim();
  const ordinal = /-(\d+)$/u.exec(fieldKey)?.[1];
  return ordinal ? `Your photo ${ordinal}` : "Your photo";
}

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));
const round = (value: number, digits = 3) => Math.round(value * 10 ** digits) / 10 ** digits;

export function clampPhotoTransform(transform: Partial<StudioPhotoTransform> | null | undefined): StudioPhotoTransform {
  const finite = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
  const rotation = finite(transform?.rotation, 0) % 360;
  return {
    offsetX: round(clamp(finite(transform?.offsetX, 0), -PHOTO_MAX_OFFSET, PHOTO_MAX_OFFSET)),
    offsetY: round(clamp(finite(transform?.offsetY, 0), -PHOTO_MAX_OFFSET, PHOTO_MAX_OFFSET)),
    rotation: round(rotation === 0 ? 0 : rotation),
    scale: round(clamp(finite(transform?.scale, 1), PHOTO_MIN_SCALE, PHOTO_MAX_SCALE)),
  };
}

export function stepPhotoTransform(transform: StudioPhotoTransform, action: PhotoAction): StudioPhotoTransform {
  switch (action) {
    case "rotate-cw": return clampPhotoTransform({ ...transform, rotation: transform.rotation + PHOTO_ROTATE_STEP });
    case "rotate-ccw": return clampPhotoTransform({ ...transform, rotation: transform.rotation - PHOTO_ROTATE_STEP });
    case "zoom-in": return clampPhotoTransform({ ...transform, scale: transform.scale + PHOTO_ZOOM_STEP });
    case "zoom-out": return clampPhotoTransform({ ...transform, scale: transform.scale - PHOTO_ZOOM_STEP });
    case "left": return clampPhotoTransform({ ...transform, offsetX: transform.offsetX - PHOTO_MOVE_STEP });
    case "right": return clampPhotoTransform({ ...transform, offsetX: transform.offsetX + PHOTO_MOVE_STEP });
    case "up": return clampPhotoTransform({ ...transform, offsetY: transform.offsetY - PHOTO_MOVE_STEP });
    case "down": return clampPhotoTransform({ ...transform, offsetY: transform.offsetY + PHOTO_MOVE_STEP });
    case "reset": return { ...DEFAULT_PHOTO_TRANSFORM };
  }
}

/** The layer's marker rectangle: the slot clamped into the policy space (slots may overhang the canvas by a few px). */
export function studioPhotoMarker(slot: Pick<StudioPhotoLayer, "x" | "y" | "width" | "height">) {
  const left = clamp(slot.x, 0, STUDIO_POLICY_SPACE - 1);
  const top = clamp(slot.y, 0, STUDIO_POLICY_SPACE - 1);
  const right = clamp(slot.x + slot.width, left + 1, STUDIO_POLICY_SPACE);
  const bottom = clamp(slot.y + slot.height, top + 1, STUDIO_POLICY_SPACE);
  return { x: round(left), y: round(top), width: round(right - left), height: round(bottom - top), rotation: 0 };
}

/** Where the untransformed photo sits: contain-fitted and centred in its slot. */
export function photoContainRect(slot: Pick<StudioPhotoLayer, "x" | "y" | "width" | "height">, sourceWidth: number, sourceHeight: number) {
  const scale = Math.min(slot.width / Math.max(1, sourceWidth), slot.height / Math.max(1, sourceHeight));
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return { x: slot.x + (slot.width - width) / 2, y: slot.y + (slot.height - height) / 2, width, height };
}

/** The slot centre after the offset: the pivot the photo rotates and scales about. */
export function photoPivot(slot: Pick<StudioPhotoLayer, "x" | "y" | "width" | "height">, transform: StudioPhotoTransform) {
  return { x: slot.x + slot.width / 2 + transform.offsetX, y: slot.y + slot.height / 2 + transform.offsetY };
}

interface PhotoLayerLike {
  id: string;
  type: string;
  asset?: unknown;
  src?: string;
}

/** The drawable photos in a surface's layers, keyed by slot (layers without a local preview are skipped). */
export function studioPhotoValues(layers: readonly (PhotoLayerLike & { photo?: Partial<StudioPhotoTransform> })[]) {
  const values: Record<string, { src: string; transform: StudioPhotoTransform }> = {};
  for (const layer of layers) {
    const key = studioPhotoFieldKey(layer.id);
    if (key && layer.type === "image" && layer.src) values[key] = { src: layer.src, transform: clampPhotoTransform(layer.photo) };
  }
  return values;
}

/** Required slots of `config` that have no photo yet (a layer with an uploaded asset or a local preview). */
export function missingStudioPhotos(config: Pick<StudioConfig, "photos">, layers: readonly PhotoLayerLike[]): string[] {
  const filled = new Set(layers
    .filter((layer) => layer.type === "image" && (layer.asset || layer.src))
    .map((layer) => studioPhotoFieldKey(layer.id))
    .filter((key): key is string => Boolean(key)));
  return [...new Set(config.photos.filter((slot) => slot.required !== false).map((slot) => slot.fieldKey))].filter((key) => !filled.has(key));
}
