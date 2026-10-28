import { designTemplates } from "./data";
import type { PersonalizationTemplate, Product, ProductTemplateLink } from "./types";

/**
 * Live catalog products use explicit ProductTemplate rows. Legacy/demo data
 * intentionally falls back to its existing static compatibility list.
 */
export function resolveProductTemplateLinks(product: Product): ProductTemplateLink[] {
  if (product.templateLinks !== undefined) {
    return product.templateLinks
      .filter((link) => link.template.active)
      .sort((left, right) => Number(right.isDefault) - Number(left.isDefault) || left.sortOrder - right.sortOrder);
  }

  return designTemplates
    .filter((template) => template.active && product.templateIds.includes(template.id) && template.compatibleProductIds.includes(product.id))
    .map((template, sortOrder) => ({ template, sortOrder, isDefault: sortOrder === 0 }));
}

export function resolveProductTemplate(product: Product, templateId: string): PersonalizationTemplate | undefined {
  return resolveProductTemplateLinks(product).find((link) => link.template.id === templateId)?.template;
}
