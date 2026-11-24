import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/auth-session";
import { requireCatalogAdmin } from "@/lib/catalog-admin";
import { productArtworkPolicySchema } from "@/lib/artwork-policy-schema";
import {
  catalogImageUrlSchema,
  catalogProductSchema,
  createCatalogProduct,
  nextConfigurationVersion,
  objectRecord,
  slugify,
  strings,
  updateCatalogProduct,
} from "@/lib/catalog-product-service";
import { CommerceError } from "@/lib/commerce-error";
import {
  EZPAC_PACKAGING_CATEGORY_PRESETS,
  getEzpacPackagingCategory,
} from "@/lib/ezpac-packaging-presets";
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
import { isStudioTemplateSlug, STUDIO_TEMPLATE_SLUG_PREFIXES } from "@/lib/studio-design";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const categorySlugSchema = z.string().trim().min(1).max(140).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens only.");
const categorySchema = z.object({ type: z.literal("category"), name: z.string().trim().min(2).max(120), slug: categorySlugSchema.optional(), parentId: z.string().min(1).nullable().optional(), description: z.string().trim().max(1000).nullable().optional(), imageUrl: catalogImageUrlSchema.nullable().optional(), isActive: z.boolean().default(true), sortOrder: z.number().int().min(0).max(1_000_000).optional() });
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
    compareAtPrice: product.compareAtPricePaise ? product.compareAtPricePaise / 100 : 0,
    gstPercent: Math.round((product.taxRateBasisPoints ?? 0) / 100),
    tags: Array.isArray(product.tags) ? product.tags : [],
    seoTitle: product.seoTitle ?? "",
    seoDescription: product.seoDescription ?? "",
    stockOnHand: Array.isArray(product.variants)
      ? product.variants.reduce((total: number, variant: any) => total + (variant.inventory?.quantityOnHand ?? 0), 0)
      : 0,
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
    templateLinks: Array.isArray(product.templateLinks) ? product.templateLinks.map((link: any) => ({
      templateId: link.templateId,
      isDefault: link.isDefault === true,
      sortOrder: typeof link.sortOrder === "number" ? link.sortOrder : 0,
      // A product's own 2D designs (imported "rb-…" or made in the design editor "st-…") are listed with the product.
      ...(typeof link.template?.slug === "string" && isStudioTemplateSlug(link.template.slug)
        ? { imported: true, name: String(link.template.name ?? ""), thumbnailUrl: String(link.template.thumbnailUrl ?? "") }
        : {}),
    })) : [],
    configurationFields: product.personalizationFields.map((field: any) => {
      const validation = objectRecord(field.validation);
      const optionConfig = objectRecord(field.optionConfig);
      return { key: field.key, label: field.label, inputType: field.inputType, required: field.isRequired, placeholder: typeof validation.placeholder === "string" ? validation.placeholder : "", helpText: typeof validation.helpText === "string" ? validation.helpText : "", defaultValue: typeof validation.defaultValue === "string" ? validation.defaultValue : "", unit: typeof validation.unit === "string" ? validation.unit : "", enabled: validation.enabled !== false, customerVisible: validation.customerVisible !== false, visibleWhen: (() => { const condition = objectRecord(validation.visibleWhen); return typeof condition.fieldId === "string" && typeof condition.equals === "string" ? { fieldId: condition.fieldId, equals: condition.equals } : null; })(), minLength: field.minLength, maxLength: field.maxLength, allowedPattern: typeof validation.allowedPattern === "string" ? validation.allowedPattern : "", minValue: typeof validation.minValue === "number" ? validation.minValue : null, maxValue: typeof validation.maxValue === "number" ? validation.maxValue : null, step: typeof validation.step === "number" ? validation.step : null, priceDelta: field.priceDeltaPaise / 100, options: Array.isArray(optionConfig.options) ? optionConfig.options : [] };
    }),
  };
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
      const product = await prisma.product.findUnique({ where: { id: productId }, include: { categoryLinks: { select: { categoryId: true } }, images: { orderBy: { sortOrder: "asc" } }, imageAssets: { where: { kind: { in: ["primary", "surface-base"] } }, select: { id: true, kind: true, surfaceId: true, altText: true }, orderBy: { createdAt: "desc" } }, variants: { include: { inventory: true }, orderBy: { sortOrder: "asc" } }, personalizationFields: { orderBy: { sortOrder: "asc" } }, templateLinks: { orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }], include: { template: { select: { name: true, slug: true, thumbnailUrl: true } } } }, visualizationJobs: { where: { status: { in: ["QUEUED", "PROCESSING", "NEEDS_CONFIRMATION"] } }, select: { status: true }, orderBy: { updatedAt: "desc" }, take: 1 } } });
      if (!product) return NextResponse.json({ error: { code: "PRODUCT_NOT_FOUND", message: "The requested product was not found." } }, { status: 404, headers: { "Cache-Control": "no-store" } });
      const templates = await prisma.visualizationTemplate.findMany({
        where: { productId, status: "PUBLISHED" },
        select: { id: true, productType: true, geometry: true, dimensions: true, version: true, publishedAt: true, materialSettings: true },
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
        publishedVisualizationTemplates: templates.map((template) => {
          const note = objectRecord(template.materialSettings).artworkNote;
          return {
            id: template.id,
            version: template.version,
            productType: template.productType ?? "",
            model: resolveVisualizationProductModel(template) ?? "",
            ...(typeof note === "string" && note ? { artworkNote: note.slice(0, 240) } : {}),
          };
        }),
      } } }, { headers: { "Cache-Control": "no-store" } });
    }
    const [categories, products, templates] = await Promise.all([
      prisma.category.findMany({ orderBy: { sortOrder: "asc" } }),
      prisma.product.findMany({ include: { category: true, categoryLinks: { select: { categoryId: true } }, images: { where: { sortOrder: 0 }, take: 1, select: { url: true } }, variants: { include: { inventory: true } } }, orderBy: { updatedAt: "desc" } }),
      // The reusable theme library; a product's own imported designs ("rb-…") come with that product.
      prisma.personalizationTemplate.findMany({ where: { status: "ACTIVE", AND: STUDIO_TEMPLATE_SLUG_PREFIXES.map((prefix) => ({ NOT: { slug: { startsWith: prefix } } })) }, select: { id: true, name: true, slug: true, theme: true, thumbnailUrl: true, premiumPricePaise: true }, orderBy: [{ theme: "asc" }, { name: "asc" }] }),
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
      const slug = parsed.data.slug ?? slugify(parsed.data.name);
      if (!slug) return NextResponse.json({ error: { code: "CATEGORY_SLUG_INVALID", message: "Enter a category name that can be converted into a URL slug." } }, { status: 422 });
      const duplicate = await prisma.category.findUnique({ where: { slug }, select: { id: true } });
      if (duplicate) return NextResponse.json({ error: { code: "CATEGORY_SLUG_EXISTS", message: "A category with this slug already exists." } }, { status: 409 });
      const category = await prisma.category.create({ data: { name: parsed.data.name, slug, parentId: parsed.data.parentId ?? null, description: parsed.data.description, imageUrl: parsed.data.imageUrl, isActive: parsed.data.isActive, sortOrder: parsed.data.sortOrder ?? await prisma.category.count({ where: { parentId: parsed.data.parentId ?? null } }) } });
      revalidatePath("/", "layout");
      return NextResponse.json({ data: category }, { status: 201 });
    }

    const product = await createCatalogProduct(parsed.data);
    revalidatePath("/", "layout");
    return NextResponse.json({ data: product }, { status: 201 });
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
          variants: { include: { inventory: true }, orderBy: { sortOrder: "asc" } },
          personalizationFields: { orderBy: { sortOrder: "asc" } },
          templateLinks: { orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }], include: { template: { select: { name: true, slug: true, thumbnailUrl: true } } } },
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
      const slug = categoryInput.data.slug ?? currentCategory.slug;
      if (slug !== currentCategory.slug) {
        const duplicate = await prisma.category.findUnique({ where: { slug }, select: { id: true } });
        if (duplicate) return NextResponse.json({ error: { code: "CATEGORY_SLUG_EXISTS", message: "A category with this slug already exists." } }, { status: 409 });
      }
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
        data: { name: categoryInput.data.name, slug, parentId: categoryInput.data.parentId ?? null, description: categoryInput.data.description, imageUrl: categoryInput.data.imageUrl, isActive: categoryInput.data.isActive, ...(categoryInput.data.sortOrder !== undefined ? { sortOrder: categoryInput.data.sortOrder } : {}) },
      });
      revalidatePath("/", "layout");
      return NextResponse.json({ data: category }, { headers: { "Cache-Control": "no-store" } });
    }
    const productInput = catalogProductSchema.safeParse(body);
    if (!productInput.success) return validationError(productInput.error);
    const product = await updateCatalogProduct(id.data.id, productInput.data);
    revalidatePath("/", "layout");
    return NextResponse.json({ data: product }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return onboardingApiError(error); }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    await requireCatalogAdmin(request);
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") ?? "category";
    const categoryId = (searchParams.get("categoryId") ?? searchParams.get("id") ?? "").trim();
    if (type !== "category" || !categoryId || categoryId.length > 100) {
      return NextResponse.json({ error: { code: "CATEGORY_DELETE_INVALID", message: "Choose a category to delete." } }, { status: 400 });
    }

    const prisma = getPrisma();
    await prisma.$transaction(async (tx) => {
      const category = await tx.category.findUnique({
        where: { id: categoryId },
        include: {
          children: { select: { id: true } },
          _count: { select: { products: true, productLinks: true } },
        },
      });
      if (!category) throw new CommerceError(404, "CATEGORY_NOT_FOUND", "The requested category was not found.");
      if (category._count.products > 0) {
        throw new CommerceError(409, "CATEGORY_HAS_PRODUCTS", "This category is assigned as the main category for existing products. Move those products before deleting it.", { productCount: category._count.products });
      }
      if (category.children.length > 0) {
        throw new CommerceError(409, "CATEGORY_HAS_CHILDREN", "Delete or move this category's subcategories before deleting it.", { childCount: category.children.length });
      }

      await tx.productCategory.deleteMany({ where: { categoryId } });
      await tx.couponCategory.deleteMany({ where: { categoryId } });
      await tx.personalizationTemplate.updateMany({ where: { categoryId }, data: { categoryId: null } });
      await tx.category.delete({ where: { id: categoryId } });
    });
    revalidatePath("/", "layout");
    return NextResponse.json({ success: true, message: "Category deleted successfully.", data: { id: categoryId } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return onboardingApiError(error); }
}
