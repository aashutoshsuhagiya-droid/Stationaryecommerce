import { z } from "zod";

const finiteCoordinate = z.number().finite().min(-100_000).max(100_000);
const positiveSize = z.number().finite().positive().max(100_000);
const nonNegativeInteger = z.number().int().min(0).max(100);
const colour = z.string().regex(/^#[0-9a-f]{6}$/i);

const geometrySchema = z.object({
  x: finiteCoordinate,
  y: finiteCoordinate,
  width: positiveSize,
  height: positiveSize,
  rotation: z.number().finite().min(-360).max(360),
}).strict();

const geometryPolicySchema = z.object({
  default: geometrySchema,
  minimumWidth: positiveSize,
  maximumWidth: positiveSize,
  minimumHeight: positiveSize,
  maximumHeight: positiveSize,
  minimumRotation: z.number().finite().min(-360).max(360),
  maximumRotation: z.number().finite().min(-360).max(360),
}).strict().superRefine((geometry, context) => {
  if (geometry.minimumWidth > geometry.maximumWidth) {
    context.addIssue({ code: "custom", path: ["maximumWidth"], message: "Maximum width must be at least the minimum width." });
  }
  if (geometry.minimumHeight > geometry.maximumHeight) {
    context.addIssue({ code: "custom", path: ["maximumHeight"], message: "Maximum height must be at least the minimum height." });
  }
  if (geometry.minimumRotation > geometry.maximumRotation) {
    context.addIssue({ code: "custom", path: ["maximumRotation"], message: "Maximum rotation must be at least the minimum rotation." });
  }
  if (geometry.default.width < geometry.minimumWidth || geometry.default.width > geometry.maximumWidth) {
    context.addIssue({ code: "custom", path: ["default", "width"], message: "Default width must be within the configured range." });
  }
  if (geometry.default.height < geometry.minimumHeight || geometry.default.height > geometry.maximumHeight) {
    context.addIssue({ code: "custom", path: ["default", "height"], message: "Default height must be within the configured range." });
  }
  if (geometry.default.rotation < geometry.minimumRotation || geometry.default.rotation > geometry.maximumRotation) {
    context.addIssue({ code: "custom", path: ["default", "rotation"], message: "Default rotation must be within the configured range." });
  }
});

const permissionsSchema = z.object({
  move: z.boolean(),
  resize: z.boolean(),
  rotate: z.boolean(),
  color: z.boolean(),
  font: z.boolean(),
}).strict();

const fontFamilySchema = z.enum(["sans", "serif", "rounded"]);
const textAlignmentSchema = z.enum(["left", "center", "right"]);

const textPolicySchema = z.object({
  enabled: z.boolean(),
  maximumElements: nonNegativeInteger,
  permissions: permissionsSchema,
  geometry: geometryPolicySchema,
  defaultColor: colour,
  allowedColors: z.array(colour).max(32),
  defaultFontFamily: fontFamilySchema,
  allowedFontFamilies: z.array(fontFamilySchema).max(3),
  defaultFontSize: z.number().finite().min(1).max(1_000).optional(),
  minimumFontSize: z.number().finite().min(1).max(1_000).optional(),
  maximumFontSize: z.number().finite().min(1).max(1_000).optional(),
  defaultTextAlign: textAlignmentSchema.optional(),
  allowedTextAlignments: z.array(textAlignmentSchema).min(1).max(3).optional(),
}).strict().superRefine((policy, context) => {
  if (policy.enabled && policy.maximumElements < 1) {
    context.addIssue({ code: "custom", path: ["maximumElements"], message: "Enabled text needs at least one allowed element." });
  }
  if (policy.allowedColors.length && !policy.allowedColors.includes(policy.defaultColor)) {
    context.addIssue({ code: "custom", path: ["defaultColor"], message: "The default colour must be one of the allowed colours." });
  }
  if (policy.allowedFontFamilies.length && !policy.allowedFontFamilies.includes(policy.defaultFontFamily)) {
    context.addIssue({ code: "custom", path: ["defaultFontFamily"], message: "The default font must be one of the allowed fonts." });
  }
  const minimumFontSize = policy.minimumFontSize ?? 8;
  const maximumFontSize = policy.maximumFontSize ?? 180;
  const defaultFontSize = policy.defaultFontSize ?? policy.geometry.default.height * 0.64;
  if (minimumFontSize > maximumFontSize) {
    context.addIssue({ code: "custom", path: ["maximumFontSize"], message: "Maximum font size must be at least the minimum font size." });
  }
  if (defaultFontSize < minimumFontSize || defaultFontSize > maximumFontSize) {
    context.addIssue({ code: "custom", path: ["defaultFontSize"], message: "Default font size must be within the configured range." });
  }
  const defaultTextAlign = policy.defaultTextAlign ?? "center";
  if (policy.allowedTextAlignments?.length && !policy.allowedTextAlignments.includes(defaultTextAlign)) {
    context.addIssue({ code: "custom", path: ["defaultTextAlign"], message: "The default alignment must be one of the allowed alignments." });
  }
});

const imagePolicySchema = z.object({
  enabled: z.boolean(),
  required: z.boolean().default(false),
  maximumElements: nonNegativeInteger,
  permissions: permissionsSchema,
  geometry: geometryPolicySchema,
  allowedMimeTypes: z.array(z.enum(["image/jpeg", "image/png", "image/webp"])).max(3),
  maximumBytes: z.number().int().min(0).max(20 * 1024 * 1024),
  minimumSourceWidth: z.number().int().min(1).max(50_000),
  maximumSourceWidth: z.number().int().min(1).max(50_000),
  minimumSourceHeight: z.number().int().min(1).max(50_000),
  maximumSourceHeight: z.number().int().min(1).max(50_000),
  allowedAspectRatios: z.array(z.number().finite().positive().max(100)).max(20),
  aspectRatioTolerance: z.number().finite().min(0).max(1),
  allowTransparency: z.boolean(),
  allowCrop: z.boolean(),
  approvalRequired: z.boolean(),
  chargePerImagePaise: z.number().int().min(0).max(100_000_000),
}).strict().superRefine((policy, context) => {
  if (policy.required && !policy.enabled) {
    context.addIssue({ code: "custom", path: ["required"], message: "A required image upload must be enabled." });
  }
  if (policy.enabled && policy.maximumElements < 1) {
    context.addIssue({ code: "custom", path: ["maximumElements"], message: "Enabled uploads need at least one allowed image." });
  }
  if (policy.enabled && (!policy.allowedMimeTypes.length || policy.maximumBytes < 1)) {
    context.addIssue({ code: "custom", path: ["allowedMimeTypes"], message: "Enabled uploads need a file type and byte limit." });
  }
  if (policy.minimumSourceWidth > policy.maximumSourceWidth) {
    context.addIssue({ code: "custom", path: ["maximumSourceWidth"], message: "Maximum source width must be at least the minimum." });
  }
  if (policy.minimumSourceHeight > policy.maximumSourceHeight) {
    context.addIssue({ code: "custom", path: ["maximumSourceHeight"], message: "Maximum source height must be at least the minimum." });
  }
});

const boundsSchema = z.object({
  x: finiteCoordinate,
  y: finiteCoordinate,
  width: positiveSize,
  height: positiveSize,
}).strict();

const surfacePolicySchema = z.object({
  id: z.string().trim().regex(/^[a-z][a-z0-9-]{0,79}$/),
  label: z.string().trim().min(1).max(80),
  coordinateSpace: z.object({ width: positiveSize, height: positiveSize }).strict(),
  printableBounds: boundsSchema,
  text: textPolicySchema,
  image: imagePolicySchema,
}).strict().superRefine((surface, context) => {
  const { printableBounds: bounds, coordinateSpace: coordinate } = surface;
  if (bounds.x < 0 || bounds.y < 0 || bounds.x + bounds.width > coordinate.width || bounds.y + bounds.height > coordinate.height) {
    context.addIssue({ code: "custom", path: ["printableBounds"], message: "Printable bounds must remain inside the surface coordinate space." });
  }
  for (const [key, geometry] of [["text", surface.text.geometry.default], ["image", surface.image.geometry.default]] as const) {
    if (
      geometry.x < bounds.x || geometry.y < bounds.y ||
      geometry.x + geometry.width > bounds.x + bounds.width ||
      geometry.y + geometry.height > bounds.y + bounds.height
    ) {
      context.addIssue({ code: "custom", path: [key, "geometry", "default"], message: "Default placement must remain inside the printable bounds." });
    }
  }
});

export const productArtworkPolicySchema = z.object({
  maximumElements: z.number().int().min(1).max(100),
  surfaces: z.array(surfacePolicySchema).min(1).max(8),
}).strict().superRefine((policy, context) => {
  const ids = new Set<string>();
  policy.surfaces.forEach((surface, index) => {
    if (ids.has(surface.id)) {
      context.addIssue({ code: "custom", path: ["surfaces", index, "id"], message: "Surface IDs must be unique." });
    }
    ids.add(surface.id);
  });
  const possibleElements = policy.surfaces.reduce(
    (total, surface) => total + surface.text.maximumElements + surface.image.maximumElements,
    0,
  );
  if (possibleElements > 0 && policy.maximumElements < 1) {
    context.addIssue({ code: "custom", path: ["maximumElements"], message: "The document element limit must allow configured surface elements." });
  }
});

export type ProductArtworkPolicyInput = z.infer<typeof productArtworkPolicySchema>;
