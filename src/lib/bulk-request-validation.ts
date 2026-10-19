import { z } from "zod";

export const bulkPrintingOptions = ["full-colour", "single-colour", "not-sure"] as const;
export const bulkFinishingOptions = ["matte", "gloss", "standard", "not-sure"] as const;

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const configuredMinimum = positiveInteger(process.env.BULK_QUOTE_MIN_QUANTITY, 1);
const configuredMaximum = positiveInteger(process.env.BULK_QUOTE_MAX_QUANTITY, 100_000);

export const bulkRequestPolicy = {
  minimumQuantity: Math.min(configuredMinimum, configuredMaximum),
  maximumQuantity: Math.max(configuredMinimum, configuredMaximum),
} as const;

const indianPhoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s()-]/g, ""))
  .refine((value) => /^(?:\+?91)?[6-9]\d{9}$/.test(value), {
    message: "Enter a valid Indian mobile number",
  })
  .transform((value) => value.replace(/^\+?91/, ""));

export const bulkRequestSchema = z
  .object({
    customerName: z.string().trim().min(2, "Enter the customer's name").max(100),
    businessName: z.string().trim().min(2, "Enter the business or organisation name").max(120),
    email: z.string().trim().toLowerCase().email("Enter a valid email address").max(254),
    phone: indianPhoneSchema,
    productId: z.string().trim().min(1, "Select a catalog product").max(100),
    dimensions: z.string().trim().min(2, "Enter the required dimensions").max(120),
    quantity: z
      .number()
      .int()
      .min(bulkRequestPolicy.minimumQuantity, `The minimum quote quantity is ${bulkRequestPolicy.minimumQuantity}`)
      .max(bulkRequestPolicy.maximumQuantity, `The maximum quote quantity is ${bulkRequestPolicy.maximumQuantity}`),
    material: z.string().trim().min(2, "Enter the preferred material").max(120),
    printing: z.enum(bulkPrintingOptions),
    finishing: z.enum(bulkFinishingOptions),
    postcode: z.string().trim().regex(/^[1-9][0-9]{5}$/, "Enter a valid 6-digit Indian PIN code"),
    notes: z.string().trim().max(1_500).default(""),
    acceptedPrivacy: z.literal(true, {
      error: "Consent is required before submitting a quote request",
    }),
  })
  .strict();

export type BulkRequestInput = z.infer<typeof bulkRequestSchema>;
