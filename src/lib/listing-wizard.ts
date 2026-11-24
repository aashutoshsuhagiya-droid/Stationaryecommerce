import {
  createRanBazaarStarterDraft,
  slugifyAdminValue,
  type QuickListConfigurationField,
  type QuickListPrintArea,
  type RanBazaarStarterDraft,
} from "./admin-quick-list";
import { buildDefaultAdminArtworkPolicy } from "./admin-artwork-policy";
import {
  CATEGORY_LISTING_PLAYBOOK,
  deriveListingTags,
  deriveSeo,
  getCategoryListingRecipe,
  listableCategories,
  printOptionDefaultFor,
  type CategoryListingRecipe,
} from "./category-listing-playbook";
import { getEzpacPackagingFieldPreset } from "./ezpac-packaging-presets";
import { packagingCategoryDimensions } from "./packaging-dimensions";
import { defaultProduct3DDimensionsMm } from "../components/configurator/product-3d-dimensions";
import type { ProductArtworkPolicy } from "./types";

/**
 * Pure logic for the single guided listing flow: unified starter search,
 * "list similar" config copy, and the 5-decisions → full catalog payload
 * builder. Kept free of React/fetch so `test:domain` can cover it.
 */

export type ListingSourceKind = "ranbazaar" | "packaging" | "blank" | "similar" | "category";

export interface ListingSource {
  kind: ListingSourceKind;
  id: string;
  name: string;
  hint: string;
  /** Count of customer personalization fields the source prefills, when known. */
  fieldCount?: number;
  /** Extra words that match this source (recipe keywords, the shelf's own name). */
  keywords?: readonly string[];
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

function nameScore(rawName: string, query: string): number {
  const name = normalize(rawName);
  if (!query) return 0;
  if (name === query) return 5;
  if (name.startsWith(query)) return 4;
  if (name.includes(query)) return 3;
  const words = query.split(/\s+/).filter(Boolean);
  if (words.length && words.every((word) => name.includes(word))) return 2;
  if (words.some((word) => word.length >= 3 && name.includes(word))) return 1;
  return 0;
}

function sourceScore(source: ListingSource, query: string): number {
  return Math.max(nameScore(source.name, query), ...(source.keywords ?? []).map((keyword) => Math.min(4, nameScore(keyword, query))));
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
  /** The chosen shelf's recipe: supplies GST, MRP habit, 3D model and collections. */
  recipe?: CategoryListingRecipe;
  categoryName?: string;
  /** Extra category ids ("Also list in" collections resolved by the caller). */
  categoryIds?: string[];
  compareAtPrice?: string | number;
  /** Admin's choice for the built-in 3D preview; ignored unless the recipe allows it. */
  enable3D?: boolean;
  /** Packaging print-option chips; selected values become customer choices (₹0 extra). */
  printOptions?: readonly PrintOptionState[];
  /** Finished size (mm). Written as "W × H × D mm" so the 3D model and product page use it. */
  sizeMm?: SizeMm | null;
  /** Gallery photos after the main one, already uploaded. */
  extraImages?: ReadonlyArray<{ url: string; width?: number; height?: number }>;
  /** "More options" overrides; each is optional and defaults to the recipe. */
  gstPercent?: 0 | 5 | 18;
  stockOnHand?: number;
  productionDaysMin?: number;
  productionDaysMax?: number;
  quantityMin?: number;
  quantityMax?: number;
}

const wholeNumber = (value: number | undefined, fallback: number, min: number, max: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;

/** Builds the full admin catalog POST/PATCH body from the wizard's decisions + starter draft. */
export function quickListProductPayload(input: ListingPayloadInput) {
  const price = Number(input.price);
  const compareAt = input.compareAtPrice === undefined || String(input.compareAtPrice).trim() === ""
    ? undefined
    : Number(input.compareAtPrice);
  const name = input.name.trim();
  const categoryName = input.categoryName?.trim() ?? "";
  const description = input.description.trim();
  // Built-in 3D needs no template, but only for shapes the playbook vouches for.
  const builtin3D = input.recipe?.threeDPath === "builtin" && Boolean(input.recipe.model3D) && input.enable3D !== false;
  const seo = deriveSeo(name, categoryName, description);
  const fields = input.printOptions?.length ? applyPrintOptions(input.draft.configurationFields, input.printOptions) : input.draft.configurationFields;
  const productionDaysMin = wholeNumber(input.productionDaysMin, 0, 0, 365);
  const productionDaysMax = Math.max(productionDaysMin, wholeNumber(input.productionDaysMax, 0, 0, 365));
  const quantityMin = wholeNumber(input.quantityMin, 1, 1, 1000);
  const quantityMax = Math.max(quantityMin, wholeNumber(input.quantityMax, 100, 1, 1000));
  const gstPercent = input.gstPercent ?? input.recipe?.gstPercent;
  const sizeDescription = input.sizeMm ? sizeDescriptionFor(input.sizeMm) : "";
  return {
    type: "product" as const,
    name,
    sku: input.sku.trim(),
    categoryId: input.categoryId,
    ...(input.categoryIds?.length ? { categoryIds: [...new Set([input.categoryId, ...input.categoryIds])] } : {}),
    price,
    ...(compareAt !== undefined && Number.isFinite(compareAt) && compareAt > price ? { compareAtPrice: compareAt } : {}),
    ...(gstPercent !== undefined ? { gstPercent } : {}),
    ...(name ? { tags: deriveListingTags(name, categoryName), seoTitle: seo.seoTitle, seoDescription: seo.seoDescription } : {}),
    description,
    imageUrl: input.imageUrl,
    ...(input.extraImages ? { extraImages: input.extraImages.slice(0, 5).map((image) => ({ ...image })) } : {}),
    ...(sizeDescription ? { sizeDescription } : {}),
    ...(typeof input.stockOnHand === "number" && Number.isFinite(input.stockOnHand) ? { stockOnHand: wholeNumber(input.stockOnHand, 0, 0, 1_000_000) } : {}),
    productType: input.productType || undefined,
    configurationFields: fields.map((field) => ({
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
    customizable: fields.length > 0,
    published: input.published,
    allow2D: true,
    allow3D: builtin3D,
    ...(builtin3D ? { productModel: input.recipe!.model3D } : {}),
    quantityMin,
    quantityMax,
    quantityTiers: [],
    setupCharge: 0,
    productionDaysMin,
    productionDaysMax,
  };
}

export type QuickListProductPayload = ReturnType<typeof quickListProductPayload>;

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

/**
 * Starter/packaging-preset draft for a category, from its playbook recipe.
 * Returns undefined when the shelf has no recipe (the admin then picks a starter).
 */
export function recipeForCategorySlug(categorySlug: string | undefined | null) {
  return getCategoryListingRecipe(categorySlug);
}

/** Packaging selects a super admin must still fill in (material, lamination, GSM…). */
export function unconfiguredOptionLabels(draft: RanBazaarStarterDraft): string[] {
  return draft.configurationFields
    .filter((field) => field.inputType === "select" && field.options.length === 0)
    .map((field) => field.label);
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


/* ------------------------------------------------------------------------ */
/* Easy listing: photo first, one merged category list, publish in a click. */
/* ------------------------------------------------------------------------ */

/** A starter-free product: no customer fields, one print area. */
export function blankListingDraft(): RanBazaarStarterDraft {
  const printAreas = [{ id: "primary", label: "Primary print area", widthMm: null, heightMm: null, safeInsetMm: null }];
  return {
    id: "blank",
    name: "Simple product",
    configurationFields: [],
    printAreas,
    artworkUpload: false,
    acceptedArtworkTypes: ["image/png", "image/jpeg"],
    artworkPolicy: buildDefaultAdminArtworkPolicy(printAreas, { uploadsEnabled: false, allowedMimeTypes: ["image/png", "image/jpeg"] }),
  };
}

/** The personalisation fields, print areas and artwork rules a shelf's recipe starts with. */
export function recipeDraftFor(recipe: CategoryListingRecipe | undefined): RanBazaarStarterDraft {
  if (recipe?.starterId) {
    const starter = createRanBazaarStarterDraft(recipe.starterId);
    if (starter) return starter;
  }
  if (recipe?.packagingFieldPresetId) {
    const preset = getEzpacPackagingFieldPreset(recipe.packagingFieldPresetId);
    return {
      ...blankListingDraft(),
      id: preset.id,
      name: preset.label,
      configurationFields: preset.fields.map((field): QuickListConfigurationField => ({
        key: field.key,
        label: field.label,
        inputType: field.inputType,
        required: field.required,
        placeholder: field.placeholder ?? "",
        helpText: field.helpText ?? "",
        defaultValue: "",
        minLength: field.minLength ?? null,
        maxLength: field.maxLength ?? null,
        allowedPattern: field.allowedPattern ?? "",
        options: field.options?.map((option) => ({ label: option.label, value: option.value, priceDelta: option.priceDelta ?? 0 })) ?? [],
        // Choices the shop has not confirmed yet stay hidden until print options are picked.
        enabled: field.optionSource !== "admin_configured",
        customerVisible: field.optionSource !== "admin_configured",
      })),
    };
  }
  return blankListingDraft();
}

/** True when the recipe prints customer packaging (print-option chips, no name field). */
export function isPackagingRecipe(recipe: CategoryListingRecipe | undefined): boolean {
  return Boolean(recipe?.packagingFieldPresetId && !recipe.starterId);
}

/* ---- Category picker ---------------------------------------------------- */

export interface WizardCategoryRecord {
  id: string;
  slug: string;
  name: string;
  parentId: string | null;
  isActive?: boolean;
}

export interface CategoryOption {
  categoryId: string;
  slug: string;
  /** Plain-language name shown on the card. */
  label: string;
  /** The shelf's own name (also searchable). */
  categoryName: string;
  benefit: string;
  /** "3D preview" badge: the recipe has a built-in model or makes one from the photo. */
  has3D: boolean;
  /** First product photo on that shelf; empty → the card shows a bundled icon. */
  imageUrl: string;
  productCount: number;
  keywords: readonly string[];
  recipe?: CategoryListingRecipe;
}

const SIMPLE_BENEFIT = "Name it, price it and publish";

/**
 * ONE list of what an admin can sell: every listable shelf with a recipe, in
 * playbook order, then leaf shelves without one (listed as simple products).
 * Group headings ("Boxes") and import buckets are never offered.
 */
export function buildCategoryOptions(
  categories: readonly WizardCategoryRecord[],
  products: ReadonlyArray<{ categoryId: string; imageUrl?: string }> = [],
): CategoryOption[] {
  const listable = listableCategories(categories);
  const parentIds = new Set(listable.flatMap((category) => category.parentId ? [category.parentId] : []));
  const firstImage = new Map<string, string>();
  const counts = new Map<string, number>();
  const stockPhoto = (url: string) => url.includes("images.unsplash.com");
  for (const product of products) {
    counts.set(product.categoryId, (counts.get(product.categoryId) ?? 0) + 1);
    const url = product.imageUrl;
    if (!url || url.endsWith("/pending")) continue;
    // A real product photo beats a demo stock photo (a desk, a laptop) as the card's picture.
    const current = firstImage.get(product.categoryId);
    if (!current || (stockPhoto(current) && !stockPhoto(url))) firstImage.set(product.categoryId, url);
  }
  const option = (category: WizardCategoryRecord, recipe?: CategoryListingRecipe): CategoryOption => ({
    categoryId: category.id,
    slug: category.slug,
    label: recipe?.displayName ?? category.name,
    categoryName: category.name,
    benefit: recipe?.benefit ?? SIMPLE_BENEFIT,
    has3D: recipe?.threeDPath === "builtin" || recipe?.threeDPath === "template",
    imageUrl: firstImage.get(category.id) ?? "",
    productCount: counts.get(category.id) ?? 0,
    keywords: recipe?.keywords ?? [],
    ...(recipe ? { recipe } : {}),
  });
  const bySlug = new Map(listable.map((category) => [category.slug, category]));
  const withRecipe = CATEGORY_LISTING_PLAYBOOK.flatMap((recipe) => {
    const category = bySlug.get(recipe.categorySlug);
    return category ? [option(category, recipe)] : [];
  });
  const covered = new Set(withRecipe.map((item) => item.categoryId));
  const simple = listable
    .filter((category) => !covered.has(category.id) && !parentIds.has(category.id))
    .map((category) => option(category));
  return [...withRecipe, ...simple];
}

/** Camera and messenger file-name noise that says nothing about the product. */
const FILE_NAME_NOISE = new Set([
  "img", "image", "dsc", "dscn", "dcim", "pxl", "photo", "pic", "picture", "screenshot", "whatsapp", "wa",
  "jpeg", "jpg", "png", "webp", "heic", "heif", "final", "edit", "edited", "new", "copy", "scaled", "large", "small",
  "front", "back", "side", "top", "mockup", "product", "untitled", "at", "pm", "am",
]);

/** Meaningful lower-case words from photo file names ("rose-soap-box_02.jpg" → rose soap box). */
export function fileNameWords(fileNames: readonly string[]): string[] {
  const words: string[] = [];
  for (const raw of fileNames) {
    const stem = raw.replace(/\.[a-z0-9]{2,5}$/i, "");
    for (const word of stem.toLocaleLowerCase("en-IN").split(/[^a-z]+/)) {
      if (word.length < 2 || FILE_NAME_NOISE.has(word) || words.includes(word)) continue;
      words.push(word);
    }
  }
  return words;
}

function containsPhrase(text: string, phrase: string) {
  const escaped = normalize(phrase).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "[\\s-]*");
  return new RegExp(`(^|[^a-z])${escaped}s?($|[^a-z])`).test(text);
}

/** Words that describe any product, so they say nothing about which shelf it belongs on. */
const GENERIC_WORDS = new Set([
  "set", "pack", "pcs", "piece", "pieces", "of", "and", "for", "with", "the", "my", "your", "our", "kids", "kid",
  "custom", "customised", "customized", "personalised", "personalized", "printed", "print", "design", "new",
]);

/** "Pencils" and "pencil" are the same word; so are "boxes" and "box". */
const wordStem = (word: string) => word.replace(/(es|s)$/u, (suffix, _offset, whole: string) => whole.length - suffix.length >= 3 ? "" : suffix);

function wordsOf(value: string): string[] {
  return normalize(value).split(/[^a-z]+/).filter((word) => word.length >= 2 && !GENERIC_WORDS.has(word)).map(wordStem);
}

function vocabularyOf(option: CategoryOption): Set<string> {
  return new Set([option.label, option.categoryName, ...option.keywords].flatMap(wordsOf));
}

/**
 * Each matching word counts by how specific it is: "pencil" points at one shelf
 * (1 point), "box" at seven (1/7 each). A whole keyword phrase ("soap box") adds
 * a point, so the most specific shelf wins over the busiest one.
 */
function categoryScores(options: readonly CategoryOption[], text: string): number[] {
  const textWords = new Set(wordsOf(text));
  if (!textWords.size) return options.map(() => 0);
  const vocabularies = options.map(vocabularyOf);
  const shelvesUsing = new Map<string, number>();
  for (const vocabulary of vocabularies) for (const word of vocabulary) shelvesUsing.set(word, (shelvesUsing.get(word) ?? 0) + 1);
  return options.map((option, index) => {
    let score = 0;
    for (const word of textWords) if (vocabularies[index].has(word)) score += 1 / (shelvesUsing.get(word) ?? 1);
    for (const phrase of [option.label, ...option.keywords]) {
      if (phrase.includes(" ") && containsPhrase(text, phrase)) score += 1;
    }
    return score;
  });
}

/**
 * Rule-based "what is it?": scores every shelf against the photo file names and
 * whatever the admin typed, using recipe keywords (no AI, no network). With no
 * signal it falls back to the busiest shelves so the cards are never empty.
 */
export function suggestCategories(
  options: readonly CategoryOption[],
  input: { fileNames?: readonly string[]; text?: string },
  limit = 3,
): CategoryOption[] {
  const text = normalize([...fileNameWords(input.fileNames ?? []), input.text ?? ""].join(" "));
  const scores = categoryScores(options, text);
  const ranked = options
    .map((option, index) => ({ option, index, score: scores[index] }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || right.option.productCount - left.option.productCount || left.index - right.index)
    .map((item) => item.option);
  if (ranked.length >= limit) return ranked.slice(0, limit);
  const popular = [...options].sort((left, right) => right.productCount - left.productCount);
  for (const option of popular) {
    if (ranked.length >= limit) break;
    if (!ranked.includes(option)) ranked.push(option);
  }
  return ranked;
}

/** The "Something else? Type it…" search: the existing source ranking over shelves. */
export function searchCategoryOptions(options: readonly CategoryOption[], query: string, limit = 8): CategoryOption[] {
  const sources: ListingSource[] = options.map((option) => ({
    kind: "category",
    id: option.categoryId,
    name: option.label,
    hint: option.benefit,
    keywords: [option.categoryName, ...option.keywords],
  }));
  if (!normalize(query)) return [];
  const byId = new Map(options.map((option) => [option.categoryId, option]));
  return searchListingSources(sources, query, limit).flatMap((source) => byId.get(source.id) ? [byId.get(source.id)!] : []);
}

/**
 * Switching shelves re-applies the new recipe. When that would replace the
 * customer fields already on the listing, the admin is asked first.
 */
export function recipeChangePrompt(input: {
  currentDraft: RanBazaarStarterDraft;
  nextDraft: RanBazaarStarterDraft;
  nextLabel: string;
}): string | null {
  const current = input.currentDraft.configurationFields;
  if (!current.length) return null;
  const signature = (fields: readonly QuickListConfigurationField[]) => fields.map((field) => field.key).join("|");
  if (signature(current) === signature(input.nextDraft.configurationFields)) return null;
  const count = current.length;
  return `Replace the ${count} personalisation field${count === 1 ? "" : "s"} with the ${input.nextLabel} defaults?`;
}

/* ---- Print options (packaging) ----------------------------------------- */

export interface PrintOptionState {
  key: string;
  label: string;
  /** Every chip shown, in order. */
  choices: string[];
  /** Chips switched on: these become the customer's choices. */
  selected: string[];
}

/** Packaging selects the shop must choose values for, pre-filled from the recipe. */
export function printOptionsFor(draft: RanBazaarStarterDraft, recipe: CategoryListingRecipe | undefined): PrintOptionState[] {
  return draft.configurationFields
    .filter((field) => field.inputType === "select" && field.options.length === 0)
    .map((field) => {
      const defaults = printOptionDefaultFor(recipe, field.key);
      return {
        key: field.key,
        label: field.label,
        choices: [...(defaults?.choices ?? [])],
        selected: [...(defaults?.selected ?? [])],
      };
    });
}

/** Toggles one chip; adding a new value also selects it. */
export function togglePrintOption(options: readonly PrintOptionState[], key: string, value: string): PrintOptionState[] {
  const clean = value.trim().slice(0, 120);
  if (!clean) return [...options];
  return options.map((option) => {
    if (option.key !== key) return option;
    const known = option.choices.some((choice) => choice.toLocaleLowerCase("en-IN") === clean.toLocaleLowerCase("en-IN"));
    const choices = known ? option.choices : [...option.choices, clean].slice(0, 20);
    const match = choices.find((choice) => choice.toLocaleLowerCase("en-IN") === clean.toLocaleLowerCase("en-IN")) ?? clean;
    const selected = option.selected.includes(match) && known
      ? option.selected.filter((item) => item !== match)
      : [...new Set([...option.selected, match])];
    return { ...option, choices, selected: choices.filter((choice) => selected.includes(choice)) };
  });
}

const optionValue = (label: string, taken: Set<string>) => {
  const base = (slugifyAdminValue(label) || "option").slice(0, 100);
  let value = base;
  for (let index = 2; taken.has(value); index += 1) value = `${base}-${index}`.slice(0, 120);
  taken.add(value);
  return value;
};

/** Writes the selected chips into the select fields (₹0 each); empty → field stays hidden. */
export function applyPrintOptions(
  fields: readonly QuickListConfigurationField[],
  options: readonly PrintOptionState[],
): QuickListConfigurationField[] {
  const byKey = new Map(options.map((option) => [option.key, option]));
  return fields.map((field) => {
    const option = byKey.get(field.key);
    if (!option || field.inputType !== "select") return field;
    const taken = new Set<string>();
    const selected = option.choices.filter((choice) => option.selected.includes(choice));
    const visible = selected.length > 0;
    return {
      ...field,
      helpText: "",
      options: selected.map((label) => ({ label: label.slice(0, 120), value: optionValue(label, taken), priceDelta: 0 })),
      enabled: visible,
      customerVisible: visible,
      required: visible && field.required,
    };
  });
}

/* ---- Name, price, description ------------------------------------------ */

const titleCase = (value: string) => value.replace(/\b([a-z])/g, (letter) => letter.toUpperCase());

/** "rose-soap-box.jpg" + Soap box → "Rose Soap Box"; "IMG_2041.jpg" → "Custom Soap Box". */
export function suggestProductName(label: string, fileNames: readonly string[] = []): string {
  const cleanLabel = label.trim();
  const words = fileNameWords(fileNames).filter((word) => /[a-z]{2,}/.test(word)).slice(0, 6);
  if (!words.length) return cleanLabel ? `Custom ${titleCase(cleanLabel.toLocaleLowerCase("en-IN"))}`.slice(0, 180) : "";
  const phrase = words.join(" ");
  const labelWords = normalize(cleanLabel).split(/[^a-z]+/).filter((word) => word.length > 2);
  const mentionsLabel = labelWords.some((word) => phrase.includes(word.replace(/s$/, "")));
  return titleCase(mentionsLabel || !cleanLabel ? phrase : `${phrase} ${cleanLabel.toLocaleLowerCase("en-IN")}`).slice(0, 180);
}

/** The "Write for me" description: a friendly sentence from the shelf's recipe. */
export function writeDescription(recipe: CategoryListingRecipe | undefined, name: string, label = ""): string {
  const subject = name.trim() || label.trim() || "This product";
  const template = recipe?.descriptionTemplate ?? "{name}, made to order and printed with care.";
  return template.replaceAll("{name}", subject);
}

/** Price band hint/warning at 0.5×–2× of what similar products sell for. */
export function priceRangeWarning(recipe: CategoryListingRecipe | undefined, rawPrice: string | number): string | null {
  const band = recipe?.priceBandRupees;
  const price = Number(rawPrice);
  if (!band || String(rawPrice).trim() === "" || !Number.isFinite(price) || price <= 0) return null;
  if (price < band.min * 0.5) return `That looks low — similar products sell for ₹${band.min}–₹${band.max}.`;
  if (price > band.max * 2) return `That looks high — similar products sell for ₹${band.min}–₹${band.max}.`;
  return null;
}

/* ---- Validation --------------------------------------------------------- */

export interface ListingCompleteness {
  photoCount: number;
  categoryId: string;
  name: string;
  price: string;
}

/** Inline, plain-word field errors (only for fields the admin can see). */
export function listingFieldErrors(input: Pick<ListingCompleteness, "name" | "price">): { name?: string; price?: string } {
  const errors: { name?: string; price?: string } = {};
  if (input.name.trim().length < 2) errors.name = input.name.trim() ? "Use at least 2 letters" : "Add a name";
  const price = input.price.trim();
  if (!price) errors.price = "Add a price";
  else if (!Number.isFinite(Number(price)) || Number(price) < 0) errors.price = "Use numbers only, like 249";
  return errors;
}

/** What still blocks Publish, in the order the wizard asks for it. */
export function missingForPublish(input: ListingCompleteness): string[] {
  const missing: string[] = [];
  if (input.photoCount < 1) missing.push("a photo");
  if (!input.categoryId) missing.push("what it is");
  const errors = listingFieldErrors(input);
  if (errors.name) missing.push("a name");
  if (errors.price) missing.push("a price");
  return missing;
}

/** One line for the Publish button area: "Add a photo and a price to publish." */
export function missingSummary(missing: readonly string[], action = "publish"): string {
  if (!missing.length) return "";
  const list = missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}`;
  return `Add ${list} to ${action}.`;
}

/* ---- 3D size ------------------------------------------------------------- */

// A type alias (not an interface) so it stays assignable to Record<string, number>.
export type SizeMm = {
  width: number;
  height: number;
  depth: number;
};

export type SizePreset = SizeMm & {
  id: "small" | "medium" | "large";
  label: string;
};

const roundTo5 = (value: number) => Math.max(1, Math.round(value / 5) * 5);

/** Small / Medium / Large around the shelf's typical size (or the model's own default). */
export function sizePresetsFor(recipe: CategoryListingRecipe | undefined): SizePreset[] {
  if (!recipe?.model3D || recipe.threeDPath === "none") return [];
  const base = packagingCategoryDimensions(recipe.categorySlug) ?? defaultProduct3DDimensionsMm(recipe.model3D);
  const scaled = (factor: number): SizeMm => ({
    width: roundTo5(base.width * factor),
    height: roundTo5(base.height * factor),
    // Flat things (sheets, mailers) keep their thickness.
    depth: base.depth <= 5 ? base.depth : roundTo5(base.depth * factor),
  });
  return [
    { id: "small", label: "Small", ...scaled(0.75) },
    { id: "medium", label: "Medium", ...base },
    { id: "large", label: "Large", ...scaled(1.35) },
  ];
}

export function clampSize(size: Partial<SizeMm>, fallback: SizeMm): SizeMm {
  const pick = (value: number | undefined, other: number) =>
    typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.min(2000, Math.round(value * 10) / 10) : other;
  return { width: pick(size.width, fallback.width), height: pick(size.height, fallback.height), depth: pick(size.depth, fallback.depth) };
}

/** "90 × 60 × 30 mm": the form `parseExactDimensions` reads back for the 3D model. */
export function sizeDescriptionFor(size: SizeMm): string {
  const fmt = (value: number) => String(Math.round(value * 10) / 10);
  return `${fmt(size.width)} × ${fmt(size.height)} × ${fmt(size.depth)} mm`;
}

/* ---- Local autosave ------------------------------------------------------ */

export const WIZARD_DRAFT_STORAGE_KEY = "naamly.admin.listing-wizard.v1";
const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface PersistedListingPhoto {
  id: string;
  fileName: string;
  width: number;
  height: number;
  /** Uploaded asset id; photos that never uploaded cannot be restored (blobs are not stored). */
  assetId: string;
}

export interface PersistedListingDraft {
  version: 1;
  savedAt: number;
  listingId: string;
  step: 1 | 2 | 3;
  productId: string;
  categoryId: string;
  name: string;
  nameEdited: boolean;
  price: string;
  description: string;
  compareAtPrice: string;
  sku: string;
  skuEdited: boolean;
  gstPercent: 0 | 5 | 18 | null;
  stockOnHand: string;
  productionDaysMin: string;
  productionDaysMax: string;
  quantityMin: string;
  quantityMax: string;
  extraCategoryIds: string[];
  printOptions: PrintOptionState[];
  sizeMm: SizeMm | null;
  textPosition: TextPosition;
  sampleText: string;
  photos: PersistedListingPhoto[];
}

export type TextPosition = "top" | "middle" | "bottom";

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const str = (value: unknown, max = 10_000) => typeof value === "string" ? value.slice(0, max) : "";
const ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

/** Serialises the wizard for localStorage. File blobs and preview URLs never leave memory. */
export function serializeListingDraft(draft: Omit<PersistedListingDraft, "version" | "savedAt">, now = Date.now()): string {
  const photos = draft.photos
    .filter((photo) => typeof photo.assetId === "string" && ID_PATTERN.test(photo.assetId))
    .map(({ id, fileName, width, height, assetId }) => ({ id: String(id), fileName: String(fileName ?? "").slice(0, 200), width: Number(width) || 0, height: Number(height) || 0, assetId }));
  return JSON.stringify({ ...draft, photos, version: 1, savedAt: now });
}

/** Reads a saved wizard back; anything malformed, foreign or older than a week is ignored. */
export function parseListingDraft(raw: string | null | undefined, now = Date.now()): PersistedListingDraft | null {
  if (!raw) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!isRecord(value) || value.version !== 1 || typeof value.savedAt !== "number") return null;
  if (now - value.savedAt > DRAFT_MAX_AGE_MS || value.savedAt > now + 60_000) return null;
  if (typeof value.listingId !== "string" || !ID_PATTERN.test(value.listingId)) return null;
  const step = value.step === 2 || value.step === 3 ? value.step : 1;
  const gst = value.gstPercent === 0 || value.gstPercent === 5 || value.gstPercent === 18 ? value.gstPercent : null;
  const size = isRecord(value.sizeMm) ? clampSize(value.sizeMm as Partial<SizeMm>, { width: 100, height: 100, depth: 50 }) : null;
  const printOptions = Array.isArray(value.printOptions) ? value.printOptions.flatMap((item): PrintOptionState[] => {
    if (!isRecord(item) || typeof item.key !== "string") return [];
    const choices = Array.isArray(item.choices) ? item.choices.filter((choice): choice is string => typeof choice === "string").slice(0, 20) : [];
    const selected = Array.isArray(item.selected) ? item.selected.filter((choice): choice is string => typeof choice === "string" && choices.includes(choice)) : [];
    return [{ key: item.key.slice(0, 80), label: str(item.label, 120), choices, selected }];
  }) : [];
  const photos = Array.isArray(value.photos) ? value.photos.flatMap((item): PersistedListingPhoto[] => {
    if (!isRecord(item) || typeof item.assetId !== "string" || !ID_PATTERN.test(item.assetId)) return [];
    return [{ id: str(item.id, 100) || item.assetId, fileName: str(item.fileName, 200), width: Number(item.width) || 0, height: Number(item.height) || 0, assetId: item.assetId }];
  }).slice(0, 8) : [];
  return {
    version: 1,
    savedAt: value.savedAt,
    listingId: value.listingId,
    step,
    productId: typeof value.productId === "string" && ID_PATTERN.test(value.productId) ? value.productId : "",
    categoryId: str(value.categoryId, 100),
    name: str(value.name, 180),
    nameEdited: value.nameEdited === true,
    price: str(value.price, 20),
    description: str(value.description),
    compareAtPrice: str(value.compareAtPrice, 20),
    sku: str(value.sku, 80),
    skuEdited: value.skuEdited === true,
    gstPercent: gst,
    stockOnHand: str(value.stockOnHand, 10),
    productionDaysMin: str(value.productionDaysMin, 5),
    productionDaysMax: str(value.productionDaysMax, 5),
    quantityMin: str(value.quantityMin, 5),
    quantityMax: str(value.quantityMax, 5),
    extraCategoryIds: Array.isArray(value.extraCategoryIds) ? value.extraCategoryIds.filter((id): id is string => typeof id === "string" && ID_PATTERN.test(id)).slice(0, 10) : [],
    printOptions,
    sizeMm: size,
    textPosition: value.textPosition === "top" || value.textPosition === "bottom" ? value.textPosition : "middle",
    sampleText: str(value.sampleText, 40) || "Aarav",
    photos,
  };
}

/** Anything worth asking "Continue where you left off?" (or confirming on close) about. */
export function hasListingInput(draft: Pick<PersistedListingDraft, "name" | "price" | "description" | "categoryId"> & { photoCount: number }): boolean {
  return Boolean(draft.photoCount || draft.name.trim() || draft.price.trim() || draft.description.trim() || draft.categoryId);
}

/** A client-generated idempotency key for one listing. */
export function newListingId(random: () => string = () => globalThis.crypto.randomUUID()): string {
  return `lst_${random().replace(/[^A-Za-z0-9]/g, "").slice(0, 32)}`;
}

/** Moves a default design's text box to the top, middle or bottom of the photo. */
export function positionStudioText<T extends { canvas: { width: number; height: number }; texts: Array<{ y: number; fontSize: number; height: number | null }> }>(
  config: T,
  position: TextPosition,
): T {
  if (position === "middle") return config;
  const { height } = config.canvas;
  return {
    ...config,
    texts: config.texts.map((layer) => {
      const box = layer.height ?? layer.fontSize * 1.5;
      const y = position === "top" ? height * 0.1 : height * 0.9 - box;
      return { ...layer, y: Math.round(Math.max(0, Math.min(height - box, y))) };
    }),
  };
}

/* ---- Photo quality (friendly, never blocking) ---------------------------- */

export interface PhotoStats {
  width: number;
  height: number;
  /** Mean brightness 0-255 of a small downsample. */
  meanLuma: number;
  /** Mean neighbour contrast 0-1 along the outer frame (plain backdrop ≈ 0). */
  borderBusyness: number;
}

export const SMALL_PHOTO_PX = 1000;

export function photoQualityWarnings(stats: PhotoStats): string[] {
  const warnings: string[] = [];
  const longEdge = Math.max(stats.width, stats.height);
  if (longEdge > 0 && longEdge < SMALL_PHOTO_PX) warnings.push(`Photo is small (${Math.round(longEdge)} px) — prints may look blurry`);
  if (stats.meanLuma < 60) warnings.push("Very dark photo");
  if (stats.borderBusyness > 0.16) warnings.push("Busy background — a plain background looks cleaner on the product card and in the customiser");
  return warnings;
}

/** Long edge after the browser shrinks a photo before upload. */
export const UPLOAD_MAX_EDGE_PX = 2000;

export function downscaledSize(width: number, height: number, maxEdge = UPLOAD_MAX_EDGE_PX) {
  const scale = Math.min(1, maxEdge / Math.max(width, height, 1));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
