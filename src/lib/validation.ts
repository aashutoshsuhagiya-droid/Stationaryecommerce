import { z } from "zod";

const optionalBoolean = z.preprocess((value) => {
  if (value === "true" || value === true) return true;
  if (value === "false" || value === false) return false;
  if (value === "" || value === null || typeof value === "undefined") return undefined;
  return value;
}, z.boolean().optional());

const optionalNumber = (schema: z.ZodNumber) =>
  z.preprocess(
    (value) => (value === "" || value === null || typeof value === "undefined" ? undefined : value),
    z.coerce.number().pipe(schema).optional(),
  );

export const productQuerySchema = z
  .object({
    category: z.string().trim().max(80).optional(),
    q: z.string().trim().max(120).optional(),
    minPrice: optionalNumber(z.number().nonnegative()),
    maxPrice: optionalNumber(z.number().nonnegative()),
    material: z.string().trim().max(80).optional(),
    size: z.string().trim().max(80).optional(),
    theme: z.string().trim().max(80).optional(),
    customizable: optionalBoolean,
    availability: z.enum(["available", "all"]).optional(),
    sort: z
      .enum(["recommended", "bestselling", "price-asc", "price-desc", "newest", "rating"])
      .optional(),
    page: optionalNumber(z.number().int().min(1).max(10_000)),
    limit: optionalNumber(z.number().int().min(1).max(48)),
  })
  .refine(
    (value) =>
      typeof value.minPrice !== "number" ||
      typeof value.maxPrice !== "number" ||
      value.minPrice <= value.maxPrice,
    { message: "minPrice must be less than or equal to maxPrice", path: ["minPrice"] },
  );

export const searchQuerySchema = z.object({
  q: z.string().trim().max(120).default(""),
  limit: optionalNumber(z.number().int().min(1).max(20)),
});

const mobileSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s()-]/g, ""))
  .refine((value) => /^(?:\+?91)?[6-9]\d{9}$/.test(value), {
    message: "Enter a valid Indian mobile number",
  })
  .transform((value) => value.replace(/^\+?91/, ""));

const postalCodeSchema = z
  .string()
  .trim()
  .regex(/^[1-9][0-9]{5}$/, "Enter a valid 6-digit Indian PIN code");

export const addressSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  mobile: mobileSchema,
  email: z.string().trim().toLowerCase().email().max(254),
  addressLine1: z.string().trim().min(5).max(160),
  addressLine2: z.string().trim().max(160).optional(),
  landmark: z.string().trim().max(100).optional(),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(80),
  postalCode: postalCodeSchema,
  country: z.literal("IN").default("IN"),
});

export const orderItemInputSchema = z.object({
  productId: z.string().trim().min(1).max(100),
  variantId: z.string().trim().min(1).max(100),
  quantity: z.number().int().min(1).max(100),
  customization: z
    .object({
      templateId: z.string().trim().min(1).max(100).optional(),
      fields: z
        .record(z.string().max(80), z.string().trim().max(500))
        .refine((fields) => Object.keys(fields).length <= 20, {
          message: "A customization can contain at most 20 fields",
        })
        .default({}),
      previewVersion: z.number().int().min(1).max(100).default(1),
    })
    .optional(),
});

export const createOrderSchema = z.object({
  items: z.array(orderItemInputSchema).min(1).max(50),
  shippingAddress: addressSchema,
  shippingMethod: z.enum(["standard"]).default("standard"),
  couponCode: z.string().trim().toUpperCase().max(40).optional(),
  notes: z.string().trim().max(500).optional(),
  acceptedTerms: z.literal(true, {
    error: "The terms and personalized-product conditions must be accepted",
  }),
});

export const orderLookupSchema = z.object({
  orderNumber: z.string().trim().min(6).max(40),
  email: z.string().trim().toLowerCase().email().max(254),
});

export const demoPaymentVerificationSchema = z.object({
  orderNumber: z.string().trim().min(6).max(40),
  paymentReference: z.string().trim().min(3).max(100),
  signature: z.string().trim().regex(/^[a-f0-9]{64}$/i, "Expected a SHA-256 HMAC signature"),
});

export const razorpayVerificationSchema = z.object({
  orderNumber: z.string().trim().min(6).max(40),
  razorpayOrderId: z.string().trim().min(3).max(100),
  razorpayPaymentId: z.string().trim().min(3).max(100),
  razorpaySignature: z.string().trim().regex(/^[a-f0-9]{64}$/i, "Invalid signature format"),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type OrderItemInput = z.infer<typeof orderItemInputSchema>;
