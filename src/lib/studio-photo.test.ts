import assert from "node:assert/strict";
import test from "node:test";

import { resolveProductArtworkPolicy, studioPhotoSlotCount, validateArtworkDocumentPolicy } from "./artwork-policy";
import { CommerceError } from "./commerce-error";
import { getProductById } from "./data";
import { priceProductItem } from "./pricing-service";
import {
  clampPhotoTransform,
  DEFAULT_PHOTO_TRANSFORM,
  missingStudioPhotos,
  photoContainRect,
  photoPivot,
  stepPhotoTransform,
  studioPhotoFieldKey,
  studioPhotoLabel,
  studioPhotoLayerId,
  studioPhotoMarker,
  studioPhotoValues,
} from "./studio-photo";
import type { ArtworkLayerSnapshot, PersonalizationTemplate, Product } from "./types";
import { artworkDocumentSchema } from "./validation";

test("photo controls step like the reference editor: 10° rotation, 0.1 zoom, 3 px moves", () => {
  let transform = { ...DEFAULT_PHOTO_TRANSFORM };
  transform = stepPhotoTransform(transform, "rotate-cw");
  assert.equal(transform.rotation, 10);
  transform = stepPhotoTransform(transform, "rotate-ccw");
  transform = stepPhotoTransform(transform, "rotate-ccw");
  assert.equal(transform.rotation, -10);
  transform = stepPhotoTransform(transform, "zoom-in");
  assert.equal(transform.scale, 1.1);
  transform = stepPhotoTransform(stepPhotoTransform(transform, "left"), "up");
  assert.deepEqual({ x: transform.offsetX, y: transform.offsetY }, { x: -3, y: -3 });
  assert.deepEqual(stepPhotoTransform(transform, "reset"), DEFAULT_PHOTO_TRANSFORM);
});

test("photo zoom is clamped to 0.2–5 and junk transforms fall back to the default", () => {
  let transform = { ...DEFAULT_PHOTO_TRANSFORM };
  for (let index = 0; index < 60; index += 1) transform = stepPhotoTransform(transform, "zoom-in");
  assert.equal(transform.scale, 5);
  for (let index = 0; index < 80; index += 1) transform = stepPhotoTransform(transform, "zoom-out");
  assert.equal(transform.scale, 0.2);
  assert.deepEqual(clampPhotoTransform({ offsetX: Number.NaN, scale: Infinity, rotation: 725 }), { offsetX: 0, offsetY: 0, rotation: 5, scale: 1 });
  assert.deepEqual(clampPhotoTransform(null), DEFAULT_PHOTO_TRANSFORM);
});

test("a photo is contain-fitted and centred in its slot; the pivot follows the offset", () => {
  // Measured on the reference exam board: an 800 × 500 photo in the 424 × 601 slot shows at 424 × 265, centred.
  const slot = { x: 89, y: 0, width: 424, height: 601 };
  const rect = photoContainRect(slot, 800, 500);
  assert.deepEqual({ x: rect.x, width: rect.width, height: rect.height }, { x: 89, width: 424, height: 265 });
  assert.equal(Math.round(rect.y), 168);
  assert.deepEqual(photoPivot(slot, { ...DEFAULT_PHOTO_TRANSFORM, offsetX: -3, offsetY: 6 }), { x: 298, y: 306.5 });
});

test("the layer marker is the slot clamped into the 600 × 600 policy space", () => {
  assert.deepEqual(studioPhotoMarker({ x: 89, y: 0, width: 424, height: 601 }), { x: 89, y: 0, width: 424, height: 600, rotation: 0 });
  assert.deepEqual(studioPhotoMarker({ x: -9, y: 131, width: 237, height: 289 }), { x: 0, y: 131, width: 228, height: 289, rotation: 0 });
});

test("photo layer ids, labels and missing slots", () => {
  assert.equal(studioPhotoLayerId("photo-2"), "studio-photo-photo-2");
  assert.equal(studioPhotoFieldKey("studio-photo-photo-2"), "photo-2");
  assert.equal(studioPhotoFieldKey("personalization-name"), null);
  assert.equal(studioPhotoLabel("photo"), "Your photo");
  assert.equal(studioPhotoLabel("photo-3"), "Your photo 3");
  const config = { photos: [{ fieldKey: "photo" }, { fieldKey: "photo-2" }] as never };
  assert.deepEqual(missingStudioPhotos(config, []), ["photo", "photo-2"]);
  assert.deepEqual(missingStudioPhotos(config, [{ id: "studio-photo-photo", type: "image", asset: {} }]), ["photo-2"]);
  assert.deepEqual(missingStudioPhotos(config, [{ id: "studio-photo-photo-2", type: "image" }]), ["photo", "photo-2"], "a layer without an asset or preview is not a photo");
  assert.deepEqual(Object.keys(studioPhotoValues([{ id: "studio-photo-photo", type: "image", src: "data:image/png;base64,AA" }, { id: "logo", type: "image", src: "data:x" }])), ["photo"]);
});

// ---- policy and pricing ------------------------------------------------------------------------

const slots = [
  { fieldKey: "photo", x: 89, y: 0, width: 424, height: 601, shape: "rect", stacking: "under" },
  { fieldKey: "photo-2", x: 10, y: 400, width: 120, height: 120, shape: "rect", stacking: "under" },
];

function studioTemplate(photos: typeof slots): PersonalizationTemplate {
  const studio = { version: 1, canvas: { width: 600, height: 600 }, background: { url: "https://dyuh5x5qbqu9p.cloudfront.net/productimages/board.webp", color: "#ffffff" }, texts: [], photos };
  return {
    id: `studio-template-${photos.length}`,
    slug: `rb-test-s${photos.length}`,
    name: "Design 1",
    theme: "Studio",
    description: "",
    thumbnail: "",
    artwork: "labels",
    premiumPrice: 0,
    active: true,
    rightsStatement: "",
    compatibleProductIds: [],
    preview: { background: "#ffffff", foreground: "#111111", accent: "#e5e7eb", fontFamily: "Montserrat", textAlign: "center", safeArea: { x: 0, y: 0, width: 100, height: 100 } },
    production: { previewConfig: { studio } as never, productionConfig: {} as never, widthPx: 600, heightPx: 600, dpi: 300, surfaces: [{ id: "primary", label: "Design" }] },
  };
}

function studioProduct(options: { uploads: boolean; photos?: typeof slots }): Product {
  const source = getProductById("prod-everyday-name-slips");
  assert.ok(source);
  const template = studioTemplate(options.photos ?? slots);
  return {
    ...source,
    id: "studio-photo-product",
    customizable: true,
    customizationFields: [],
    templateIds: [template.id],
    templateLinks: [{ template, sortOrder: 0, isDefault: true }],
    variants: [{ ...source.variants[0], id: "studio-photo-variant", stockStatus: "made_to_order" as const }],
    configurator: {
      ...source.configurator!,
      artworkPolicy: undefined,
      printAreas: [{ id: "primary", label: "Design", widthMm: 50.8, heightMm: 50.8 }],
      ...(options.uploads ? { artworkUpload: { enabled: true, acceptedMimeTypes: ["image/jpeg", "image/png", "image/webp"], maximumBytes: 10 * 1024 * 1024 } } : {}),
    },
  } as Product;
}

type StudioImageLayer = Extract<ArtworkLayerSnapshot, { type: "image" }>;
type PriceInput = Parameters<typeof priceProductItem>[1];

const photoLayer = (fieldKey: string, slot: (typeof slots)[number], assetId: string): StudioImageLayer => ({
  id: studioPhotoLayerId(fieldKey),
  type: "image",
  name: studioPhotoLabel(fieldKey),
  ...studioPhotoMarker(slot),
  opacity: 1,
  sourceWidth: 800,
  sourceHeight: 500,
  imageFit: "contain",
  aspectLocked: true,
  photo: { offsetX: -3, offsetY: 0, rotation: 10, scale: 1.1 },
  asset: { id: assetId, claimToken: "claim-token-for-studio-test", mimeType: "image/png", sizeBytes: 12_000, width: 800, height: 500 },
});

const artworkWith = (layers: ArtworkLayerSnapshot[]) => ({
  version: 1 as const,
  activeSurfaceId: "primary",
  updatedAt: "2026-11-22T00:00:00.000Z",
  surfaces: [{ id: "primary", label: "Design", layers }],
});

test("a studio product's policy: 600 × 600 space, fully printable, one image per photo slot", () => {
  const product = studioProduct({ uploads: true });
  assert.equal(studioPhotoSlotCount(product), 2);
  const [surface] = resolveProductArtworkPolicy(product).surfaces;
  assert.deepEqual(surface.coordinateSpace, { width: 600, height: 600 });
  assert.deepEqual(surface.printableBounds, { x: 0, y: 0, width: 600, height: 600 });
  assert.equal(surface.image.enabled, true);
  assert.equal(surface.image.maximumElements, 2);
  // Zoomed, rotated photos still validate: the transform lives in `photo`, the marker stays inside the space.
  const issues = validateArtworkDocumentPolicy(artworkWith([photoLayer("photo", slots[0], "a1"), photoLayer("photo-2", slots[1], "a2")]), resolveProductArtworkPolicy(product));
  assert.deepEqual(issues, []);
});

test("a policy saved from the admin form keeps the photo-slot rules on studio products", () => {
  // The admin product form always saves an explicit policy, with its own space and safe area.
  const legacy = resolveProductArtworkPolicy({ ...studioProduct({ uploads: true }), templateLinks: [] } as Product);
  const saved = {
    ...legacy,
    surfaces: legacy.surfaces.map((surface) => ({
      ...surface,
      coordinateSpace: { width: 1000, height: 500 },
      printableBounds: { x: 50, y: 50, width: 900, height: 400 },
      image: { ...surface.image, maximumElements: 1 },
    })),
  };
  const withSaved = (policy: typeof saved) => {
    const product = studioProduct({ uploads: true });
    return { ...product, configurator: { ...product.configurator!, artworkPolicy: policy } } as Product;
  };
  const resolved = resolveProductArtworkPolicy(withSaved(saved));
  assert.deepEqual(resolved.surfaces[0].coordinateSpace, { width: 600, height: 600 });
  assert.equal(resolved.surfaces[0].image.maximumElements, 2);
  assert.deepEqual(resolved.surfaces[0].image.allowedMimeTypes, saved.surfaces[0].image.allowedMimeTypes, "file types stay the admin's");
  assert.deepEqual(validateArtworkDocumentPolicy(artworkWith([photoLayer("photo", slots[0], "a1"), photoLayer("photo-2", slots[1], "a2")]), resolved), []);

  // Switching images off in admin still switches the slots off.
  const imagesOff = { ...saved, surfaces: saved.surfaces.map((surface) => ({ ...surface, image: { ...surface.image, enabled: false } })) };
  assert.equal(resolveProductArtworkPolicy(withSaved(imagesOff)).surfaces[0].image.enabled, false);
});

test("a design's photo slots are required before it can be priced", () => {
  const product = studioProduct({ uploads: true });
  const item = (layers: ArtworkLayerSnapshot[]) => ({
    productId: product.id,
    variantId: "studio-photo-variant",
    quantity: 1,
    customization: { templateId: "studio-template-2", fields: {}, previewVersion: 1 as const, artwork: artworkWith(layers) },
  }) as PriceInput;
  assert.throws(
    () => priceProductItem(product, item([photoLayer("photo", slots[0], "a1")])),
    (error: unknown) => error instanceof CommerceError && error.code === "STUDIO_PHOTO_REQUIRED" && JSON.stringify(error.details).includes("photo-2"),
  );
  const priced = priceProductItem(product, item([photoLayer("photo", slots[0], "a1"), photoLayer("photo-2", slots[1], "a2")]));
  assert.ok(priced.unitPricePaise > 0);
});

test("without uploads enabled, photo slots never block an order", () => {
  const product = studioProduct({ uploads: false });
  const priced = priceProductItem(product, {
    productId: product.id,
    variantId: "studio-photo-variant",
    quantity: 1,
    customization: { templateId: "studio-template-2", fields: {}, previewVersion: 1 },
  });
  assert.ok(priced.unitPricePaise > 0);
});

test("the artwork schema accepts a bounded photo transform and rejects out-of-range ones", () => {
  const valid = artworkDocumentSchema.safeParse(artworkWith([photoLayer("photo", slots[0], "a1")]));
  assert.equal(valid.success, true);
  const layer = photoLayer("photo", slots[0], "a1");
  const tooBig = artworkDocumentSchema.safeParse(artworkWith([{ ...layer, photo: { ...layer.photo!, scale: 9 } } as ArtworkLayerSnapshot]));
  assert.equal(tooBig.success, false);
  const extraKey = artworkDocumentSchema.safeParse(artworkWith([{ ...layer, photo: { ...layer.photo!, skew: 1 } } as unknown as ArtworkLayerSnapshot]));
  assert.equal(extraKey.success, false);
});
