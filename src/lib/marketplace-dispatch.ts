import "server-only";

import {
  AssignmentError,
  isAssignmentRetryable,
  normalizeServiceCity,
  planAssignmentOffers,
  type VendorEligibilitySnapshot,
} from "./marketplace-assignment";
import {
  capVendorOfferIds,
  MARKETPLACE_MAX_VENDORS_SETTING_KEY,
  MarketplaceSettingValueError,
  resolveMaxVendorsPerOrder,
} from "./marketplace-settings-domain";
import { getPrisma } from "./prisma";
import { capturedCustomOrderStatus } from "./artwork-review";

function positiveIntegerSetting(name: string, fallback: number, minimum: number, maximum: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new AssignmentError(500, "INVALID_ASSIGNMENT_POLICY", `${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return value;
}

const assignmentSelect = {
  id: true,
  orderId: true,
  status: true,
  attempt: true,
  offerExpiresAt: true,
  assignedVendorId: true,
  assignedAt: true,
  failureReason: true,
  version: true,
  offers: {
    select: { id: true, vendorId: true, status: true, expiresAt: true },
    orderBy: { createdAt: "asc" as const },
  },
} as const;

function fulfillmentCategoryIds(product: { categoryId: string }) {
  return [product.categoryId];
}

export async function dispatchCapturedOrderToVendors(orderId: string) {
  const prisma = getPrisma();
  const offerWindowSeconds = positiveIntegerSetting("VENDOR_OFFER_WINDOW_SECONDS", 60, 15, 900);

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;
    const existing = await tx.orderAssignment.findUnique({ where: { orderId }, select: assignmentSelect });
    const now = new Date();
    const retryable = isAssignmentRetryable(existing, now);
    if (!retryable && existing) return { assignment: existing, replayed: true };

    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        paymentStatus: true,
        addresses: {
          where: { type: "SHIPPING" },
          select: { city: true, postalCode: true },
          take: 1,
        },
        items: {
          select: {
            productId: true,
            quantity: true,
            personalization: { select: { artworkStatus: true } },
            product: {
              select: {
                categoryId: true,
              },
            },
          },
        },
      },
    });
    if (!order) throw new AssignmentError(404, "ORDER_NOT_FOUND", "The order was not found.");

    const terminal = ["DELIVERED", "CANCELLED", "REFUND_PROCESSING", "REFUNDED"].includes(order.status);
    if (terminal || order.paymentStatus !== "CAPTURED") {
      if (existing) {
        await tx.vendorOrderOffer.updateMany({
          where: { assignmentId: existing.id, status: "PENDING" },
          data: { status: "CLOSED", closedAt: now },
        });
        const assignment = await tx.orderAssignment.update({
          where: { id: existing.id },
          data: {
            status: "CANCELLED",
            offerExpiresAt: null,
            failureReason: terminal ? "Order is closed or refunded" : "Payment is no longer captured",
            version: { increment: 1 },
            events: {
              create: {
                orderId: order.id,
                type: "ASSIGNMENT_CANCELLED",
                metadata: { orderStatus: order.status, paymentStatus: order.paymentStatus },
              },
            },
          },
          select: assignmentSelect,
        });
        return { assignment, replayed: false };
      }
      if (order.paymentStatus !== "CAPTURED") {
        throw new AssignmentError(409, "PAYMENT_NOT_CAPTURED", "Vendor assignment can start only after payment is captured.");
      }
      throw new AssignmentError(409, "ORDER_NOT_ASSIGNABLE", "A closed or refunded order cannot be assigned to a vendor.");
    }
    const shipping = order.addresses[0];
    if (!shipping) {
      throw new AssignmentError(409, "SHIPPING_ADDRESS_REQUIRED", "A shipping address is required before vendor assignment.");
    }

    const personalizationStatuses = order.items.flatMap((item) =>
      item.personalization ? [item.personalization.artworkStatus] : []);
    const reviewAwareOrderStatus = capturedCustomOrderStatus(order.paymentStatus, personalizationStatuses);
    if (reviewAwareOrderStatus && reviewAwareOrderStatus !== order.status) {
      await tx.order.update({ where: { id: order.id }, data: { status: reviewAwareOrderStatus } });
    }

    const storedOfferPolicy = await tx.storeSetting.findUnique({
      where: { key: MARKETPLACE_MAX_VENDORS_SETTING_KEY },
      select: { value: true },
    });
    let offerPolicy: ReturnType<typeof resolveMaxVendorsPerOrder>;
    try {
      offerPolicy = resolveMaxVendorsPerOrder({
        databaseValue: storedOfferPolicy?.value,
        environmentValue: process.env.VENDOR_MAX_OFFERS_PER_ORDER,
      });
    } catch (error) {
      if (error instanceof MarketplaceSettingValueError) {
        throw new AssignmentError(500, "INVALID_ASSIGNMENT_POLICY", error.message);
      }
      throw error;
    }

    if (existing?.status === "OFFERED") {
      await tx.vendorOrderOffer.updateMany({
        where: { assignmentId: existing.id, status: "PENDING" },
        data: { status: "EXPIRED", closedAt: now },
      });
      await tx.assignmentEvent.create({
        data: {
          assignmentId: existing.id,
          orderId: order.id,
          type: "ASSIGNMENT_EXPIRED",
          metadata: { expiredAt: now.toISOString(), attempt: existing.attempt },
        },
      });
    }

    const demandHasUnknownProduct = order.items.some((item) => item.productId === null || item.product === null);
    const orderCategoryIds = [...new Set(order.items.flatMap((item) => item.product
      ? fulfillmentCategoryIds(item.product)
      : []))];
    const vendors = demandHasUnknownProduct ? [] : await tx.vendorProfile.findMany({
      where: {
        verificationStatus: "APPROVED",
        operationalStatus: "ACTIVE",
        availabilityStatus: "ONLINE",
        acceptingOrders: true,
        normalizedCity: normalizeServiceCity(shipping.city),
        servicePostalCodes: { has: shipping.postalCode },
        serviceCategoryIds: { hasEvery: orderCategoryIds },
        user: { status: "ACTIVE" },
      },
      orderBy: [{ activeOrderCount: "asc" }, { updatedAt: "asc" }],
      take: 500,
      select: {
        id: true,
        verificationStatus: true,
        operationalStatus: true,
        availabilityStatus: true,
        acceptingOrders: true,
        normalizedCity: true,
        servicePostalCodes: true,
        serviceCategoryIds: true,
        activeOrderCount: true,
        maxConcurrentOrders: true,
        capabilities: {
          where: { isActive: true },
          select: { productId: true, isActive: true, maxOrderQuantity: true },
        },
      },
    });
    const snapshots: VendorEligibilitySnapshot[] = vendors.map((vendor) => ({
      ...vendor,
      capabilities: vendor.capabilities.map((capability) => ({
        productId: capability.productId,
        isActive: capability.isActive,
        ...(capability.maxOrderQuantity === null ? {} : { maxOrderQuantity: capability.maxOrderQuantity }),
      })),
    }));
    const priorVendorIds = new Set(existing?.offers.map((offer) => offer.vendorId) ?? []);
    const plan = planAssignmentOffers({
      order: {
        orderId: order.id,
        paymentStatus: "CAPTURED",
        city: shipping.city,
        postalCode: shipping.postalCode,
        lines: order.items.flatMap((item) => item.productId && item.product
          ? [{
              productId: item.productId,
              categoryIds: fulfillmentCategoryIds(item.product),
              quantity: item.quantity,
            }]
          : []),
      },
      vendors: snapshots,
      now,
      offerWindowSeconds,
      excludedVendorIds: priorVendorIds,
    });

    if (plan.status === "UNASSIGNED") {
      const failureReason = demandHasUnknownProduct ? "Order contains an item without a product capability key" : "No eligible vendor";
      const assignment = existing
        ? await tx.orderAssignment.update({
          where: { id: existing.id },
          data: {
            status: "UNASSIGNED",
            attempt: { increment: 1 },
            offerExpiresAt: null,
            failureReason,
            version: { increment: 1 },
            events: {
              create: [
                { orderId: order.id, type: "ASSIGNMENT_STARTED", metadata: { paymentStatus: order.paymentStatus } },
                { orderId: order.id, type: "NO_ELIGIBLE_VENDOR", metadata: { reason: demandHasUnknownProduct ? "unknown_product" : "no_eligible_vendor" } },
              ],
            },
          },
          select: assignmentSelect,
        })
        : await tx.orderAssignment.create({
          data: {
            orderId: order.id,
            status: "UNASSIGNED",
            failureReason,
            events: {
              create: [
                { orderId: order.id, type: "ASSIGNMENT_STARTED", metadata: { paymentStatus: order.paymentStatus } },
                { orderId: order.id, type: "NO_ELIGIBLE_VENDOR", metadata: { reason: demandHasUnknownProduct ? "unknown_product" : "no_eligible_vendor" } },
              ],
            },
          },
          select: assignmentSelect,
        });
      return { assignment, replayed: false };
    }

    const vendorIds = capVendorOfferIds(plan.vendorIds, offerPolicy.maxVendorsPerOrder);
    const offerEventMetadata = {
      vendorCount: vendorIds.length,
      expiresAt: plan.expiresAt.toISOString(),
      maxVendorsPerOrder: offerPolicy.maxVendorsPerOrder,
      policySource: offerPolicy.source,
    };
    const assignment = existing
      ? await tx.orderAssignment.update({
        where: { id: existing.id },
        data: {
          status: "OFFERED",
          attempt: { increment: 1 },
          offerExpiresAt: plan.expiresAt,
          failureReason: null,
          version: { increment: 1 },
          offers: {
            create: vendorIds.map((vendorId) => ({ vendorId, expiresAt: plan.expiresAt })),
          },
          events: {
            create: [
              { orderId: order.id, type: "ASSIGNMENT_STARTED", metadata: { paymentStatus: order.paymentStatus } },
              { orderId: order.id, type: "OFFERS_CREATED", metadata: offerEventMetadata },
            ],
          },
        },
        select: assignmentSelect,
      })
      : await tx.orderAssignment.create({
        data: {
          orderId: order.id,
          status: "OFFERED",
          offerExpiresAt: plan.expiresAt,
          offers: { create: vendorIds.map((vendorId) => ({ vendorId, expiresAt: plan.expiresAt })) },
          events: {
            create: [
              { orderId: order.id, type: "ASSIGNMENT_STARTED", metadata: { paymentStatus: order.paymentStatus } },
              { orderId: order.id, type: "OFFERS_CREATED", metadata: offerEventMetadata },
            ],
          },
        },
        select: assignmentSelect,
      });
    return { assignment, replayed: false };
  }, { isolationLevel: "Serializable" });
}

export async function recoverExpiredVendorAssignments(limit = 50) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new AssignmentError(400, "INVALID_RECOVERY_LIMIT", "Recovery limit must be between 1 and 100.");
  }
  const now = new Date();
  const retryDelaySeconds = positiveIntegerSetting("VENDOR_RETRY_DELAY_SECONDS", 60, 30, 3_600);
  const retryCutoff = new Date(now.getTime() - retryDelaySeconds * 1_000);
  const expired = await getPrisma().orderAssignment.findMany({
    where: {
      OR: [
        { status: "OFFERED", offerExpiresAt: { lte: now } },
        { status: { in: ["PENDING", "UNASSIGNED", "EXPIRED"] }, updatedAt: { lte: retryCutoff } },
      ],
    },
    select: { orderId: true },
    orderBy: { offerExpiresAt: "asc" },
    take: limit,
  });
  const results = [];
  for (const { orderId: expiredOrderId } of expired) {
    try {
      const result = await dispatchCapturedOrderToVendors(expiredOrderId);
      results.push({ orderId: expiredOrderId, status: result.assignment.status, ok: true as const });
    } catch (error) {
      results.push({
        orderId: expiredOrderId,
        ok: false as const,
        error: error instanceof Error ? error.message : "Recovery failed",
      });
    }
  }
  return { processed: results.length, results };
}
