export const MARKETPLACE_MAX_VENDORS_SETTING_KEY = "marketplace.maxVendorsPerOrder";
export const DEFAULT_MAX_VENDORS_PER_ORDER = 10;
export const MIN_VENDORS_PER_ORDER = 1;
export const MAX_VENDORS_PER_ORDER = 100;

export type MarketplaceSettingSource = "database" | "environment" | "default";

export class MarketplaceSettingValueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarketplaceSettingValueError";
  }
}

function validatedMaximum(value: unknown, label: string) {
  if (
    typeof value !== "number"
    || !Number.isSafeInteger(value)
    || value < MIN_VENDORS_PER_ORDER
    || value > MAX_VENDORS_PER_ORDER
  ) {
    throw new MarketplaceSettingValueError(
      `${label} must be an integer between ${MIN_VENDORS_PER_ORDER} and ${MAX_VENDORS_PER_ORDER}.`,
    );
  }
  return value;
}

function maximumFromDatabaseValue(value: unknown) {
  if (typeof value === "number") return validatedMaximum(value, MARKETPLACE_MAX_VENDORS_SETTING_KEY);
  if (typeof value === "object" && value !== null && "maxVendorsPerOrder" in value) {
    return validatedMaximum(
      (value as { maxVendorsPerOrder?: unknown }).maxVendorsPerOrder,
      MARKETPLACE_MAX_VENDORS_SETTING_KEY,
    );
  }
  throw new MarketplaceSettingValueError(
    `${MARKETPLACE_MAX_VENDORS_SETTING_KEY} must contain a maxVendorsPerOrder integer.`,
  );
}

export function resolveMaxVendorsPerOrder(input: {
  databaseValue?: unknown;
  environmentValue?: string;
}): { maxVendorsPerOrder: number; source: MarketplaceSettingSource } {
  if (typeof input.databaseValue !== "undefined") {
    return {
      maxVendorsPerOrder: maximumFromDatabaseValue(input.databaseValue),
      source: "database",
    };
  }

  const environmentValue = input.environmentValue?.trim();
  if (environmentValue) {
    return {
      maxVendorsPerOrder: validatedMaximum(Number(environmentValue), "VENDOR_MAX_OFFERS_PER_ORDER"),
      source: "environment",
    };
  }

  return { maxVendorsPerOrder: DEFAULT_MAX_VENDORS_PER_ORDER, source: "default" };
}

export function capVendorOfferIds<T>(vendorIds: readonly T[], maximum: number) {
  return vendorIds.slice(0, validatedMaximum(maximum, "Maximum vendors per order"));
}
