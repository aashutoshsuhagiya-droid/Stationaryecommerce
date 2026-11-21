import {
  type QuickListConfigurationField,
  type QuickListPrintArea,
  type RanBazaarStarterDraft,
} from "./admin-quick-list";
import { buildDefaultAdminArtworkPolicy } from "./admin-artwork-policy";
import type { ProductArtworkPolicy } from "./types";

/**
 * Pure logic for the single guided listing flow: unified starter search,
 * "list similar" config copy, and the 5-decisions → full catalog payload
 * builder. Kept free of React/fetch so `test:domain` can cover it.
 */

export type ListingSourceKind = "ranbazaar" | "packaging" | "blank" | "similar";

export interface ListingSource {
  kind: ListingSourceKind;
  id: string;
  name: string;
  hint: string;
  /** Count of customer personalization fields the source prefills, when known. */
  fieldCount?: number;
}

export interface ListingSourceInput {
  starters: ReadonlyArray<{ id: string; name: string; description: string; fieldCount: number }>;
  packagingTypes: ReadonlyArray<{ id: string; name: string }>;
  products: ReadonlyArray<{ id: string; name: string }>;
}

export const BLANK_SOURCE: ListingSource = {
  kind: "blank",
  id: "blank",
  name: "Simple product",
  hint: "No customer customization — name it, price it, publish.",
  fieldCount: 0,
};

export function buildListingSources(input: ListingSourceInput): ListingSource[] {
  return [
    ...input.starters.map((starter): ListingSource => ({
      kind: "ranbazaar",
      id: starter.id,
      name: starter.name,
      hint: starter.description,
      fieldCount: starter.fieldCount,
    })),
    BLANK_SOURCE,
    ...input.packagingTypes.map((type): ListingSource => ({
      kind: "packaging",
      id: type.id,
      name: type.name,
      hint: "Custom-printed packaging — photo surfaces and sizes prefilled.",
    })),
    ...input.products.map((product): ListingSource => ({
      kind: "similar",
      id: product.id,
      name: product.name,
      hint: "Copy this product's setup — you only add a new name, price and photo.",
    })),
  ];
}

const normalize = (value: string) => value.toLocaleLowerCase("en-IN").trim();

function sourceScore(source: ListingSource, query: string): number {
  const name = normalize(source.name);
  if (!query) return 0;
  if (name === query) return 5;
  if (name.startsWith(query)) return 4;
  if (name.includes(query)) return 3;
  const words = query.split(/\s+/).filter(Boolean);
  if (words.length && words.every((word) => name.includes(word))) return 2;
  if (words.some((word) => word.length >= 3 && name.includes(word))) return 1;
  return 0;
}

/**
 * Empty query → the "most used" suggestions (every RanBazaar starter + blank).
 * With a query → ranked matches across all kinds, capped at `limit`.
 */
export function searchListingSources(sources: readonly ListingSource[], rawQuery: string, limit = 9): ListingSource[] {
  const query = normalize(rawQuery);
  if (!query) {
    return sources.filter((source) => source.kind === "ranbazaar" || source.kind === "blank").slice(0, limit);
  }
  return sources
    .map((source, index) => ({ source, score: sourceScore(source, query), index }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, limit)
    .map(({ source }) => source);
}

export interface ListingEssentials {
  name: string;
  price: string;
  categoryId: string;
  sku: string;
}

export function essentialsComplete(input: ListingEssentials): boolean {
  return Boolean(
    input.name.trim()
    && input.price.trim()
    && Number.isFinite(Number(input.price))
    && Number(input.price) >= 0
    && input.categoryId
    && input.sku.trim(),
  );
}

export interface ListingPayloadInput {
  name: string;
  sku: string;
  categoryId: string;
  price: string | number;
  description: string;
  productType: string;
  draft: RanBazaarStarterDraft;
  published: boolean;
  imageUrl: string;
}

/** Builds the full admin catalog POST/PATCH body from the 5 decisions + starter draft. */
export function quickListProductPayload(input: ListingPayloadInput) {
  return {
    type: "product" as const,
    name: input.name.trim(),
    sku: input.sku.trim(),
    categoryId: input.categoryId,
    price: Number(input.price),
    description: input.description.trim(),
    imageUrl: input.imageUrl,
    productType: input.productType || undefined,
    configurationFields: input.draft.configurationFields.map((field) => ({
      key: field.key,
      label: field.label,
      inputType: field.inputType,
      required: field.required,
      placeholder: field.placeholder || null,
      helpText: field.helpText || null,
      defaultValue: field.defaultValue || null,
      minLength: field.minLength,
      maxLength: field.maxLength,
      allowedPattern: field.allowedPattern || null,
      minValue: null,
      maxValue: null,
      step: null,
      priceDelta: 0,
      options: field.options,
      enabled: field.enabled,
      customerVisible: field.customerVisible,
      visibleWhen: null,
      unit: null,
    })),
    printAreas: input.draft.printAreas,
    artworkUpload: input.draft.artworkUpload,
    acceptedArtworkTypes: input.draft.acceptedArtworkTypes,
    artworkPolicy: input.draft.artworkPolicy,
    customizable: input.draft.configurationFields.length > 0,
    published: input.published,
    allow2D: true,
    allow3D: false,
    quantityMin: 1,
    quantityMax: 100,
    quantityTiers: [],
    setupCharge: 0,
    productionDaysMin: 0,
    productionDaysMax: 0,
  };
}

interface ExistingProductConfig {
  productType?: string;
  categoryId?: string;
  price?: number;
  description?: string;
  printAreas?: ReadonlyArray<Partial<QuickListPrintArea>>;
  artworkUpload?: boolean;
  acceptedArtworkTypes?: readonly string[];
  artworkPolicy?: ProductArtworkPolicy | null;
  configurationFields?: ReadonlyArray<Partial<QuickListConfigurationField> & { key?: string; label?: string }>;
}

export interface SimilarDraftResult {
  draft: RanBazaarStarterDraft;
  categoryId: string;
  productType: string;
  priceText: string;
  description: string;
}

/**
 * Copies an existing product's configuration into a fresh starter draft.
 * Configuration only — no identity: callers must supply a new name, SKU, slug
 * and photo, and the source product is never referenced or mutated.
 */
export function draftFromExistingProduct(sourceName: string, product: ExistingProductConfig): SimilarDraftResult {
  const printAreas: QuickListPrintArea[] = (product.printAreas ?? [])
    .flatMap((area) => area.id && area.label ? [{
      id: area.id,
      label: area.label,
      widthMm: typeof area.widthMm === "number" ? area.widthMm : null,
      heightMm: typeof area.heightMm === "number" ? area.heightMm : null,
      safeInsetMm: typeof area.safeInsetMm === "number" ? area.safeInsetMm : null,
    }] : []);
  const safePrintAreas = printAreas.length ? printAreas : [{ id: "primary", label: "Primary print area", widthMm: null, heightMm: null, safeInsetMm: null }];
  const acceptedArtworkTypes = (product.acceptedArtworkTypes ?? []).filter((type): type is string => typeof type === "string");
  const safeAccepted = acceptedArtworkTypes.length ? acceptedArtworkTypes : ["image/png", "image/jpeg"];
  const artworkUpload = product.artworkUpload === true;
  const configurationFields: QuickListConfigurationField[] = (product.configurationFields ?? [])
    .flatMap((field) => field.key && field.label ? [{
      key: field.key,
      label: field.label,
      inputType: field.inputType ?? "text",
      required: field.required === true,
      placeholder: field.placeholder ?? "",
      helpText: field.helpText ?? "",
      defaultValue: field.defaultValue ?? "",
      minLength: typeof field.minLength === "number" ? field.minLength : null,
      maxLength: typeof field.maxLength === "number" ? field.maxLength : null,
      allowedPattern: field.allowedPattern ?? "",
      options: (field.options ?? []).map((option) => ({ label: option.label, value: option.value, priceDelta: option.priceDelta ?? 0 })),
      enabled: field.enabled !== false,
      customerVisible: field.customerVisible !== false,
    }] : []);
  const artworkPolicy = product.artworkPolicy
    ?? buildDefaultAdminArtworkPolicy(safePrintAreas, { uploadsEnabled: artworkUpload, allowedMimeTypes: safeAccepted });
  return {
    draft: {
      id: "similar",
      name: `Like “${sourceName}”`,
      configurationFields,
      printAreas: safePrintAreas,
      artworkUpload,
      acceptedArtworkTypes: safeAccepted,
      artworkPolicy,
    },
    categoryId: product.categoryId ?? "",
    productType: product.productType ?? "",
    priceText: typeof product.price === "number" && Number.isFinite(product.price) ? String(product.price) : "",
    description: (product.description ?? "").slice(0, 10_000),
  };
}

/** ₹ formatting for the live preview card (Indian digit grouping, no paise for whole rupees). */
export function previewPrice(raw: string | number): string {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || String(raw).trim() === "") return "";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);
}
