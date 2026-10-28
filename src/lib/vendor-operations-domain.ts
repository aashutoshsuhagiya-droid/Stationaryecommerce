export type VendorOrderAction = "START_PRODUCTION" | "SEND_TO_QUALITY_CHECK" | "MARK_READY_TO_SHIP";

export const vendorOrderTransitions = {
  START_PRODUCTION: { from: "PRODUCTION_APPROVED", to: "IN_PRODUCTION" },
  SEND_TO_QUALITY_CHECK: { from: "IN_PRODUCTION", to: "QUALITY_CHECK" },
  MARK_READY_TO_SHIP: { from: "QUALITY_CHECK", to: "READY_TO_SHIP" },
} as const satisfies Record<VendorOrderAction, { from: string; to: string }>;

export function canApplyVendorOrderAction(status: string, action: VendorOrderAction) {
  return vendorOrderTransitions[action].from === status;
}

export function isVendorOperational(profile: {
  verificationStatus: string;
  operationalStatus: string;
}) {
  return profile.verificationStatus === "APPROVED" && profile.operationalStatus === "ACTIVE";
}

export function canVendorAccessCustomerData(profile: {
  verificationStatus: string;
  operationalStatus: string;
}) {
  return isVendorOperational(profile);
}

export function canVendorAccessAssignedCustomerData(
  profile: {
    verificationStatus: string;
    operationalStatus: string;
  },
  assignmentStatus: string,
) {
  return canVendorAccessCustomerData(profile) && assignmentStatus === "ASSIGNED";
}

export function canVendorAccessApprovedArtwork(
  profile: {
    verificationStatus: string;
    operationalStatus: string;
  },
  assignmentStatus: string,
  artworkStatus: string,
) {
  return canVendorAccessAssignedCustomerData(profile, assignmentStatus)
    && artworkStatus === "APPROVED";
}
