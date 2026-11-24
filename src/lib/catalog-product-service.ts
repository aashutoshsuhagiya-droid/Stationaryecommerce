/**
 * Admin catalog product create/update, shared by `/api/admin/catalog` and the
 * one-click listing flow (`/api/admin/listings`). Validation and invariants live
 * here once: the 3D gate (`assertProductPreviewAllowed`), artwork-upload publish
 * checks, category checks, and the PATCH guard that keeps a product's studio
 * designs and the fields they bind. Callers handle auth and cache revalidation.
 */
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { productArtworkPolicySchema } from "@/lib/artwork-policy-schema";
import { CommerceError } from "@/lib/commerce-error";
import {
  MAX_CUSTOMIZATION_PATTERN_LENGTH,
  customizationPatternIssue,
  normalizeCustomizationPattern,
} from "@/lib/customization-pattern";
import { isEzpacPackagingProductType } from "@/lib/ezpac-packaging-presets";
import { EZPAC_FEATURE_BULLETS } from "@/lib/ezpac-feature-bullets";
import { getPrisma } from "@/lib/prisma";
import { normalizeProductCategoryIds } from "@/lib/product-category-links";
import { resolveVisualizationProductModel } from "@/lib/visualization-studio-service-policy";
import { isStudioTemplateSlug } from "@/lib/studio-design";
import { readStudioConfig } from "@/lib/studio-template";

export const slugify = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
export const catalogImageUrlSchema = z.string().trim().max(2_000).refine((value) => {
  if (value.startsWith("/api/")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}, "Use an HTTP(S) URL or a first-party /api/ image URL.");
export const structuredDescriptionSchema = z.object({
  intro: z.string().trim().max(2_000).optional(),
  bestFor: z.array(z.string().trim().min(1).max(120)).max(12).optional(),
  featureBullets: z.array(z.enum(EZPAC_FEATURE_BULLETS)).max(EZPAC_FEATURE_BULLETS.length).optional(),
}).strict();
export const extraImagesField = z.array(z.object({
  url: catalogImageUrlSchema,
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
})).max(5);
export const optionSchema = z.object({ label: z.string().trim().min(1).max(120), value: z.string().trim().min(1).max(120), priceDelta: z.number().finite().min(-100_000).max(100_000).default(0) }).strict();
export const quantityTierSchema = z.object({ minimum: z.number().int().min(1).max(1000), priceDelta: z.number().finite().min(-100_000).max(100_000), label: z.string().trim().max(80).optional() }).strict();
export const productModelSchema = z.enum(["label-pack", "waterproof-sheet", "school-kit", "notebook", "bottle-label", "pencil-set", "tag", "geometry-box", "gift-ribbon", "keychain-duo", "bulk-grid", "rectangular-box", "square-box", "folding-carton", "mailer-box", "paper-bag", "stand-up-pouch", "product-sleeve", "rigid-lid-box", "mailer-envelope", "pyramid-box"]);
export const packagingProductModels = new Set([
  "rectangular-box", "square-box", "folding-carton", "mailer-box", "rigid-lid-box",
  "paper-bag", "stand-up-pouch", "product-sleeve", "mailer-envelope", "pyramid-box",
]);
export const fieldVisibilitySchema = z.object({ fieldId: z.string().trim().regex(/^[a-z][a-z0-9-]{0,79}$/), equals: z.string().max(120) }).strict();
export const templateLinkSchema = z.object({ templateId: z.string().trim().min(1).max(100), isDefault: z.boolean().default(false) }).strict();
export const allowedPatternSchema = z.string().trim().max(MAX_CUSTOMIZATION_PATTERN_LENGTH).nullable().optional();
export const configurationFieldSchema = z.object({ key: z.string().trim().regex(/^[a-z][a-z0-9-]{0,79}$/), label: z.string().trim().min(1).max(120), inputType: z.enum(["text", "select", "color", "number"]), required: z.boolean().default(false), placeholder: z.string().trim().max(240).nullable().optional(), helpText: z.string().trim().max(240).nullable().optional(), defaultValue: z.string().max(500).nullable().optional(), unit: z.string().trim().max(40).nullable().optional(), enabled: z.boolean().default(true), customerVisible: z.boolean().default(true), visibleWhen: fieldVisibilitySchema.nullable().optional(), minLength: z.number().int().min(0).max(500).nullable().optional(), maxLength: z.number().int().min(1).max(500).nullable().optional(), allowedPattern: allowedPatternSchema, minValue: z.number().finite().min(-1_000_000).max(1_000_000).nullable().optional(), maxValue: z.number().finite().min(-1_000_000).max(1_000_000).nullable().optional(), step: z.number().finite().positive().max(1_000_000).nullable().optional(), priceDelta: z.number().finite().min(-100_000).max(100_000).default(0), options: z.array(optionSchema).max(50).default([]) }).strict().superRefine((field, context) => { if (field.inputType === "select" && field.enabled && field.customerVisible && !field.options.length) context.addIssue({ code: "custom", path: ["options"], message: "Add at least one choice before enabling a customer dropdown." }); if (field.minLength && field.maxLength && field.minLength > field.maxLength) context.addIssue({ code: "custom", path: ["maxLength"], message: "Maximum length must be at least the minimum." }); if (field.minValue !== null && field.maxValue !== null && field.minValue !== undefined && field.maxValue !== undefined && field.minValue > field.maxValue) context.addIssue({ code: "custom", path: ["maxValue"], message: "Maximum value must be at least the minimum." }); if (field.inputType !== "number" && (field.minValue !== null && field.minValue !== undefined || field.maxValue !== null && field.maxValue !== undefined || field.step !== null && field.step !== undefined)) context.addIssue({ code: "custom", path: ["inputType"], message: "Numeric limits can only be used on a number field." }); if (field.inputType === "select" && field.defaultValue && field.options.length && !field.options.some((option) => option.value === field.defaultValue)) context.addIssue({ code: "custom", path: ["defaultValue"], message: "The default choice must match an available option." }); const patternIssue = customizationPatternIssue(field.allowedPattern); if (patternIssue) context.addIssue({ code: "custom", path: ["allowedPattern"], message: patternIssue }); if (field.inputType !== "text" && normalizeCustomizationPattern(field.allowedPattern)) context.addIssue({ code: "custom", path: ["allowedPattern"], message: "Allowed-character patterns can only be used on text fields." }); });
export const printAreaSchema = z.object({ id: z.string().trim().regex(/^[a-z][a-z0-9-]{0,79}$/), label: z.string().trim().min(1).max(80), widthMm: z.number().finite().positive().max(10_000).nullable().optional(), heightMm: z.number().finite().positive().max(10_000).nullable().optional(), safeInsetMm: z.number().finite().min(0).max(1_000).nullable().optional() }).strict().superRefine((area, context) => { if ((area.widthMm === null) !== (area.heightMm === null) || (area.widthMm === undefined) !== (area.heightMm === undefined)) context.addIssue({ code: "custom", path: ["widthMm"], message: "Enter both print-area width and height, or leave both blank." }); if (area.safeInsetMm && area.widthMm && area.heightMm && area.safeInsetMm * 2 >= Math.min(area.widthMm, area.heightMm)) context.addIssue({ code: "custom", path: ["safeInsetMm"], message: "Safe inset must leave a printable region." }); });
export const productSchema = z.object({ type: z.literal("product"), name: z.string().trim().min(2).max(180), sku: z.string().trim().min(2).max(80), categoryId: z.string().min(1), categoryIds: z.array(z.string().trim().min(1).max(100)).max(30).optional(), productType: z.string().trim().max(120).optional(), price: z.number().nonnegative(), compareAtPrice: z.number().nonnegative().max(10_000_000).optional(), gstPercent: z.union([z.literal(0), z.literal(5), z.literal(18)]).optional(), tags: z.array(z.string().trim().min(1).max(80)).max(30).optional(), seoTitle: z.string().trim().max(160).optional(), seoDescription: z.string().trim().max(320).optional(), stockOnHand: z.number().int().min(0).max(1_000_000).optional(), description: z.string().trim().max(10_000).optional(), shortDescription: z.string().trim().max(400).optional(), imageUrl: catalogImageUrlSchema, material: z.string().trim().max(160).optional(), sizes: z.array(z.string().trim().min(1).max(80)).max(30).default([]), sizeDescription: z.string().trim().max(240).optional(), features: z.array(z.string().trim().min(1).max(200)).max(30).default([]), configurationFields: z.array(configurationFieldSchema).max(20).default([]), templateLinks: z.array(templateLinkSchema).max(20).optional(), printAreas: z.array(printAreaSchema).min(1).max(8).default([{ id: "primary", label: "Primary print area" }]), previewTemplate: z.string().trim().max(120).optional(), productModel: productModelSchema.optional(), artworkUpload: z.boolean().default(false), acceptedArtworkTypes: z.array(z.enum(["image/png", "image/jpeg", "image/webp"])).max(3).default(["image/png", "image/jpeg"]), artworkPolicy: productArtworkPolicySchema.optional(), customizable: z.boolean().default(false), published: z.boolean().default(false), allow2D: z.boolean().default(true), allow3D: z.boolean().default(false), quantityMin: z.number().int().min(1).max(1000).default(1), quantityMax: z.number().int().min(1).max(1000).default(100), quantityTiers: z.array(quantityTierSchema).max(20).default([]), setupCharge: z.number().finite().min(0).max(100_000).default(0), productionDaysMin: z.number().int().min(0).max(365).default(0), productionDaysMax: z.number().int().min(0).max(365).default(0) }).refine((value) => value.productionDaysMax >= value.productionDaysMin && value.quantityMax >= value.quantityMin, { message: "Maximum values must be at least the corresponding minimum." }).refine((value) => value.compareAtPrice === undefined || value.compareAtPrice === 0 || value.compareAtPrice >= value.price, { message: "The MRP must be at least the selling price.", path: ["compareAtPrice"] }).superRefine((value, context) => { const keys = new Set<string>(); const printAreas = new Set<string>(); const tierMinimums = new Set<number>(); const templateIds = new Set<string>(); let defaultTemplateCount = 0; value.templateLinks?.forEach((link, index) => { if (templateIds.has(link.templateId)) context.addIssue({ code: "custom", path: ["templateLinks", index, "templateId"], message: "A design template can only be linked once." }); templateIds.add(link.templateId); if (link.isDefault) defaultTemplateCount += 1; }); if (defaultTemplateCount > 1) context.addIssue({ code: "custom", path: ["templateLinks"], message: "Choose at most one default design template." }); value.configurationFields.forEach((field, index) => { if (keys.has(field.key)) context.addIssue({ code: "custom", path: ["configurationFields", index, "key"], message: "Field keys must be unique." }); keys.add(field.key); if (field.visibleWhen) { if (field.visibleWhen.fieldId === field.key) context.addIssue({ code: "custom", path: ["configurationFields", index, "visibleWhen"], message: "A field cannot control its own visibility." }); const controller = value.configurationFields.find((candidate) => candidate.key === field.visibleWhen?.fieldId); if (!controller) context.addIssue({ code: "custom", path: ["configurationFields", index, "visibleWhen", "fieldId"], message: "Choose an existing controlling field." }); else if (controller.inputType === "select" && controller.options.length && !controller.options.some((option) => option.value === field.visibleWhen?.equals)) context.addIssue({ code: "custom", path: ["configurationFields", index, "visibleWhen", "equals"], message: "The visibility value must match a controlling dropdown choice." }); } }); value.printAreas.forEach((area, index) => { if (printAreas.has(area.id)) context.addIssue({ code: "custom", path: ["printAreas", index, "id"], message: "Print area IDs must be unique." }); printAreas.add(area.id); }); value.quantityTiers.forEach((tier, index) => { if (tierMinimums.has(tier.minimum)) context.addIssue({ code: "custom", path: ["quantityTiers", index, "minimum"], message: "Each quantity break needs a unique minimum." }); if (tier.minimum < value.quantityMin || tier.minimum > value.quantityMax) context.addIssue({ code: "custom", path: ["quantityTiers", index, "minimum"], message: "Quantity breaks must fall within the product's order range." }); tierMinimums.add(tier.minimum); }); if (value.allow3D && !value.productModel) context.addIssue({ code: "custom", path: ["productModel"], message: "Choose a validated product model before enabling 3D preview." }); if (value.artworkPolicy) { const surfaceIds = new Set(value.printAreas.map((area) => area.id)); value.artworkPolicy.surfaces.forEach((surface, index) => { if (!surfaceIds.has(surface.id)) context.addIssue({ code: "custom", path: ["artworkPolicy", "surfaces", index, "id"], message: "Artwork policy surfaces must match a configured print area." }); }); if (value.artworkUpload && !value.artworkPolicy.surfaces.some((surface) => surface.image.enabled)) context.addIssue({ code: "custom", path: ["artworkPolicy"], message: "Enable image controls on at least one surface before enabling uploads." }); } });
export const catalogProductSchema = productSchema.extend({
  structuredDescription: structuredDescriptionSchema.optional(),
  extraImages: extraImagesField.optional(),
});
export const objectRecord = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export const strings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
export const nextConfigurationVersion = (value: Record<string, unknown>) => {
  const current = typeof value.configurationVersion === "string" ? Number(value.configurationVersion) : 0;
  return Number.isSafeInteger(current) && current >= 0 && current < 1_000_000 ? String(current + 1) : "1";
};

export async function writeExtraProductImages(
  prisma: Prisma.TransactionClient,
  productId: string,
  imageUrl: string,
  extraImages: z.infer<typeof extraImagesField> | undefined,
  altText: string,
) {
  if (extraImages === undefined) return;
  const desiredImages: Array<{ url: string; width?: number; height?: number }> = [
    { url: imageUrl },
    ...extraImages,
  ];
  const dedupedImages = desiredImages.filter(
    (image, index, images) => images.findIndex((candidate) => candidate.url === image.url) === index,
  );
  await Promise.all(dedupedImages.slice(1).map((image, index) =>
    prisma.productImage.upsert({
      where: { productId_sortOrder: { productId, sortOrder: index + 1 } },
      update: {
        url: image.url,
        altText,
        width: image.width ?? null,
        height: image.height ?? null,
      },
      create: {
        productId,
        url: image.url,
        altText,
        width: image.width ?? null,
        height: image.height ?? null,
        sortOrder: index + 1,
      },
    }),
  ));
  await prisma.productImage.deleteMany({ where: { productId, sortOrder: { gt: dedupedImages.length - 1 } } });
}

export function configurationFieldValidation(field: z.infer<typeof configurationFieldSchema>) {
  return {
    minValue: field.inputType === "number" ? field.minValue ?? null : null,
    maxValue: field.inputType === "number" ? field.maxValue ?? null : null,
    step: field.inputType === "number" ? field.step ?? null : null,
    placeholder: field.placeholder ?? null,
    helpText: field.helpText ?? null,
    defaultValue: field.defaultValue ?? null,
    allowedPattern: field.inputType === "text" ? normalizeCustomizationPattern(field.allowedPattern) ?? null : null,
    unit: field.unit ?? null,
    enabled: field.enabled,
    customerVisible: field.customerVisible,
    visibleWhen: field.visibleWhen ?? null,
  };
}

/**
 * Storefront-parity columns (MRP, GST, tags, search snippet). Each is applied only
 * when the caller sends it, so older clients that omit them leave imported rows —
 * which already carry all four — untouched.
 */
export function parityColumns(input: z.infer<typeof productSchema>) {
  const gst = input.gstPercent;
  return {
    ...(input.compareAtPrice === undefined
      ? {}
      : { compareAtPricePaise: input.compareAtPrice > 0 ? Math.round(input.compareAtPrice * 100) : null }),
    ...(gst === undefined ? {} : { taxRateBasisPoints: gst * 100, taxCode: gst > 0 ? `IN-GST-${gst}` : null }),
    ...(input.tags === undefined ? {} : { tags: input.tags }),
    ...(input.seoTitle === undefined ? {} : { seoTitle: input.seoTitle || null }),
    ...(input.seoDescription === undefined ? {} : { seoDescription: input.seoDescription || null }),
  };
}

/** Mirrors the importer's stock parity: real stock sells down, everything else is made to order. */
export async function applyStockOnHand(
  tx: Prisma.TransactionClient,
  productId: string,
  stockOnHand: number | undefined,
) {
  if (stockOnHand === undefined) return;
  const variant = await tx.productVariant.findFirst({
    where: { productId },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });
  if (!variant) return;
  if (stockOnHand > 0) {
    await tx.productVariant.update({ where: { id: variant.id }, data: { inventoryPolicy: "CONTINUE" } });
    await tx.inventory.upsert({
      where: { variantId: variant.id },
      update: { quantityOnHand: stockOnHand, reorderPoint: 5 },
      create: { variantId: variant.id, quantityOnHand: stockOnHand, reorderPoint: 5 },
    });
    return;
  }
  await tx.productVariant.update({ where: { id: variant.id }, data: { inventoryPolicy: "MADE_TO_ORDER" } });
  await tx.inventory.deleteMany({ where: { variantId: variant.id } });
}

export function configurationFieldsData(input: z.infer<typeof productSchema>) {
  return input.configurationFields.map((field, sortOrder) => ({ key: field.key, label: field.label, inputType: field.inputType, isRequired: field.required, minLength: field.minLength ?? null, maxLength: field.maxLength ?? null, validation: configurationFieldValidation(field), optionConfig: field.options.length ? { options: field.options.map((option, index) => ({ id: `${field.key}-${index + 1}`, label: option.label, value: option.value, priceDelta: option.priceDelta })) } : undefined, priceDeltaPaise: Math.round(field.priceDelta * 100), sortOrder }));
}

export function templateLinksData(templateLinks: z.infer<typeof templateLinkSchema>[] | undefined) {
  return (templateLinks ?? []).map((link, sortOrder) => ({ templateId: link.templateId, isDefault: link.isDefault, sortOrder }));
}

export async function assertActiveTemplateLinks(prisma: ReturnType<typeof getPrisma>, templateLinks: z.infer<typeof templateLinkSchema>[] | undefined) {
  if (!templateLinks?.length) return;
  const records = await prisma.personalizationTemplate.findMany({
    where: { id: { in: templateLinks.map((link) => link.templateId) }, status: "ACTIVE" },
    select: { id: true },
  });
  if (records.length !== templateLinks.length) {
    throw new CommerceError(422, "TEMPLATE_LINK_INVALID", "Each linked design must be an active personalization template.");
  }
}

export async function assertCatalogCategoryIds(
  prisma: ReturnType<typeof getPrisma>,
  categoryIds: readonly string[],
  primaryCategoryId: string,
) {
  const records = await prisma.category.findMany({
    where: { id: { in: [...categoryIds] } },
    select: { id: true, slug: true, parent: { select: { slug: true } } },
  });
  if (records.length !== categoryIds.length) {
    throw new CommerceError(
      422,
      "PRODUCT_CATEGORY_INVALID",
      "Each selected product category must exist in the catalog.",
    );
  }
  const primary = records.find((record) => record.id === primaryCategoryId);
  if (
    primary?.slug === "industry-collections" ||
    primary?.parent?.slug === "industry-collections"
  ) {
    throw new CommerceError(
      422,
      "PRODUCT_PRIMARY_CATEGORY_INVALID",
      "Choose a sellable category or subcategory as the primary category. Industry collections can be selected under Also list in.",
    );
  }
}

export function productMetadataBase(input: z.infer<typeof productSchema>, existing?: unknown) {
  const current = objectRecord(existing);
  const currentConfigurator = objectRecord(current.configurator);
  const retainedConfigurator = Object.fromEntries(Object.entries(currentConfigurator).filter(([key]) => {
    const match = /^([a-z][a-z0-9-]{0,79})\.baseImage$/.exec(key);
    return !match || input.printAreas.some((area) => area.id === match[1]);
  }));
  return { ...current, artwork: typeof current.artwork === "string" ? current.artwork : "labels", productType: input.productType ?? null, sizes: input.sizes, features: input.features, colors: strings(current.colors), themes: strings(current.themes), configurator: { ...retainedConfigurator, allow2D: input.allow2D, allow3D: input.allow3D, quantityMin: input.quantityMin, quantityMax: input.quantityMax, quantityTiers: input.quantityTiers, setupCharge: input.setupCharge, printAreas: input.printAreas, previewTemplate: input.previewTemplate ?? null, productModel: input.productModel ?? null, artworkUpload: input.artworkUpload, acceptedMimeTypes: input.acceptedArtworkTypes, maximumArtworkBytes: input.artworkPolicy?.surfaces.filter((surface) => surface.image.enabled).reduce((maximum, surface) => Math.max(maximum, surface.image.maximumBytes), 0) || 2_000_000, artworkPolicy: input.artworkPolicy ?? currentConfigurator.artworkPolicy ?? null, configurationVersion: nextConfigurationVersion(currentConfigurator) } };
}

export function productMetadata(input: z.infer<typeof catalogProductSchema>, existing?: unknown) {
  const metadata = productMetadataBase(input, existing);
  const currentConfigurator = objectRecord(objectRecord(existing).configurator);
  return {
    ...metadata,
    configurator: {
      ...objectRecord(metadata.configurator),
      structuredDescription: input.structuredDescription ?? currentConfigurator.structuredDescription ?? null,
    },
  };
}

export const safeArtworkMimeTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function assertProductPreviewAllowed(
  prisma: ReturnType<typeof getPrisma>,
  input: z.infer<typeof productSchema>,
  productId?: string,
) {
  if (!input.allow3D) return;
  if (!productId && isEzpacPackagingProductType(input.productType)) {
    throw new CommerceError(
      422,
      "PACKAGING_3D_TEMPLATE_REQUIRED",
      "Save the product first, then publish a confirmed visualization template before enabling 3D.",
    );
  }
  const publishedTemplates = productId ? await prisma.visualizationTemplate.findMany({
    where: { productId, status: "PUBLISHED" },
    select: { id: true, productType: true, geometry: true, dimensions: true },
    orderBy: [{ publishedAt: "desc" }, { version: "desc" }],
    take: 10,
  }) : [];
  if (publishedTemplates.length) {
    const linkedTemplate = publishedTemplates.find(
      (template) => input.previewTemplate === `visualization:${template.id}`,
    );
    const expectedModel = linkedTemplate ? resolveVisualizationProductModel(linkedTemplate) : null;
    if (!linkedTemplate || !expectedModel || input.productModel !== expectedModel) {
      throw new CommerceError(
        422,
        "VISUALIZATION_3D_LINK_INVALID",
        "Use the active published visualization template and its validated 3D model.",
      );
    }
    return;
  }
  if (!isEzpacPackagingProductType(input.productType)) return;
  if (!input.productModel || !packagingProductModels.has(input.productModel)) {
    throw new CommerceError(422, "PACKAGING_3D_MODEL_INVALID", "Choose a supported packaging model for this product.");
  }
  throw new CommerceError(
    422,
    "PACKAGING_3D_TEMPLATE_REQUIRED",
    "Publish a confirmed visualization template before enabling packaging 3D.",
  );
}

export function assertArtworkUploadPublishable(input: z.infer<typeof productSchema>) {
  if (!input.published || !input.artworkUpload) return;
  if (
    input.acceptedArtworkTypes.length === 0 ||
    !input.acceptedArtworkTypes.every((mimeType) => safeArtworkMimeTypes.has(mimeType))
  ) {
    throw new CommerceError(
      422,
      "ARTWORK_UPLOAD_PUBLISH_INVALID",
      "Choose at least one safe PNG, JPEG or WEBP artwork type before publishing.",
    );
  }
  const enabledImageSurfaces = input.artworkPolicy?.surfaces.filter((surface) => surface.image.enabled) ?? [];
  if (enabledImageSurfaces.length === 0) {
    throw new CommerceError(
      422,
      "ARTWORK_UPLOAD_PUBLISH_INVALID",
      "Configure at least one enabled image surface before publishing artwork uploads.",
    );
  }
  const printAreas = new Map(input.printAreas.map((area) => [area.id, area]));
  const missingPhysicalDimensions = enabledImageSurfaces
    .map((surface) => surface.id)
    .filter((surfaceId) => {
      const area = printAreas.get(surfaceId);
      return !area ||
        typeof area.widthMm !== "number" ||
        !Number.isFinite(area.widthMm) ||
        area.widthMm <= 0 ||
        typeof area.heightMm !== "number" ||
        !Number.isFinite(area.heightMm) ||
        area.heightMm <= 0;
    });
  if (missingPhysicalDimensions.length > 0) {
    throw new CommerceError(
      422,
      "ARTWORK_UPLOAD_PUBLISH_INVALID",
      "Every enabled image surface needs positive physical width and height in millimetres for accurate 300-DPI export.",
      { surfaceIds: missingPhysicalDimensions },
    );
  }
}

export type CatalogProductInput = z.infer<typeof catalogProductSchema>;

/** Creates a product (and its first variant, image row, fields and links) in one transaction. */
export async function createCatalogProduct(input: CatalogProductInput, options: { metadata?: Record<string, unknown> } = {}) {
  const prisma = getPrisma();
  await assertProductPreviewAllowed(prisma, input);
  assertArtworkUploadPublishable(input);
  const slug = `${slugify(input.name)}-${Date.now().toString(36)}`;
  const status = input.published ? "ACTIVE" : "DRAFT";
  const categoryIds = normalizeProductCategoryIds(input.categoryId, input.categoryIds);
  await assertCatalogCategoryIds(prisma, categoryIds, input.categoryId);
  await assertActiveTemplateLinks(prisma, input.templateLinks);
  const product = await prisma.$transaction(async (tx) => {
    const product = await tx.product.create({ data: { categoryId: input.categoryId, name: input.name, slug, baseSku: input.sku, status, shortDescription: input.shortDescription ?? input.description ?? null, description: input.description ?? null, basePricePaise: Math.round(input.price * 100), customizable: input.customizable || input.configurationFields.length > 0 || Boolean(input.templateLinks?.length), material: input.material ?? null, dimensions: { display: input.sizeDescription || input.sizes.join(", ") || "Not specified" }, packSize: 1, productionDaysMin: input.productionDaysMin, productionDaysMax: input.productionDaysMax, tags: input.tags ?? [], ...parityColumns(input), metadata: { ...productMetadata(input), ...(options.metadata ?? {}) }, publishedAt: input.published ? new Date() : null, categoryLinks: { create: categoryIds.map((categoryId) => ({ categoryId })) }, images: { create: { url: input.imageUrl, altText: input.name, sortOrder: 0 } }, variants: { create: { sku: input.sku, name: input.sizes[0] ?? "Standard", optionValues: { size: input.sizes[0] ?? null, material: input.material ?? null, color: null, packSize: 1 }, pricePaise: Math.round(input.price * 100), inventoryPolicy: "MADE_TO_ORDER", isActive: true, sortOrder: 0 } }, personalizationFields: { create: configurationFieldsData(input) }, ...(input.templateLinks !== undefined ? { templateLinks: { create: templateLinksData(input.templateLinks) } } : {}) } });
    await writeExtraProductImages(tx, product.id, input.imageUrl, input.extraImages, input.name);
    await applyStockOnHand(tx, product.id, input.stockOnHand);
    return product;
  });
  return { ...product, categoryIds };
}

/** Full product update; never drops the product's studio designs or the fields they bind. */
export async function updateCatalogProduct(productId: string, input: CatalogProductInput) {
  const prisma = getPrisma();
  await assertProductPreviewAllowed(prisma, input, productId);
  assertArtworkUploadPublishable(input);
  const existing = await prisma.product.findUnique({
    where: { id: productId },
    include: { categoryLinks: { select: { categoryId: true } }, variants: { orderBy: { sortOrder: "asc" } }, templateLinks: { select: { templateId: true, isDefault: true, template: { select: { slug: true, previewConfig: true } } } }, personalizationFields: { select: { key: true } } },
  });
  if (!existing) throw new CommerceError(404, "PRODUCT_NOT_FOUND", "The requested product was not found.");
  const status = input.published ? "ACTIVE" : "DRAFT";
  const categoryIds = normalizeProductCategoryIds(
    input.categoryId,
    input.categoryIds ?? existing.categoryLinks.map((link) => link.categoryId),
  );
  await assertCatalogCategoryIds(prisma, categoryIds, input.categoryId);
  await assertActiveTemplateLinks(prisma, input.templateLinks);
  // The product's 2D designs and the fields they show belong to the design editor: a product
  // save (possibly from a form opened before the designs changed) never removes them.
  const studioLinks = existing.templateLinks.filter((link) => isStudioTemplateSlug(link.template.slug));
  const keptStudioLinks = input.templateLinks === undefined ? [] : studioLinks.filter((link) => !input.templateLinks?.some((item) => item.templateId === link.templateId));
  const submittedFieldKeys = new Set(input.configurationFields.map((field) => field.key));
  const existingFieldKeys = new Set(existing.personalizationFields.map((field) => field.key));
  const keptFieldKeys = [...new Set(studioLinks.flatMap((link) => readStudioConfig(link.template.previewConfig)?.texts.map((layer) => layer.fieldKey) ?? []))]
    .filter((key) => existingFieldKeys.has(key) && !submittedFieldKeys.has(key));
  const submittedDefault = input.templateLinks?.some((link) => link.isDefault) === true;
  const linkRows = input.templateLinks === undefined ? undefined : [
    ...templateLinksData(input.templateLinks),
    ...keptStudioLinks.map((link, index) => ({ templateId: link.templateId, isDefault: link.isDefault && !submittedDefault, sortOrder: (input.templateLinks?.length ?? 0) + index })),
  ];
  const product = await prisma.$transaction(async (tx) => {
    const product = await tx.product.update({
    where: { id: existing.id },
    data: {
      categoryId: input.categoryId,
      categoryLinks: input.categoryIds === undefined
        ? { createMany: { data: categoryIds.map((categoryId) => ({ categoryId })), skipDuplicates: true } }
        : {
            deleteMany: { categoryId: { notIn: categoryIds } },
            createMany: { data: categoryIds.map((categoryId) => ({ categoryId })), skipDuplicates: true },
          },
      name: input.name,
      baseSku: input.sku,
      status,
      shortDescription: input.shortDescription ?? input.description ?? null,
      description: input.description ?? null,
      basePricePaise: Math.round(input.price * 100),
      ...parityColumns(input),
      customizable: input.customizable || input.configurationFields.length > 0 || keptFieldKeys.length > 0 || (linkRows?.length ?? existing.templateLinks.length) > 0,
      material: input.material ?? null,
      dimensions: { display: input.sizeDescription || input.sizes.join(", ") || "Not specified" },
      productionDaysMin: input.productionDaysMin,
      productionDaysMax: input.productionDaysMax,
      metadata: productMetadata(input, existing.metadata),
      publishedAt: input.published ? existing.publishedAt ?? new Date() : null,
      images: { upsert: { where: { productId_sortOrder: { productId: existing.id, sortOrder: 0 } }, update: { url: input.imageUrl, altText: input.name }, create: { url: input.imageUrl, altText: input.name, sortOrder: 0 } } },
      ...(existing.variants[0] ? { variants: { update: { where: { id: existing.variants[0].id }, data: { sku: input.sku, name: input.sizes[0] ?? "Standard", optionValues: { size: input.sizes[0] ?? null, material: input.material ?? null, color: null, packSize: 1 }, pricePaise: Math.round(input.price * 100) } } } } : { variants: { create: { sku: input.sku, name: input.sizes[0] ?? "Standard", optionValues: { size: input.sizes[0] ?? null, material: input.material ?? null, color: null, packSize: 1 }, pricePaise: Math.round(input.price * 100), inventoryPolicy: "MADE_TO_ORDER", isActive: true, sortOrder: 0 } } }),
      personalizationFields: { deleteMany: keptFieldKeys.length ? { key: { notIn: keptFieldKeys } } : {}, create: configurationFieldsData(input) },
      ...(linkRows ? { templateLinks: { deleteMany: {}, create: linkRows } } : {}),
    },
  });
    await writeExtraProductImages(tx, product.id, input.imageUrl, input.extraImages, input.name);
    await applyStockOnHand(tx, product.id, input.stockOnHand);
    return product;
  });
  return { ...product, categoryIds };
}
