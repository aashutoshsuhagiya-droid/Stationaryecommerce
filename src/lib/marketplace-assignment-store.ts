import "server-only";

import type { AssignmentClaimStore, OfferAcceptanceOutcome, OfferAcceptanceResult } from "./marketplace-assignment";
import { getPrisma } from "./prisma";

const outcomes = new Set<OfferAcceptanceOutcome>([
  "ACCEPTED",
  "REPLAYED",
  "NOT_FOUND",
  "ALREADY_ASSIGNED",
  "OFFER_EXPIRED",
  "VENDOR_INELIGIBLE",
]);

export class PrismaAssignmentClaimStore implements AssignmentClaimStore {
  async claimOffer(input: { offerId: string; vendorUserId: string; acceptedAt: Date }): Promise<OfferAcceptanceResult> {
    const rows = await getPrisma().$queryRaw<Array<{
      outcome: string;
      assignmentId: string | null;
      orderId: string | null;
      vendorId: string | null;
    }>>`SELECT * FROM "acceptVendorOrderOffer"(${input.offerId}, ${input.vendorUserId})`;
    const row = rows[0];
    if (!row || !outcomes.has(row.outcome as OfferAcceptanceOutcome)) {
      throw new Error("The assignment database function returned an invalid result.");
    }
    return {
      outcome: row.outcome as OfferAcceptanceOutcome,
      ...(row.assignmentId ? { assignmentId: row.assignmentId } : {}),
      ...(row.orderId ? { orderId: row.orderId } : {}),
      ...(row.vendorId ? { vendorId: row.vendorId } : {}),
    };
  }
}
