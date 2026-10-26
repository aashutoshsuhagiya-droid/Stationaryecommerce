import "server-only";

import { categories as demoCategories, getProductBySlug, products as demoProducts } from "./data";
import { getPrisma } from "./prisma";
import type { Category, CustomizationField, Product, ProductVariant, StockStatus } from "./types";

const jsonObject = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const stringList = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
const fieldType = (value: string): CustomizationField["type"] => ["text", "select", "color", "template", "image"].includes(value) ? value as CustomizationField["type"] : "text";

function stockStatus(variant: { isActive: boolean; inventoryPolicy: string; inventory: { quantityOnHand: number } | null }): StockStatus {
  if (!variant.isActive) return "out_of_stock";
  if (variant.inventoryPolicy === "MADE_TO_ORDER") return "made_to_order";
  if ((variant.inventory?.quantityOnHand ?? 0) <= 0) return "out_of_stock";
  return (variant.inventory?.quantityOnHand ?? 0) <= 5 ? "low_stock" : "in_stock";
}

function mapCategory(category: { id: string; slug: string; name: string; description: string | null; imageUrl: string | null; sortOrder: number }, productCount = 0): Category {
  return { id: category.id, slug: category.slug, name: category.name, shortName: category.name, description: category.description ?? "", image: category.imageUrl ?? "", artwork: "labels", accent: "mint", sortOrder: category.sortOrder, featured: false, productCount };
}

function mapProduct(product: any): Product {
  const metadata = jsonObject(product.metadata);
  const dimensions = jsonObject(product.dimensions);
  const variantList: ProductVariant[] = product.variants.map((variant: any) => {
    const options = jsonObject(variant.optionValues);
    return { id: variant.id, sku: variant.sku, name: variant.name, price: variant.pricePaise / 100, compareAtPrice: variant.compareAtPricePaise ? variant.compareAtPricePaise / 100 : undefined, size: typeof options.size === "string" ? options.size : undefined, color: typeof options.color === "string" ? options.color : undefined, material: typeof options.material === "string" ? options.material : undefined, packSize: typeof options.packSize === "number" ? options.packSize : undefined, stockStatus: stockStatus(variant) };
  });
  const fields: CustomizationField[] = product.personalizationFields.map((field: any) => {
    const config = jsonObject(field.optionConfig);
    return { id: field.key, label: field.label, type: fieldType(field.inputType), required: field.isRequired, minLength: field.minLength ?? undefined, maxLength: field.maxLength ?? undefined, options: Array.isArray(config.options) ? config.options as CustomizationField["options"] : undefined };
  });
  const images = product.images.map((image: any) => ({ id: image.id, src: image.url, alt: image.altText, width: image.width ?? 800, height: image.height ?? 800 }));
  return {
    id: product.id, slug: product.slug, sku: product.baseSku, name: product.name, categorySlug: product.category.slug, category: product.category.name,
    price: product.basePricePaise / 100, compareAtPrice: product.compareAtPricePaise ? product.compareAtPricePaise / 100 : undefined, customizable: product.customizable,
    description: product.description ?? product.shortDescription ?? "", shortDescription: product.shortDescription ?? "", material: product.material ?? "Not specified", dimensions: typeof dimensions.display === "string" ? dimensions.display : "Not specified", packSize: product.packSize,
    artwork: typeof metadata.artwork === "string" ? metadata.artwork : "labels", image: images[0]?.src ?? "", images, stockStatus: variantList[0]?.stockStatus ?? "made_to_order", featured: Boolean(metadata.featured), newArrival: Boolean(metadata.newArrival), tags: product.tags, features: stringList(metadata.features), careInstructions: typeof metadata.careInstructions === "string" ? metadata.careInstructions : undefined,
    productionDays: { min: product.productionDaysMin, max: product.productionDaysMax }, variants: variantList, customizationFields: fields, templateIds: [], sizes: stringList(metadata.sizes), colors: stringList(metadata.colors), themes: stringList(metadata.themes), badge: undefined,
    configurator: (() => { const config = jsonObject(metadata.configurator); const areas = Array.isArray(config.printAreas) ? config.printAreas.filter((area): area is { id: string; label: string } => !!area && typeof area === "object" && typeof (area as Record<string, unknown>).id === "string" && typeof (area as Record<string, unknown>).label === "string") : []; return { allow2D: config.allow2D !== false, allow3D: config.allow3D !== false, quantityMin: typeof config.quantityMin === "number" ? config.quantityMin : 1, quantityMax: typeof config.quantityMax === "number" ? config.quantityMax : 100, printAreas: areas.length ? areas : [{ id: "primary", label: "Primary print area" }] }; })(),
  };
}

const include = { category: true, images: { orderBy: { sortOrder: "asc" as const } }, variants: { include: { inventory: true }, orderBy: { sortOrder: "asc" as const } }, personalizationFields: { orderBy: { sortOrder: "asc" as const } } };

export async function getStorefrontCatalog() {
  try {
    const prisma = getPrisma();
    const [records, categoryRecords] = await Promise.all([
      prisma.product.findMany({ where: { status: "ACTIVE", publishedAt: { not: null, lte: new Date() }, archivedAt: null }, include, orderBy: { publishedAt: "desc" } }),
      prisma.category.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    ]);
    return { products: records.map(mapProduct), categories: categoryRecords.map((category) => mapCategory(category, records.filter((product) => product.categoryId === category.id).length)) };
  } catch {
    return { products: demoProducts, categories: demoCategories };
  }
}

export async function getStorefrontProduct(slug: string) {
  try {
    const record = await getPrisma().product.findFirst({ where: { slug, status: "ACTIVE", publishedAt: { not: null, lte: new Date() }, archivedAt: null }, include });
    return record ? mapProduct(record) : undefined;
  } catch {
    return getProductBySlug(slug);
  }
}

export async function getVendorCategoryOptions() {
  try {
    const records = await getPrisma().category.findMany({ where: { isActive: true }, include: { parent: { select: { name: true } } }, orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }] });
    return records.map((category) => ({ id: category.id, name: category.parent ? `${category.parent.name} · ${category.name}` : category.name, description: category.description ?? "" }));
  } catch {
    return demoCategories.slice().sort((left, right) => left.sortOrder - right.sortOrder).map(({ id, name, description }) => ({ id, name, description }));
  }
}
