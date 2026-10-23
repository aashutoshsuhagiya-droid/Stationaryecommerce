export type VendorApplicationStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "ACTION_REQUIRED"
  | "APPROVED"
  | "REJECTED"
  | "WITHDRAWN";

export type VendorApplicationAction =
  | "START_REVIEW"
  | "REQUEST_CHANGES"
  | "APPROVE"
  | "REJECT"
  | "SUSPEND"
  | "REACTIVATE";

export const vendorApplicationTransitionTargets: Record<VendorApplicationAction, VendorApplicationStatus> = {
  START_REVIEW: "UNDER_REVIEW",
  REQUEST_CHANGES: "ACTION_REQUIRED",
  APPROVE: "APPROVED",
  REJECT: "REJECTED",
  SUSPEND: "APPROVED",
  REACTIVATE: "APPROVED",
};

const allowedTransitions: Record<VendorApplicationAction, readonly VendorApplicationStatus[]> = {
  START_REVIEW: ["SUBMITTED"],
  REQUEST_CHANGES: ["SUBMITTED", "UNDER_REVIEW"],
  APPROVE: ["SUBMITTED", "UNDER_REVIEW"],
  REJECT: ["SUBMITTED", "UNDER_REVIEW"],
  SUSPEND: ["APPROVED"],
  REACTIVATE: ["APPROVED"],
};

export function canApplyVendorApplicationAction(
  status: VendorApplicationStatus,
  action: VendorApplicationAction,
) {
  return allowedTransitions[action].includes(status);
}
