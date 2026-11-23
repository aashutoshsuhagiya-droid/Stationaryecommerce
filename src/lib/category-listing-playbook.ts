import type { PackagingFieldPresetId } from "./ezpac-packaging-presets";
import type { RanBazaarCustomizationStarterId } from "./ranbazaar-customization-presets";

/**
 * What a new product needs, per category shelf.
 *
 * Every value mirrors what the 435 live products on that shelf actually do
 * (see `docs/research/category-listing-study.json`): the starter whose fields
 * match the shelf, the GST the source charges, the price band siblings sit in,
 * whether an MRP strikethrough is the norm, and which 3D lane is honest for the
 * shape. Recipes are defaults and nudges only — the admin can override all of it.
 */

/** The models `productModelSchema` accepts; built-in geometry exists for each. */
export type ListingProductModel =
  | "label-pack" | "waterproof-sheet" | "school-kit" | "notebook" | "bottle-label"
  | "pencil-set" | "tag" | "geometry-box" | "gift-ribbon" | "keychain-duo" | "bulk-grid"
  | "rectangular-box" | "square-box" | "folding-carton" | "mailer-box" | "paper-bag"
  | "stand-up-pouch" | "product-sleeve" | "rigid-lid-box" | "mailer-envelope";

/**
 * "builtin" — `allow3D` + `productModel` is enough (non-packaging product types).
 * "template" — needs the product's own PUBLISHED visualization template first.
 * "none" — no honest model for this shape; never offer 3D.
 */
export type ThreeDPath = "builtin" | "template" | "none";

export interface CategoryListingRecipe {
  categorySlug: string;
  starterId?: RanBazaarCustomizationStarterId;
  packagingFieldPresetId?: PackagingFieldPresetId;
  gstPercent: 0 | 5 | 18;
  priceBandRupees?: { min: number; max: number };
  mrpExpected: boolean;
  model3D?: ListingProductModel;
  threeDPath: ThreeDPath;
  /** Industry collection slugs to also list in (ezpac tree, `collection-*`). */
  collectionSlugs?: string[];
  madeToOrder: boolean;
  notes?: string;
}

const PERSONAL = ["collection-personal"];
const PRODUCT_PACKAGING = ["collection-product-packaging"];

export const CATEGORY_LISTING_PLAYBOOK: readonly CategoryListingRecipe[] = [
  // ---- Personalised retail shelves (GST-charged, MRP strikethrough is the norm)
  {
    categorySlug: "customized-name-slips",
    starterId: "name-slips",
    gstPercent: 18,
    priceBandRupees: { min: 219, max: 499 },
    mrpExpected: true,
    model3D: "label-pack",
    threeDPath: "builtin",
    collectionSlugs: PERSONAL,
    madeToOrder: true,
    notes: "Name and school lines on a slip sheet — the shelf's bestseller shape.",
  },
  {
    categorySlug: "waterproof-stickers",
    starterId: "name-slips",
    gstPercent: 18,
    priceBandRupees: { min: 290, max: 399 },
    mrpExpected: true,
    model3D: "waterproof-sheet",
    threeDPath: "builtin",
    collectionSlugs: PERSONAL,
    madeToOrder: true,
  },
  {
    categorySlug: "school-labels",
    starterId: "name-slips",
    gstPercent: 18,
    priceBandRupees: { min: 400, max: 700 },
    mrpExpected: false,
    model3D: "label-pack",
    threeDPath: "builtin",
    collectionSlugs: PERSONAL,
    madeToOrder: true,
    notes: "Multi-pack label sets; usually sold at one price with no strikethrough.",
  },
  {
    categorySlug: "personalized-notebooks",
    starterId: "notebook",
    gstPercent: 18,
    priceBandRupees: { min: 449, max: 499 },
    mrpExpected: true,
    model3D: "notebook",
    threeDPath: "builtin",
    collectionSlugs: PERSONAL,
    madeToOrder: true,
    notes: "Source rows omitted tax here; 18% follows the curated siblings — change it if the print partner differs.",
  },
  {
    categorySlug: "personalized-pencils-pens",
    starterId: "pen-pencil",
    gstPercent: 18,
    priceBandRupees: { min: 235, max: 869 },
    mrpExpected: true,
    model3D: "pencil-set",
    threeDPath: "builtin",
    collectionSlugs: PERSONAL,
    madeToOrder: true,
    notes: "Source rows omitted tax here; 18% follows the curated siblings.",
  },
  {
    categorySlug: "name-plates-keychains",
    starterId: "name-plate",
    gstPercent: 18,
    priceBandRupees: { min: 379, max: 1598 },
    mrpExpected: true,
    model3D: "keychain-duo",
    threeDPath: "builtin",
    collectionSlugs: PERSONAL,
    madeToOrder: true,
  },
  {
    categorySlug: "bottle-tiffin-labels",
    starterId: "bottle-tiffin",
    gstPercent: 5,
    priceBandRupees: { min: 329, max: 1025 },
    mrpExpected: false,
    model3D: "bottle-label",
    threeDPath: "builtin",
    collectionSlugs: PERSONAL,
    madeToOrder: true,
    notes: "Bottle and tiffin items sit at 5% GST on the source site.",
  },
  {
    categorySlug: "school-accessories",
    starterId: "school-kit",
    gstPercent: 18,
    priceBandRupees: { min: 230, max: 899 },
    mrpExpected: true,
    model3D: "school-kit",
    threeDPath: "builtin",
    collectionSlugs: PERSONAL,
    madeToOrder: true,
  },
  {
    categorySlug: "personalized-gifts",
    starterId: "gift-slip",
    gstPercent: 18,
    priceBandRupees: { min: 169, max: 2399 },
    mrpExpected: true,
    model3D: "gift-ribbon",
    threeDPath: "builtin",
    collectionSlugs: ["collection-gift-packaging", "collection-personal"],
    madeToOrder: true,
    notes: "Photo gifts (toppers, mouse pads, decor) list better with the Photo gift starter.",
  },
  {
    categorySlug: "bulk-orders",
    starterId: "name-slips",
    gstPercent: 18,
    priceBandRupees: { min: 1799, max: 185000 },
    mrpExpected: false,
    model3D: "bulk-grid",
    threeDPath: "builtin",
    madeToOrder: true,
    notes: "Add quantity price breaks in the advanced editor after saving.",
  },
  {
    categorySlug: "paper-bags",
    starterId: "bag-luggage-tag",
    gstPercent: 18,
    priceBandRupees: { min: 1200, max: 1600 },
    mrpExpected: true,
    model3D: "paper-bag",
    threeDPath: "builtin",
    collectionSlugs: PERSONAL,
    madeToOrder: true,
    notes: "The retail custom-print bags shelf; the packaging bag subcategories quote per order instead.",
  },

  // ---- Packaging shelves (quote-priced, no GST on the listing, template-backed 3D)
  {
    categorySlug: "soap-boxes",
    packagingFieldPresetId: "soap-box",
    gstPercent: 0,
    mrpExpected: false,
    model3D: "folding-carton",
    threeDPath: "template",
    collectionSlugs: ["collection-soap-packaging", "collection-product-packaging"],
    madeToOrder: true,
  },
  {
    categorySlug: "perfume-cosmetic-boxes",
    packagingFieldPresetId: "generic-packaging",
    gstPercent: 0,
    mrpExpected: false,
    model3D: "folding-carton",
    threeDPath: "template",
    collectionSlugs: ["collection-perfume-cosmetics-packaging", "collection-product-packaging"],
    madeToOrder: true,
  },
  {
    categorySlug: "specialty-boxes",
    packagingFieldPresetId: "generic-packaging",
    gstPercent: 0,
    mrpExpected: false,
    model3D: "folding-carton",
    threeDPath: "template",
    collectionSlugs: PRODUCT_PACKAGING,
    madeToOrder: true,
    notes: "Pick the shape that matches when the 3D preview is created — square boxes get their own model.",
  },
  {
    // Gift and event boxes are rigid lid-and-base boxes, not tuck-end cartons.
    categorySlug: "gift-event-boxes",
    packagingFieldPresetId: "generic-packaging",
    gstPercent: 0,
    mrpExpected: false,
    model3D: "rigid-lid-box",
    threeDPath: "template",
    collectionSlugs: ["collection-gift-packaging", "collection-product-packaging"],
    madeToOrder: true,
  },
  {
    // A courier mailer is a flat poly envelope, not a gusseted bag with handles.
    categorySlug: "mailer-bags",
    packagingFieldPresetId: "courier-bag",
    gstPercent: 0,
    mrpExpected: false,
    model3D: "mailer-envelope",
    threeDPath: "template",
    collectionSlugs: ["collection-e-commerce-packaging"],
    madeToOrder: true,
  },
  {
    // Most shipping boxes are corrugated RSC cartons; tuck-top mailers are
    // recognised by name when the 3D preview is created.
    categorySlug: "shipping-boxes",
    packagingFieldPresetId: "generic-packaging",
    gstPercent: 0,
    mrpExpected: false,
    model3D: "rectangular-box",
    threeDPath: "template",
    collectionSlugs: ["collection-e-commerce-packaging"],
    madeToOrder: true,
  },
  {
    categorySlug: "branded-carry-bags",
    packagingFieldPresetId: "paper-bag",
    gstPercent: 0,
    mrpExpected: false,
    model3D: "paper-bag",
    threeDPath: "template",
    collectionSlugs: PRODUCT_PACKAGING,
    madeToOrder: true,
  },
  {
    categorySlug: "d-cut-paper-bags",
    packagingFieldPresetId: "paper-bag",
    gstPercent: 0,
    mrpExpected: false,
    model3D: "paper-bag",
    threeDPath: "template",
    collectionSlugs: PRODUCT_PACKAGING,
    madeToOrder: true,
  },
  {
    categorySlug: "branded-ziplock-pouches",
    packagingFieldPresetId: "ziplock-pouch",
    gstPercent: 0,
    mrpExpected: false,
    model3D: "stand-up-pouch",
    threeDPath: "template",
    collectionSlugs: PRODUCT_PACKAGING,
    madeToOrder: true,
  },
  {
    categorySlug: "snack-confectionery-boxes",
    packagingFieldPresetId: "generic-packaging",
    gstPercent: 0,
    mrpExpected: false,
    model3D: "folding-carton",
    threeDPath: "template",
    collectionSlugs: ["collection-food-packaging"],
    madeToOrder: true,
  },
  {
    categorySlug: "food-trays-delivery",
    packagingFieldPresetId: "generic-packaging",
    gstPercent: 0,
    mrpExpected: false,
    threeDPath: "none",
    collectionSlugs: ["collection-food-packaging"],
    madeToOrder: true,
    notes: "Open trays have no honest 3D model; box-shaped delivery cartons can get one from the advanced editor.",
  },
  {
    categorySlug: "food-pouches",
    packagingFieldPresetId: "ziplock-pouch",
    gstPercent: 0,
    mrpExpected: false,
    model3D: "stand-up-pouch",
    threeDPath: "template",
    collectionSlugs: ["collection-food-packaging"],
    madeToOrder: true,
  },

  // ---- Flat print (no solid shape to model)
  {
    categorySlug: "stickers",
    packagingFieldPresetId: "flat-print",
    gstPercent: 0,
    mrpExpected: false,
    model3D: "waterproof-sheet",
    threeDPath: "builtin",
    madeToOrder: true,
  },
  {
    categorySlug: "business-cards",
    packagingFieldPresetId: "business-card",
    gstPercent: 0,
    mrpExpected: false,
    threeDPath: "none",
    madeToOrder: true,
    notes: "A card is flat — a 3D box preview would misrepresent it.",
  },
  {
    categorySlug: "flyers-brochures",
    packagingFieldPresetId: "brochure",
    gstPercent: 0,
    mrpExpected: false,
    threeDPath: "none",
    madeToOrder: true,
  },
  {
    categorySlug: "thank-you-hang-tags",
    packagingFieldPresetId: "flat-print",
    gstPercent: 0,
    mrpExpected: false,
    threeDPath: "none",
    madeToOrder: true,
    notes: "Hang tags stay 2D until a tag model is verified against a real product photo.",
  },
];

const BY_SLUG = new Map(CATEGORY_LISTING_PLAYBOOK.map((recipe) => [recipe.categorySlug, recipe]));

export function getCategoryListingRecipe(categorySlug: string | undefined | null): CategoryListingRecipe | undefined {
  return categorySlug ? BY_SLUG.get(categorySlug) : undefined;
}

/** Category slugs the listing wizard must never offer: import buckets and test shelves. */
const HIDDEN_CATEGORY_SLUGS = new Set([
  "imported-ezpac", "imported-ranbazaar", "industry-collections", "bhautesh", "bhautesh1", "notestick",
]);

export interface ListableCategory {
  id: string;
  slug: string;
  name: string;
  parentId: string | null;
  isActive?: boolean;
}

/**
 * Categories an admin may list a *new* product into. Import buckets exist only so
 * re-runs of the importer stay idempotent; test shelves and the collection tree are
 * not sellable shelves. The advanced editor keeps the full list for existing rows.
 */
export function listableCategories<T extends ListableCategory>(categories: readonly T[]): T[] {
  const hiddenIds = new Set(
    categories.filter((category) => HIDDEN_CATEGORY_SLUGS.has(category.slug)).map((category) => category.id),
  );
  return categories.filter((category) => {
    if (category.isActive === false) return false;
    if (HIDDEN_CATEGORY_SLUGS.has(category.slug)) return false;
    return !(category.parentId && hiddenIds.has(category.parentId));
  });
}

export function isHiddenListingCategorySlug(slug: string) {
  return HIDDEN_CATEGORY_SLUGS.has(slug);
}

export function gstBasisPoints(gstPercent: 0 | 5 | 18) {
  return gstPercent * 100;
}

export function gstTaxCode(gstPercent: 0 | 5 | 18) {
  return gstPercent > 0 ? `IN-GST-${gstPercent}` : null;
}

/** A price this far outside the shelf's band is probably a typo — warn, never block. */
const BAND_TOLERANCE = 3;

export function priceBandWarning(
  recipe: CategoryListingRecipe | undefined,
  priceRupees: number,
): string | null {
  const band = recipe?.priceBandRupees;
  if (!band || !Number.isFinite(priceRupees) || priceRupees <= 0) return null;
  if (priceRupees < band.min / BAND_TOLERANCE) {
    return `That looks low for this shelf — similar products sell for ₹${band.min}–₹${band.max}.`;
  }
  if (priceRupees > band.max * BAND_TOLERANCE) {
    return `That looks high for this shelf — similar products sell for ₹${band.min}–₹${band.max}.`;
  }
  return null;
}

export function priceBandHint(recipe: CategoryListingRecipe | undefined): string | null {
  const band = recipe?.priceBandRupees;
  if (!band) return null;
  return band.min === band.max
    ? `Similar products: ₹${band.min}`
    : `Similar products: ₹${band.min}–₹${band.max}`;
}

/** Short, plain-language summary of what the shelf applied for the admin. */
export function recipeSummaryChips(recipe: CategoryListingRecipe | undefined, collectionNames: readonly string[] = []): string[] {
  if (!recipe) return [];
  return [
    recipe.gstPercent > 0 ? `GST ${recipe.gstPercent}%` : "No GST on this shelf",
    ...(collectionNames.length ? [`Also in: ${collectionNames.join(", ")}`] : []),
    ...(recipe.threeDPath === "builtin" ? ["3D preview ready"] : []),
  ];
}

const STOP_WORDS = new Set(["the", "and", "for", "with", "your", "a", "an", "of", "in", "to", "pack", "set"]);

/**
 * Derives 3-6 search tags from the product name and its shelf. Imported rows carry
 * source tags; admin rows had none, which made them rank worse in our own search.
 */
export function deriveListingTags(name: string, categoryName: string, extra: readonly string[] = []): string[] {
  const words = `${name} ${categoryName}`
    .toLocaleLowerCase("en-IN")
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
  const tags: string[] = [];
  for (const candidate of [categoryName.trim(), ...words, ...extra]) {
    const tag = candidate.trim().slice(0, 80);
    if (!tag) continue;
    if (tags.some((existing) => existing.toLocaleLowerCase("en-IN") === tag.toLocaleLowerCase("en-IN"))) continue;
    tags.push(tag);
    if (tags.length >= 6) break;
  }
  return tags;
}

export function deriveSeo(name: string, categoryName: string, description: string) {
  const title = `${name.trim()}${categoryName ? ` · ${categoryName.trim()}` : ""}`.slice(0, 160);
  const plain = description.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const fallback = `${name.trim()} — custom made and personalised${categoryName ? ` in ${categoryName.trim()}` : ""}.`;
  return { seoTitle: title, seoDescription: (plain || fallback).slice(0, 320) };
}
