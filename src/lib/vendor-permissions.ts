export const VENDOR_APPLICANT_PERMISSIONS = [
  "vendor.application.read",
  "vendor.application.update",
  "vendor.documents.manage",
] as const;

export const APPROVED_VENDOR_PERMISSIONS = [
  "vendor.profile.manage",
  "vendor.offers.read",
  "vendor.offers.respond",
  "vendor.orders.manage",
  "vendor.application.read",
  "vendor.documents.manage",
] as const;

export const VENDOR_OPERATIONAL_PERMISSIONS = [
  "vendor.profile.manage",
  "vendor.offers.read",
  "vendor.offers.respond",
  "vendor.orders.manage",
] as const;
