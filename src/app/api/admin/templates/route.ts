import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { assertSameOrigin, AuthenticationError, requireRequestActor } from "@/lib/auth-session";
import { apiError, readJson, validationError } from "@/lib/http";
import { DatabaseConfigurationError, getPrisma } from "@/lib/prisma";
import { type AdminTemplateInput, type AdminTemplateSurface, validateAdminTemplate } from "@/lib/admin-template-validation";
import { Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({ action: z.literal("create"), template: z.unknown() }).strict();
const duplicateSchema = z.object({ action: z.literal("duplicate"), id: z.string().trim().min(1).max(100) }).strict();
const postSchema = z.discriminatedUnion("action", [createSchema, duplicateSchema]);
const updateSchema = z.object({
  action: z.enum(["save-draft", "publish"]),
  id: z.string().trim().min(1).max(100),
  template: z.unknown(),
}).strict();

const objectRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

const finiteNumber = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const text = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;

const safeAreaFrom = (value: unknown) => {
  const area = objectRecord(value);
  return {
    x: finiteNumber(area.x, 10),
    y: finiteNumber(area.y, 15),
    width: finiteNumber(area.width, 80),
    height: finiteNumber(area.height, 70),
  };
};

function storedSurfaces(template: {
  previewConfig: unknown;
  productionConfig: unknown;
  productionWidthPx: number;
  productionHeightPx: number;
  productionDpi: number;
}): AdminTemplateSurface[] {
  const preview = objectRecord(template.previewConfig);
  const production = objectRecord(template.productionConfig);
  const previewSurfaces = Array.isArray(preview.surfaces) ? preview.surfaces.map(objectRecord) : [];
  const productionSurfaces = Array.isArray(production.surfaces) ? production.surfaces.map(objectRecord) : [];

  if (!previewSurfaces.length) {
    return [{
      id: "front",
      label: "Front",
      baseImageUrl: text(preview.baseImageUrl),
      sampleText: text(preview.sampleText, "Your name"),
      background: text(preview.background, "#ffffff"),
      foreground: text(preview.foreground, "#111418"),
      accent: text(preview.accent, "#3a3d42"),
      safeArea: safeAreaFrom(preview.safeArea),
      widthPx: template.productionWidthPx,
      heightPx: template.productionHeightPx,
      dpi: template.productionDpi,
    }];
  }

  return previewSurfaces.flatMap((surface, index) => {
    const id = surface.id === "back" ? "back" : surface.id === "front" ? "front" : null;
    if (!id) return [];
    const output = productionSurfaces.find((candidate) => candidate.id === id) ?? productionSurfaces[index] ?? {};
    return [{
      id,
      label: text(surface.label, id === "front" ? "Front" : "Back"),
      baseImageUrl: text(surface.baseImageUrl, text(output.baseImageUrl)),
      sampleText: text(surface.sampleText, "Your name"),
      background: text(surface.background, "#ffffff"),
      foreground: text(surface.foreground, "#111418"),
      accent: text(surface.accent, "#3a3d42"),
      safeArea: safeAreaFrom(surface.safeArea ?? output.safeArea),
      widthPx: finiteNumber(surface.widthPx, finiteNumber(output.widthPx, template.productionWidthPx)),
      heightPx: finiteNumber(surface.heightPx, finiteNumber(output.heightPx, template.productionHeightPx)),
      dpi: finiteNumber(surface.dpi, finiteNumber(output.dpi, template.productionDpi)),
    } satisfies AdminTemplateSurface];
  });
}

function serializeTemplate(template: {
  id: string;
  name: string;
  slug: string;
  theme: string | null;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  description: string | null;
  thumbnailUrl: string | null;
  previewConfig: unknown;
  productionConfig: unknown;
  productionWidthPx: number;
  productionHeightPx: number;
  productionDpi: number;
  premiumPricePaise: number;
  rightsReference: string | null;
  updatedAt: Date;
  _count: { productLinks: number; customizations: number; orderPersonalizations: number };
}) {
  return {
    id: template.id,
    name: template.name,
    slug: template.slug,
    theme: template.theme ?? "",
    status: template.status,
    description: template.description ?? "",
    thumbnailUrl: template.thumbnailUrl ?? "",
    premiumPrice: template.premiumPricePaise / 100,
    rightsReference: template.rightsReference ?? "",
    surfaces: storedSurfaces(template),
    productCount: template._count.productLinks,
    uses: template._count.customizations + template._count.orderPersonalizations,
    updatedAt: template.updatedAt.toISOString(),
  };
}

const templateInclude = {
  _count: { select: { productLinks: true, customizations: true, orderPersonalizations: true } },
} as const;

function templateData(input: AdminTemplateInput, status: "DRAFT" | "ACTIVE") {
  const primary = input.surfaces.find((surface) => surface.id === "front") ?? input.surfaces[0];
  return {
    name: input.name,
    theme: input.theme || null,
    status,
    description: input.description || null,
    thumbnailUrl: input.thumbnailUrl || primary.baseImageUrl || null,
    previewConfig: {
      schemaVersion: 1,
      defaultSurfaceId: primary.id,
      background: primary.background,
      foreground: primary.foreground,
      accent: primary.accent,
      fontFamily: "Manrope",
      textAlign: "center",
      safeArea: primary.safeArea,
      sampleText: primary.sampleText,
      baseImageUrl: primary.baseImageUrl || null,
      surfaces: input.surfaces.map((surface) => ({ ...surface })),
    } as Prisma.InputJsonValue,
    productionConfig: {
      schemaVersion: 1,
      renderer: "svg-v1",
      defaultSurfaceId: primary.id,
      safeArea: primary.safeArea,
      fontScaling: { minPx: 24, maxPx: 72, overflow: "shrink-to-fit" },
      surfaces: input.surfaces.map((surface) => ({
        id: surface.id,
        label: surface.label,
        baseImageUrl: surface.baseImageUrl || null,
        safeArea: surface.safeArea,
        widthPx: surface.widthPx,
        heightPx: surface.heightPx,
        dpi: surface.dpi,
      })),
    } as Prisma.InputJsonValue,
    productionWidthPx: primary.widthPx,
    productionHeightPx: primary.heightPx,
    productionDpi: primary.dpi,
    premiumPricePaise: Math.round(input.premiumPrice * 100),
    rightsReference: input.rightsReference || null,
  };
}

function uniqueSlug(name: string) {
  const base = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "template";
  return `${base.slice(0, 145)}-${randomUUID().slice(0, 8)}`;
}

async function requireTemplateAdmin(request: Request) {
  const actor = await requireRequestActor(request, "templates.manage");
  if (!actor.roles.includes("admin")) {
    throw new AuthenticationError(403, "FORBIDDEN", "Super Admin access is required.");
  }
}

function templateApiError(error: unknown) {
  if (error instanceof AuthenticationError) return apiError(error.status, error.code, error.message);
  if (error instanceof DatabaseConfigurationError) return apiError(503, "DATABASE_NOT_CONFIGURED", "Template management is unavailable until the database is configured.");
  if (error instanceof SyntaxError) return apiError(400, "INVALID_JSON", error.message);
  if (objectRecord(error).code === "P2002") return apiError(409, "TEMPLATE_CONFLICT", "A template with this identifier already exists.");
  console.error("Unexpected template management error", error);
  return apiError(500, "TEMPLATE_MANAGEMENT_FAILED", "The template request could not be completed safely.");
}

export async function GET(request: Request) {
  try {
    await requireTemplateAdmin(request);
    const templates = await getPrisma().personalizationTemplate.findMany({
      include: templateInclude,
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
    });
    return NextResponse.json({ data: { templates: templates.map(serializeTemplate) } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return templateApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await requireTemplateAdmin(request);
    const envelope = postSchema.safeParse(await readJson(request));
    if (!envelope.success) return validationError(envelope.error);
    const prisma = getPrisma();

    if (envelope.data.action === "duplicate") {
      const source = await prisma.personalizationTemplate.findUnique({ where: { id: envelope.data.id } });
      if (!source) return apiError(404, "TEMPLATE_NOT_FOUND", "The requested template was not found.");
      const copyName = `${source.name.slice(0, 133)} copy`;
      const copy = await prisma.personalizationTemplate.create({
        data: {
          name: copyName,
          slug: uniqueSlug(copyName),
          theme: source.theme,
          status: "DRAFT",
          description: source.description,
          thumbnailUrl: source.thumbnailUrl,
          previewConfig: source.previewConfig as Prisma.InputJsonValue,
          productionConfig: source.productionConfig as Prisma.InputJsonValue,
          productionWidthPx: source.productionWidthPx,
          productionHeightPx: source.productionHeightPx,
          productionDpi: source.productionDpi,
          premiumPricePaise: source.premiumPricePaise,
          rightsReference: source.rightsReference,
        },
        include: templateInclude,
      });
      return NextResponse.json({ data: { template: serializeTemplate(copy) } }, { status: 201 });
    }

    const parsed = validateAdminTemplate(envelope.data.template, false);
    if (!parsed.success) return validationError(parsed.error);
    const created = await prisma.personalizationTemplate.create({
      data: { slug: uniqueSlug(parsed.data.name), ...templateData(parsed.data, "DRAFT") },
      include: templateInclude,
    });
    return NextResponse.json({ data: { template: serializeTemplate(created) } }, { status: 201 });
  } catch (error) {
    return templateApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    await requireTemplateAdmin(request);
    const envelope = updateSchema.safeParse(await readJson(request));
    if (!envelope.success) return validationError(envelope.error);
    const publishing = envelope.data.action === "publish";
    const parsed = validateAdminTemplate(envelope.data.template, publishing);
    if (!parsed.success) return validationError(parsed.error);
    const prisma = getPrisma();
    const exists = await prisma.personalizationTemplate.findUnique({ where: { id: envelope.data.id }, select: { id: true } });
    if (!exists) return apiError(404, "TEMPLATE_NOT_FOUND", "The requested template was not found.");
    const updated = await prisma.personalizationTemplate.update({
      where: { id: envelope.data.id },
      data: templateData(parsed.data, publishing ? "ACTIVE" : "DRAFT"),
      include: templateInclude,
    });
    return NextResponse.json({ data: { template: serializeTemplate(updated) } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return templateApiError(error);
  }
}
