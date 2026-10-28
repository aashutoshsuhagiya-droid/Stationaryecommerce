import { z } from "zod";
import { inspectArtworkImageDataUrl } from "./artwork-policy";

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

const boundedCoordinateSchema = z.number().finite().min(-100_000).max(100_000);
const boundedSizeSchema = z.number().finite().min(1).max(100_000);
const colorSchema = z.string().regex(/^#[0-9a-f]{6}$/i, "Expected a six-digit hex colour");
const identifierSchema = z.string().trim().min(1).max(128);
const imageDataUrlSchema = z
  .string()
  .max(2_800_000, "Artwork images must be no larger than 2 MB before encoding")
  .refine(
    (value) => Boolean(inspectArtworkImageDataUrl(value)),
    "Expected a genuine PNG, JPEG or WEBP data URL",
  );

const artworkImageAssetSchema = z.object({
  id: identifierSchema,
  claimToken: z.string().min(20).max(512),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  sizeBytes: z.number().int().min(1).max(100_000_000),
  width: z.number().int().min(1).max(50_000),
  height: z.number().int().min(1).max(50_000),
  hasTransparency: z.boolean().optional(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
}).strict();

const artworkLayerBase = {
  id: identifierSchema,
  name: z.string().trim().min(1).max(80),
  x: boundedCoordinateSchema,
  y: boundedCoordinateSchema,
  width: boundedSizeSchema,
  height: boundedSizeSchema,
  rotation: z.number().finite().min(-360).max(360),
  opacity: z.number().finite().min(0).max(1),
};

export const artworkLayerSchema = z.discriminatedUnion("type", [
  z.object({
    ...artworkLayerBase,
    type: z.literal("text"),
    text: z.string().max(80),
    color: colorSchema,
    fontSize: z.number().finite().min(1).max(1_000),
    fontFamily: z.enum(["sans", "serif", "rounded"]),
    textAlign: z.enum(["left", "center", "right"]).optional(),
  }).strict(),
  z.object({
    ...artworkLayerBase,
    type: z.literal("image"),
    src: imageDataUrlSchema.optional(),
    asset: artworkImageAssetSchema.optional(),
    sourceWidth: z.number().int().min(1).max(50_000),
    sourceHeight: z.number().int().min(1).max(50_000),
    imageFit: z.enum(["contain", "cover", "stretch"]).optional(),
    aspectLocked: z.boolean().optional(),
  }).strict().superRefine((layer, context) => {
    if (!layer.src && !layer.asset) {
      context.addIssue({
        code: "custom",
        path: ["src"],
        message: "Artwork images need a preview or persisted asset reference",
      });
    }
  }),
]);

const artworkSurfaceSchema = z.object({
  id: identifierSchema,
  label: z.string().trim().min(1).max(80),
  layers: z.array(artworkLayerSchema).max(40),
}).strict().superRefine((surface, context) => {
  const layerIds = new Set<string>();
  surface.layers.forEach((layer, index) => {
    if (layerIds.has(layer.id)) {
      context.addIssue({
        code: "custom",
        path: ["layers", index, "id"],
        message: "Artwork layer IDs must be unique within a surface",
      });
    }
    layerIds.add(layer.id);
  });
});

export const artworkDocumentSchema = z.object({
  version: z.literal(1),
  activeSurfaceId: identifierSchema,
  surfaces: z.array(artworkSurfaceSchema).min(1).max(8),
  updatedAt: z.string().datetime({ offset: true }),
}).strict().superRefine((document, context) => {
  const surfaceIds = new Set<string>();
  let layerCount = 0;
  document.surfaces.forEach((surface, index) => {
    if (surfaceIds.has(surface.id)) {
      context.addIssue({
        code: "custom",
        path: ["surfaces", index, "id"],
        message: "Artwork surface IDs must be unique",
      });
    }
    surfaceIds.add(surface.id);
    layerCount += surface.layers.length;
  });
  if (!surfaceIds.has(document.activeSurfaceId)) {
    context.addIssue({
      code: "custom",
      path: ["activeSurfaceId"],
      message: "The active artwork surface must exist in the document",
    });
  }
  if (layerCount > 100) {
    context.addIssue({
      code: "custom",
      path: ["surfaces"],
      message: "An artwork document can contain at most 100 layers",
    });
  }
});

const presentationSchema = z.object({
  name: z.string().trim().min(1).max(180),
  detail: z.string().trim().max(180).optional(),
  templateLabel: z.string().trim().min(1).max(140),
  fontLabel: z.string().trim().min(1).max(100),
  textColor: colorSchema,
  backgroundColor: colorSchema,
  packLabel: z.string().trim().min(1).max(160),
  materialLabel: z.string().trim().min(1).max(160),
}).strict();

const quoteAuditSchema = z.object({
  id: identifierSchema,
  pricingVersion: z.string().trim().min(1).max(100),
  calculatedAt: z.string().datetime({ offset: true }),
  unitPricePaise: z.number().int().nonnegative().max(100_000_000),
}).strict();

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
  quantity: z.number().int().min(1).max(1000),
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
      configurationId: identifierSchema.optional(),
      dimensionPresetId: identifierSchema.optional(),
      dimensionLabel: z.string().trim().min(1).max(160).optional(),
      displayUnit: z.enum(["mm", "cm", "in"]).optional(),
      artwork: artworkDocumentSchema.optional(),
      presentation: presentationSchema.optional(),
      quote: quoteAuditSchema.optional(),
    })
    .strict()
    .optional(),
}).strict();

export const catalogQuoteSchema = z.object({
  items: z.array(orderItemInputSchema).min(1).max(50),
}).strict();

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
export type CatalogQuoteInput = z.infer<typeof catalogQuoteSchema>;
