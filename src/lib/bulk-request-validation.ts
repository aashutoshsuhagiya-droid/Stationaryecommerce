import { z } from "zod";

import {
  bulkPersonalizationPolicy,
  normalizeBulkPersonalizationName,
} from "./bulk-personalization";

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

export const bulkPersonalizationRowSchema = z
  .object({
    rowNumber: z.number().int().min(1).max(1_000_000),
    name: z
      .string()
      .trim()
      .min(1, "Every personalization row requires a name")
      .max(bulkPersonalizationPolicy.maxNameLength),
    details: z.string().trim().max(bulkPersonalizationPolicy.maxDetailsLength).default(""),
    quantity: z
      .number()
      .int()
      .min(bulkPersonalizationPolicy.minimumRowQuantity)
      .max(bulkPersonalizationPolicy.maximumRowQuantity),
  })
  .strict();

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
    personalizationRows: z
      .array(bulkPersonalizationRowSchema)
      .max(bulkPersonalizationPolicy.maxRows)
      .default([]),
    allowDuplicateNames: z.boolean().default(false),
    acceptedPrivacy: z.literal(true, {
      error: "Consent is required before submitting a quote request",
    }),
  })
  .strict()
  .superRefine((request, context) => {
    const personalizationQuantity = request.personalizationRows.reduce(
      (total, row) => total + row.quantity,
      0,
    );
    if (personalizationQuantity > request.quantity) {
      context.addIssue({
        code: "custom",
        path: ["personalizationRows"],
        message: "Personalization row quantities cannot exceed the requested bulk quantity",
      });
    }

    const rowNumbers = new Set<number>();
    request.personalizationRows.forEach((row, index) => {
      if (rowNumbers.has(row.rowNumber)) {
        context.addIssue({
          code: "custom",
          path: ["personalizationRows", index, "rowNumber"],
          message: `CSV row number ${row.rowNumber} appears more than once`,
        });
      }
      rowNumbers.add(row.rowNumber);
    });

    if (!request.allowDuplicateNames) {
      const firstIndexByName = new Map<string, number>();
      request.personalizationRows.forEach((row, index) => {
        const normalizedName = normalizeBulkPersonalizationName(row.name);
        const firstIndex = firstIndexByName.get(normalizedName);
        if (typeof firstIndex === "number") {
          context.addIssue({
            code: "custom",
            path: ["personalizationRows", index, "name"],
            message: `Duplicate name; it first appears on CSV row ${request.personalizationRows[firstIndex].rowNumber}`,
          });
        } else {
          firstIndexByName.set(normalizedName, index);
        }
      });
    }
  });

export type BulkRequestInput = z.infer<typeof bulkRequestSchema>;
