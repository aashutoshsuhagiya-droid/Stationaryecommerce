/**
 * Curated homes for imported source categories.
 *
 * The importer falls back to `Imported · <source> > <source category>` buckets
 * whenever a source category has no curated equivalent. That keeps re-runs
 * idempotent, but it leaves real products parked outside the shop's own
 * shelves. This map is the importer's second chance: source bucket slug →
 * curated category slug, applied before the fallback.
 *
 * Only unambiguous moves belong here. A source category whose products would
 * have to be split across shelves stays in its bucket until a human decides.
 */
export const IMPORTED_CATEGORY_MAP: Readonly<Record<string, string>> = {
  // Ranbazaar
  "premium-name-slips": "customized-name-slips",
  "exam-board": "school-accessories",
  "geometry-box": "school-accessories",
  "tracing-name-board": "school-accessories",
  "kids-utilities": "school-accessories",
  "gift-slip-for-gifts": "personalized-gifts",
  "cake-topper": "personalized-gifts",
  "decorative-items": "personalized-gifts",
  "shagun-envelopes": "personalized-gifts",
  "mouse-pad": "personalized-gifts",
  "kids-bottle-tiffin-box": "bottle-tiffin-labels",
  "customize-bottles": "bottle-tiffin-labels",
  "bulk-buy": "bulk-orders",
};

/**
 * Source categories deliberately left in their import bucket, with the reason.
 * Surfaced in the import report so the decision stays visible instead of
 * looking like an oversight.
 */
export const IMPORTED_CATEGORY_PENDING: Readonly<Record<string, string>> = {
  "t-shirts": "No garments shelf exists yet; create one before moving these.",
  "wrapping-paper": "Needs a 'Wrapping & posters' shelf decision in the storefront nav.",
  "vinyl-poster": "Needs the same 'Wrapping & posters' shelf decision.",
};

export function curatedCategorySlugForImport(sourceCategorySlug: string | undefined | null): string | undefined {
  return sourceCategorySlug ? IMPORTED_CATEGORY_MAP[sourceCategorySlug] : undefined;
}

export function importCategoryPendingReason(sourceCategorySlug: string | undefined | null): string | undefined {
  return sourceCategorySlug ? IMPORTED_CATEGORY_PENDING[sourceCategorySlug] : undefined;
}
