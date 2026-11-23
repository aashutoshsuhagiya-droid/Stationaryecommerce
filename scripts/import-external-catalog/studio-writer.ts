/**
 * Writes a product's 2D studio (design templates, their links, and the
 * personalization fields they bind) idempotently. Shared by the importer and
 * the `2d-templates.ts` backfill so both converge on the same rows.
 */
import type { Prisma } from "../../src/generated/prisma/client";
import {
  parseRanbazaarStudio,
  studioPxToMm,
  studioTemplateRecord,
  type RanbazaarStudio,
  type StudioField,
  type StudioTemplateRecord,
} from "./ranbazaar-studio";
import { loadMockupSizes, measureMissingMockups, type MockupSizes } from "./mockup-sizes";
import { studioFontForSource } from "../../src/lib/studio-fonts";

/**
 * Photo slots live on the design templates (the customer uploads into them in
 * the studio), not as personalization fields: a photo is an uploaded artwork
 * image, validated, stored privately and attached to the order like any other.
 */
export const STUDIO_PHOTO_SLOTS_ENABLED = true;

/**
 * Upload settings for products whose designs have photo slots, in the stored
 * configurator format (the same keys the admin product form saves and the
 * runtime catalog reads). Shared with the admin design editor.
 */
export { STUDIO_PHOTO_UPLOAD } from "../../src/lib/studio-design";

export interface StudioPlan {
  externalId: string;
  studio: RanbazaarStudio;
  templates: StudioTemplateRecord[];
  /** Text fields only; photos are uploaded into the templates' slots. */
  fields: StudioField[];
  /** Some design has a photo slot, so the product must accept uploads. */
  acceptsPhotos: boolean;
  /** Mockups whose size is unknown (their designs fall back to a square canvas). */
  unmeasuredMockups: string[];
}

/** `sizes` defaults to the checked-in cache (docs/research/ranbazaar/mockup-sizes.json). */
export function planRanbazaarStudio(externalId: string, rawProduct: unknown, sizes: MockupSizes = loadMockupSizes()): StudioPlan {
  const studio = parseRanbazaarStudio(rawProduct);
  const fields = studio.fields.filter((field) => field.inputType === "text");
  const acceptsPhotos = STUDIO_PHOTO_SLOTS_ENABLED && studio.samples.some((sample) => sample.photos.length > 0);
  return { externalId, studio, fields, acceptsPhotos, ...studioTemplates(externalId, studio, sizes) };
}

function studioTemplates(externalId: string, studio: RanbazaarStudio, sizes: MockupSizes) {
  const templates = studio.samples.map((sample, position) =>
    studioTemplateRecord({ externalId, studio, position, includePhotos: STUDIO_PHOTO_SLOTS_ENABLED, mockupSize: sizes.get(sample.mockupUrl) }));
  const unmeasuredMockups = studio.samples.map((sample) => sample.mockupUrl).filter((url) => !sizes.has(url));
  return { templates, unmeasuredMockups };
}

/**
 * Measures any mockup the cache lacks (network, so call it outside a
 * transaction) and rebuilds the plan's templates with the right canvases.
 */
export async function withMeasuredMockups(plan: StudioPlan, sizes: MockupSizes = loadMockupSizes()): Promise<StudioPlan> {
  if (!plan.unmeasuredMockups.length) return plan;
  await measureMissingMockups(plan.unmeasuredMockups, sizes);
  return { ...plan, ...studioTemplates(plan.externalId, plan.studio, sizes) };
}

/** The field row as stored: the source text becomes the input placeholder too. */
export function studioFieldRow(field: StudioField, sortOrder: number) {
  return {
    key: field.key,
    label: field.label,
    inputType: field.inputType,
    isRequired: field.required,
    maxLength: field.maxLength,
    validation: {
      ...(field.placeholder ? { placeholder: field.placeholder } : {}),
      ...(field.sourceLabel ? { sourceLabel: field.sourceLabel } : {}),
      ...(field.style
        ? {
            fontId: studioFontForSource(field.style.sourceFont),
            color: field.style.color,
            fontSize: field.style.fontSize,
          }
        : {}),
    },
    sortOrder,
  };
}

const stableJson = (value: unknown): string => JSON.stringify(value, (_key, item) =>
  item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)))
    : item);

export interface StudioWriteResult {
  templates: { created: number; updated: number; unchanged: number };
  linksRemoved: number;
  fieldsRemoved: string[];
}

/**
 * Applies a plan inside the caller's transaction. Templates are keyed by their
 * deterministic slug, so a re-run updates rather than duplicates; links and
 * fields the source no longer has are removed.
 */
export async function writeStudioPlan(
  tx: Prisma.TransactionClient,
  productId: string,
  plan: StudioPlan,
): Promise<StudioWriteResult> {
  const result: StudioWriteResult = { templates: { created: 0, updated: 0, unchanged: 0 }, linksRemoved: 0, fieldsRemoved: [] };
  const linkedTemplateIds: string[] = [];

  for (const record of plan.templates) {
    const data = {
      name: record.name,
      status: "ACTIVE" as const,
      thumbnailUrl: record.thumbnailUrl,
      previewConfig: record.previewConfig as Prisma.InputJsonValue,
      productionConfig: record.productionConfig as Prisma.InputJsonValue,
      productionWidthPx: record.productionWidthPx,
      productionHeightPx: record.productionHeightPx,
      productionDpi: record.productionDpi,
    };
    const existing = await tx.personalizationTemplate.findUnique({
      where: { slug: record.slug },
      select: { id: true, name: true, status: true, thumbnailUrl: true, previewConfig: true, productionConfig: true, productionWidthPx: true, productionHeightPx: true, productionDpi: true },
    });
    let templateId: string;
    if (!existing) {
      templateId = (await tx.personalizationTemplate.create({ data: { ...data, slug: record.slug }, select: { id: true } })).id;
      result.templates.created += 1;
    } else {
      templateId = existing.id;
      const { id: _id, ...current } = existing;
      if (stableJson(current) === stableJson(data)) {
        result.templates.unchanged += 1;
      } else {
        await tx.personalizationTemplate.update({ where: { id: existing.id }, data });
        result.templates.updated += 1;
      }
    }
    linkedTemplateIds.push(templateId);
    await tx.productTemplate.upsert({
      where: { productId_templateId: { productId, templateId } },
      update: { sortOrder: record.sortOrder, isDefault: record.isDefault },
      create: { productId, templateId, sortOrder: record.sortOrder, isDefault: record.isDefault },
    });
  }

  // Imported designs the source dropped are unlinked; admin-linked themes are kept.
  const stale = await tx.productTemplate.deleteMany({
    where: {
      productId,
      templateId: { notIn: linkedTemplateIds },
      template: { slug: { startsWith: "rb-" } },
    },
  });
  result.linksRemoved = stale.count;

  const desiredKeys = plan.fields.map((field) => field.key);
  const existingFields = await tx.productPersonalizationField.findMany({ where: { productId }, select: { key: true } });
  result.fieldsRemoved = existingFields.map((field) => field.key).filter((key) => !desiredKeys.includes(key));
  if (result.fieldsRemoved.length) {
    await tx.productPersonalizationField.deleteMany({ where: { productId, key: { in: result.fieldsRemoved } } });
  }
  for (const [index, field] of plan.fields.entries()) {
    const row = studioFieldRow(field, index);
    await tx.productPersonalizationField.upsert({
      where: { productId_key: { productId, key: field.key } },
      update: { ...row, validation: row.validation as Prisma.InputJsonValue },
      create: { ...row, productId, validation: row.validation as Prisma.InputJsonValue },
    });
  }
  return result;
}

/**
 * The design surface the studio templates draw on, sized like the default
 * design's production render (canvas px at 300 DPI).
 */
export function studioPrintArea(plan: StudioPlan) {
  const template = plan.templates.find((candidate) => candidate.isDefault) ?? plan.templates[0];
  const widthPx = template?.productionWidthPx ?? 600;
  const heightPx = template?.productionHeightPx ?? 600;
  return { id: "primary", label: "Design", widthMm: studioPxToMm(widthPx), heightMm: studioPxToMm(heightPx) };
}
