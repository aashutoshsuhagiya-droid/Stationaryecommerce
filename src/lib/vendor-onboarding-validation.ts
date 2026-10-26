import { z } from "zod";
import { cityStateByCity } from "./india-cities";

const mobile = z.string().trim().transform((value) => value.replace(/[\s()-]/g, "")).refine(
  (value) => /^(?:\+?91)?[6-9]\d{9}$/.test(value),
  "Enter a valid Indian mobile number",
).transform((value) => {
  if (value.startsWith("+91")) return value.slice(3);
  if (value.length === 12 && value.startsWith("91")) return value.slice(2);
  return value;
});

const postalCode = z.string().trim().regex(/^[1-9][0-9]{5}$/, "Enter a valid 6-digit Indian PIN code");
const shortList = z.array(z.string().trim().min(1).max(120)).min(1).max(20).transform((values) => [...new Set(values)]);

export const otpRequestSchema = z.object({ mobile }).strict();
export const otpVerifySchema = z.object({
  challengeId: z.string().uuid(),
  mobile,
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit verification code"),
}).strict();

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(200),
}).strict();

const vendorApplicationFieldsBaseSchema = z.object({
  ownerName: z.string().trim().min(2).max(120),
  businessName: z.string().trim().min(2).max(180),
  email: z.string().trim().toLowerCase().email().max(254),
  mobile,
  addressLine1: z.string().trim().min(5).max(160),
  addressLine2: z.string().trim().max(160).optional(),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(80),
  postalCode,
  latitude: z.number().finite().min(-90).max(90).optional(),
  longitude: z.number().finite().min(-180).max(180).optional(),
  servicePostalCodes: z.array(postalCode).min(1).max(50).transform((values) => [...new Set(values)]),
  serviceCategoryIds: z.array(z.string().trim().min(1).max(100)).min(1).max(30).transform((values) => [...new Set(values)]),
  printingServices: shortList,
  equipment: shortList,
  businessRegistrationNumber: z.string().trim().max(80).optional(),
  gstin: z.string().trim().toUpperCase().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, "Enter a valid GSTIN").optional(),
  termsAccepted: z.literal(true),
}).strict();

export const vendorApplicationFieldsSchema = vendorApplicationFieldsBaseSchema.superRefine((value, context) => {
  const expectedState = cityStateByCity.get(value.city);
  if (!expectedState || value.state !== expectedState) {
    context.addIssue({ code: "custom", path: ["city"], message: "Choose a city from the registration list." });
  }
  if ((typeof value.latitude === "number") !== (typeof value.longitude === "number")) {
    context.addIssue({ code: "custom", path: ["latitude"], message: "Provide both latitude and longitude" });
  }
  if (!value.servicePostalCodes.includes(value.postalCode)) {
    context.addIssue({ code: "custom", path: ["servicePostalCodes"], message: "Include the shop PIN code in the service area" });
  }
});

export const vendorRegistrationSchema = z.object({
  application: vendorApplicationFieldsSchema,
  password: z.string().min(12).max(200)
    .regex(/[A-Za-z]/, "Password must contain a letter")
    .regex(/\d/, "Password must contain a number"),
  confirmPassword: z.string().min(1).max(200),
  otpChallengeId: z.string().uuid(),
  documentTypes: z.array(z.enum([
    "BUSINESS_REGISTRATION",
    "GST_CERTIFICATE",
    "SHOP_LICENSE",
    "IDENTITY_PROOF",
    "ADDRESS_PROOF",
    "OTHER",
  ])).max(5).default([]),
}).strict().refine((value) => value.password === value.confirmPassword, {
  path: ["confirmPassword"],
  message: "Passwords do not match",
});

export const vendorApplicationUpdateSchema = vendorApplicationFieldsBaseSchema
  .omit({
    email: true,
    mobile: true,
    termsAccepted: true,
    addressLine2: true,
    businessRegistrationNumber: true,
    gstin: true,
  })
  .partial()
  .extend({
    addressLine2: z.string().trim().max(160).nullable().optional(),
    businessRegistrationNumber: z.string().trim().max(80).nullable().optional(),
    gstin: z.string().trim().toUpperCase().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, "Enter a valid GSTIN").nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.postalCode && value.servicePostalCodes && !value.servicePostalCodes.includes(value.postalCode)) {
      context.addIssue({ code: "custom", path: ["servicePostalCodes"], message: "Include the shop PIN code in the service area" });
    }
  });

export const adminVendorDecisionSchema = z.object({
  action: z.enum(["START_REVIEW", "REQUEST_CHANGES", "APPROVE", "REJECT", "SUSPEND", "REACTIVATE"]),
  expectedVersion: z.number().int().positive(),
  applicantMessage: z.string().trim().max(1000).optional(),
  internalNotes: z.string().trim().max(4000).optional(),
}).strict().superRefine((value, context) => {
  if (["REQUEST_CHANGES", "REJECT"].includes(value.action) && !value.applicantMessage) {
    context.addIssue({ code: "custom", path: ["applicantMessage"], message: "Explain the decision to the applicant" });
  }
});

export const adminVendorDocumentReviewSchema = z.object({
  reviewStatus: z.enum(["APPROVED", "REJECTED"]),
  reviewNotes: z.string().trim().max(500).optional(),
}).strict().superRefine((value, context) => {
  if (value.reviewStatus === "REJECTED" && !value.reviewNotes) {
    context.addIssue({ code: "custom", path: ["reviewNotes"], message: "Explain why the document was rejected" });
  }
});

export type VendorRegistrationInput = z.infer<typeof vendorRegistrationSchema>;
export type AdminVendorDecisionInput = z.infer<typeof adminVendorDecisionSchema>;
export type AdminVendorDocumentReviewInput = z.infer<typeof adminVendorDocumentReviewSchema>;
