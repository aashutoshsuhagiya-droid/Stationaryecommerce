/**
 * The admin 2D design editor's API: a product's studio designs (one
 * PersonalizationTemplate each) and the text fields they bind.
 *
 * GET  ?productId=…  → the designs in order, the text fields, the product photo.
 * PUT  { productId, designs, fields } → saves everything in one transaction:
 *      templates (created as "st-…" or updated in place), their links and
 *      order, the bound fields, and the product's design surface. The product
 *      is marked as edited in admin so a re-import keeps these designs.
 */
import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import type { Prisma } from "@/generated/prisma/client";
import { assertSameOrigin } from "@/lib/auth-session";
import { requireCatalogAdmin } from "@/lib/catalog-admin";
import { CommerceError } from "@/lib/commerce-error";
import { apiError, readJson, validationError } from "@/lib/http";
import { onboardingApiError } from "@/lib/onboarding-api";
import { getPrisma } from "@/lib/prisma";
import {
  adminStudioTemplateSlug,
  planStudioFields,
  STUDIO_EDITED_AT_KEY,
  STUDIO_PHOTO_UPLOAD,
  studioPxToMm,
  studioSaveSchema,
  studioTemplateData,
  withOneDefaultDesign,
} from "@/lib/studio-design";
import { readStudioConfig } from "@/lib/studio-template";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRODUCT_ID = /^[A-Za-z0-9_-]{1,100}$/u;

const objectRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

function nextConfigurationVersion(configurator: Record<string, unknown>) {
  const current = typeof configurator.configurationVersion === "string" ? Number(configurator.configurationVersion) : 0;
  return Number.isSafeInteger(current) && current >= 0 && current < 1_000_000 ? String(current + 1) : "1";
}

type Database = ReturnType<typeof getPrisma> | Prisma.TransactionClient;

async function loadStudio(db: Database, productId: string) {
  const product = await db.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      name: true,
      status: true,
      publishedAt: true,
      metadata: true,
      images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true, width: true, height: true } },
      templateLinks: {
        orderBy: [{ sortOrder: "asc" }],
        select: { templateId: true, isDefault: true, template: { select: { slug: true, name: true, previewConfig: true } } },
      },
      personalizationFields: {
        orderBy: { sortOrder: "asc" },
        select: { key: true, label: true, inputType: true, isRequired: true, maxLength: true, validation: true },
      },
    },
  });
  if (!product) return null;
  const designs = product.templateLinks.flatMap((link) => {
    const studio = readStudioConfig(link.template.previewConfig);
    return studio
      ? [{ templateId: link.templateId, name: link.template.name, isDefault: link.isDefault, imported: link.template.slug.startsWith("rb-"), studio }]
      : [];
  });
  const image = product.images[0];
  const metadata = objectRecord(product.metadata);
  return {
    product: {
      id: product.id,
      name: product.name,
      published: product.status === "ACTIVE" && Boolean(product.publishedAt),
      imageUrl: image?.url ?? "",
      imageSize: image?.width && image?.height ? { width: image.width, height: image.height } : null,
    },
    designs,
    fields: product.personalizationFields.filter((field) => field.inputType === "text").map((field) => {
      const validation = objectRecord(field.validation);
      return {
        key: field.key,
        label: field.label,
        required: field.isRequired,
        maxLength: field.maxLength,
        placeholder: typeof validation.placeholder === "string" ? validation.placeholder.slice(0, 240) : "",
      };
    }),
    /** Keys of the product's other (dropdown, colour…) fields: a text field cannot reuse them. */
    reservedKeys: product.personalizationFields.filter((field) => field.inputType !== "text").map((field) => field.key),
    editedAt: typeof metadata[STUDIO_EDITED_AT_KEY] === "string" ? metadata[STUDIO_EDITED_AT_KEY] : null,
  };
}

export async function GET(request: Request) {
  try {
    await requireCatalogAdmin(request);
    const productId = new URL(request.url).searchParams.get("productId") ?? "";
    if (!PRODUCT_ID.test(productId)) return apiError(400, "PRODUCT_ID_INVALID", "Choose a valid product.");
    const studio = await loadStudio(getPrisma(), productId);
    if (!studio) return apiError(404, "PRODUCT_NOT_FOUND", "The product was not found.");
    return NextResponse.json({ data: studio }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return onboardingApiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    await requireCatalogAdmin(request);
    const parsed = studioSaveSchema.safeParse(await readJson(request));
    if (!parsed.success) return validationError(parsed.error);
    const input = parsed.data;
    const designs = withOneDefaultDesign(input.designs);
    const warnings: string[] = [];
    const prisma = getPrisma();

    await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: input.productId },
        select: {
          id: true,
          metadata: true,
          templateLinks: {
            orderBy: [{ sortOrder: "asc" }],
            select: { templateId: true, isDefault: true, template: { select: { previewConfig: true } } },
          },
          personalizationFields: { select: { key: true, inputType: true, validation: true, sortOrder: true } },
        },
      });
      if (!product) throw new CommerceError(404, "PRODUCT_NOT_FOUND", "The product was not found.");

      const studioLinks = product.templateLinks.filter((link) => readStudioConfig(link.template.previewConfig));
      const studioIds = new Set(studioLinks.map((link) => link.templateId));
      const stale = designs.find((design) => design.templateId && !studioIds.has(design.templateId));
      if (stale) {
        throw new CommerceError(409, "STUDIO_DESIGN_STALE", `"${stale.name}" is no longer one of this product's designs. Reload the editor and try again.`);
      }
      const previouslyBound = studioLinks.flatMap((link) => readStudioConfig(link.template.previewConfig)?.texts.map((layer) => layer.fieldKey) ?? []);
      const fieldPlan = planStudioFields({ existing: product.personalizationFields, previouslyBound, fields: input.fields });
      if (fieldPlan.conflicts.length) {
        throw new CommerceError(422, "STUDIO_FIELD_CONFLICT", `The key "${fieldPlan.conflicts[0]}" already belongs to one of this product's dropdown or option fields. Give the text field another key.`, { keys: fieldPlan.conflicts });
      }

      // Templates: update the product's own designs in place, create new ones.
      const savedIds: string[] = [];
      for (const design of designs) {
        const template = studioTemplateData(design.studio);
        const data = {
          name: design.name,
          status: "ACTIVE" as const,
          thumbnailUrl: template.thumbnailUrl,
          previewConfig: template.previewConfig as unknown as Prisma.InputJsonValue,
          productionConfig: template.productionConfig as unknown as Prisma.InputJsonValue,
          productionWidthPx: template.productionWidthPx,
          productionHeightPx: template.productionHeightPx,
          productionDpi: template.productionDpi,
        };
        const saved = design.templateId
          ? await tx.personalizationTemplate.update({ where: { id: design.templateId }, data, select: { id: true } })
          : await tx.personalizationTemplate.create({ data: { ...data, slug: adminStudioTemplateSlug(product.id, randomUUID().slice(0, 8)) }, select: { id: true } });
        savedIds.push(saved.id);
      }

      // Removed designs are unlinked; a design no product uses any more is archived (orders keep their snapshot).
      const removed = studioLinks.map((link) => link.templateId).filter((id) => !savedIds.includes(id));
      if (removed.length) {
        await tx.productTemplate.deleteMany({ where: { productId: product.id, templateId: { in: removed } } });
        await tx.personalizationTemplate.updateMany({ where: { id: { in: removed }, productLinks: { none: {} } }, data: { status: "ARCHIVED" } });
      }

      // Order: the designs first, as arranged; linked theme templates keep their order after them.
      for (const [sortOrder, templateId] of savedIds.entries()) {
        const isDefault = designs[sortOrder].isDefault;
        await tx.productTemplate.upsert({
          where: { productId_templateId: { productId: product.id, templateId } },
          update: { sortOrder, isDefault },
          create: { productId: product.id, templateId, sortOrder, isDefault },
        });
      }
      const others = product.templateLinks.filter((link) => !studioIds.has(link.templateId));
      for (const [offset, link] of others.entries()) {
        await tx.productTemplate.update({
          where: { productId_templateId: { productId: product.id, templateId: link.templateId } },
          data: { sortOrder: savedIds.length + offset, ...(savedIds.length ? { isDefault: false } : {}) },
        });
      }

      // Fields: only those the designs bind (see planStudioFields).
      if (fieldPlan.deletes.length) {
        await tx.productPersonalizationField.deleteMany({ where: { productId: product.id, key: { in: fieldPlan.deletes } } });
      }
      const existingFields = new Map(product.personalizationFields.map((field) => [field.key, field]));
      let nextSortOrder = product.personalizationFields.reduce((highest, field) => Math.max(highest, field.sortOrder), -1) + 1;
      for (const field of fieldPlan.upserts) {
        const current = existingFields.get(field.key);
        const validation = { ...objectRecord(current?.validation), placeholder: field.placeholder || null } as Prisma.InputJsonValue;
        if (current) {
          await tx.productPersonalizationField.update({
            where: { productId_key: { productId: product.id, key: field.key } },
            data: { label: field.label, isRequired: field.required, maxLength: field.maxLength, validation },
          });
        } else {
          await tx.productPersonalizationField.create({
            data: { productId: product.id, key: field.key, label: field.label, inputType: "text", isRequired: field.required, maxLength: field.maxLength, validation, sortOrder: nextSortOrder++ },
          });
        }
      }

      // The product: a sized design surface, uploads for photo slots, and the admin-edit mark.
      const metadata = objectRecord(product.metadata);
      const configurator = objectRecord(metadata.configurator);
      const printAreas = Array.isArray(configurator.printAreas) ? configurator.printAreas : [];
      const singlePrimaryArea = printAreas.length === 0 || (printAreas.length === 1 && objectRecord(printAreas[0]).id === "primary");
      const defaultDesign = designs.find((design) => design.isDefault);
      const hasPhotoSlots = designs.some((design) => design.studio.photos.length > 0);
      if (defaultDesign && !singlePrimaryArea) {
        warnings.push("This product has several print areas, so its print-area sizes were left as they are.");
      }
      const policy = objectRecord(configurator.artworkPolicy);
      if (hasPhotoSlots && Array.isArray(policy.surfaces) && !policy.surfaces.some((surface) => objectRecord(objectRecord(surface).image).enabled === true)) {
        warnings.push("Photo slots need image uploads: turn on image controls in this product's artwork settings, or customers cannot add photos.");
      }
      const nextConfigurator = {
        ...configurator,
        ...(defaultDesign && singlePrimaryArea
          ? { printAreas: [{ id: "primary", label: "Design", widthMm: studioPxToMm(defaultDesign.studio.canvas.width), heightMm: studioPxToMm(defaultDesign.studio.canvas.height) }] }
          : {}),
        ...(hasPhotoSlots
          ? {
              artworkUpload: true,
              acceptedMimeTypes: Array.isArray(configurator.acceptedMimeTypes) && configurator.acceptedMimeTypes.length
                ? configurator.acceptedMimeTypes
                : STUDIO_PHOTO_UPLOAD.acceptedMimeTypes,
              maximumArtworkBytes: typeof configurator.maximumArtworkBytes === "number"
                ? configurator.maximumArtworkBytes
                : STUDIO_PHOTO_UPLOAD.maximumArtworkBytes,
            }
          : {}),
        configurationVersion: nextConfigurationVersion(configurator),
      };
      await tx.product.update({
        where: { id: product.id },
        data: {
          ...(designs.length ? { customizable: true } : {}),
          metadata: { ...metadata, configurator: nextConfigurator, [STUDIO_EDITED_AT_KEY]: new Date().toISOString() } as Prisma.InputJsonValue,
        },
      });
    }, { maxWait: 15_000, timeout: 60_000 });

    revalidatePath("/", "layout");
    const studio = await loadStudio(prisma, input.productId);
    return NextResponse.json({ data: { ...studio, warnings } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return onboardingApiError(error);
  }
}
