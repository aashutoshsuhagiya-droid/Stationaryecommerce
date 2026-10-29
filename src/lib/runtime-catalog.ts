import "server-only";

import { CommerceError } from "./commerce-error";
import { categories as demoCategories, getProductById, getProductBySlug, products as demoProducts } from "./data";
import { getPrisma } from "./prisma";
import { normalizeProductCategoryIds } from "./product-category-links";
import { productArtworkPolicySchema } from "./artwork-policy-schema";
import { normalizeTemplateProduction } from "./template-production";
import { visualizationSurfaceMappingsSchema } from "./visualization-studio-domain";
import { publicVisualizationAssetUrl } from "./visualization-studio-service-policy";
import { groupVendorCategories } from "./vendor-category-options";
import type { Category, CustomizationField, PersonalizationTemplate, Product, ProductTemplateLink, ProductVariant, ProductVisualizationTemplate, StockStatus } from "./types";

const jsonObject = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const stringList = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
const isFirstPartyProductImageUrl = (value: unknown): value is string =>
  typeof value === "string" && /^\/api\/product-images\/[A-Za-z0-9_-]{1,100}$/.test(value);
const fieldType = (value: string): CustomizationField["type"] => ["text", "select", "color", "template", "image", "number"].includes(value) ? value as CustomizationField["type"] : "text";

function mappedBaseImages(
  configurator: Record<string, unknown>,
  areas: Array<{ id: string }>,
) {
  return Object.fromEntries(areas.flatMap((area) => {
    const imageUrl = configurator[`${area.id}.baseImage`];
    return isFirstPartyProductImageUrl(imageUrl) ? [[area.id, imageUrl] as const] : [];
  }));
}

function mappedVisibleWhen(value: unknown, productId: string, fieldKey: string): CustomizationField["visibleWhen"] | undefined {
  if (value === undefined || value === null) return undefined;
  const condition = jsonObject(value);
  if (typeof condition.fieldId !== "string" || !condition.fieldId || typeof condition.equals !== "string") {
    throw new CommerceError(500, "CATALOG_CONFIGURATION_INVALID", "A product field has an invalid visibility rule.", { productId, fieldKey });
  }
  return { fieldId: condition.fieldId, equals: condition.equals };
}

function mappedOptions(value: unknown, productId: string, fieldKey: string): CustomizationField["options"] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((rawOption, index) => {
    const option = jsonObject(rawOption);
    if (typeof option.id !== "string" || typeof option.label !== "string" || typeof option.value !== "string") {
      throw new CommerceError(500, "CATALOG_CONFIGURATION_INVALID", "A product option is not configured safely.", { productId, fieldKey, optionIndex: index });
    }
    if (option.priceDelta !== undefined && (typeof option.priceDelta !== "number" || !Number.isFinite(option.priceDelta))) {
      throw new CommerceError(500, "CATALOG_CONFIGURATION_INVALID", "A product option has an invalid price adjustment.", { productId, fieldKey, optionIndex: index });
    }
    return { id: option.id, label: option.label, value: option.value, ...(typeof option.priceDelta === "number" ? { priceDelta: option.priceDelta } : {}) };
  });
}

function mappedQuantityTiers(value: unknown, productId: string) {
  if (!Array.isArray(value)) return [];
  const minimums = new Set<number>();
  return value.map((rawTier, index) => {
    const tier = jsonObject(rawTier);
    if (!Number.isInteger(tier.minimum) || (tier.minimum as number) < 1 || typeof tier.priceDelta !== "number" || !Number.isFinite(tier.priceDelta)) {
      throw new CommerceError(500, "CATALOG_CONFIGURATION_INVALID", "A quantity price break is not configured safely.", { productId, tierIndex: index });
    }
    if (minimums.has(tier.minimum as number)) {
      throw new CommerceError(500, "CATALOG_CONFIGURATION_INVALID", "A product has duplicate quantity price breaks.", { productId, tierIndex: index });
    }
    minimums.add(tier.minimum as number);
    if (tier.label !== undefined && typeof tier.label !== "string") {
      throw new CommerceError(500, "CATALOG_CONFIGURATION_INVALID", "A quantity price break has an invalid label.", { productId, tierIndex: index });
    }
    return { minimum: tier.minimum as number, priceDelta: tier.priceDelta, ...(typeof tier.label === "string" ? { label: tier.label } : {}) };
  }).sort((left, right) => left.minimum - right.minimum);
}

function mappedSetupCharge(value: unknown, productId: string) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new CommerceError(500, "CATALOG_CONFIGURATION_INVALID", "The product setup charge is not configured safely.", { productId });
  }
  return value;
}

function mappedArtworkPolicy(value: unknown, productId: string) {
  if (value === undefined || value === null) return undefined;
  const parsed = productArtworkPolicySchema.safeParse(value);
  if (!parsed.success) {
    throw new CommerceError(500, "CATALOG_CONFIGURATION_INVALID", "This product has an invalid artwork policy.", {
      productId,
      issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    });
  }
  return parsed.data;
}

const visualizationRoles = new Set([
  "front", "back", "left", "right", "top", "bottom", "wrap", "gusset", "inside", "other",
]);
const visualizationGeometryKinds = new Set([
  "box", "cylinder", "plane", "bag", "pouch", "label", "custom",
]);

function mappedVisualizationTemplate(value: any, productId: string): ProductVisualizationTemplate | undefined {
  const publishedAt = value?.publishedAt ? new Date(value.publishedAt) : null;
  if (
    !value
    || value.status !== "PUBLISHED"
    || !publishedAt
    || Number.isNaN(publishedAt.valueOf())
    || publishedAt > new Date()
    || value.archivedAt
  ) return undefined;
  const version = value.version;
  const geometry = jsonObject(value.geometry);
  const dimensions = jsonObject(value.dimensions);
  const geometryKind = typeof geometry.kind === "string" && visualizationGeometryKinds.has(geometry.kind)
    ? geometry.kind
    : undefined;
  if (
    typeof value.id !== "string"
    || typeof value.name !== "string"
    || typeof value.productType !== "string"
    || !Number.isSafeInteger(version)
    || version < 1
    || !geometryKind
  ) {
    throw new CommerceError(500, "CATALOG_CONFIGURATION_INVALID", "A published visualization template is invalid.", {
      productId,
      visualizationTemplateId: typeof value.id === "string" ? value.id : undefined,
    });
  }
  const dimensionsMm = Object.fromEntries(
    ["width", "height", "depth", "diameter", "gusset", "labelWidth", "labelHeight"].flatMap((key) => {
      const numeric = dimensions[key];
      return typeof numeric === "number" && Number.isFinite(numeric) && numeric > 0 && numeric <= 10_000_000
        ? [[key, numeric] as const]
        : [];
    }),
  );
  if (!Object.keys(dimensionsMm).length || dimensions.unit !== "mm") {
    throw new CommerceError(500, "CATALOG_CONFIGURATION_INVALID", "A published visualization has invalid dimensions.", {
      productId,
      visualizationTemplateId: value.id,
    });
  }
  const sourceAsset = Array.isArray(value.assets)
    ? value.assets.find((asset: any) =>
      asset?.kind === "SOURCE_IMAGE"
      && asset.storage === "DATABASE"
      && asset.productId === productId
      && typeof asset.id === "string"
      && typeof asset.sha256 === "string"
      && /^[a-f0-9]{64}$/i.test(asset.sha256)
      && Number.isSafeInteger(asset.width)
      && asset.width > 0
      && Number.isSafeInteger(asset.height)
      && asset.height > 0
      && ["image/jpeg", "image/png", "image/webp"].includes(asset.mimeType))
    : undefined;
  if (!sourceAsset) return undefined;
  const parsedSurfaceMappings = visualizationSurfaceMappingsSchema.safeParse(value.surfaceMappings);
  if (!parsedSurfaceMappings.success) {
    throw new CommerceError(500, "CATALOG_CONFIGURATION_INVALID", "A published visualization has an invalid surface mapping.", {
      productId,
      visualizationTemplateId: value.id,
    });
  }
  const surfaceIds = new Set<string>();
  const surfaces = parsedSurfaceMappings.data.map((rawSurface, index) => {
    const surface = jsonObject(rawSurface);
    const surfaceId = typeof surface.surfaceId === "string" ? surface.surfaceId.trim() : "";
    const label = typeof surface.label === "string" ? surface.label.trim() : "";
    const role = typeof surface.role === "string" && visualizationRoles.has(surface.role) ? surface.role : undefined;
    const normalizedId = surfaceId.toLowerCase();
    if (
      !/^[a-z0-9][a-z0-9_-]{0,79}$/i.test(surfaceId)
      || !label
      || label.length > 120
      || !role
      || surfaceIds.has(normalizedId)
    ) {
      throw new CommerceError(500, "CATALOG_CONFIGURATION_INVALID", "A published visualization has an invalid surface mapping.", {
        productId,
        visualizationTemplateId: value.id,
        surfaceIndex: index,
      });
    }
    surfaceIds.add(normalizedId);
    const bounds = jsonObject(surface.sourceBounds);
    const measurements = [bounds.x, bounds.y, bounds.width, bounds.height];
    const hasBounds = measurements.every((measurement): measurement is number =>
      typeof measurement === "number" && Number.isFinite(measurement));
    const validBounds = hasBounds
      && (bounds.x as number) >= 0
      && (bounds.y as number) >= 0
      && (bounds.width as number) > 0
      && (bounds.height as number) > 0
      && (bounds.x as number) + (bounds.width as number) <= 1 + Number.EPSILON
      && (bounds.y as number) + (bounds.height as number) <= 1 + Number.EPSILON;
    if (Object.keys(bounds).length && !validBounds) {
      throw new CommerceError(500, "CATALOG_CONFIGURATION_INVALID", "A published visualization has invalid panel bounds.", {
        productId,
        visualizationTemplateId: value.id,
        surfaceIndex: index,
      });
    }
    return {
      surfaceId,
      label,
      role: role as "front" | "back" | "left" | "right" | "top" | "bottom" | "wrap" | "gusset" | "inside" | "other",
      ...(validBounds ? {
        sourceBounds: {
          x: bounds.x as number,
          y: bounds.y as number,
          width: bounds.width as number,
          height: bounds.height as number,
        },
      } : {}),
      ...((validBounds || index === 0) ? {
        textureUrl: publicVisualizationAssetUrl(sourceAsset.id, surfaceId),
      } : {}),
    };
  });
  const manufacturingMetadata = jsonObject(value.manufacturingMetadata);
  return {
    id: value.id,
    version,
    name: value.name,
    productType: value.productType,
    geometryKind: geometryKind as "box" | "cylinder" | "plane" | "bag" | "pouch" | "label" | "custom",
    dimensionsMm,
    surfaces,
    sourceAsset: {
      id: sourceAsset.id,
      width: sourceAsset.width,
      height: sourceAsset.height,
      mimeType: sourceAsset.mimeType as "image/jpeg" | "image/png" | "image/webp",
    },
    manufacturingValidated: manufacturingMetadata.validated === true,
  };
}

function mappedTemplatePreview(value: unknown): PersonalizationTemplate["preview"] | undefined {
  const preview = jsonObject(value);
  const safeArea = jsonObject(preview.safeArea);
  const color = (candidate: unknown) => typeof candidate === "string" && /^#[0-9a-f]{3,8}$/i.test(candidate) ? candidate : undefined;
  const background = color(preview.background);
  const foreground = color(preview.foreground);
  const accent = color(preview.accent);
  const fontFamily = typeof preview.fontFamily === "string" && /^[a-z0-9 ,'-]{1,80}$/i.test(preview.fontFamily) ? preview.fontFamily : undefined;
  const textAlign = preview.textAlign === "left" || preview.textAlign === "center" || preview.textAlign === "right" ? preview.textAlign : undefined;
  const x = safeArea.x;
  const y = safeArea.y;
  const width = safeArea.width;
  const height = safeArea.height;
  const measurements = [x, y, width, height];
  if (!background || !foreground || !accent || !fontFamily || !textAlign || !measurements.every((item): item is number => typeof item === "number" && Number.isFinite(item))) return undefined;
  const [safeX, safeY, safeWidth, safeHeight] = measurements;
  if (safeX < 0 || safeY < 0 || safeWidth <= 0 || safeHeight <= 0 || safeX + safeWidth > 100 || safeY + safeHeight > 100) return undefined;
  return { background, foreground, accent, fontFamily, textAlign, safeArea: { x: safeX, y: safeY, width: safeWidth, height: safeHeight } };
}

function mappedTemplateLink(link: any, productId: string): ProductTemplateLink | undefined {
  const template = link?.template;
  if (!template || template.status !== "ACTIVE") return undefined;
  const preview = mappedTemplatePreview(template.previewConfig);
  if (!preview) return undefined;
  let production: NonNullable<PersonalizationTemplate["production"]>;
  try {
    production = normalizeTemplateProduction(template);
  } catch (error) {
    throw new CommerceError(500, "CATALOG_CONFIGURATION_INVALID", "A product template has invalid production configuration.", {
      productId,
      templateId: typeof template.id === "string" ? template.id : undefined,
      reason: error instanceof Error ? error.message : "Unknown template configuration error",
    });
  }
  return {
    sortOrder: Number.isInteger(link.sortOrder) && link.sortOrder >= 0 ? link.sortOrder : 0,
    isDefault: link.isDefault === true,
    template: {
      id: template.id,
      slug: template.slug,
      name: template.name,
      theme: typeof template.theme === "string" ? template.theme : "",
      description: typeof template.description === "string" ? template.description : "",
      thumbnail: typeof template.thumbnailUrl === "string" ? template.thumbnailUrl : "",
      artwork: template.slug,
      premiumPrice: typeof template.premiumPricePaise === "number" && Number.isFinite(template.premiumPricePaise) ? template.premiumPricePaise / 100 : 0,
      active: true,
      rightsStatement: typeof template.rightsReference === "string" ? template.rightsReference : "",
      compatibleProductIds: [productId],
      preview,
      production,
    },
  };
}

function stockStatus(variant: { isActive: boolean; inventoryPolicy: string; inventory: { quantityOnHand: number } | null }): StockStatus {
  if (!variant.isActive) return "out_of_stock";
  if (variant.inventoryPolicy === "MADE_TO_ORDER") return "made_to_order";
  if ((variant.inventory?.quantityOnHand ?? 0) <= 0) return "out_of_stock";
  return (variant.inventory?.quantityOnHand ?? 0) <= 5 ? "low_stock" : "in_stock";
}

function mapCategory(category: { id: string; parentId: string | null; slug: string; name: string; description: string | null; imageUrl: string | null; sortOrder: number }, productCount = 0): Category {
  return { id: category.id, parentId: category.parentId, slug: category.slug, name: category.name, shortName: category.name, description: category.description ?? "", image: category.imageUrl ?? "", artwork: "labels", accent: "mint", sortOrder: category.sortOrder, featured: false, productCount };
}

function mapProduct(product: any): Product {
  const metadata = jsonObject(product.metadata);
  const dimensions = jsonObject(product.dimensions);
  const configurator = jsonObject(metadata.configurator);
  const visualizationTemplate = Array.isArray(product.visualizationTemplates)
    ? mappedVisualizationTemplate(product.visualizationTemplates[0], product.id)
    : undefined;
  const linkedCategories = Array.isArray(product.categoryLinks)
    ? product.categoryLinks.flatMap((link: any) => {
      const category = link?.category;
      if (!category?.isActive || (category.parentId && !category.parent?.isActive)) return [];
      return [{ id: category.id as string, slug: category.slug as string }];
    })
    : [];
  const categoryIds = normalizeProductCategoryIds(
    product.categoryId,
    linkedCategories.map((category: { id: string; slug: string }) => category.id),
  );
  const categorySlugs = [...new Set([
    product.category.slug,
    ...linkedCategories.map((category: { id: string; slug: string }) => category.slug),
  ])];
  const templateLinks: ProductTemplateLink[] = Array.isArray(product.templateLinks)
    ? product.templateLinks.flatMap((link: any) => {
      const mapped = mappedTemplateLink(link, product.id);
      return mapped ? [mapped] : [];
    })
    : [];
  const variantList: ProductVariant[] = product.variants.map((variant: any) => {
    const options = jsonObject(variant.optionValues);
    return { id: variant.id, sku: variant.sku, name: variant.name, price: variant.pricePaise / 100, compareAtPrice: variant.compareAtPricePaise ? variant.compareAtPricePaise / 100 : undefined, size: typeof options.size === "string" ? options.size : undefined, color: typeof options.color === "string" ? options.color : undefined, material: typeof options.material === "string" ? options.material : undefined, packSize: typeof options.packSize === "number" ? options.packSize : undefined, stockStatus: stockStatus(variant) };
  });
  const fields: CustomizationField[] = product.personalizationFields.map((field: any) => {
    const config = jsonObject(field.optionConfig);
    const validation = jsonObject(field.validation);
    if (typeof field.priceDeltaPaise !== "number" || !Number.isFinite(field.priceDeltaPaise)) {
      throw new CommerceError(500, "CATALOG_CONFIGURATION_INVALID", "A product field has an invalid price adjustment.", { productId: product.id, fieldKey: field.key });
    }
    return {
      id: field.key,
      label: field.label,
      type: fieldType(field.inputType),
      required: field.isRequired,
      placeholder: typeof validation.placeholder === "string" ? validation.placeholder : undefined,
      helpText: typeof validation.helpText === "string" ? validation.helpText : undefined,
      defaultValue: typeof validation.defaultValue === "string" ? validation.defaultValue : undefined,
      unit: typeof validation.unit === "string" ? validation.unit : undefined,
      enabled: validation.enabled !== false,
      customerVisible: validation.customerVisible !== false,
      visibleWhen: mappedVisibleWhen(validation.visibleWhen, product.id, field.key),
      minLength: field.minLength ?? undefined,
      maxLength: field.maxLength ?? undefined,
      allowedPattern: typeof validation.allowedPattern === "string" ? validation.allowedPattern : undefined,
      minValue: typeof validation.minValue === "number" ? validation.minValue : undefined,
      maxValue: typeof validation.maxValue === "number" ? validation.maxValue : undefined,
      step: typeof validation.step === "number" ? validation.step : undefined,
      options: mappedOptions(config.options, product.id, field.key),
      priceDelta: field.priceDeltaPaise / 100,
    };
  });
  const images = product.images.map((image: any) => ({ id: image.id, src: image.url, alt: image.altText, width: image.width ?? 800, height: image.height ?? 800 }));
  return {
    id: product.id, slug: product.slug, sku: product.baseSku, name: product.name, categorySlug: product.category.slug, category: product.category.name, categoryIds, categorySlugs,
    price: product.basePricePaise / 100, compareAtPrice: product.compareAtPricePaise ? product.compareAtPricePaise / 100 : undefined, customizable: product.customizable,
    description: product.description ?? product.shortDescription ?? "", shortDescription: product.shortDescription ?? "", material: product.material ?? "Not specified", dimensions: typeof dimensions.display === "string" ? dimensions.display : "Not specified", packSize: product.packSize,
    artwork: typeof metadata.artwork === "string" ? metadata.artwork : "labels", image: images[0]?.src ?? "", images, stockStatus: variantList[0]?.stockStatus ?? "made_to_order", featured: Boolean(metadata.featured), newArrival: Boolean(metadata.newArrival), tags: product.tags, features: stringList(metadata.features), careInstructions: typeof metadata.careInstructions === "string" ? metadata.careInstructions : undefined,
    productionDays: { min: product.productionDaysMin, max: product.productionDaysMax }, variants: variantList, customizationFields: fields, templateIds: templateLinks.map((link) => link.template.id), templateLinks, sizes: stringList(metadata.sizes), colors: stringList(metadata.colors), themes: stringList(metadata.themes), productType: typeof metadata.productType === "string" ? metadata.productType : undefined, badge: undefined,
    configurator: (() => {
      const areas = Array.isArray(configurator.printAreas) ? configurator.printAreas.flatMap((area) => {
        if (!area || typeof area !== "object") return [];
        const record = area as Record<string, unknown>;
        if (typeof record.id !== "string" || typeof record.label !== "string") return [];
        return [{
          id: record.id,
          label: record.label,
          widthMm: typeof record.widthMm === "number" ? record.widthMm : undefined,
          heightMm: typeof record.heightMm === "number" ? record.heightMm : undefined,
          safeInsetMm: typeof record.safeInsetMm === "number" ? record.safeInsetMm : undefined,
        }];
      }) : [];
      const printedAreas = areas.length ? areas : [{ id: "primary", label: "Primary print area" }];
      const mimeTypes = stringList(configurator.acceptedMimeTypes);
      const baseImages = mappedBaseImages(configurator, areas);
      return {
        allow2D: configurator.allow2D !== false,
        allow3D: configurator.allow3D === true,
        quantityMin: typeof configurator.quantityMin === "number" ? configurator.quantityMin : 1,
        quantityMax: typeof configurator.quantityMax === "number" ? configurator.quantityMax : 100,
        quantityTiers: mappedQuantityTiers(configurator.quantityTiers, product.id),
        setupCharge: mappedSetupCharge(configurator.setupCharge, product.id),
        printAreas: printedAreas,
        ...(Object.keys(baseImages).length ? { baseImages } : {}),
        artworkUpload: {
          enabled: Boolean(configurator.artworkUpload),
          acceptedMimeTypes: mimeTypes,
          maximumBytes: typeof configurator.maximumArtworkBytes === "number" ? configurator.maximumArtworkBytes : 2_000_000,
        },
        artworkPolicy: mappedArtworkPolicy(configurator.artworkPolicy, product.id),
        previewTemplate: typeof configurator.previewTemplate === "string" ? configurator.previewTemplate : undefined,
        productModel: typeof configurator.productModel === "string" ? configurator.productModel : undefined,
        configurationVersion: typeof configurator.configurationVersion === "string" ? configurator.configurationVersion : undefined,
        ...(visualizationTemplate ? { visualizationTemplate } : {}),
      };
    })(),
  };
}

const include = { category: { include: { parent: { select: { id: true, isActive: true } } } }, categoryLinks: { include: { category: { include: { parent: { select: { id: true, isActive: true } } } } } }, images: { orderBy: { sortOrder: "asc" as const } }, variants: { include: { inventory: true }, orderBy: { sortOrder: "asc" as const } }, personalizationFields: { orderBy: { sortOrder: "asc" as const } }, templateLinks: { include: { template: true }, orderBy: [{ isDefault: "desc" as const }, { sortOrder: "asc" as const }] }, visualizationTemplates: { where: { status: "PUBLISHED" as const, publishedAt: { not: null }, archivedAt: null }, orderBy: { publishedAt: "desc" as const }, take: 1, select: { id: true, version: true, name: true, productType: true, status: true, geometry: true, dimensions: true, surfaceMappings: true, manufacturingMetadata: true, publishedAt: true, archivedAt: true, assets: { where: { kind: "SOURCE_IMAGE" as const, storage: "DATABASE" as const, sha256: { not: null }, mimeType: { in: ["image/jpeg", "image/png", "image/webp"] } }, take: 1, select: { id: true, productId: true, kind: true, storage: true, mimeType: true, width: true, height: true, sha256: true } } } } };
const storefrontCategoryWhere = { isActive: true, OR: [{ parentId: null }, { parent: { isActive: true } }] };

export async function getStorefrontCatalog() {
  try {
    const prisma = getPrisma();
    const [records, categoryRecords] = await Promise.all([
      prisma.product.findMany({ where: { status: "ACTIVE", publishedAt: { not: null, lte: new Date() }, archivedAt: null, category: storefrontCategoryWhere }, include, orderBy: { publishedAt: "desc" } }),
      prisma.category.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    ]);
    const products = records.flatMap((record) => {
      try {
        return [mapProduct(record)];
      } catch (error) {
        if (error instanceof CommerceError) return [];
        throw error;
      }
    });
    const categoryById = new Map(categoryRecords.map((category) => [category.id, category]));
    const visibleCategories = categoryRecords.filter((category) => !category.parentId || Boolean(categoryById.get(category.parentId)));
    return { products, categories: visibleCategories.map((category) => mapCategory(category, products.filter((product) => (product.categorySlugs ?? [product.categorySlug]).includes(category.slug)).length)) };
  } catch {
    return { products: demoProducts, categories: demoCategories };
  }
}

export async function getStorefrontProduct(slug: string) {
  try {
    const record = await getPrisma().product.findUnique({ where: { slug }, include });
    if (!record) return getProductBySlug(slug);
    const isPublished = record.status === "ACTIVE" && record.publishedAt && record.publishedAt <= new Date() && !record.archivedAt && record.category.isActive && (!record.category.parentId || record.category.parent?.isActive);
    return isPublished ? mapProduct(record) : undefined;
  } catch (error) {
    if (error instanceof CommerceError) throw error;
    return getProductBySlug(slug);
  }
}

export async function getStorefrontProductById(id: string) {
  try {
    const record = await getPrisma().product.findUnique({ where: { id }, include });
    if (!record) return getProductById(id);
    const isPublished = record.status === "ACTIVE" && record.publishedAt && record.publishedAt <= new Date() && !record.archivedAt && record.category.isActive && (!record.category.parentId || record.category.parent?.isActive);
    return isPublished ? mapProduct(record) : undefined;
  } catch (error) {
    if (error instanceof CommerceError) throw error;
    return getProductById(id);
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

export async function getVendorCategoryGroups() {
  try {
    const records = await getPrisma().category.findMany({
      where: storefrontCategoryWhere,
      select: { id: true, name: true, description: true, parentId: true, sortOrder: true },
      orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }],
    });
    return groupVendorCategories(records);
  } catch {
    return groupVendorCategories(
      demoCategories.map(({ id, name, description, sortOrder }) => ({
        id,
        name,
        description,
        parentId: null,
        sortOrder,
      })),
    );
  }
}
