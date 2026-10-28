import { z } from "zod";

const imageReferenceSchema = z.string().trim().max(2_000).refine((value) => {
  if (!value) return true;
  if (value.startsWith("data:image/")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}, "Enter an HTTP(S) image URL or an image data URL.");

const colorSchema = z.string().trim().regex(/^#[0-9a-f]{6}$/i, "Use a six-digit hex colour.");

export const templateSurfaceSchema = z.object({
  id: z.enum(["front", "back"]),
  label: z.string().trim().min(1).max(60),
  baseImageUrl: imageReferenceSchema.default(""),
  sampleText: z.string().trim().max(120).default("Your name"),
  background: colorSchema.default("#ffffff"),
  foreground: colorSchema.default("#111418"),
  accent: colorSchema.default("#3a3d42"),
  safeArea: z.object({
    x: z.number().finite().min(0).max(100),
    y: z.number().finite().min(0).max(100),
    width: z.number().finite().min(0).max(100),
    height: z.number().finite().min(0).max(100),
  }).strict(),
  widthPx: z.number().int().min(0).max(30_000),
  heightPx: z.number().int().min(0).max(30_000),
  dpi: z.number().int().min(0).max(2_400),
}).strict();

export const adminTemplateDraftSchema = z.object({
  name: z.string().trim().min(2).max(140),
  theme: z.string().trim().max(100).default(""),
  description: z.string().trim().max(2_000).default(""),
  thumbnailUrl: imageReferenceSchema.default(""),
  premiumPrice: z.number().finite().min(0).max(100_000).default(0),
  rightsReference: z.string().trim().max(300).default(""),
  surfaces: z.array(templateSurfaceSchema).min(1).max(2),
}).strict().superRefine((template, context) => {
  const ids = new Set<string>();
  template.surfaces.forEach((surface, index) => {
    if (ids.has(surface.id)) {
      context.addIssue({ code: "custom", path: ["surfaces", index, "id"], message: "Each surface can only be configured once." });
    }
    ids.add(surface.id);
  });
});

export const adminTemplatePublishSchema = adminTemplateDraftSchema.superRefine((template, context) => {
  if (!template.surfaces.some((surface) => surface.id === "front")) {
    context.addIssue({ code: "custom", path: ["surfaces"], message: "Configure a front surface before publishing." });
  }

  template.surfaces.forEach((surface, index) => {
    if (surface.widthPx <= 0) {
      context.addIssue({ code: "custom", path: ["surfaces", index, "widthPx"], message: "Output width is required before publishing." });
    }
    if (surface.heightPx <= 0) {
      context.addIssue({ code: "custom", path: ["surfaces", index, "heightPx"], message: "Output height is required before publishing." });
    }
    if (surface.dpi < 72) {
      context.addIssue({ code: "custom", path: ["surfaces", index, "dpi"], message: "Resolution must be at least 72 DPI before publishing." });
    }
    const { x, y, width, height } = surface.safeArea;
    if (width <= 0 || height <= 0 || x + width > 100 || y + height > 100) {
      context.addIssue({
        code: "custom",
        path: ["surfaces", index, "safeArea"],
        message: "Safe area must have a positive size and remain inside the surface.",
      });
    }
  });
});

export type AdminTemplateInput = z.infer<typeof adminTemplateDraftSchema>;
export type AdminTemplateSurface = z.infer<typeof templateSurfaceSchema>;

export function validateAdminTemplate(input: unknown, publishing: boolean) {
  return publishing ? adminTemplatePublishSchema.safeParse(input) : adminTemplateDraftSchema.safeParse(input);
}
