import "server-only";

import { createHash } from "node:crypto";

import { CommerceError } from "./commerce-error";
import { createQuoteFromPricedItems, priceProductItem } from "./pricing-service";
import { resolveProductTemplateLinks } from "./product-template-resolution";
import { getStorefrontProductById } from "./runtime-catalog";
import type { Product } from "./types";
import type { CatalogQuoteInput } from "./validation";

function runtimePricingVersion(products: Product[]) {
  const rates = products.map((product) => ({
    id: product.id,
    variants: product.variants.map((variant) => ({ id: variant.id, price: variant.price })),
    fields: product.customizationFields.map((field) => ({
      id: field.id,
      priceDelta: field.priceDelta ?? 0,
      defaultValue: field.defaultValue,
      enabled: field.enabled !== false,
      customerVisible: field.customerVisible !== false,
      visibleWhen: field.visibleWhen,
      options: field.options?.map((option) => ({ value: option.value, priceDelta: option.priceDelta ?? 0 })) ?? [],
    })),
    configurator: {
      quantityMin: product.configurator?.quantityMin,
      quantityMax: product.configurator?.quantityMax,
      quantityTiers: product.configurator?.quantityTiers ?? [],
      setupCharge: product.configurator?.setupCharge ?? 0,
      configurationVersion: product.configurator?.configurationVersion,
      artworkPolicy: product.configurator?.artworkPolicy,
    },
    templates: resolveProductTemplateLinks(product).map(({ template, isDefault, sortOrder }) => ({
      id: template.id,
      premiumPrice: template.premiumPrice,
      active: template.active,
      isDefault,
      sortOrder,
    })),
  }));
  return `runtime-${createHash("sha256").update(JSON.stringify(rates)).digest("hex").slice(0, 16)}`;
}

/**
 * Quotes the same published runtime catalog that powers the storefront. Browser prices
 * are intentionally never read; only server-loaded variants and attribute definitions
 * determine the result.
 */
export async function createRuntimeCatalogQuote(input: CatalogQuoteInput) {
  const products = await Promise.all(input.items.map((item) => getStorefrontProductById(item.productId)));
  const missing = products.findIndex((product) => !product);
  if (missing >= 0) {
    throw new CommerceError(404, "PRODUCT_NOT_FOUND", "One of the selected products no longer exists.", {
      productId: input.items[missing].productId,
    });
  }
  const resolved = products as Product[];
  const items = input.items.map((item, index) => priceProductItem(resolved[index], item));
  return createQuoteFromPricedItems(items, runtimePricingVersion(resolved));
}
