import assert from "node:assert/strict";
import test from "node:test";

import {
  acceptOrderOffer,
  AssignmentError,
  isAssignmentRetryable,
  type AssignmentClaimStore,
  type AssignmentOrderDemand,
  type OfferAcceptanceResult,
  planAssignmentOffers,
  type VendorEligibilitySnapshot,
} from "./marketplace-assignment";
import { capVendorOfferIds, resolveMaxVendorsPerOrder } from "./marketplace-settings-domain";

const order: AssignmentOrderDemand = {
  orderId: "order-1",
  paymentStatus: "CAPTURED",
  city: "Ahmedabad",
  postalCode: "380015",
  lines: [{ productId: "labels", categoryId: "labels-category", quantity: 50 }],
};

function vendor(overrides: Partial<VendorEligibilitySnapshot> = {}): VendorEligibilitySnapshot {
  return {
    id: "vendor-1",
    verificationStatus: "APPROVED",
    operationalStatus: "ACTIVE",
    availabilityStatus: "ONLINE",
    acceptingOrders: true,
    normalizedCity: "ahmedabad",
    servicePostalCodes: ["380015"],
    serviceCategoryIds: ["labels-category"],
    activeOrderCount: 0,
    maxConcurrentOrders: 3,
    capabilities: [{ productId: "labels", isActive: true, maxOrderQuantity: 100 }],
    ...overrides,
  };
}

test("offers a captured order only to eligible vendors in its service area", () => {
  const eligible = vendor();
  const otherCity = vendor({ id: "vendor-2", normalizedCity: "surat" });
  const unapproved = vendor({ id: "vendor-3", verificationStatus: "PENDING" });
  const offline = vendor({ id: "vendor-4", availabilityStatus: "OFFLINE" });
  const suspended = vendor({ id: "vendor-5", operationalStatus: "SUSPENDED" });

  const plan = planAssignmentOffers({
    order,
    vendors: [otherCity, offline, eligible, unapproved, suspended],
    now: new Date("2026-10-23T00:00:00.000Z"),
    offerWindowSeconds: 60,
  });

  assert.equal(plan.status, "OFFERED");
  if (plan.status === "OFFERED") {
    assert.deepEqual(plan.vendorIds, ["vendor-1"]);
    assert.equal(plan.expiresAt.toISOString(), "2026-10-23T00:01:00.000Z");
  }
});

test("requires both normalized city and every registered product category", () => {
  const cityMismatch = vendor({ id: "vendor-city", normalizedCity: "surat" });
  const categoryMismatch = vendor({ id: "vendor-category", serviceCategoryIds: ["notebooks-category"] });

  const plan = planAssignmentOffers({
    order,
    vendors: [cityMismatch, categoryMismatch],
    now: new Date("2026-10-23T00:00:00.000Z"),
    offerWindowSeconds: 60,
  });

  assert.deepEqual(plan, { status: "UNASSIGNED", orderId: "order-1", reason: "NO_ELIGIBLE_VENDOR" });
});

test("requires every product capability and respects quantity and capacity", () => {
  const incapable = vendor({ capabilities: [] });
  const overQuantity = vendor({ capabilities: [{ productId: "labels", isActive: true, maxOrderQuantity: 10 }] });
  const atCapacity = vendor({ activeOrderCount: 3 });

  const plan = planAssignmentOffers({
    order,
    vendors: [incapable, overQuantity, atCapacity],
    now: new Date(),
    offerWindowSeconds: 60,
  });

  assert.deepEqual(plan, { status: "UNASSIGNED", orderId: "order-1", reason: "NO_ELIGIBLE_VENDOR" });
});

test("database marketplace setting overrides the environment and caps the offer batch", () => {
  const policy = resolveMaxVendorsPerOrder({
    databaseValue: { maxVendorsPerOrder: 2 },
    environmentValue: "9",
  });

  assert.deepEqual(policy, { maxVendorsPerOrder: 2, source: "database" });
  assert.deepEqual(capVendorOfferIds(["vendor-a", "vendor-b", "vendor-c"], policy.maxVendorsPerOrder), [
    "vendor-a",
    "vendor-b",
  ]);
});

test("marketplace offer cap falls back to the environment and then to ten", () => {
  assert.deepEqual(resolveMaxVendorsPerOrder({ environmentValue: "6" }), {
    maxVendorsPerOrder: 6,
    source: "environment",
  });
  assert.deepEqual(resolveMaxVendorsPerOrder({}), {
    maxVendorsPerOrder: 10,
    source: "default",
  });
  assert.throws(() => resolveMaxVendorsPerOrder({ databaseValue: { maxVendorsPerOrder: 0 } }));
  assert.throws(() => resolveMaxVendorsPerOrder({ databaseValue: { maxVendorsPerOrder: 101 } }));
  assert.throws(() => resolveMaxVendorsPerOrder({ databaseValue: { maxVendorsPerOrder: 1.5 } }));
});

test("does not start assignment before authoritative payment capture", () => {
  assert.throws(
    () => planAssignmentOffers({
      order: { ...order, paymentStatus: "AUTHORIZED" },
      vendors: [vendor()],
      now: new Date(),
      offerWindowSeconds: 60,
    }),
    (error) => error instanceof AssignmentError && error.code === "PAYMENT_NOT_CAPTURED",
  );
});

class AtomicMemoryClaimStore implements AssignmentClaimStore {
  private winner: string | undefined;
  private acceptedOffer: string | undefined;

  constructor(
    private readonly vendorByUser: Record<string, string>,
    private readonly expiry: Date,
  ) {}

  async claimOffer(input: { offerId: string; vendorUserId: string; acceptedAt: Date }): Promise<OfferAcceptanceResult> {
    const vendorId = this.vendorByUser[input.vendorUserId];
    if (!vendorId) return { outcome: "NOT_FOUND" };
    if (input.acceptedAt >= this.expiry) return { outcome: "OFFER_EXPIRED", assignmentId: "assignment-1", orderId: "order-1" };

    // No await occurs between observing and committing the winner. This mirrors
    // the migration's row-locked PostgreSQL function for the domain test double.
    if (!this.winner) {
      this.winner = vendorId;
      this.acceptedOffer = input.offerId;
      return { outcome: "ACCEPTED", assignmentId: "assignment-1", orderId: "order-1", vendorId };
    }
    if (this.winner === vendorId && this.acceptedOffer === input.offerId) {
      return { outcome: "REPLAYED", assignmentId: "assignment-1", orderId: "order-1", vendorId };
    }
    return { outcome: "ALREADY_ASSIGNED", assignmentId: "assignment-1", orderId: "order-1" };
  }
}

test("simultaneous acceptance produces exactly one winner", async () => {
  const store = new AtomicMemoryClaimStore(
    { "user-a": "vendor-a", "user-b": "vendor-b" },
    new Date("2026-10-23T00:02:00.000Z"),
  );
  const acceptedAt = new Date("2026-10-23T00:01:00.000Z");
  const results = await Promise.allSettled([
    acceptOrderOffer(store, { offerId: "offer-a", vendorUserId: "user-a", acceptedAt }),
    acceptOrderOffer(store, { offerId: "offer-b", vendorUserId: "user-b", acceptedAt }),
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  const rejection = results.find((result) => result.status === "rejected");
  assert.ok(rejection?.status === "rejected" && rejection.reason instanceof AssignmentError);
  assert.equal(rejection.reason.code, "ORDER_ALREADY_ASSIGNED");
});

test("a later acceptor is rejected after the first vendor wins", async () => {
  const store = new AtomicMemoryClaimStore(
    { "user-a": "vendor-a", "user-b": "vendor-b" },
    new Date("2026-10-23T00:02:00.000Z"),
  );
  const acceptedAt = new Date("2026-10-23T00:01:00.000Z");

  const winner = await acceptOrderOffer(store, { offerId: "offer-a", vendorUserId: "user-a", acceptedAt });
  assert.equal(winner.outcome, "ACCEPTED");
  await assert.rejects(
    acceptOrderOffer(store, { offerId: "offer-b", vendorUserId: "user-b", acceptedAt }),
    (error) => error instanceof AssignmentError && error.code === "ORDER_ALREADY_ASSIGNED",
  );
});

test("repeated acceptance by the winner is idempotent", async () => {
  const store = new AtomicMemoryClaimStore(
    { "user-a": "vendor-a" },
    new Date("2026-10-23T00:02:00.000Z"),
  );
  const input = {
    offerId: "offer-a",
    vendorUserId: "user-a",
    acceptedAt: new Date("2026-10-23T00:01:00.000Z"),
  };

  assert.equal((await acceptOrderOffer(store, input)).outcome, "ACCEPTED");
  assert.equal((await acceptOrderOffer(store, input)).outcome, "REPLAYED");
});

test("expired and foreign offers are not exposed as acceptable", async () => {
  const store = new AtomicMemoryClaimStore(
    { "user-a": "vendor-a" },
    new Date("2026-10-23T00:02:00.000Z"),
  );

  await assert.rejects(
    acceptOrderOffer(store, {
      offerId: "offer-a",
      vendorUserId: "user-a",
      acceptedAt: new Date("2026-10-23T00:02:00.000Z"),
    }),
    (error) => error instanceof AssignmentError && error.code === "OFFER_EXPIRED",
  );
  await assert.rejects(
    acceptOrderOffer(store, {
      offerId: "offer-a",
      vendorUserId: "unknown-user",
      acceptedAt: new Date("2026-10-23T00:01:00.000Z"),
    }),
    (error) => error instanceof AssignmentError && error.code === "OFFER_NOT_FOUND",
  );
});

test("only unfinished or expired assignments can be dispatched again", () => {
  const now = new Date("2026-10-23T00:02:00.000Z");
  assert.equal(isAssignmentRetryable(null, now), true);
  assert.equal(isAssignmentRetryable({ status: "UNASSIGNED" }, now), true);
  assert.equal(isAssignmentRetryable({ status: "OFFERED", offerExpiresAt: new Date("2026-10-23T00:01:59.000Z") }, now), true);
  assert.equal(isAssignmentRetryable({ status: "OFFERED", offerExpiresAt: new Date("2026-10-23T00:03:00.000Z") }, now), false);
  assert.equal(isAssignmentRetryable({ status: "ASSIGNED" }, now), false);
  assert.equal(isAssignmentRetryable({ status: "CANCELLED" }, now), false);
});
