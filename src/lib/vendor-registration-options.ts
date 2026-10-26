import "server-only";
import { getPrisma } from "./prisma";

export const DEFAULT_VENDOR_REGISTRATION_OPTIONS = {
  printingServices: ["Digital printing", "Vinyl label printing", "UV printing", "Screen printing", "Sublimation printing", "Laser engraving"],
  equipment: ["Digital production press", "Wide-format printer", "Laminator", "Vinyl cutter / plotter", "Laser cutter / engraver", "Heat press"],
};

export type VendorRegistrationOptions = typeof DEFAULT_VENDOR_REGISTRATION_OPTIONS;
const KEY = "vendor.registration.options";

export async function getVendorRegistrationOptions(): Promise<VendorRegistrationOptions> {
  try {
    const setting = await getPrisma().storeSetting.findUnique({ where: { key: KEY } });
    const value = setting?.value;
    if (!value || typeof value !== "object" || Array.isArray(value)) return DEFAULT_VENDOR_REGISTRATION_OPTIONS;
    const source = value as Record<string, unknown>;
    const list = (key: "printingServices" | "equipment") => Array.isArray(source[key]) ? source[key].filter((item): item is string => typeof item === "string" && item.trim().length > 0) : DEFAULT_VENDOR_REGISTRATION_OPTIONS[key];
    return { printingServices: list("printingServices"), equipment: list("equipment") };
  } catch { return DEFAULT_VENDOR_REGISTRATION_OPTIONS; }
}

export async function saveVendorRegistrationOptions(value: VendorRegistrationOptions) {
  return getPrisma().storeSetting.upsert({ where: { key: KEY }, update: { value, description: "Vendor registration printing services and equipment" }, create: { key: KEY, value, description: "Vendor registration printing services and equipment" } });
}
