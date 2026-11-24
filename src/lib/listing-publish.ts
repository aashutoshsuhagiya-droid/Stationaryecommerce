import { z } from "zod";

import { slugifyAdminValue } from "./admin-quick-list";
import type { CategoryListingRecipe } from "./category-listing-playbook";

/**
 * The one-click listing flow behind `POST /api/admin/listings`.
 *
 *   prepare  → find the listing's product by its client-generated `listingId`,
 *              or create it as a DRAFT (so photos have somewhere to upload).
 *   publish  → 1. product (find/create)  2. details + photos attached in order
 *              3. default 2D design      4. 3D preview (recipe permitting)
 *              5. publish (status only)
 *
 * Every step checks what already exists instead of trusting flags, so a retry
 * with the same `listingId` resumes where it failed and never duplicates the
 * product, its 2D design or its 3D template.
 *
 * 3D invariant: for template-backed shapes this flow never writes `allow3D`,
 * `productModel` or `previewTemplate`; only publishing the visualization
 * template does (the existing studio rule). A details update after the 3D
 * step carries the published link over unchanged. Built-in 3D shapes (pens,
 * name slips…) keep the catalog's own validated `allow3D + productModel` path.
 *
 * Pure orchestration: the database work is injected (see listing-publish-server).
 */

export const LISTING_ID_PATTERN = /^lst_[A-Za-z0-9]{8,32}$/;

export const listingRequestSchema = z.object({
  phase: z.enum(["prepare", "publish", "discard"]),
  listingId: z.string().regex(LISTING_ID_PATTERN, "Start the listing again."),
  /** The catalog product body (validated again by the catalog service). */
  product: z.record(z.string(), z.unknown()).default({}),
  /** Uploaded photo asset ids, main photo first. */
  imageAssetIds: z.array(z.string().regex(/^[A-Za-z0-9_-]{1,100}$/)).max(8).default([]),
  publish: z.boolean().default(true),
  /** Where the customer's name sits on the default 2D design. */
  textPosition: z.enum(["top", "middle", "bottom"]).default("middle"),
  /** The draft's id from "prepare": a fast lookup, always checked against `listingId`. */
  productId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/).optional(),
}).strict();

export type ListingRequest = z.infer<typeof listingRequestSchema>;

export interface ListingProductState {
  id: string;
  slug: string;
  categorySlug: string;
  published: boolean;
  /** The published 3D link already on the product, carried across detail updates. */
  threeDLink: { allow3D: true; productModel: string; previewTemplate: string } | null;
  /** Print areas set by the product's 2D design; kept so a retry never resizes the design surface. */
  studioPrintAreas: unknown[] | null;
  hasStudioDesigns: boolean;
  hasPublished3D: boolean;
  /** Photo assets uploaded to this product, by id. */
  assets: ReadonlyArray<{ id: string; kind: string; width: number; height: number }>;
}

export interface ListingPublishDeps {
  /** The listing's product. `productIdHint` makes it a primary-key lookup; it must still belong to the listing. */
  findByListingId(listingId: string, productIdHint?: string): Promise<ListingProductState | null>;
  createProduct(listingId: string, product: Record<string, unknown>): Promise<{ id: string }>;
  load(productId: string): Promise<ListingProductState>;
  /** The slug of a category id (null when it does not exist). */
  categorySlugFor(categoryId: string): Promise<string | null>;
  recipeFor(categorySlug: string): CategoryListingRecipe | undefined;
  /** `willPublish`: run the catalog's publish checks now, before anything else changes. */
  updateProduct(productId: string, product: Record<string, unknown>, willPublish: boolean): Promise<void>;
  createDefaultDesign(productId: string, textPosition: ListingRequest["textPosition"]): Promise<boolean>;
  create3D(productId: string): Promise<{ note?: string }>;
  /** Status (and, before a first publish, the URL slug) in one write. Returns the slug in use. */
  setPublished(productId: string, published: boolean, slug?: string): Promise<string>;
  /** Deletes a never-published draft; false when anything still references it. */
  deleteDraft(productId: string): Promise<boolean>;
}

export type ThreeDOutcome =
  | { status: "ready" }
  | { status: "builtin" }
  | { status: "none" }
  | { status: "skipped"; message: string }
  | { status: "failed"; message: string };

export interface ListingPublishResult {
  productId: string;
  slug: string;
  published: boolean;
  design2D: "created" | "existing" | "none";
  threeD: ThreeDOutcome;
  photoCount: number;
}

export class ListingPublishError extends Error {
  constructor(readonly status: 404 | 409 | 422, readonly code: string, message: string) {
    super(message);
    this.name = "ListingPublishError";
  }
}

const PENDING_IMAGE = "/api/product-images/pending";
const assetUrl = (id: string) => `/api/product-images/${id}`;

/** Removes every 3D field the client sent; the server alone decides 3D. */
export function withoutThreeDFields(product: Record<string, unknown>): Record<string, unknown> {
  const { allow3D: _allow3D, productModel: _productModel, previewTemplate: _previewTemplate, ...rest } = product;
  return rest;
}

/**
 * The 3D fields a details write may carry: built-in shapes get the recipe's
 * model; template shapes get only the link publishing already wrote (or none).
 */
export function threeDFieldsFor(recipe: CategoryListingRecipe | undefined, state: Pick<ListingProductState, "threeDLink"> | null) {
  if (state?.threeDLink) return { ...state.threeDLink };
  if (recipe?.threeDPath === "builtin" && recipe.model3D) return { allow3D: true, productModel: recipe.model3D };
  return { allow3D: false };
}

function detailsBody(
  product: Record<string, unknown>,
  recipe: CategoryListingRecipe | undefined,
  state: ListingProductState | null,
  images: { imageUrl: string; extraImages?: Array<{ url: string; width: number; height: number }> },
) {
  return {
    ...withoutThreeDFields(product),
    ...threeDFieldsFor(recipe, state),
    ...(state?.studioPrintAreas ? { printAreas: state.studioPrintAreas } : {}),
    imageUrl: images.imageUrl,
    ...(images.extraImages ? { extraImages: images.extraImages } : {}),
    // Status is the last step's job; details are always written as a draft.
    published: false,
  };
}

const locks = new Map<string, Promise<unknown>>();

/** Serialises work per listing within this server, so a double click cannot double-create. */
export async function withListingLock<T>(listingId: string, work: () => Promise<T>): Promise<T> {
  const previous = locks.get(listingId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(work);
  locks.set(listingId, next);
  try {
    return await next;
  } finally {
    if (locks.get(listingId) === next) locks.delete(listingId);
  }
}

/**
 * The product URL from its real name. The draft was named from a first guess
 * ("Custom Name Slips" for a paper bag), so a never-published listing takes its
 * final name's slug, keeping the unique suffix. Live URLs are never changed.
 */
export function finalListingSlug(currentSlug: string, name: unknown): string {
  const stem = typeof name === "string" ? slugifyAdminValue(name).slice(0, 120) : "";
  const suffix = /-([a-z0-9]{4,})$/u.exec(currentSlug)?.[1];
  if (!stem || !suffix) return currentSlug;
  return `${stem}-${suffix}`;
}

async function ensureProduct(deps: ListingPublishDeps, request: ListingRequest) {
  const existing = await deps.findByListingId(request.listingId, request.productId);
  if (existing) return existing;
  const created = await deps.createProduct(request.listingId, {
    ...withoutThreeDFields(request.product),
    // Built-in 3D is decided after the category is known (see the details step).
    allow3D: false,
    imageUrl: PENDING_IMAGE,
    published: false,
  });
  return deps.load(created.id);
}

/** Step 0 (photos need a product): find or create the listing's draft. */
export async function prepareListing(deps: ListingPublishDeps, request: ListingRequest) {
  return withListingLock(request.listingId, async () => {
    const state = await ensureProduct(deps, request);
    return { productId: state.id, slug: state.slug, uploadedAssetIds: state.assets.map((asset) => asset.id) };
  });
}

/** Steps 1-5. Throws only for problems the admin must fix; 3D failure is reported, not thrown. */
export async function publishListing(deps: ListingPublishDeps, request: ListingRequest): Promise<ListingPublishResult> {
  return withListingLock(request.listingId, async () => {
    // 1. Product.
    let state = await ensureProduct(deps, request);
    const wasLive = state.published;

    // 2. Details + photos, main photo first. Only this product's own uploads are accepted.
    const owned = new Map(state.assets.map((asset) => [asset.id, asset]));
    const photos = request.imageAssetIds.map((id) => {
      const asset = owned.get(id);
      if (!asset) throw new ListingPublishError(422, "LISTING_PHOTO_UNKNOWN", "One photo did not finish uploading. Please add it again.");
      return asset;
    });
    if (request.publish && !photos.length) {
      throw new ListingPublishError(422, "LISTING_PHOTO_REQUIRED", "Add a photo to publish.");
    }
    const [main, ...gallery] = photos;
    // The recipe of the shelf being saved now: the draft was created under a first guess.
    const requestedCategoryId = typeof request.product.categoryId === "string" ? request.product.categoryId : "";
    const categorySlug = (requestedCategoryId && await deps.categorySlugFor(requestedCategoryId)) || state.categorySlug;
    const savedRecipe = deps.recipeFor(categorySlug);
    await deps.updateProduct(state.id, detailsBody(request.product, savedRecipe, state, {
      imageUrl: main ? assetUrl(main.id) : PENDING_IMAGE,
      extraImages: gallery.slice(0, 5).map((asset) => ({ url: assetUrl(asset.id), width: asset.width, height: asset.height })),
    }), request.publish);
    state = { ...state, categorySlug };

    // 3. Default 2D design for personalised products with a photo (whatever their 3D path);
    //    pure packaging keeps its free-form artwork editor.
    const purePackaging = Boolean(savedRecipe?.packagingFieldPresetId && !savedRecipe.starterId);
    let design2D: ListingPublishResult["design2D"] = "none";
    if (state.hasStudioDesigns) design2D = "existing";
    else if (main && !purePackaging) {
      design2D = await deps.createDefaultDesign(state.id, request.textPosition) ? "created" : "none";
    }

    // 4. 3D preview.
    let threeD: ThreeDOutcome;
    if (savedRecipe?.threeDPath === "builtin" && savedRecipe.model3D) threeD = { status: "builtin" };
    else if (savedRecipe?.threeDPath !== "template") threeD = { status: "none" };
    else if (state.hasPublished3D) threeD = { status: "ready" };
    else if (!main) threeD = { status: "skipped", message: "Add a photo to get a 3D preview." };
    else {
      try {
        await deps.create3D(state.id);
        threeD = { status: "ready" };
      } catch {
        threeD = { status: "failed", message: "3D preview couldn't be made from this photo." };
      }
    }

    // 5. Publish: status (and a first-publish slug) only, so nothing written above is touched.
    const slug = await deps.setPublished(state.id, request.publish, wasLive ? undefined : finalListingSlug(state.slug, request.product.name));
    return {
      productId: state.id,
      slug,
      published: request.publish,
      design2D,
      threeD,
      photoCount: photos.length,
    };
  });
}

/** "Start over": removes the listing's draft if it was never published. Live products are kept. */
export async function discardListing(deps: ListingPublishDeps, request: Pick<ListingRequest, "listingId">) {
  return withListingLock(request.listingId, async () => {
    const state = await deps.findByListingId(request.listingId);
    if (!state) return { discarded: false };
    if (state.published) return { discarded: false, kept: "published" as const };
    return { discarded: await deps.deleteDraft(state.id) };
  });
}

/**
 * Wraps the database steps to time them, for a `Server-Timing` response header
 * (shows in the browser's network panel which step a slow publish spent its time on).
 */
export function timedListingDeps(deps: ListingPublishDeps) {
  const totals = new Map<string, { ms: number; calls: number }>();
  const timed = Object.fromEntries(Object.entries(deps).map(([name, fn]) => [name, typeof fn !== "function" ? fn : (...args: unknown[]) => {
    const started = performance.now();
    const record = () => {
      const entry = totals.get(name) ?? { ms: 0, calls: 0 };
      totals.set(name, { ms: entry.ms + performance.now() - started, calls: entry.calls + 1 });
    };
    const result = (fn as (...values: unknown[]) => unknown).apply(deps, args);
    if (result instanceof Promise) return result.finally(record);
    record();
    return result;
  }])) as unknown as ListingPublishDeps;
  return {
    deps: timed,
    serverTiming: () => [...totals.entries()].map(([name, entry]) => `${name};dur=${entry.ms.toFixed(0)};desc="${entry.calls}x"`).join(", "),
  };
}
