import { z } from "zod";

export const vendorAvailabilitySchema = z.object({
  availabilityStatus: z.enum(["OFFLINE", "ONLINE", "PAUSED"]),
  acceptingOrders: z.boolean(),
}).strict();

export const vendorOfferDeclineSchema = z.object({
  reason: z.string().trim().max(300).optional(),
}).strict();

export const vendorOrderActionSchema = z.object({
  action: z.enum(["START_PRODUCTION", "SEND_TO_QUALITY_CHECK", "MARK_READY_TO_SHIP"]),
}).strict();

export type VendorAvailabilityInput = z.infer<typeof vendorAvailabilitySchema>;
export type VendorOrderActionInput = z.infer<typeof vendorOrderActionSchema>;
