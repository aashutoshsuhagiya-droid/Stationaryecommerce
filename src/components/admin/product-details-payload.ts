import { formatStructuredDescription, type StructuredDescription } from "@/lib/admin-structured-description";
import type { ProductArtworkPolicy } from "@/lib/types";

export type FullDetailsInputType = "text" | "select" | "color" | "number";

export interface FullDetailsCategory {
  id: string;
  slug: string;
  name: string;
  parentId?: string | null;
}

export interface FullDetailsOption {
  label: string;
  value?: string;
  priceDelta?: number;
}

export interface FullDetailsConfigurationField {
  id: string;
  key: string;
  label: string;
  inputType: FullDetailsInputType;
  required: boolean;
  options: FullDetailsOption[];
  priceDelta: number;
  minLength: number | null;
  maxLength: number | null;
  allowedPattern: string;
  minValue: number | null;
  maxValue: number | null;
  step: number | null;
  placeholder: string;
  helpText: string;
  defaultValue: string;
  unit: string;
  enabled: boolean;
  customerVisible: boolean;
  visibleWhen: { fieldId: string; equals: string } | null;
}

export interface FullDetailsPrintArea {
  id: string;
  label: string;
  widthMm: number | null;
  heightMm: number | null;
  safeInsetMm: number | null;
}

export interface FullDetailsQuantityTier {
  id: string;
  minimum: number | string;
  priceDelta: number | string;
  label: string;
}

export interface FullDetailsImage {
  url: string;
  width?: number;
  height?: number;
}

export interface FullDetailsStructuredDescription {
  intro?: string;
  bestFor?: string[];
  featureBullets?: string[];
}

export interface FullDetailsProductBase {
  id?: string;
  name: string;
  sku: string;
  categoryId: string;
  categoryIds: string[];
  productType: string;
  price: number;
  imageUrl: string;
  material: string;
  sizes: string[];
  sizeDescription: string;
  features: string[];
  description: string;
  shortDescription?: string;
  customizable: boolean;
  published: boolean;
  allow2D: boolean;
  allow3D: boolean;
  quantityMin: number;
  quantityMax: number;
  quantityTiers: FullDetailsQuantityTier[];
  setupCharge: number;
  productionDaysMin: number;
  productionDaysMax: number;
  printAreas: FullDetailsPrintArea[];
  previewTemplate: string;
  productModel: string;
  artworkUpload: boolean;
  acceptedArtworkTypes: string[];
  artworkPolicy: ProductArtworkPolicy | null;
  templateLinks: Array<{ templateId: string; isDefault: boolean; sortOrder?: number }>;
  configurationFields: FullDetailsConfigurationField[];
  structuredDescription?: FullDetailsStructuredDescription | null;
  extraImages?: FullDetailsImage[];
}

export type FullDetailsOverrides = Partial<Omit<FullDetailsProductBase, "id">>;

export function safeDetailsKey(value: string, fallback: string) {
  const key = value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return key && /^[a-z]/.test(key) ? key.slice(0, 80) : fallback;
}

export function numberOr(value: number | string | null | undefined, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cleanOptionalNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function descriptionHasContent(value: FullDetailsStructuredDescription | null | undefined) {
  return Boolean(
    value?.intro?.trim()
    || value?.bestFor?.some((item) => item.trim())
    || value?.featureBullets?.length,
  );
}

export function normalizeStructuredDescription(value: FullDetailsStructuredDescription | null | undefined) {
  const intro = value?.intro?.trim();
  const bestFor = value?.bestFor
    ?.map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
  const featureBullets = value?.featureBullets?.filter(Boolean);
  if (!intro && !bestFor?.length && !featureBullets?.length) return undefined;
  return {
    ...(intro ? { intro } : {}),
    ...(bestFor?.length ? { bestFor } : {}),
    ...(featureBullets?.length ? { featureBullets } : {}),
  };
}

export function configurationFieldPayload(fields: FullDetailsConfigurationField[]) {
  return fields.map((field, index) => ({
    key: safeDetailsKey(field.key, `attribute-${index + 1}`),
    label: field.label.trim() || `Attribute ${index + 1}`,
    inputType: field.inputType,
    required: field.required,
    placeholder: field.placeholder.trim() || null,
    helpText: field.helpText.trim() || null,
    defaultValue: field.defaultValue || null,
    unit: field.unit.trim() || null,
    enabled: field.enabled,
    customerVisible: field.customerVisible,
    visibleWhen: field.visibleWhen,
    minLength: cleanOptionalNumber(field.minLength),
    maxLength: cleanOptionalNumber(field.maxLength),
    allowedPattern: field.inputType === "text" ? field.allowedPattern.trim() || null : null,
    minValue: field.inputType === "number" ? cleanOptionalNumber(field.minValue) : null,
    maxValue: field.inputType === "number" ? cleanOptionalNumber(field.maxValue) : null,
    step: field.inputType === "number" ? cleanOptionalNumber(field.step) : null,
    priceDelta: numberOr(field.priceDelta, 0),
    options: field.inputType === "select"
      ? field.options.map((option, optionIndex) => ({
        label: option.label.trim(),
        value: option.value?.trim() || safeDetailsKey(option.label, `option-${optionIndex + 1}`),
        priceDelta: numberOr(option.priceDelta, 0),
      })).filter((option) => option.label)
      : [],
  }));
}

/**
 * Builds the only expanded product payload used by the opt-in full-details UI.
 * Classic ProductsPanel submissions intentionally do not call this helper.
 */
export function buildFullDetailsPatch(
  base: FullDetailsProductBase,
  overrides: FullDetailsOverrides = {},
) {
  const value: FullDetailsProductBase = { ...base, ...overrides };
  const categoryId = value.categoryId;
  const categoryIds = [...new Set([categoryId, ...value.categoryIds].filter(Boolean))];
  const extraImages = (value.extraImages ?? [])
    .map((image) => ({
      url: image.url.trim(),
      ...(typeof image.width === "number" && image.width > 0 ? { width: image.width } : {}),
      ...(typeof image.height === "number" && image.height > 0 ? { height: image.height } : {}),
    }))
    .filter((image) => image.url)
    .slice(0, 5);
  const structuredDescription = normalizeStructuredDescription(value.structuredDescription);
  const flattenedDescription = structuredDescription
    ? formatStructuredDescription(structuredDescription as StructuredDescription)
    : value.description.trim();

  return {
    type: "product" as const,
    ...(base.id ? { id: base.id } : {}),
    name: value.name.trim(),
    sku: value.sku.trim(),
    categoryId,
    categoryIds,
    ...(value.productType.trim() ? { productType: value.productType.trim() } : {}),
    price: numberOr(value.price, 0),
    imageUrl: value.imageUrl.trim(),
    material: value.material.trim(),
    sizes: value.sizes.map((item) => item.trim()).filter(Boolean),
    sizeDescription: value.sizeDescription.trim(),
    features: value.features.map((item) => item.trim()).filter(Boolean),
    description: flattenedDescription,
    ...(value.shortDescription?.trim() ? { shortDescription: value.shortDescription.trim() } : {}),
    configurationFields: configurationFieldPayload(value.configurationFields),
    templateLinks: value.templateLinks.map(({ templateId, isDefault }) => ({ templateId, isDefault })),
    printAreas: value.printAreas.map((area, index) => ({
      id: safeDetailsKey(area.id, `surface-${index + 1}`),
      label: area.label.trim() || `Surface ${index + 1}`,
      widthMm: cleanOptionalNumber(area.widthMm),
      heightMm: cleanOptionalNumber(area.heightMm),
      safeInsetMm: cleanOptionalNumber(area.safeInsetMm),
    })),
    previewTemplate: value.allow3D ? value.previewTemplate.trim() : "",
    ...(value.productModel.trim() ? { productModel: value.productModel.trim() } : {}),
    artworkUpload: value.artworkUpload,
    acceptedArtworkTypes: value.acceptedArtworkTypes,
    ...(value.artworkPolicy ? { artworkPolicy: value.artworkPolicy } : {}),
    customizable: value.customizable,
    published: value.published,
    allow2D: value.allow2D,
    allow3D: value.allow3D,
    quantityMin: Math.max(1, Math.round(numberOr(value.quantityMin, 1))),
    quantityMax: Math.max(1, Math.round(numberOr(value.quantityMax, 100))),
    quantityTiers: value.quantityTiers.map((tier) => ({
      minimum: Math.max(1, Math.round(numberOr(tier.minimum, 1))),
      priceDelta: numberOr(tier.priceDelta, 0),
      ...(tier.label.trim() ? { label: tier.label.trim() } : {}),
    })),
    setupCharge: Math.max(0, numberOr(value.setupCharge, 0)),
    productionDaysMin: Math.max(0, Math.round(numberOr(value.productionDaysMin, 0))),
    productionDaysMax: Math.max(0, Math.round(numberOr(value.productionDaysMax, 0))),
    ...(structuredDescription ? { structuredDescription } : {}),
    ...(extraImages.length ? { extraImages } : {}),
  };
}
