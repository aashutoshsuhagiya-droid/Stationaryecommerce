import type { ZodError } from "zod";

import {
  assertArtworkUploadPublishable,
  catalogProductSchema,
  createCatalogProduct,
  objectRecord,
  updateCatalogProduct,
} from "./catalog-product-service";
import { getCategoryListingRecipe } from "./category-listing-playbook";
import { ListingPublishError, type ListingProductState, type ListingPublishDeps } from "./listing-publish";
import { positionStudioText } from "./listing-wizard";
import { getPrisma } from "./prisma";
import { createQuick3DPreview } from "./quick-3d-service";
import { defaultDesignPayload } from "./studio-design";
import { loadStudio, saveStudioDesigns } from "./studio-design-service";
import { readStudioConfig } from "./studio-template";

const FIELD_MESSAGES: Record<string, string> = {
  name: "Check the name: use 2 to 180 letters.",
  price: "Check the price.",
  compareAtPrice: "The MRP must be at least the price.",
  sku: "Check the SKU in More options.",
  categoryId: "Choose what you are selling.",
  quantityMax: "Check the quantity limits in More options.",
  productionDaysMax: "Check the production days in More options.",
};

/** Catalog validation in plain words: the first problem, phrased for a shop owner. */
function detailsError(error: ZodError) {
  const path = String(error.issues[0]?.path[0] ?? "");
  return new ListingPublishError(422, "LISTING_DETAILS_INVALID", FIELD_MESSAGES[path] ?? "Some details need another look. Open More options and check them.");
}

function parseProduct(body: Record<string, unknown>) {
  const parsed = catalogProductSchema.safeParse({ ...body, type: "product" });
  if (!parsed.success) throw detailsError(parsed.error);
  return parsed.data;
}

async function loadState(productId: string): Promise<ListingProductState> {
  const prisma = getPrisma();
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      slug: true,
      status: true,
      publishedAt: true,
      metadata: true,
      category: { select: { slug: true } },
      imageAssets: { where: { kind: { in: ["primary", "gallery"] } }, select: { id: true, kind: true, width: true, height: true } },
      templateLinks: { select: { template: { select: { previewConfig: true } } } },
      visualizationTemplates: { where: { status: "PUBLISHED", archivedAt: null }, select: { id: true }, take: 1 },
    },
  });
  if (!product) throw new ListingPublishError(404, "LISTING_PRODUCT_MISSING", "This listing's product was removed. Start a new listing.");
  const configurator = objectRecord(objectRecord(product.metadata).configurator);
  const previewTemplate = typeof configurator.previewTemplate === "string" ? configurator.previewTemplate : "";
  const productModel = typeof configurator.productModel === "string" ? configurator.productModel : "";
  const hasStudioDesigns = product.templateLinks.some((link) => readStudioConfig(link.template.previewConfig));
  return {
    id: product.id,
    slug: product.slug,
    categorySlug: product.category?.slug ?? "",
    published: product.status === "ACTIVE" && Boolean(product.publishedAt),
    threeDLink: configurator.allow3D === true && previewTemplate.startsWith("visualization:") && productModel
      ? { allow3D: true, productModel, previewTemplate }
      : null,
    studioPrintAreas: hasStudioDesigns && Array.isArray(configurator.printAreas) ? configurator.printAreas : null,
    hasStudioDesigns,
    hasPublished3D: product.visualizationTemplates.length > 0,
    assets: product.imageAssets.map((asset) => ({ id: asset.id, kind: asset.kind, width: asset.width, height: asset.height })),
  };
}

/** The real database work behind the listing flow (see `listing-publish.ts`). */
export function listingPublishDeps(actorId: string): ListingPublishDeps {
  const prisma = getPrisma();
  return {
    async findByListingId(listingId, productIdHint) {
      if (productIdHint) {
        // Fast path: the client's id, accepted only if the product really belongs to this listing.
        const hinted = await prisma.product.findUnique({ where: { id: productIdHint }, select: { metadata: true } });
        if (hinted && objectRecord(hinted.metadata).listingId === listingId) return loadState(productIdHint);
      }
      const product = await prisma.product.findFirst({
        where: { metadata: { path: ["listingId"], equals: listingId } },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      return product ? loadState(product.id) : null;
    },
    async createProduct(listingId, body) {
      const created = await createCatalogProduct(parseProduct(body), { metadata: { listingId } });
      return { id: created.id };
    },
    load: loadState,
    async categorySlugFor(categoryId) {
      const category = await prisma.category.findUnique({ where: { id: categoryId }, select: { slug: true } });
      return category?.slug ?? null;
    },
    recipeFor: (categorySlug) => getCategoryListingRecipe(categorySlug),
    async updateProduct(productId, body, willPublish) {
      const input = parseProduct(body);
      // Publishing comes last, but its checks run first, so a refusal leaves nothing half-done.
      if (willPublish) assertArtworkUploadPublishable({ ...input, published: true });
      await updateCatalogProduct(productId, input);
    },
    async createDefaultDesign(productId, textPosition) {
      const studio = await loadStudio(prisma, productId);
      if (!studio || studio.designs.length) return false;
      const fields = await prisma.productPersonalizationField.findMany({
        where: { productId },
        orderBy: { sortOrder: "asc" },
        select: { key: true, label: true, inputType: true, isRequired: true, maxLength: true, validation: true },
      });
      const design = defaultDesignPayload({
        productId,
        imageUrl: studio.product.imageUrl,
        imageSize: studio.product.imageSize,
        fields: fields.map((field) => {
          const validation = objectRecord(field.validation);
          return {
            key: field.key,
            label: field.label,
            inputType: field.inputType,
            required: field.isRequired,
            maxLength: field.maxLength,
            placeholder: typeof validation.placeholder === "string" ? validation.placeholder : null,
            enabled: validation.enabled !== false,
            customerVisible: validation.customerVisible !== false,
          };
        }),
      });
      if (!design) return false;
      await saveStudioDesigns({
        ...design,
        designs: design.designs.map((item) => ({ ...item, studio: positionStudioText(item.studio, textPosition) })),
      });
      return true;
    },
    async create3D(productId) {
      try {
        const result = await createQuick3DPreview({ actorId, productId });
        return result.alreadyLinked ? {} : { ...(result.artworkNote ? { note: result.artworkNote } : {}) };
      } catch (error) {
        // The admin sees a friendly "try another photo"; keep the real cause in the server log.
        console.warn("Listing 3D preview failed", { productId, error });
        throw error;
      }
    },
    async setPublished(productId, published, slug) {
      // One round trip: the details step always leaves the listing as an unpublished draft.
      const status = published ? { status: "ACTIVE" as const, publishedAt: new Date() } : { status: "DRAFT" as const, publishedAt: null };
      const write = (data: Record<string, unknown>) => prisma.product.update({ where: { id: productId }, data, select: { slug: true } });
      try {
        return (await write(slug ? { ...status, slug } : status)).slug;
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code === "P2025") throw new ListingPublishError(404, "LISTING_PRODUCT_MISSING", "This listing's product was removed. Start a new listing.");
        // Slug already taken (P2002): keep the current URL rather than fail the publish.
        if (slug && code === "P2002") return (await write(status)).slug;
        throw error;
      }
    },
    async deleteDraft(productId) {
      try {
        // Never-published drafts only; carts, orders and reviews block the delete (Restrict).
        const removed = await prisma.product.deleteMany({ where: { id: productId, status: "DRAFT", publishedAt: null } });
        return removed.count > 0;
      } catch {
        return false;
      }
    },
  };
}
