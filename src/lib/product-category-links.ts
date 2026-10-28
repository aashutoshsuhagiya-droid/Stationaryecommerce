export function normalizeProductCategoryIds(
  primaryCategoryId: string,
  categoryIds: readonly string[] = [],
) {
  return [...new Set([primaryCategoryId, ...categoryIds].map((id) => id.trim()).filter(Boolean))];
}

export function vendorCoversProductCategories(
  serviceCategoryIds: readonly string[],
  requiredCategoryIds: readonly string[],
) {
  const serviceCategories = new Set(serviceCategoryIds.map((id) => id.trim()).filter(Boolean));
  const primaryCategoryId = requiredCategoryIds.map((id) => id.trim()).find(Boolean);
  return Boolean(primaryCategoryId && serviceCategories.has(primaryCategoryId));
}

/**
 * Prisma-compatible scope used when automatically creating vendor capabilities.
 * ProductCategory links are discovery-only; the primary Product.categoryId owns fulfillment.
 */
export function vendorProductCategoryScope(serviceCategoryIds: readonly string[]) {
  const categoryIds = [...new Set(serviceCategoryIds.map((id) => id.trim()).filter(Boolean))];
  return {
    categoryId: { in: categoryIds },
  };
}
