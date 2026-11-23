/**
 * Typical finished sizes per packaging shelf, in millimetres (W × H × D).
 *
 * These sit between a product's own measured size and a 3D model's generic
 * default: a soap box should look like a soap box (90 × 60 × 30) even before
 * anyone types its exact size, instead of every carton sharing one placeholder.
 * Kept free of server-only imports — the storefront uses it in the browser.
 */
// A type alias (not an interface) so it stays assignable to Record<string, number>.
export type PackagingDimensionsMm = {
  width: number;
  height: number;
  depth: number;
};

export const PACKAGING_CATEGORY_DIMENSIONS_MM: Readonly<Record<string, PackagingDimensionsMm>> = {
  "soap-boxes": { width: 90, height: 60, depth: 30 },
  "perfume-cosmetic-boxes": { width: 60, height: 150, depth: 60 },
  "snack-confectionery-boxes": { width: 160, height: 60, depth: 100 },
  "specialty-boxes": { width: 120, height: 120, depth: 60 },
  "gift-event-boxes": { width: 200, height: 200, depth: 100 },
  "shipping-boxes": { width: 300, height: 200, depth: 150 },
  "d-cut-paper-bags": { width: 250, height: 350, depth: 80 },
  "branded-carry-bags": { width: 300, height: 400, depth: 100 },
  "branded-ziplock-pouches": { width: 150, height: 220, depth: 60 },
  "food-pouches": { width: 160, height: 240, depth: 90 },
  "mailer-bags": { width: 250, height: 330, depth: 2 },
};

export function packagingCategoryDimensions(
  categorySlug: string | undefined | null,
): PackagingDimensionsMm | undefined {
  const dimensions = categorySlug ? PACKAGING_CATEGORY_DIMENSIONS_MM[categorySlug] : undefined;
  return dimensions ? { ...dimensions } : undefined;
}

function positive(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * Picks the size a packaging preview should use, most specific first:
 * the product's own measured size, then the shelf's typical size, then the
 * model's generic default (returned as `undefined` so the renderer applies it).
 */
export function resolvePackagingDimensions(input: {
  productDimensions?: Readonly<Record<string, number>> | null;
  categorySlug?: string | null;
}): Record<string, number> | undefined {
  const own = input.productDimensions ?? undefined;
  if (own && positive(own.width) && positive(own.height)) return { ...own };
  const category = packagingCategoryDimensions(input.categorySlug);
  if (category) return { ...category };
  return undefined;
}
