import "server-only";

import { createHash, randomUUID } from "node:crypto";

import type { Prisma } from "@/generated/prisma/client";
import { verifyArtworkAssetsForOrder } from "./artwork-assets";
import { artworkRequiresManualReview } from "./artwork-review";
import { resolveProductArtworkPolicy } from "./artwork-policy";
import { CommerceError } from "./commerce-error";
import { priceProductItem } from "./pricing-service";
import { getPrisma } from "./prisma";
import { getStorefrontProductById } from "./runtime-catalog";
import { createOrderTemplateSnapshot, normalizePersistentOrderCustomization } from "./runtime-order-snapshot";
import type { FulfillmentStatus, Order, PaymentStatus, PersonalizationValues, Product } from "./types";
import type { CreateOrderInput, OrderItemInput } from "./validation";

const persistedOrderInclude = {
  addresses: { where: { type: "SHIPPING" as const }, take: 1 },
  items: { include: { personalization: true } },
} as const;

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

function makeOrderNumber() {
  const day = new Date().toISOString().slice(2, 10).replaceAll("-", "");
  return `NMLY-${day}-${randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`;
}

function paymentStatus(status: string): PaymentStatus {
  if (status === "CAPTURED") return "paid";
  if (status === "AUTHORIZED") return "authorized";
  if (status === "FAILED") return "failed";
  if (status === "REFUNDED" || status === "PARTIALLY_REFUNDED") return "refunded";
  return "pending";
}

function fulfillmentStatus(status: string): FulfillmentStatus {
  if (status === "PAYMENT_CONFIRMED") return "order_received";
  const value = status.toLowerCase();
  const supported: FulfillmentStatus[] = ["order_received", "customization_review", "production_approved", "in_production", "quality_check", "ready_to_ship", "shipped", "delivered", "cancelled", "refund_processing", "refunded"];
  return supported.includes(value as FulfillmentStatus) ? value as FulfillmentStatus : "order_received";
}

function configurationSnapshot(product: Product) {
  return {
    version: product.configurator?.configurationVersion ?? "1",
    productType: product.productType ?? null,
    fields: product.customizationFields.map((field) => ({
      id: field.id,
      label: field.label,
      type: field.type,
      required: field.required,
      placeholder: field.placeholder ?? null,
      helpText: field.helpText ?? null,
      defaultValue: field.defaultValue ?? null,
      unit: field.unit ?? null,
      enabled: field.enabled !== false,
      customerVisible: field.customerVisible !== false,
      visibleWhen: field.visibleWhen ?? null,
      minLength: field.minLength ?? null,
      maxLength: field.maxLength ?? null,
      minValue: field.minValue ?? null,
      maxValue: field.maxValue ?? null,
      step: field.step ?? null,
      allowedPattern: field.allowedPattern ?? null,
      priceDelta: field.priceDelta ?? 0,
      options: field.options ?? [],
    })),
    quantity: {
      minimum: product.configurator?.quantityMin ?? 1,
      maximum: product.configurator?.quantityMax ?? 100,
      tiers: product.configurator?.quantityTiers ?? [],
    },
    setupCharge: product.configurator?.setupCharge ?? 0,
    previewTemplate: product.configurator?.previewTemplate ?? null,
    productModel: product.configurator?.productModel ?? null,
    printAreas: product.configurator?.printAreas ?? [],
    artworkUpload: product.configurator?.artworkUpload ?? null,
    artworkPolicy: product.configurator?.artworkPolicy ?? null,
  };
}

function normalizedCustomization(
  product: Product,
  input: OrderItemInput,
  priced: ReturnType<typeof priceProductItem>,
  verifiedArtwork?: Awaited<ReturnType<typeof verifyArtworkAssetsForOrder>>,
): PersonalizationValues | undefined {
  return normalizePersistentOrderCustomization(product, input, priced, verifiedArtwork?.artwork);
}

function selectedTemplateSnapshot(product: Product, customization: PersonalizationValues | undefined) {
  return createOrderTemplateSnapshot(product, customization);
}

function mapPersistedOrder(record: any): Order {
  const address = record.addresses[0];
  if (!address) throw new CommerceError(500, "ORDER_ADDRESS_MISSING", "The persisted order is missing its shipping address.");
  return {
    id: record.id,
    orderNumber: record.orderNumber,
    currency: record.currency,
    items: record.items.map((item: any) => {
      const snapshot = item.productSnapshot && typeof item.productSnapshot === "object" ? item.productSnapshot as Record<string, unknown> : {};
      const values = item.personalization?.values && typeof item.personalization.values === "object" ? item.personalization.values as PersonalizationValues : undefined;
      return {
        id: item.id,
        productId: item.productId ?? "",
        variantId: item.variantId ?? "",
        productName: item.productNameSnapshot,
        productSlug: item.productSlugSnapshot,
        sku: item.skuSnapshot,
        image: typeof snapshot.image === "string" ? snapshot.image : "",
        quantity: item.quantity,
        unitPricePaise: item.unitPricePaise,
        ...(values ? { customization: values } : {}),
        lineTotalPaise: item.lineTotalPaise,
        productSnapshot: {
          name: typeof snapshot.name === "string" ? snapshot.name : item.productNameSnapshot,
          sku: typeof snapshot.sku === "string" ? snapshot.sku : item.skuSnapshot,
          variantName: typeof snapshot.variantName === "string" ? snapshot.variantName : "Standard",
          material: typeof snapshot.material === "string" ? snapshot.material : "Not specified",
          dimensions: typeof snapshot.dimensions === "string" ? snapshot.dimensions : "Not specified",
        },
      };
    }),
    shippingAddress: {
      fullName: address.fullName,
      mobile: address.phone,
      email: record.customerEmail,
      addressLine1: address.addressLine1,
      ...(address.addressLine2 ? { addressLine2: address.addressLine2 } : {}),
      ...(address.landmark ? { landmark: address.landmark } : {}),
      city: address.city,
      state: address.state,
      postalCode: address.postalCode,
      country: "IN",
    },
    ...(record.customerNotes ? { notes: record.customerNotes } : {}),
    paymentStatus: paymentStatus(record.paymentStatus),
    fulfillmentStatus: fulfillmentStatus(record.status),
    subtotalPaise: record.subtotalPaise,
    shippingPaise: record.shippingPaise,
    taxPaise: record.taxPaise,
    discountPaise: record.discountPaise,
    totalPaise: record.totalPaise,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function replayPersistentOrder(record: any, requestFingerprint: string) {
  const snapshot = record.shippingMethodSnapshot && typeof record.shippingMethodSnapshot === "object" ? record.shippingMethodSnapshot as Record<string, unknown> : {};
  if (snapshot.requestFingerprint !== requestFingerprint) {
    throw new CommerceError(409, "IDEMPOTENCY_KEY_REUSED", "This idempotency key was already used for a different order request.");
  }
  return { order: mapPersistedOrder(record), replayed: true };
}

function isUniqueConstraint(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "P2002");
}

/** Returns null when the requested product IDs are not in the persistent catalog. */
export async function createPersistentStorefrontOrder(input: CreateOrderInput, idempotencyKey: string, userId?: string) {
  const prisma = getPrisma();
  const requestFingerprint = createHash("sha256").update(canonicalJson(input)).digest("hex");
  const existing = await prisma.order.findUnique({ where: { idempotencyKey }, include: persistedOrderInclude });
  if (existing) return replayPersistentOrder(existing, requestFingerprint);
  const ids = [...new Set(input.items.map((item) => item.productId))];
  const persistentProducts = await prisma.product.findMany({
    where: { id: { in: ids }, status: "ACTIVE", publishedAt: { not: null, lte: new Date() }, archivedAt: null, category: { isActive: true, OR: [{ parentId: null }, { parent: { isActive: true } }] } },
    select: { id: true, variants: { select: { id: true, inventoryPolicy: true } } },
  });
  if (persistentProducts.length !== ids.length) return null;
  const persistentById = new Map(persistentProducts.map((product) => [product.id, product]));
  for (const item of input.items) {
    const variant = persistentById.get(item.productId)?.variants.find((candidate) => candidate.id === item.variantId);
    if (variant && variant.inventoryPolicy !== "MADE_TO_ORDER") {
      throw new CommerceError(409, "INVENTORY_RESERVATION_REQUIRED", "This product needs an inventory reservation flow before it can be ordered through the database checkout.", {
        productId: item.productId,
        variantId: item.variantId,
      });
    }
  }

  const products = await Promise.all(input.items.map((item) => getStorefrontProductById(item.productId)));
  const unavailable = products.findIndex((product) => !product);
  if (unavailable >= 0) throw new CommerceError(404, "PRODUCT_NOT_FOUND", "One of the selected products no longer exists.", { productId: input.items[unavailable].productId });
  const resolvedProducts = products as Product[];
  const pricedItems = input.items.map((item, index) => priceProductItem(resolvedProducts[index], item));
  const verifiedArtworkAssets = await Promise.all(input.items.map((item, index) => verifyArtworkAssetsForOrder({
    productId: resolvedProducts[index].id,
    artwork: item.customization?.artwork,
    ownerUserId: userId,
  })));
  const customizations = input.items.map((item, index) => normalizedCustomization(
    resolvedProducts[index],
    item,
    pricedItems[index],
    verifiedArtworkAssets[index],
  ));
  const artworkReviews = input.items.map((item, index) => {
    const requiresReview = artworkRequiresManualReview(
      item.customization?.artwork,
      resolveProductArtworkPolicy(resolvedProducts[index]),
    );
    return {
      artworkStatus: requiresReview ? "PENDING_REVIEW" as const : "APPROVED" as const,
      assetStatus: requiresReview ? "ATTACHED" as const : "APPROVED" as const,
    };
  });
  const orderItemIds = input.items.map(() => randomUUID());
  const subtotalPaise = pricedItems.reduce((total, item) => total + item.lineTotalPaise, 0);
  const shippingPaise = 7_900;
  const taxPaise = 0;
  const discountPaise = 0;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.order.findUnique({ where: { idempotencyKey }, include: persistedOrderInclude });
      if (existing) return replayPersistentOrder(existing, requestFingerprint);
      const reviewedAt = new Date();
      const created = await tx.order.create({
        data: {
          orderNumber: makeOrderNumber(),
          ...(userId ? { userId } : {}),
          customerEmail: input.shippingAddress.email,
          customerPhone: input.shippingAddress.mobile,
          subtotalPaise,
          shippingPaise,
          taxPaise,
          discountPaise,
          totalPaise: subtotalPaise + shippingPaise + taxPaise - discountPaise,
          shippingMethodSnapshot: asJson({ method: input.shippingMethod, requestFingerprint }),
          ...(input.notes ? { customerNotes: input.notes } : {}),
          idempotencyKey,
          addresses: { create: { type: "SHIPPING", fullName: input.shippingAddress.fullName, phone: input.shippingAddress.mobile, addressLine1: input.shippingAddress.addressLine1, ...(input.shippingAddress.addressLine2 ? { addressLine2: input.shippingAddress.addressLine2 } : {}), ...(input.shippingAddress.landmark ? { landmark: input.shippingAddress.landmark } : {}), city: input.shippingAddress.city, state: input.shippingAddress.state, postalCode: input.shippingAddress.postalCode, countryCode: input.shippingAddress.country } },
          items: { create: pricedItems.map((priced, index) => {
            const product = resolvedProducts[index];
            const customization = customizations[index];
            const templateSnapshot = selectedTemplateSnapshot(product, customization);
            return {
              id: orderItemIds[index],
              productId: priced.productId,
              variantId: priced.variantId,
              productNameSnapshot: priced.productName,
              productSlugSnapshot: priced.productSlug,
              skuSnapshot: priced.sku,
              variantSnapshot: asJson({ id: priced.variantId, name: priced.productSnapshot.variantName, sku: priced.sku, material: priced.productSnapshot.material }),
              productSnapshot: asJson({ ...priced.productSnapshot, image: priced.image, configuration: configurationSnapshot(product), pricingAdjustments: priced.adjustments }),
              quantity: priced.quantity,
              unitPricePaise: priced.unitPricePaise,
              lineTotalPaise: priced.lineTotalPaise,
              ...(customization ? { personalization: { create: { values: asJson(customization), previewVersion: customization.previewVersion, artworkStatus: artworkReviews[index].artworkStatus, ...(artworkReviews[index].artworkStatus === "APPROVED" ? { approvedAt: reviewedAt } : {}), ...(templateSnapshot ? { templateId: templateSnapshot.templateId, templateSnapshot: asJson(templateSnapshot) } : {}) } } } : {}),
            };
          }) },
        },
        include: persistedOrderInclude,
      });
      const attachedAt = new Date();
      const guestClaimExpiresAt = new Date(attachedAt.getTime() + 7 * 24 * 60 * 60 * 1_000);
      for (let itemIndex = 0; itemIndex < verifiedArtworkAssets.length; itemIndex += 1) {
        const verified = verifiedArtworkAssets[itemIndex];
        if (!verified) continue;
        for (const claim of verified.claims) {
          const attached = await tx.artworkAsset.updateMany({
            where: {
              id: claim.id,
              claimTokenHash: claim.claimTokenHash,
              productId: pricedItems[itemIndex].productId,
              orderItemId: null,
              status: "UPLOADED",
              expiresAt: { gt: attachedAt },
            },
            data: {
              orderItemId: orderItemIds[itemIndex],
              status: artworkReviews[itemIndex].assetStatus,
              attachedAt,
              expiresAt: guestClaimExpiresAt,
            },
          });
          if (attached.count !== 1) {
            throw new CommerceError(409, "ARTWORK_ASSET_ALREADY_CLAIMED", "An uploaded artwork asset was already used or expired. Upload it again before checkout.", {
              productId: pricedItems[itemIndex].productId,
              assetId: claim.id,
            });
          }
        }
      }
      return { order: mapPersistedOrder(created), replayed: false };
    });
    return result;
  } catch (error) {
    if (!isUniqueConstraint(error)) throw error;
    const existing = await prisma.order.findUnique({ where: { idempotencyKey }, include: persistedOrderInclude });
    if (!existing) throw error;
    return replayPersistentOrder(existing, requestFingerprint);
  }
}

export async function getPersistentOrderTracking(orderNumber: string, email: string) {
  try {
    const record = await getPrisma().order.findFirst({
      where: { orderNumber: orderNumber.trim().toUpperCase(), customerEmail: email.toLowerCase() },
      select: { orderNumber: true, currency: true, paymentStatus: true, status: true, totalPaise: true, updatedAt: true, _count: { select: { items: true } } },
    });
    if (!record) return undefined;
    return { orderNumber: record.orderNumber, currency: record.currency as "INR", paymentStatus: paymentStatus(record.paymentStatus), fulfillmentStatus: fulfillmentStatus(record.status), itemCount: record._count.items, totalPaise: record.totalPaise, updatedAt: record.updatedAt.toISOString() };
  } catch {
    return undefined;
  }
}
