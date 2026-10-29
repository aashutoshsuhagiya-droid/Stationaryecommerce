import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { assertSameOrigin } from "@/lib/auth-session";
import { requireCatalogAdmin } from "@/lib/catalog-admin";
import { productArtworkPolicySchema } from "@/lib/artwork-policy-schema";
import { CommerceError } from "@/lib/commerce-error";
import {
  MAX_CUSTOMIZATION_PATTERN_LENGTH,
  customizationPatternIssue,
  normalizeCustomizationPattern,
} from "@/lib/customization-pattern";
import {
  EZPAC_PACKAGING_CATEGORY_PRESETS,
  getEzpacPackagingCategory,
  isEzpacPackagingProductType,
} from "@/lib/ezpac-packaging-presets";
import { EZPAC_FEATURE_BULLETS } from "@/lib/ezpac-feature-bullets";
import { readJson, validationError } from "@/lib/http";
import { onboardingApiError } from "@/lib/onboarding-api";
import { getPrisma } from "@/lib/prisma";
import { normalizeProductCategoryIds } from "@/lib/product-category-links";
import { productImageAssetUrl } from "@/lib/product-image-assets";
import {
  RANBAZAAR_CATEGORY_PRESETS,
  findRanBazaarCategoryMatch,
  getRanBazaarCategoryGroup,
  type CatalogCategoryIdentity,
} from "@/lib/ranbazaar-category-presets";
import { resolveVisualizationProductModel } from "@/lib/visualization-studio-service-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const slugify = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const catalogImageUrlSchema = z.string().trim().max(2_000).refine((value) => {
  if (value.startsWith("/api/")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}, "Use an HTTP(S) URL or a first-party /api/ image URL.");
const structuredDescriptionSchema = z.object({
  intro: z.string().trim().max(2_000).optional(),
  bestFor: z.array(z.string().trim().min(1).max(120)).max(12).optional(),
  featureBullets: z.array(z.enum(EZPAC_FEATURE_BULLETS)).max(EZPAC_FEATURE_BULLETS.length).optional(),
}).strict();
const extraImagesField = z.array(z.object({
  url: catalogImageUrlSchema,
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
})).max(5);
const categorySchema = z.object({ type: z.literal("category"), name: z.string().trim().min(2).max(120), parentId: z.string().min(1).nullable().optional(), description: z.string().trim().max(1000).nullable().optional(), imageUrl: catalogImageUrlSchema.nullable().optional(), isActive: z.boolean().default(true), sortOrder: z.number().int().min(0).max(1_000_000).optional() });
const optionSchema = z.object({ label: z.string().trim().min(1).max(120), value: z.string().trim().min(1).max(120), priceDelta: z.number().finite().min(-100_000).max(100_000).default(0) }).strict();
const quantityTierSchema = z.object({ minimum: z.number().int().min(1).max(1000), priceDelta: z.number().finite().min(-100_000).max(100_000), label: z.string().trim().max(80).optional() }).strict();
const productModelSchema = z.enum(["label-pack", "waterproof-sheet", "school-kit", "notebook", "bottle-label", "pencil-set", "tag", "geometry-box", "gift-ribbon", "keychain-duo", "bulk-grid", "rectangular-box", "square-box", "folding-carton", "mailer-box", "paper-bag", "stand-up-pouch", "product-sleeve"]);
const packagingProductModels = new Set([
  "rectangular-box", "square-box", "folding-carton", "mailer-box",
  "paper-bag", "stand-up-pouch", "product-sleeve",
]);
const fieldVisibilitySchema = z.object({ fieldId: z.string().trim().regex(/^[a-z][a-z0-9-]{0,79}$/), equals: z.string().max(120) }).strict();
const templateLinkSchema = z.object({ templateId: z.string().trim().min(1).max(100), isDefault: z.boolean().default(false) }).strict();
const allowedPatternSchema = z.string().trim().max(MAX_CUSTOMIZATION_PATTERN_LENGTH).nullable().optional();
const configurationFieldSchema = z.object({ key: z.string().trim().regex(/^[a-z][a-z0-9-]{0,79}$/), label: z.string().trim().min(1).max(120), inputType: z.enum(["text", "select", "color", "number"]), required: z.boolean().default(false), placeholder: z.string().trim().max(240).nullable().optional(), helpText: z.string().trim().max(240).nullable().optional(), defaultValue: z.string().max(500).nullable().optional(), unit: z.string().trim().max(40).nullable().optional(), enabled: z.boolean().default(true), customerVisible: z.boolean().default(true), visibleWhen: fieldVisibilitySchema.nullable().optional(), minLength: z.number().int().min(0).max(500).nullable().optional(), maxLength: z.number().int().min(1).max(500).nullable().optional(), allowedPattern: allowedPatternSchema, minValue: z.number().finite().min(-1_000_000).max(1_000_000).nullable().optional(), maxValue: z.number().finite().min(-1_000_000).max(1_000_000).nullable().optional(), step: z.number().finite().positive().max(1_000_000).nullable().optional(), priceDelta: z.number().finite().min(-100_000).max(100_000).default(0), options: z.array(optionSchema).max(50).default([]) }).strict().superRefine((field, context) => { if (field.inputType === "select" && field.enabled && field.customerVisible && !field.options.length) context.addIssue({ code: "custom", path: ["options"], message: "Add at least one choice before enabling a customer dropdown." }); if (field.minLength && field.maxLength && field.minLength > field.maxLength) context.addIssue({ code: "custom", path: ["maxLength"], message: "Maximum length must be at least the minimum." }); if (field.minValue !== null && field.maxValue !== null && field.minValue !== undefined && field.maxValue !== undefined && field.minValue > field.maxValue) context.addIssue({ code: "custom", path: ["maxValue"], message: "Maximum value must be at least the minimum." }); if (field.inputType !== "number" && (field.minValue !== null && field.minValue !== undefined || field.maxValue !== null && field.maxValue !== undefined || field.step !== null && field.step !== undefined)) context.addIssue({ code: "custom", path: ["inputType"], message: "Numeric limits can only be used on a number field." }); if (field.inputType === "select" && field.defaultValue && field.options.length && !field.options.some((option) => option.value === field.defaultValue)) context.addIssue({ code: "custom", path: ["defaultValue"], message: "The default choice must match an available option." }); const patternIssue = customizationPatternIssue(field.allowedPattern); if (patternIssue) context.addIssue({ code: "custom", path: ["allowedPattern"], message: patternIssue }); if (field.inputType !== "text" && normalizeCustomizationPattern(field.allowedPattern)) context.addIssue({ code: "custom", path: ["allowedPattern"], message: "Allowed-character patterns can only be used on text fields." }); });
const printAreaSchema = z.object({ id: z.string().trim().regex(/^[a-z][a-z0-9-]{0,79}$/), label: z.string().trim().min(1).max(80), widthMm: z.number().finite().positive().max(10_000).nullable().optional(), heightMm: z.number().finite().positive().max(10_000).nullable().optional(), safeInsetMm: z.number().finite().min(0).max(1_000).nullable().optional() }).strict().superRefine((area, context) => { if ((area.widthMm === null) !== (area.heightMm === null) || (area.widthMm === undefined) !== (area.heightMm === undefined)) context.addIssue({ code: "custom", path: ["widthMm"], message: "Enter both print-area width and height, or leave both blank." }); if (area.safeInsetMm && area.widthMm && area.heightMm && area.safeInsetMm * 2 >= Math.min(area.widthMm, area.heightMm)) context.addIssue({ code: "custom", path: ["safeInsetMm"], message: "Safe inset must leave a printable region." }); });
const productSchema = z.object({ type: z.literal("product"), name: z.string().trim().min(2).max(180), sku: z.string().trim().min(2).max(80), categoryId: z.string().min(1), categoryIds: z.array(z.string().trim().min(1).max(100)).max(30).optional(), productType: z.string().trim().max(120).optional(), price: z.number().nonnegative(), description: z.string().trim().max(10_000).optional(), shortDescription: z.string().trim().max(400).optional(), imageUrl: catalogImageUrlSchema, material: z.string().trim().max(160).optional(), sizes: z.array(z.string().trim().min(1).max(80)).max(30).default([]), sizeDescription: z.string().trim().max(240).optional(), features: z.array(z.string().trim().min(1).max(200)).max(30).default([]), configurationFields: z.array(configurationFieldSchema).max(20).default([]), templateLinks: z.array(templateLinkSchema).max(20).optional(), printAreas: z.array(printAreaSchema).min(1).max(8).default([{ id: "primary", label: "Primary print area" }]), previewTemplate: z.string().trim().max(120).optional(), productModel: productModelSchema.optional(), artworkUpload: z.boolean().default(false), acceptedArtworkTypes: z.array(z.enum(["image/png", "image/jpeg", "image/webp"])).max(3).default(["image/png", "image/jpeg"]), artworkPolicy: productArtworkPolicySchema.optional(), customizable: z.boolean().default(false), published: z.boolean().default(false), allow2D: z.boolean().default(true), allow3D: z.boolean().default(false), quantityMin: z.number().int().min(1).max(1000).default(1), quantityMax: z.number().int().min(1).max(1000).default(100), quantityTiers: z.array(quantityTierSchema).max(20).default([]), setupCharge: z.number().finite().min(0).max(100_000).default(0), productionDaysMin: z.number().int().min(0).max(365).default(0), productionDaysMax: z.number().int().min(0).max(365).default(0) }).refine((value) => value.productionDaysMax >= value.productionDaysMin && value.quantityMax >= value.quantityMin, { message: "Maximum values must be at least the corresponding minimum." }).superRefine((value, context) => { const keys = new Set<string>(); const printAreas = new Set<string>(); const tierMinimums = new Set<number>(); const templateIds = new Set<string>(); let defaultTemplateCount = 0; value.templateLinks?.forEach((link, index) => { if (templateIds.has(link.templateId)) context.addIssue({ code: "custom", path: ["templateLinks", index, "templateId"], message: "A design template can only be linked once." }); templateIds.add(link.templateId); if (link.isDefault) defaultTemplateCount += 1; }); if (defaultTemplateCount > 1) context.addIssue({ code: "custom", path: ["templateLinks"], message: "Choose at most one default design template." }); value.configurationFields.forEach((field, index) => { if (keys.has(field.key)) context.addIssue({ code: "custom", path: ["configurationFields", index, "key"], message: "Field keys must be unique." }); keys.add(field.key); if (field.visibleWhen) { if (field.visibleWhen.fieldId === field.key) context.addIssue({ code: "custom", path: ["configurationFields", index, "visibleWhen"], message: "A field cannot control its own visibility." }); const controller = value.configurationFields.find((candidate) => candidate.key === field.visibleWhen?.fieldId); if (!controller) context.addIssue({ code: "custom", path: ["configurationFields", index, "visibleWhen", "fieldId"], message: "Choose an existing controlling field." }); else if (controller.inputType === "select" && controller.options.length && !controller.options.some((option) => option.value === field.visibleWhen?.equals)) context.addIssue({ code: "custom", path: ["configurationFields", index, "visibleWhen", "equals"], message: "The visibility value must match a controlling dropdown choice." }); } }); value.printAreas.forEach((area, index) => { if (printAreas.has(area.id)) context.addIssue({ code: "custom", path: ["printAreas", index, "id"], message: "Print area IDs must be unique." }); printAreas.add(area.id); }); value.quantityTiers.forEach((tier, index) => { if (tierMinimums.has(tier.minimum)) context.addIssue({ code: "custom", path: ["quantityTiers", index, "minimum"], message: "Each quantity break needs a unique minimum." }); if (tier.minimum < value.quantityMin || tier.minimum > value.quantityMax) context.addIssue({ code: "custom", path: ["quantityTiers", index, "minimum"], message: "Quantity breaks must fall within the product's order range." }); tierMinimums.add(tier.minimum); }); if (value.allow3D && !value.productModel) context.addIssue({ code: "custom", path: ["productModel"], message: "Choose a validated product model before enabling 3D preview." }); if (value.artworkPolicy) { const surfaceIds = new Set(value.printAreas.map((area) => area.id)); value.artworkPolicy.surfaces.forEach((surface, index) => { if (!surfaceIds.has(surface.id)) context.addIssue({ code: "custom", path: ["artworkPolicy", "surfaces", index, "id"], message: "Artwork policy surfaces must match a configured print area." }); }); if (value.artworkUpload && !value.artworkPolicy.surfaces.some((surface) => surface.image.enabled)) context.addIssue({ code: "custom", path: ["artworkPolicy"], message: "Enable image controls on at least one surface before enabling uploads." }); } });
const catalogProductSchema = productSchema.extend({
  structuredDescription: structuredDescriptionSchema.optional(),
  extraImages: extraImagesField.optional(),
});
const schema = z.discriminatedUnion("type", [categorySchema, catalogProductSchema]);
const productIdSchema = z.object({ id: z.string().trim().min(1).max(100) });
const maximumCategoryPresetImports = Math.max(
  EZPAC_PACKAGING_CATEGORY_PRESETS.length,
  RANBAZAAR_CATEGORY_PRESETS.length,
);
const categoryPresetImportSchema = z.object({ type: z.literal("category-preset-import"), source: z.enum(["ezpac-packaging", "ranbazaar"]).default("ezpac-packaging"), presetIds: z.array(z.string().trim().min(1).max(80)).min(1).max(maximumCategoryPresetImports) }).strict();
const artworkPolicyOverrideSchema = z.object({
  type: z.literal("artwork-policy-override"),
  id: z.string().trim().min(1).max(100),
  artworkPolicy: productArtworkPolicySchema,
}).strict();
const objectRecord = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const strings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
const nextConfigurationVersion = (value: Record<string, unknown>) => {
  const current = typeof value.configurationVersion === "string" ? Number(value.configurationVersion) : 0;
  return Number.isSafeInteger(current) && current >= 0 && current < 1_000_000 ? String(current + 1) : "1";
};

async function writeExtraProductImages(
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

function serializeCatalogProduct(product: any) {
  const metadata = objectRecord(product.metadata);
  const configurator = objectRecord(metadata.configurator);
  const dimensions = objectRecord(product.dimensions);
  const printAreas = Array.isArray(configurator.printAreas) ? configurator.printAreas.filter((area): area is Record<string, unknown> => Boolean(area) && typeof area === "object" && !Array.isArray(area)) : [];
  const configuredSurfaceIds = new Set(printAreas.flatMap((area) =>
    typeof area.id === "string" ? [area.id] : [],
  ));
  const baseImages = Object.fromEntries((Array.isArray(product.imageAssets) ? product.imageAssets : []).flatMap((asset: any) => {
    const url = `/api/product-images/${asset.id}`;
    if (
      typeof asset.id !== "string"
      || typeof asset.surfaceId !== "string"
      || !configuredSurfaceIds.has(asset.surfaceId)
      || configurator[`${asset.surfaceId}.baseImage`] !== url
    ) return [];
    return [[asset.surfaceId, { id: asset.id, url, altText: typeof asset.altText === "string" ? asset.altText : null }]];
  }));
  return {
    id: product.id,
    name: product.name,
    sku: product.baseSku,
    categoryId: product.categoryId,
    categoryIds: normalizeProductCategoryIds(product.categoryId, Array.isArray(product.categoryLinks) ? product.categoryLinks.map((link: { categoryId: string }) => link.categoryId) : []),
    productType: typeof metadata.productType === "string" ? metadata.productType : "",
    price: product.basePricePaise / 100,
    imageUrl: product.images[0]?.url ?? "",
    hasUploadedPrimaryImage: (Array.isArray(product.imageAssets) ? product.imageAssets : []).some((asset: any) =>
      asset.kind === "primary" && productImageAssetUrl(asset.id) === product.images[0]?.url,
    ),
    material: product.material ?? "",
    sizes: strings(metadata.sizes),
    sizeDescription: typeof dimensions.display === "string" ? dimensions.display : "",
    features: strings(metadata.features),
    description: product.description ?? "",
    shortDescription: product.shortDescription ?? "",
    status: product.status,
    customizable: product.customizable,
    published: product.status === "ACTIVE" && Boolean(product.publishedAt),
    allow2D: configurator.allow2D !== false,
    allow3D: configurator.allow3D === true,
    quantityMin: typeof configurator.quantityMin === "number" ? configurator.quantityMin : 1,
    quantityMax: typeof configurator.quantityMax === "number" ? configurator.quantityMax : 100,
    quantityTiers: Array.isArray(configurator.quantityTiers) ? configurator.quantityTiers.flatMap((tier) => { const item = objectRecord(tier); return typeof item.minimum === "number" && typeof item.priceDelta === "number" ? [{ minimum: item.minimum, priceDelta: item.priceDelta, label: typeof item.label === "string" ? item.label : undefined }] : []; }) : [],
    setupCharge: typeof configurator.setupCharge === "number" ? configurator.setupCharge : 0,
    productionDaysMin: product.productionDaysMin,
    productionDaysMax: product.productionDaysMax,
    printAreas: printAreas.map((area) => ({ id: typeof area.id === "string" ? area.id : "primary", label: typeof area.label === "string" ? area.label : "Primary print area", widthMm: typeof area.widthMm === "number" ? area.widthMm : null, heightMm: typeof area.heightMm === "number" ? area.heightMm : null, safeInsetMm: typeof area.safeInsetMm === "number" ? area.safeInsetMm : null })),
    ...(Object.keys(baseImages).length ? { baseImages } : {}),
    previewTemplate: typeof configurator.previewTemplate === "string" ? configurator.previewTemplate : "",
    productModel: typeof configurator.productModel === "string" ? configurator.productModel : "",
    artworkUpload: Boolean(configurator.artworkUpload),
    acceptedArtworkTypes: strings(configurator.acceptedMimeTypes),
    artworkPolicy: configurator.artworkPolicy ?? null,
    visualizationJobStatus: Array.isArray(product.visualizationJobs) && typeof product.visualizationJobs[0]?.status === "string"
      ? product.visualizationJobs[0].status
      : "",
    templateLinks: Array.isArray(product.templateLinks) ? product.templateLinks.map((link: any) => ({ templateId: link.templateId, isDefault: link.isDefault === true, sortOrder: typeof link.sortOrder === "number" ? link.sortOrder : 0 })) : [],
    configurationFields: product.personalizationFields.map((field: any) => {
      const validation = objectRecord(field.validation);
      const optionConfig = objectRecord(field.optionConfig);
      return { key: field.key, label: field.label, inputType: field.inputType, required: field.isRequired, placeholder: typeof validation.placeholder === "string" ? validation.placeholder : "", helpText: typeof validation.helpText === "string" ? validation.helpText : "", defaultValue: typeof validation.defaultValue === "string" ? validation.defaultValue : "", unit: typeof validation.unit === "string" ? validation.unit : "", enabled: validation.enabled !== false, customerVisible: validation.customerVisible !== false, visibleWhen: (() => { const condition = objectRecord(validation.visibleWhen); return typeof condition.fieldId === "string" && typeof condition.equals === "string" ? { fieldId: condition.fieldId, equals: condition.equals } : null; })(), minLength: field.minLength, maxLength: field.maxLength, allowedPattern: typeof validation.allowedPattern === "string" ? validation.allowedPattern : "", minValue: typeof validation.minValue === "number" ? validation.minValue : null, maxValue: typeof validation.maxValue === "number" ? validation.maxValue : null, step: typeof validation.step === "number" ? validation.step : null, priceDelta: field.priceDeltaPaise / 100, options: Array.isArray(optionConfig.options) ? optionConfig.options : [] };
    }),
  };
}

function configurationFieldValidation(field: z.infer<typeof configurationFieldSchema>) {
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

function configurationFieldsData(input: z.infer<typeof productSchema>) {
  return input.configurationFields.map((field, sortOrder) => ({ key: field.key, label: field.label, inputType: field.inputType, isRequired: field.required, minLength: field.minLength ?? null, maxLength: field.maxLength ?? null, validation: configurationFieldValidation(field), optionConfig: field.options.length ? { options: field.options.map((option, index) => ({ id: `${field.key}-${index + 1}`, label: option.label, value: option.value, priceDelta: option.priceDelta })) } : undefined, priceDeltaPaise: Math.round(field.priceDelta * 100), sortOrder }));
}

function templateLinksData(templateLinks: z.infer<typeof templateLinkSchema>[] | undefined) {
  return (templateLinks ?? []).map((link, sortOrder) => ({ templateId: link.templateId, isDefault: link.isDefault, sortOrder }));
}

async function assertActiveTemplateLinks(prisma: ReturnType<typeof getPrisma>, templateLinks: z.infer<typeof templateLinkSchema>[] | undefined) {
  if (!templateLinks?.length) return;
  const records = await prisma.personalizationTemplate.findMany({
    where: { id: { in: templateLinks.map((link) => link.templateId) }, status: "ACTIVE" },
    select: { id: true },
  });
  if (records.length !== templateLinks.length) {
    throw new CommerceError(422, "TEMPLATE_LINK_INVALID", "Each linked design must be an active personalization template.");
  }
}

async function assertCatalogCategoryIds(
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

function productMetadataBase(input: z.infer<typeof productSchema>, existing?: unknown) {
  const current = objectRecord(existing);
  const currentConfigurator = objectRecord(current.configurator);
  const retainedConfigurator = Object.fromEntries(Object.entries(currentConfigurator).filter(([key]) => {
    const match = /^([a-z][a-z0-9-]{0,79})\.baseImage$/.exec(key);
    return !match || input.printAreas.some((area) => area.id === match[1]);
  }));
  return { ...current, artwork: typeof current.artwork === "string" ? current.artwork : "labels", productType: input.productType ?? null, sizes: input.sizes, features: input.features, colors: strings(current.colors), themes: strings(current.themes), configurator: { ...retainedConfigurator, allow2D: input.allow2D, allow3D: input.allow3D, quantityMin: input.quantityMin, quantityMax: input.quantityMax, quantityTiers: input.quantityTiers, setupCharge: input.setupCharge, printAreas: input.printAreas, previewTemplate: input.previewTemplate ?? null, productModel: input.productModel ?? null, artworkUpload: input.artworkUpload, acceptedMimeTypes: input.acceptedArtworkTypes, maximumArtworkBytes: input.artworkPolicy?.surfaces.filter((surface) => surface.image.enabled).reduce((maximum, surface) => Math.max(maximum, surface.image.maximumBytes), 0) || 2_000_000, artworkPolicy: input.artworkPolicy ?? currentConfigurator.artworkPolicy ?? null, configurationVersion: nextConfigurationVersion(currentConfigurator) } };
}

function productMetadata(input: z.infer<typeof catalogProductSchema>, existing?: unknown) {
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

const safeArtworkMimeTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

async function assertProductPreviewAllowed(
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

function assertArtworkUploadPublishable(input: z.infer<typeof productSchema>) {
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

async function importPackagingCategoryPresets(prisma: ReturnType<typeof getPrisma>, presetIds: string[]) {
  const presets = [...new Set(presetIds)].map((presetId) => getEzpacPackagingCategory(presetId));
  if (presets.some((preset) => !preset)) {
    throw new CommerceError(422, "CATEGORY_PRESET_INVALID", "Choose a supported packaging category starter.");
  }
  const selected = presets.filter((preset): preset is NonNullable<typeof preset> => Boolean(preset));
  return prisma.$transaction(async (tx) => {
    const slugs = selected.flatMap((preset) => [preset.slug, ...preset.subcategories.map((subcategory) => subcategory.slug)]);
    const existingRecords = await tx.category.findMany({ where: { slug: { in: slugs } }, select: { id: true, slug: true, parentId: true } });
    const existingBySlug = new Map(existingRecords.map((record) => [record.slug, record]));
    const maximumSortOrder = await tx.category.aggregate({ _max: { sortOrder: true } });
    let nextSortOrder = (maximumSortOrder._max.sortOrder ?? -1) + 1;
    const created: string[] = [];
    const reused: string[] = [];
    const conflicts: string[] = [];

    for (const preset of selected) {
      let root = existingBySlug.get(preset.slug);
      if (root?.parentId) {
        conflicts.push(preset.name);
        continue;
      }
      if (!root) {
        root = await tx.category.create({ data: { name: preset.name, slug: preset.slug, isActive: true, sortOrder: nextSortOrder++ }, select: { id: true, slug: true, parentId: true } });
        existingBySlug.set(root.slug, root);
        created.push(preset.name);
      } else {
        reused.push(preset.name);
      }
      for (const subcategory of preset.subcategories) {
        const existing = existingBySlug.get(subcategory.slug);
        if (existing) {
          if (existing.parentId !== root.id) conflicts.push(subcategory.name);
          else reused.push(subcategory.name);
          continue;
        }
        const child = await tx.category.create({ data: { name: subcategory.name, slug: subcategory.slug, parentId: root.id, isActive: true, sortOrder: nextSortOrder++ }, select: { id: true, slug: true, parentId: true } });
        existingBySlug.set(child.slug, child);
        created.push(subcategory.name);
      }
    }
    return { created, reused, conflicts };
  });
}

async function importRanBazaarCategoryPresets(
  prisma: ReturnType<typeof getPrisma>,
  presetIds: string[],
) {
  const presets = [...new Set(presetIds)].map((presetId) => getRanBazaarCategoryGroup(presetId));
  if (presets.some((preset) => !preset)) {
    throw new CommerceError(
      422,
      "CATEGORY_PRESET_INVALID",
      "Choose a supported RanBazaar category starter.",
    );
  }
  const selected = presets.filter((preset): preset is NonNullable<typeof preset> => Boolean(preset));

  return prisma.$transaction(async (tx) => {
    const categoryRecords: CatalogCategoryIdentity[] = await tx.category.findMany({
      select: { id: true, name: true, slug: true, parentId: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    const maximumSortOrder = await tx.category.aggregate({ _max: { sortOrder: true } });
    let nextSortOrder = (maximumSortOrder._max.sortOrder ?? -1) + 1;
    const created: string[] = [];
    const reused: string[] = [];
    const conflicts: string[] = [];
    const entrypoints: Array<{
      name: string;
      href: string;
      categoryId: string;
      categorySlug: string;
    }> = [];

    for (const preset of selected) {
      let root = findRanBazaarCategoryMatch(preset, categoryRecords);
      if (root?.parentId) {
        conflicts.push(preset.name);
        continue;
      }
      if (!root) {
        root = await tx.category.create({
          data: {
            name: preset.name,
            slug: preset.slug,
            isActive: true,
            sortOrder: nextSortOrder++,
          },
          select: { id: true, name: true, slug: true, parentId: true },
        });
        categoryRecords.push(root);
        created.push(preset.name);
      } else {
        reused.push(`${preset.name} → ${root.name}`);
      }

      for (const child of preset.children) {
        if (child.kind === "entrypoint") {
          entrypoints.push({
            name: child.name,
            href: child.href,
            categoryId: root.id,
            categorySlug: root.slug,
          });
          continue;
        }

        const existingCategory = findRanBazaarCategoryMatch(child, categoryRecords);
        if (existingCategory) {
          // Preserve the existing parent, name and URL. Cross-list products via
          // ProductCategory rather than cloning or moving their category record.
          reused.push(`${child.name} → ${existingCategory.name}`);
          continue;
        }

        const createdCategory = await tx.category.create({
          data: {
            name: child.name,
            slug: child.slug,
            parentId: root.id,
            isActive: true,
            sortOrder: nextSortOrder++,
          },
          select: { id: true, name: true, slug: true, parentId: true },
        });
        categoryRecords.push(createdCategory);
        created.push(child.name);
      }
    }

    return { created, reused, conflicts, entrypoints };
  });
}

export async function GET(request: Request) {
  try {
    await requireCatalogAdmin(request);
    const prisma = getPrisma();
    const productId = new URL(request.url).searchParams.get("productId");
    if (productId) {
      const product = await prisma.product.findUnique({ where: { id: productId }, include: { categoryLinks: { select: { categoryId: true } }, images: { orderBy: { sortOrder: "asc" } }, imageAssets: { where: { kind: { in: ["primary", "surface-base"] } }, select: { id: true, kind: true, surfaceId: true, altText: true }, orderBy: { createdAt: "desc" } }, personalizationFields: { orderBy: { sortOrder: "asc" } }, templateLinks: { orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }] }, visualizationJobs: { where: { status: { in: ["QUEUED", "PROCESSING", "NEEDS_CONFIRMATION"] } }, select: { status: true }, orderBy: { updatedAt: "desc" }, take: 1 } } });
      if (!product) return NextResponse.json({ error: { code: "PRODUCT_NOT_FOUND", message: "The requested product was not found." } }, { status: 404, headers: { "Cache-Control": "no-store" } });
      const templates = await prisma.visualizationTemplate.findMany({
        where: { productId, status: "PUBLISHED" },
        select: { id: true, productType: true, geometry: true, dimensions: true, version: true, publishedAt: true },
        orderBy: [{ publishedAt: "desc" }, { version: "desc" }],
        take: 10,
      });
      const configurator = objectRecord(objectRecord(product.metadata).configurator);
      return NextResponse.json({ data: { product: {
        ...serializeCatalogProduct(product),
        structuredDescription: configurator.structuredDescription ?? null,
        extraImages: product.images.filter((image) => image.sortOrder >= 1).map((image) => ({
          url: image.url,
          altText: image.altText,
          width: image.width,
          height: image.height,
        })),
        publishedVisualizationTemplates: templates.map((template) => ({ id: template.id, version: template.version, productType: template.productType ?? "", model: resolveVisualizationProductModel(template) ?? "" })),
      } } }, { headers: { "Cache-Control": "no-store" } });
    }
    const [categories, products, templates] = await Promise.all([
      prisma.category.findMany({ orderBy: { sortOrder: "asc" } }),
      prisma.product.findMany({ include: { category: true, categoryLinks: { select: { categoryId: true } }, images: { where: { sortOrder: 0 }, take: 1, select: { url: true } }, variants: { include: { inventory: true } } }, orderBy: { updatedAt: "desc" } }),
      prisma.personalizationTemplate.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true, slug: true, theme: true, thumbnailUrl: true, premiumPricePaise: true }, orderBy: [{ theme: "asc" }, { name: "asc" }] }),
    ]);
    return NextResponse.json({ data: { categories, templates: templates.map((template) => ({ id: template.id, name: template.name, slug: template.slug, theme: template.theme ?? "", thumbnailUrl: template.thumbnailUrl ?? "", premiumPrice: template.premiumPricePaise / 100 })), products: products.map((product) => {
      const configurator = objectRecord(objectRecord(product.metadata).configurator);
      return {
        id: product.id, name: product.name, category: product.category.name, categoryId: product.categoryId,
        categoryIds: normalizeProductCategoryIds(product.categoryId, product.categoryLinks.map((link) => link.categoryId)),
        sku: product.baseSku, price: product.basePricePaise / 100,
        stock: product.variants.reduce((total, variant) => total + (variant.inventory?.quantityOnHand ?? 0), 0),
        status: product.status === "ACTIVE" ? "Active" : product.status === "ARCHIVED" ? "Archived" : "Draft",
        personalized: product.customizable, art: "labels", imageUrl: product.images[0]?.url ?? "",
        has3DTemplate: typeof configurator.previewTemplate === "string" && configurator.previewTemplate.startsWith("visualization:"),
      };
    }) } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return onboardingApiError(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await requireCatalogAdmin(request);
    const body = await readJson(request);
    if ((body as { type?: unknown }).type === "category-preset-import") {
      const categoryPresetImport = categoryPresetImportSchema.safeParse(body);
      if (!categoryPresetImport.success) return validationError(categoryPresetImport.error);
      const result = categoryPresetImport.data.source === "ranbazaar"
        ? await importRanBazaarCategoryPresets(getPrisma(), categoryPresetImport.data.presetIds)
        : await importPackagingCategoryPresets(getPrisma(), categoryPresetImport.data.presetIds);
      if (result.created.length) revalidatePath("/", "layout");
      return NextResponse.json({ data: result }, { headers: { "Cache-Control": "no-store" } });
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);
    const prisma = getPrisma();
    if (parsed.data.type === "category") {
      if (parsed.data.parentId) {
        const parent = await prisma.category.findUnique({ where: { id: parsed.data.parentId }, select: { id: true, parentId: true } });
        if (!parent) return NextResponse.json({ error: { code: "CATEGORY_PARENT_NOT_FOUND", message: "The selected parent category was not found." } }, { status: 422 });
        if (parent.parentId) return NextResponse.json({ error: { code: "CATEGORY_DEPTH_INVALID", message: "Categories support one main category and one subcategory level." } }, { status: 422 });
      }
      const slug = slugify(parsed.data.name);
      const duplicate = await prisma.category.findUnique({ where: { slug }, select: { id: true } });
      if (duplicate) return NextResponse.json({ error: { code: "CATEGORY_SLUG_EXISTS", message: "A category with this name already exists." } }, { status: 409 });
      const category = await prisma.category.create({ data: { name: parsed.data.name, slug, parentId: parsed.data.parentId ?? null, description: parsed.data.description, imageUrl: parsed.data.imageUrl, isActive: parsed.data.isActive, sortOrder: parsed.data.sortOrder ?? await prisma.category.count() } });
      revalidatePath("/", "layout");
      return NextResponse.json({ data: category }, { status: 201 });
    }
    const input = parsed.data;
    await assertProductPreviewAllowed(prisma, input);
    assertArtworkUploadPublishable(input);
    const slug = `${slugify(input.name)}-${Date.now().toString(36)}`;
    const status = input.published ? "ACTIVE" : "DRAFT";
    const categoryIds = normalizeProductCategoryIds(input.categoryId, input.categoryIds);
    await assertCatalogCategoryIds(prisma, categoryIds, input.categoryId);
    await assertActiveTemplateLinks(prisma, input.templateLinks);
    const product = await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({ data: { categoryId: input.categoryId, name: input.name, slug, baseSku: input.sku, status, shortDescription: input.shortDescription ?? input.description ?? null, description: input.description ?? null, basePricePaise: Math.round(input.price * 100), customizable: input.customizable || input.configurationFields.length > 0 || Boolean(input.templateLinks?.length), material: input.material ?? null, dimensions: { display: input.sizeDescription || input.sizes.join(", ") || "Not specified" }, packSize: 1, productionDaysMin: input.productionDaysMin, productionDaysMax: input.productionDaysMax, tags: [], metadata: productMetadata(input), publishedAt: input.published ? new Date() : null, categoryLinks: { create: categoryIds.map((categoryId) => ({ categoryId })) }, images: { create: { url: input.imageUrl, altText: input.name, sortOrder: 0 } }, variants: { create: { sku: input.sku, name: input.sizes[0] ?? "Standard", optionValues: { size: input.sizes[0] ?? null, material: input.material ?? null, color: null, packSize: 1 }, pricePaise: Math.round(input.price * 100), inventoryPolicy: "MADE_TO_ORDER", isActive: true, sortOrder: 0 } }, personalizationFields: { create: configurationFieldsData(input) }, ...(input.templateLinks !== undefined ? { templateLinks: { create: templateLinksData(input.templateLinks) } } : {}) } });
      await writeExtraProductImages(tx, product.id, input.imageUrl, input.extraImages, input.name);
      return product;
    });
    revalidatePath("/", "layout");
    return NextResponse.json({ data: { ...product, categoryIds } }, { status: 201 });
  } catch (error) { return onboardingApiError(error); }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    await requireCatalogAdmin(request);
    const body = await readJson(request);
    if ((body as { type?: unknown }).type === "artwork-policy-override") {
      const parsed = artworkPolicyOverrideSchema.safeParse(body);
      if (!parsed.success) return validationError(parsed.error);
      const prisma = getPrisma();
      const existing = await prisma.product.findUnique({
        where: { id: parsed.data.id },
        include: {
          categoryLinks: { select: { categoryId: true } },
          images: { orderBy: { sortOrder: "asc" } },
          imageAssets: { where: { kind: { in: ["primary", "surface-base"] } }, select: { id: true, kind: true, surfaceId: true, altText: true }, orderBy: { createdAt: "desc" } },
          personalizationFields: { orderBy: { sortOrder: "asc" } },
          templateLinks: { orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }] },
          visualizationJobs: { where: { status: { in: ["QUEUED", "PROCESSING", "NEEDS_CONFIRMATION"] } }, select: { status: true }, orderBy: { updatedAt: "desc" }, take: 1 },
        },
      });
      if (!existing) return NextResponse.json({ error: { code: "PRODUCT_NOT_FOUND", message: "The requested product was not found." } }, { status: 404 });
      const currentMetadata = objectRecord(existing.metadata);
      const configurator = objectRecord(currentMetadata.configurator);
      const printAreaIds = new Set(
        (Array.isArray(configurator.printAreas) ? configurator.printAreas : []).flatMap((area) => {
          const record = objectRecord(area);
          return typeof record.id === "string" ? [record.id] : [];
        }),
      );
      const invalidSurfaceIds = parsed.data.artworkPolicy.surfaces
        .map((surface) => surface.id)
        .filter((surfaceId) => !printAreaIds.has(surfaceId));
      if (invalidSurfaceIds.length) {
        return NextResponse.json({ error: { code: "ARTWORK_POLICY_SURFACE_INVALID", message: "Artwork policy surfaces must match configured print areas.", details: { surfaceIds: invalidSurfaceIds } } }, { status: 422 });
      }
      const metadata = {
        ...currentMetadata,
        configurator: {
          ...configurator,
          artworkPolicy: parsed.data.artworkPolicy,
          configurationVersion: nextConfigurationVersion(configurator),
        },
      };
      await prisma.product.update({ where: { id: existing.id }, data: { metadata } });
      revalidatePath("/", "layout");
      return NextResponse.json({ data: { product: serializeCatalogProduct({ ...existing, metadata }) } }, { headers: { "Cache-Control": "no-store" } });
    }
    const id = productIdSchema.safeParse(body);
    if (!id.success) return validationError(id.error);
    if ((body as { type?: unknown }).type === "category") {
      const categoryInput = categorySchema.safeParse(body);
      if (!categoryInput.success) return validationError(categoryInput.error);
      if (categoryInput.data.parentId === id.data.id) return NextResponse.json({ error: { code: "CATEGORY_PARENT_INVALID", message: "A category cannot be its own parent." } }, { status: 422 });
      const prisma = getPrisma();
      const currentCategory = await prisma.category.findUnique({ where: { id: id.data.id }, include: { children: { select: { id: true } } } });
      if (!currentCategory) return NextResponse.json({ error: { code: "CATEGORY_NOT_FOUND", message: "The requested category was not found." } }, { status: 404 });
      if (categoryInput.data.parentId) {
        let ancestorId: string | null = categoryInput.data.parentId;
        const parent = await prisma.category.findUnique({ where: { id: categoryInput.data.parentId }, select: { parentId: true } });
        if (!parent) return NextResponse.json({ error: { code: "CATEGORY_PARENT_NOT_FOUND", message: "The selected parent category was not found." } }, { status: 422 });
        if (parent.parentId) return NextResponse.json({ error: { code: "CATEGORY_DEPTH_INVALID", message: "Categories support one main category and one subcategory level." } }, { status: 422 });
        if (currentCategory.children.length) return NextResponse.json({ error: { code: "CATEGORY_DEPTH_INVALID", message: "Move this category's subcategories first; a subcategory cannot contain another level." } }, { status: 422 });
        while (ancestorId) {
          if (ancestorId === id.data.id) return NextResponse.json({ error: { code: "CATEGORY_PARENT_INVALID", message: "A category cannot be moved beneath one of its own subcategories." } }, { status: 422 });
          const ancestor: { parentId: string | null } | null = await prisma.category.findUnique({ where: { id: ancestorId }, select: { parentId: true } });
          if (!ancestor) return NextResponse.json({ error: { code: "CATEGORY_PARENT_NOT_FOUND", message: "The selected parent category was not found." } }, { status: 422 });
          ancestorId = ancestor.parentId;
        }
      }
      const category = await prisma.category.update({
        where: { id: id.data.id },
        data: { name: categoryInput.data.name, parentId: categoryInput.data.parentId ?? null, description: categoryInput.data.description, imageUrl: categoryInput.data.imageUrl, isActive: categoryInput.data.isActive, ...(categoryInput.data.sortOrder !== undefined ? { sortOrder: categoryInput.data.sortOrder } : {}) },
      });
      revalidatePath("/", "layout");
      return NextResponse.json({ data: category }, { headers: { "Cache-Control": "no-store" } });
    }
    const productInput = catalogProductSchema.safeParse(body);
    if (!productInput.success) return validationError(productInput.error);
    const input = productInput.data;
    const prisma = getPrisma();
    await assertProductPreviewAllowed(prisma, input, id.data.id);
    assertArtworkUploadPublishable(input);
    const existing = await prisma.product.findUnique({
      where: { id: id.data.id },
      include: { categoryLinks: { select: { categoryId: true } }, variants: { orderBy: { sortOrder: "asc" } }, templateLinks: { select: { templateId: true } } },
    });
    if (!existing) return NextResponse.json({ error: { code: "PRODUCT_NOT_FOUND", message: "The requested product was not found." } }, { status: 404 });
    const status = input.published ? "ACTIVE" : "DRAFT";
    const categoryIds = normalizeProductCategoryIds(
      input.categoryId,
      input.categoryIds ?? existing.categoryLinks.map((link) => link.categoryId),
    );
    await assertCatalogCategoryIds(prisma, categoryIds, input.categoryId);
    await assertActiveTemplateLinks(prisma, input.templateLinks);
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
        customizable: input.customizable || input.configurationFields.length > 0 || (input.templateLinks?.length ?? existing.templateLinks.length) > 0,
        material: input.material ?? null,
        dimensions: { display: input.sizeDescription || input.sizes.join(", ") || "Not specified" },
        productionDaysMin: input.productionDaysMin,
        productionDaysMax: input.productionDaysMax,
        metadata: productMetadata(input, existing.metadata),
        publishedAt: input.published ? existing.publishedAt ?? new Date() : null,
        images: { upsert: { where: { productId_sortOrder: { productId: existing.id, sortOrder: 0 } }, update: { url: input.imageUrl, altText: input.name }, create: { url: input.imageUrl, altText: input.name, sortOrder: 0 } } },
        ...(existing.variants[0] ? { variants: { update: { where: { id: existing.variants[0].id }, data: { sku: input.sku, name: input.sizes[0] ?? "Standard", optionValues: { size: input.sizes[0] ?? null, material: input.material ?? null, color: null, packSize: 1 }, pricePaise: Math.round(input.price * 100) } } } } : { variants: { create: { sku: input.sku, name: input.sizes[0] ?? "Standard", optionValues: { size: input.sizes[0] ?? null, material: input.material ?? null, color: null, packSize: 1 }, pricePaise: Math.round(input.price * 100), inventoryPolicy: "MADE_TO_ORDER", isActive: true, sortOrder: 0 } } }),
        personalizationFields: { deleteMany: {}, create: configurationFieldsData(input) },
        ...(input.templateLinks !== undefined ? { templateLinks: { deleteMany: {}, create: templateLinksData(input.templateLinks) } } : {}),
      },
    });
      await writeExtraProductImages(tx, product.id, input.imageUrl, input.extraImages, input.name);
      return product;
    });
    revalidatePath("/", "layout");
    return NextResponse.json({ data: { ...product, categoryIds } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return onboardingApiError(error); }
}
