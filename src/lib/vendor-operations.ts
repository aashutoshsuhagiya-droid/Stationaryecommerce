import "server-only";

import { dispatchCapturedOrderToVendors } from "./marketplace-dispatch";
import { getPrisma } from "./prisma";
import { canApplyVendorOrderAction, isVendorOperational, vendorOrderTransitions } from "./vendor-operations-domain";
import type { VendorAvailabilityInput, VendorOrderActionInput } from "./vendor-operations-validation";

export class VendorOperationsError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = "VendorOperationsError";
  }
}

const orderSummarySelect = {
  id: true,
  orderNumber: true,
  status: true,
  paymentStatus: true,
  currency: true,
  subtotalPaise: true,
  totalPaise: true,
  placedAt: true,
  completedAt: true,
  items: {
    select: {
      id: true,
      productNameSnapshot: true,
      quantity: true,
      lineTotalPaise: true,
    },
  },
  addresses: {
    where: { type: "SHIPPING" as const },
    select: {
      fullName: true,
      phone: true,
      addressLine1: true,
      addressLine2: true,
      landmark: true,
      city: true,
      state: true,
      postalCode: true,
    },
    take: 1,
  },
} as const;

const offerOrderSummarySelect = {
  id: true,
  orderNumber: true,
  status: true,
  paymentStatus: true,
  currency: true,
  subtotalPaise: true,
  totalPaise: true,
  placedAt: true,
  completedAt: true,
  items: orderSummarySelect.items,
  addresses: {
    where: { type: "SHIPPING" as const },
    select: { city: true, state: true, postalCode: true },
    take: 1,
  },
} as const;

export async function getVendorOperations(userId: string) {
  const profile = await getPrisma().vendorProfile.findUnique({
    where: { userId },
    select: {
      id: true,
      verificationStatus: true,
      operationalStatus: true,
      availabilityStatus: true,
      acceptingOrders: true,
      maxConcurrentOrders: true,
      activeOrderCount: true,
      servicePostalCodes: true,
      capabilities: {
        where: { isActive: true },
        select: { id: true, productId: true, maxOrderQuantity: true, productionDays: true },
      },
      offers: {
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          status: true,
          expiresAt: true,
          acceptedAt: true,
          declinedAt: true,
          rejectionReason: true,
          createdAt: true,
          assignment: {
            select: {
              id: true,
              status: true,
              order: { select: offerOrderSummarySelect },
            },
          },
        },
      },
      assignments: {
        orderBy: { assignedAt: "desc" },
        take: 100,
        select: {
          id: true,
          status: true,
          assignedAt: true,
          order: { select: orderSummarySelect },
        },
      },
    },
  });
  if (!profile) throw new VendorOperationsError(404, "VENDOR_PROFILE_NOT_FOUND", "Vendor profile not found.");

  const deliveredOrders = profile.assignments.filter(({ order }) => order.status === "DELIVERED");
  return {
    profile: {
      id: profile.id,
      verificationStatus: profile.verificationStatus,
      operationalStatus: profile.operationalStatus,
      availabilityStatus: profile.availabilityStatus,
      acceptingOrders: profile.acceptingOrders,
      maxConcurrentOrders: profile.maxConcurrentOrders,
      activeOrderCount: profile.activeOrderCount,
      servicePostalCodes: profile.servicePostalCodes,
      capabilityCount: profile.capabilities.length,
    },
    offers: profile.offers,
    orders: profile.assignments,
    earnings: {
      currency: "INR",
      completedOrderCount: deliveredOrders.length,
      grossFulfilledValuePaise: deliveredOrders.reduce((total, assignment) => total + assignment.order.subtotalPaise, 0),
      disclosure: "Gross fulfilled order value is shown until a vendor payout policy and settlement ledger are configured.",
    },
  };
}

export async function updateVendorAvailability(userId: string, input: VendorAvailabilityInput) {
  const prisma = getPrisma();
  const profile = await prisma.vendorProfile.findUnique({ where: { userId } });
  if (!profile) throw new VendorOperationsError(404, "VENDOR_PROFILE_NOT_FOUND", "Vendor profile not found.");
  const acceptingOrders = input.availabilityStatus === "ONLINE" && input.acceptingOrders;
  const changed = await prisma.vendorProfile.updateMany({
    where: { id: profile.id, verificationStatus: "APPROVED", operationalStatus: "ACTIVE" },
    data: { availabilityStatus: input.availabilityStatus, acceptingOrders },
  });
  if (changed.count !== 1) {
    throw new VendorOperationsError(403, "VENDOR_NOT_OPERATIONAL", "Only an approved, active vendor can change marketplace availability.");
  }
  return prisma.vendorProfile.findUniqueOrThrow({
    where: { id: profile.id },
    select: {
      verificationStatus: true,
      operationalStatus: true,
      availabilityStatus: true,
      acceptingOrders: true,
      maxConcurrentOrders: true,
      activeOrderCount: true,
    },
  });
}

export async function declineVendorOffer(userId: string, offerId: string, reason?: string) {
  const prisma = getPrisma();
  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const offer = await tx.vendorOrderOffer.findUnique({
      where: { id: offerId },
      include: {
        vendor: { select: { userId: true } },
        assignment: { select: { id: true, orderId: true, status: true } },
      },
    });
    if (!offer || offer.vendor.userId !== userId) {
      throw new VendorOperationsError(404, "OFFER_NOT_FOUND", "The order offer was not found.");
    }
    if (offer.status !== "PENDING") {
      throw new VendorOperationsError(409, "OFFER_NOT_PENDING", "This order offer is no longer pending.");
    }
    if (offer.expiresAt <= now) {
      await tx.vendorOrderOffer.update({
        where: { id: offer.id },
        data: { status: "EXPIRED", closedAt: now },
      });
      return { expired: true as const, orderId: offer.assignment.orderId };
    }

    const changed = await tx.vendorOrderOffer.updateMany({
      where: { id: offer.id, status: "PENDING" },
      data: { status: "DECLINED", declinedAt: now, closedAt: now, rejectionReason: reason },
    });
    if (changed.count !== 1) throw new VendorOperationsError(409, "OFFER_NOT_PENDING", "This order offer changed before it could be declined.");
    await tx.assignmentEvent.create({
      data: {
        assignmentId: offer.assignment.id,
        orderId: offer.assignment.orderId,
        vendorId: offer.vendorId,
        type: "OFFER_DECLINED",
        metadata: { offerId: offer.id, reason: reason ?? null },
      },
    });

    await tx.vendorOrderOffer.updateMany({
      where: { assignmentId: offer.assignment.id, status: "PENDING", expiresAt: { lte: now } },
      data: { status: "EXPIRED", closedAt: now },
    });
    const remaining = await tx.vendorOrderOffer.count({
      where: { assignmentId: offer.assignment.id, status: "PENDING", expiresAt: { gt: now } },
    });
    if (!remaining && offer.assignment.status === "OFFERED") {
      await tx.orderAssignment.updateMany({
        where: { id: offer.assignment.id, status: "OFFERED" },
        data: { status: "UNASSIGNED", failureReason: "All eligible vendors declined or expired", version: { increment: 1 } },
      });
      await tx.assignmentEvent.create({
        data: {
          assignmentId: offer.assignment.id,
          orderId: offer.assignment.orderId,
          type: "NO_ELIGIBLE_VENDOR",
          metadata: { reason: "all_offers_closed" },
        },
      });
    }
    return {
      expired: false as const,
      offerId: offer.id,
      orderId: offer.assignment.orderId,
      status: "DECLINED" as const,
      redispatch: !remaining && offer.assignment.status === "OFFERED",
    };
  });
  if (result.expired) throw new VendorOperationsError(409, "OFFER_EXPIRED", "This order offer has expired.");
  if (result.redispatch) {
    try {
      await dispatchCapturedOrderToVendors(result.orderId);
    } catch (error) {
      console.error("Immediate vendor redispatch failed; scheduled recovery can retry it", error);
    }
  }
  return result;
}

export async function updateAssignedVendorOrder(
  userId: string,
  orderId: string,
  input: VendorOrderActionInput,
) {
  const prisma = getPrisma();
  return prisma.$transaction(async (tx) => {
    const assignment = await tx.orderAssignment.findUnique({
      where: { orderId },
      include: {
        assignedVendor: true,
        order: { select: { status: true, orderNumber: true } },
      },
    });
    if (
      !assignment?.assignedVendor ||
      assignment.assignedVendor.userId !== userId ||
      assignment.status !== "ASSIGNED"
    ) {
      throw new VendorOperationsError(404, "ASSIGNED_ORDER_NOT_FOUND", "The assigned order was not found.");
    }
    if (!isVendorOperational(assignment.assignedVendor)) {
      throw new VendorOperationsError(403, "VENDOR_NOT_OPERATIONAL", "This vendor cannot update orders while inactive or suspended.");
    }
    if (!canApplyVendorOrderAction(assignment.order.status, input.action)) {
      throw new VendorOperationsError(409, "INVALID_ORDER_TRANSITION", "This fulfilment action is not valid for the current order status.");
    }
    const transition = vendorOrderTransitions[input.action];
    const changed = await tx.order.updateMany({
      where: {
        id: orderId,
        status: transition.from,
        assignment: {
          is: {
            status: "ASSIGNED",
            assignedVendor: {
              is: { userId, verificationStatus: "APPROVED", operationalStatus: "ACTIVE" },
            },
          },
        },
      },
      data: { status: transition.to },
    });
    if (changed.count !== 1) throw new VendorOperationsError(409, "ORDER_CHANGED", "The order changed before it could be updated.");
    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: `vendor.order.${input.action.toLowerCase()}`,
        entityType: "Order",
        entityId: orderId,
        before: { status: transition.from },
        after: { status: transition.to },
      },
    });
    return { id: orderId, orderNumber: assignment.order.orderNumber, status: transition.to };
  });
}
