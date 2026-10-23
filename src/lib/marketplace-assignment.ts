export type MarketplacePaymentStatus =
  | "CREATED"
  | "PENDING"
  | "AUTHORIZED"
  | "CAPTURED"
  | "FAILED"
  | "REFUNDED";

export interface AssignmentOrderLine {
  productId: string;
  quantity: number;
}

export interface AssignmentOrderDemand {
  orderId: string;
  paymentStatus: MarketplacePaymentStatus;
  city: string;
  postalCode: string;
  lines: AssignmentOrderLine[];
}

export interface VendorCapabilitySnapshot {
  productId: string;
  isActive: boolean;
  maxOrderQuantity?: number;
}

export interface VendorEligibilitySnapshot {
  id: string;
  verificationStatus: "PENDING" | "APPROVED" | "REJECTED";
  operationalStatus?: "INACTIVE" | "ACTIVE" | "SUSPENDED" | "CLOSED";
  availabilityStatus: "OFFLINE" | "ONLINE" | "PAUSED";
  acceptingOrders: boolean;
  normalizedCity: string;
  servicePostalCodes: string[];
  activeOrderCount: number;
  maxConcurrentOrders: number;
  capabilities: VendorCapabilitySnapshot[];
}

export type AssignmentPlan =
  | {
      status: "OFFERED";
      orderId: string;
      vendorIds: string[];
      expiresAt: Date;
    }
  | {
      status: "UNASSIGNED";
      orderId: string;
      reason: "NO_ELIGIBLE_VENDOR";
    };

export type OfferAcceptanceOutcome =
  | "ACCEPTED"
  | "REPLAYED"
  | "NOT_FOUND"
  | "ALREADY_ASSIGNED"
  | "OFFER_EXPIRED"
  | "VENDOR_INELIGIBLE";

export interface OfferAcceptanceResult {
  outcome: OfferAcceptanceOutcome;
  assignmentId?: string;
  orderId?: string;
  vendorId?: string;
}

export function isAssignmentRetryable(
  assignment: { status: string; offerExpiresAt?: Date | null } | null,
  now: Date,
) {
  if (!assignment) return true;
  if (["PENDING", "UNASSIGNED", "EXPIRED"].includes(assignment.status)) return true;
  return assignment.status === "OFFERED" && (!assignment.offerExpiresAt || assignment.offerExpiresAt <= now);
}

export interface AssignmentClaimStore {
  claimOffer(input: {
    offerId: string;
    vendorUserId: string;
    acceptedAt: Date;
  }): Promise<OfferAcceptanceResult>;
}

export class AssignmentError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AssignmentError";
  }
}

export function normalizeServiceCity(city: string) {
  return city
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("en-IN")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function aggregateOrderQuantities(lines: AssignmentOrderLine[]) {
  const quantities = new Map<string, number>();
  for (const line of lines) {
    quantities.set(line.productId, (quantities.get(line.productId) ?? 0) + line.quantity);
  }
  return quantities;
}

export function isVendorEligibleForOrder(
  order: AssignmentOrderDemand,
  vendor: VendorEligibilitySnapshot,
) {
  if (vendor.verificationStatus !== "APPROVED") return false;
  if ((vendor.operationalStatus ?? "ACTIVE") !== "ACTIVE") return false;
  if (vendor.availabilityStatus !== "ONLINE" || !vendor.acceptingOrders) return false;
  if (vendor.activeOrderCount >= vendor.maxConcurrentOrders) return false;

  const postalCodeMatches = vendor.servicePostalCodes.includes(order.postalCode);
  if (!postalCodeMatches) return false;

  const quantities = aggregateOrderQuantities(order.lines);
  for (const [productId, quantity] of quantities) {
    const capability = vendor.capabilities.find(
      (candidate) => candidate.productId === productId && candidate.isActive,
    );
    if (!capability) return false;
    if (capability.maxOrderQuantity && quantity > capability.maxOrderQuantity) return false;
  }
  return true;
}

export function planAssignmentOffers(input: {
  order: AssignmentOrderDemand;
  vendors: VendorEligibilitySnapshot[];
  now: Date;
  offerWindowSeconds: number;
  excludedVendorIds?: ReadonlySet<string>;
}): AssignmentPlan {
  if (input.order.paymentStatus !== "CAPTURED") {
    throw new AssignmentError(
      409,
      "PAYMENT_NOT_CAPTURED",
      "Vendor assignment can start only after payment is captured.",
    );
  }
  if (!Number.isInteger(input.offerWindowSeconds) || input.offerWindowSeconds < 15 || input.offerWindowSeconds > 900) {
    throw new AssignmentError(
      500,
      "INVALID_ASSIGNMENT_POLICY",
      "The vendor offer window must be between 15 and 900 seconds.",
    );
  }

  const vendorIds = input.vendors
    .filter((vendor) => !input.excludedVendorIds?.has(vendor.id))
    .filter((vendor) => isVendorEligibleForOrder(input.order, vendor))
    .map((vendor) => vendor.id)
    .sort();

  if (!vendorIds.length) {
    return {
      status: "UNASSIGNED",
      orderId: input.order.orderId,
      reason: "NO_ELIGIBLE_VENDOR",
    };
  }

  return {
    status: "OFFERED",
    orderId: input.order.orderId,
    vendorIds,
    expiresAt: new Date(input.now.getTime() + input.offerWindowSeconds * 1_000),
  };
}

export async function acceptOrderOffer(
  store: AssignmentClaimStore,
  input: { offerId: string; vendorUserId: string; acceptedAt?: Date },
) {
  const result = await store.claimOffer({
    offerId: input.offerId,
    vendorUserId: input.vendorUserId,
    acceptedAt: input.acceptedAt ?? new Date(),
  });

  switch (result.outcome) {
    case "ACCEPTED":
    case "REPLAYED":
      return result;
    case "NOT_FOUND":
      throw new AssignmentError(404, "OFFER_NOT_FOUND", "The order offer was not found.");
    case "ALREADY_ASSIGNED":
      throw new AssignmentError(409, "ORDER_ALREADY_ASSIGNED", "Another vendor already accepted this order.");
    case "OFFER_EXPIRED":
      throw new AssignmentError(409, "OFFER_EXPIRED", "This order offer has expired.");
    case "VENDOR_INELIGIBLE":
      throw new AssignmentError(403, "VENDOR_INELIGIBLE", "This vendor is not currently eligible to accept the order.");
  }
}
