import "server-only";

import { AssignmentError } from "./marketplace-assignment";
import {
  MARKETPLACE_MAX_VENDORS_SETTING_KEY,
  MAX_VENDORS_PER_ORDER,
  MIN_VENDORS_PER_ORDER,
  MarketplaceSettingValueError,
  resolveMaxVendorsPerOrder,
} from "./marketplace-settings-domain";
import { getPrisma } from "./prisma";

const settingDescription = "Maximum eligible vendors offered each captured marketplace order";

function resolveSetting(databaseValue?: unknown) {
  try {
    return resolveMaxVendorsPerOrder({
      databaseValue,
      environmentValue: process.env.VENDOR_MAX_OFFERS_PER_ORDER,
    });
  } catch (error) {
    if (error instanceof MarketplaceSettingValueError) {
      throw new AssignmentError(500, "INVALID_ASSIGNMENT_POLICY", error.message);
    }
    throw error;
  }
}

export interface MarketplaceSettingsSnapshot {
  maxVendorsPerOrder: number;
  source: "database" | "environment" | "default";
  limits: { minimum: number; maximum: number };
  updatedAt: string | null;
}

function snapshot(
  resolved: ReturnType<typeof resolveMaxVendorsPerOrder>,
  updatedAt: Date | null,
): MarketplaceSettingsSnapshot {
  return {
    ...resolved,
    limits: {
      minimum: MIN_VENDORS_PER_ORDER,
      maximum: MAX_VENDORS_PER_ORDER,
    },
    updatedAt: updatedAt?.toISOString() ?? null,
  };
}

export async function getMarketplaceSettings() {
  const setting = await getPrisma().storeSetting.findUnique({
    where: { key: MARKETPLACE_MAX_VENDORS_SETTING_KEY },
    select: { value: true, updatedAt: true },
  });
  return snapshot(resolveSetting(setting?.value), setting?.updatedAt ?? null);
}

export async function updateMarketplaceSettings(input: {
  maxVendorsPerOrder: number;
  actorId: string;
  requestId: string;
  ipAddress?: string;
  userAgent?: string;
}) {
  const requested = resolveMaxVendorsPerOrder({
    databaseValue: { maxVendorsPerOrder: input.maxVendorsPerOrder },
  });
  return getPrisma().$transaction(async (tx) => {
    const existing = await tx.storeSetting.findUnique({
      where: { key: MARKETPLACE_MAX_VENDORS_SETTING_KEY },
      select: { value: true, updatedAt: true },
    });
    const before = resolveSetting(existing?.value);
    if (existing && before.maxVendorsPerOrder === requested.maxVendorsPerOrder) {
      return { data: snapshot(before, existing.updatedAt), changed: false };
    }

    const setting = await tx.storeSetting.upsert({
      where: { key: MARKETPLACE_MAX_VENDORS_SETTING_KEY },
      create: {
        key: MARKETPLACE_MAX_VENDORS_SETTING_KEY,
        value: { maxVendorsPerOrder: requested.maxVendorsPerOrder },
        description: settingDescription,
      },
      update: {
        value: { maxVendorsPerOrder: requested.maxVendorsPerOrder },
        description: settingDescription,
      },
      select: { updatedAt: true },
    });
    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "marketplace.settings.max_vendors_per_order.update",
        entityType: "StoreSetting",
        entityId: MARKETPLACE_MAX_VENDORS_SETTING_KEY,
        before,
        after: requested,
        requestId: input.requestId,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      },
    });
    return { data: snapshot(requested, setting.updatedAt), changed: true };
  }, { isolationLevel: "Serializable" });
}
