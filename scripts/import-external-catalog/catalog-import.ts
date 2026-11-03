
export type ExternalCatalogSource = "ezpac" | "ranbazaar";

export interface ImportedImage {
  url: string;
  altText: string;
  width: number | null;
  height: number | null;
  sortOrder: number;
}

export interface ImportedVariant {
  sku: string;
  name: string;
  optionValues: Record<string, string | null>;
  pricePaise: number;
  compareAtPricePaise: number | null;
  weightGrams: number | null;
  inventoryPolicy: "DENY" | "CONTINUE" | "MADE_TO_ORDER";
  /** Physical stock to write into Inventory when inventoryPolicy is CONTINUE. */
  onHand?: number | null;
  isActive: boolean;
  sortOrder: number;
}

export interface ImportedExternalProduct {
  source: ExternalCatalogSource;
  externalId: string;
  externalKey: string;
  title: string;
  sourceHandle?: string;
  description: string | null;
  shortDescription: string | null;
  tags: string[];
  images: ImportedImage[];
  variants: ImportedVariant[];
  basePricePaise: number;
  compareAtPricePaise: number | null;
  categoryHints: string[];
  dimensions: Record<string, unknown> | null;
  /** Source offers a personalization flow (name, photo, …) on this product. */
  customizable?: boolean;
  /** Absolute bulk price breaks inherited from the source ({quantity: price}). */
  bulkPriceTiers?: Array<{ minimum: number; pricePaise: number }>;
}

type UnknownRecord = Record<string, unknown>;

export interface EzpacSourceVariant {
  title?: unknown;
  option1?: unknown;
  option2?: unknown;
  option3?: unknown;
  price?: unknown;
  compare_at_price?: unknown;
  available?: unknown;
  grams?: unknown;
  position?: unknown;
}

export interface EzpacSourceProduct {
  id?: unknown;
  title?: unknown;
  handle?: unknown;
  body_html?: unknown;
  product_type?: unknown;
  tags?: unknown;
  options?: unknown;
  variants?: unknown;
  images?: unknown;
}

export function objectRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

export function stringValue(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

/** Validates that source text is non-blank without changing its supplied characters. */
function sourceString(value: unknown): string | null {
  if (typeof value === "string") return value.trim() ? value : null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function integerValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  const text = stringValue(value);
  return text && /^-?\d+$/.test(text) ? Number(text) : null;
}

function uniqueStrings(values: readonly string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

/** Mirrors the admin catalog route's conservative lower-case URL-slug algorithm. */
export function slugifyCatalogTitle(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Returns a stable, auditable import key; metadata stores its two components separately. */
export function deriveExternalKey(source: ExternalCatalogSource, externalId: string) {
  return `${source}:${externalId}`;
}

export function externalSku(
  source: ExternalCatalogSource,
  externalId: string,
  ordinal: number,
) {
  const safeId = externalId.replace(/[^A-Za-z0-9-]+/g, "-").replace(/(^-|-$)/g, "");
  const prefix = source === "ezpac" ? "EZPAC" : "RANBAZAAR";
  const sku = `EXT-${prefix}-${safeId}-${ordinal}`;
  if (sku.length > 80) {
    throw new Error(`External SKU is longer than the catalog limit for ${deriveExternalKey(source, externalId)}.`);
  }
  return sku;
}

/** Decimal strings are converted without floating-point rounding. */
export function priceToPaise(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const text = typeof value === "number" ? String(value) : stringValue(value);
  if (!text || !/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(result) ? result : null;
}

/** Source HTML is preserved byte-for-byte except for executable script tags. */
export function sanitizeSourceHtml(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const withoutScripts = value.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "");
  return withoutScripts.trim() ? withoutScripts : null;
}

/** Uses the first supplied paragraph only when it fits the target's 400-character field. */
export function sourceShortDescription(value: string | null): string | null {
  if (!value) return null;
  const paragraph = value.match(/<p\b[^>]*>[\s\S]*?<\/p\s*>/i)?.[0] ?? value;
  return paragraph.length <= 400 ? paragraph : null;
}

export function nextAvailableSlug(preferred: string, usedSlugs: ReadonlySet<string>) {
  if (!preferred) throw new Error("Source title cannot be converted into a catalog slug.");
  if (!usedSlugs.has(preferred)) return preferred;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${preferred}-${suffix}`;
    if (!usedSlugs.has(candidate)) return candidate;
  }
}

function priceOrZero(value: unknown) {
  return priceToPaise(value) ?? 0;
}

function availability(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  const text = stringValue(value)?.toLocaleLowerCase("en-IN");
  if (!text) return true;
  return !["false", "0", "out of stock", "out_of_stock", "unavailable", "sold out"].includes(text);
}

function imageRecords(value: unknown, title: string): ImportedImage[] {
  const rawImages = Array.isArray(value) ? value : value ? [value] : [];
  const orderedImages = rawImages
    .map((image, index) => ({ image, index, position: integerValue(objectRecord(image).position ?? objectRecord(image).sort_order) }))
    .sort((left, right) => (left.position ?? left.index + 1) - (right.position ?? right.index + 1));
  const seen = new Set<string>();
  const result: ImportedImage[] = [];
  for (const { image: raw } of orderedImages) {
    const image = objectRecord(raw);
    const url = sourceString(typeof raw === "string" ? raw : image.src ?? image.url ?? image.image ?? image.path);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    result.push({
      url,
      altText: sourceString(image.alt ?? image.altText ?? image.title) ?? title,
      width: integerValue(image.width),
      height: integerValue(image.height),
      sortOrder: result.length + 1,
    });
  }
  return result;
}

function ezpacOptionNames(options: unknown) {
  return Array.isArray(options)
    ? options.map((option, index) => stringValue(objectRecord(option).name) ?? `Option ${index + 1}`)
    : [];
}

export function mapEzpacProduct(product: EzpacSourceProduct): ImportedExternalProduct {
  const externalId = sourceString(product.id);
  const title = sourceString(product.title);
  if (!externalId || !title) throw new Error("EzPac product is missing its id or title.");
  if (title.length > 180) throw new Error(`EzPac title exceeds Product.name's 180-character limit: ${externalId}.`);

  const optionNames = ezpacOptionNames(product.options);
  const rawVariants = Array.isArray(product.variants) && product.variants.length ? product.variants : [{}];
  const variants = rawVariants
    .map((raw, index) => ({ raw: objectRecord(raw), index }))
    .sort((left, right) => (integerValue(left.raw.position) ?? left.index + 1) - (integerValue(right.raw.position) ?? right.index + 1))
    .map(({ raw }, index): ImportedVariant => {
      const pricePaise = priceOrZero(raw.price);
      const optionValues = Object.fromEntries(
        [raw.option1, raw.option2, raw.option3]
          .map((option, optionIndex) => [optionNames[optionIndex] ?? `Option ${optionIndex + 1}`, sourceString(option)] as const)
          .filter(([, option]) => option !== null),
      );
      return {
        sku: externalSku("ezpac", externalId, index + 1),
        name: sourceString(raw.title) ?? "Default Title",
        optionValues,
        pricePaise,
        compareAtPricePaise: priceToPaise(raw.compare_at_price),
        weightGrams: integerValue(raw.grams),
        inventoryPolicy: pricePaise === 0 ? "MADE_TO_ORDER" : "DENY",
        isActive: availability(raw.available),
        sortOrder: index,
      };
    });
  const description = sanitizeSourceHtml(product.body_html);
  const tags = Array.isArray(product.tags)
    ? product.tags.flatMap((tag) => sourceString(tag) ?? [])
    : [];
  const categoryHints = uniqueStrings((stringValue(product.product_type) ?? "").split(","));
  const baseVariant = variants[0];
  return {
    source: "ezpac",
    externalId,
    externalKey: deriveExternalKey("ezpac", externalId),
    title,
    sourceHandle: sourceString(product.handle) ?? undefined,
    description,
    shortDescription: sourceShortDescription(description),
    tags,
    images: imageRecords(product.images, title),
    variants,
    basePricePaise: baseVariant?.pricePaise ?? 0,
    compareAtPricePaise: baseVariant?.compareAtPricePaise ?? null,
    categoryHints,
    dimensions: null,
  };
}

export function extractNextData(html: string): unknown {
  const match = html.match(/<script\b(?=[^>]*\bid=["']__NEXT_DATA__["'])[^>]*>([\s\S]*?)<\/script\s*>/i);
  if (!match?.[1]) throw new Error("Ranbazaar page has no __NEXT_DATA__ payload.");
  try {
    return JSON.parse(match[1]);
  } catch (error) {
    throw new Error(`Ranbazaar __NEXT_DATA__ is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function recordsWithin(value: unknown, maximum = 10_000) {
  const records: UnknownRecord[] = [];
  const visit = (candidate: unknown) => {
    if (records.length >= maximum || !candidate || typeof candidate !== "object") return;
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }
    const record = candidate as UnknownRecord;
    records.push(record);
    Object.values(record).forEach(visit);
  };
  visit(value);
  return records;
}

function firstValue(record: UnknownRecord, keys: readonly string[]) {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function likelyProductRecord(payload: unknown) {
  const candidates = recordsWithin(payload);
  const scored = candidates.map((record, index) => {
    const name = sourceString(firstValue(record, ["name", "product_name", "productName", "title"]));
    const price = firstValue(record, ["price", "selling_price", "sellingPrice", "sale_price", "salePrice", "discountPrice"]);
    const images = firstValue(record, ["images", "product_images", "productImages", "image", "image_url", "imageUrl"]);
    const id = firstValue(record, ["id", "_id", "product_id", "productId", "slug"]);
    return { record, score: (name ? 4 : 0) + (price !== null ? 3 : 0) + (images !== null ? 2 : 0) + (id !== null ? 1 : 0), index };
  });
  const best = scored.sort((left, right) => right.score - left.score || left.index - right.index)[0];
  if (!best || best.score < 4) throw new Error("Ranbazaar __NEXT_DATA__ has no recognizable product record.");
  return best.record;
}

function valueAsCategoryHints(value: unknown): string[] {
  if (typeof value === "string") return uniqueStrings([value]);
  if (!Array.isArray(value)) {
    const record = objectRecord(value);
    return uniqueStrings([stringValue(record.name) ?? "", stringValue(record.title) ?? "", stringValue(record.slug) ?? ""]);
  }
  return uniqueStrings(value.flatMap(valueAsCategoryHints));
}

function sourceSpecs(record: UnknownRecord) {
  const specs = firstValue(record, ["specs", "specifications", "attributes", "product_specs", "productSpecs"]);
  if (specs === null) return null;
  return { specs };
}

function extractRanbazaarImages(record: UnknownRecord): unknown[] {
  const images = firstValue(record, ["images", "product_images", "productImages"]);
  const list = Array.isArray(images) ? [...images] : images ? [images] : [];
  const customizeDetails = record.customizeDetails;
  if (Array.isArray(customizeDetails)) {
    for (const item of customizeDetails) {
      const img = objectRecord(item).productImg;
      if (img) list.push(img);
    }
  }
  const singleImage = firstValue(record, ["image", "image_url", "imageUrl", "defaultImage"]);
  if (singleImage && typeof singleImage === "string") list.push(singleImage);
  return list;
}

function ranbazaarVariants(record: UnknownRecord, sourceId: string, title: string) {
  const rawVariants = firstValue(record, ["variants", "product_variants", "productVariants"]);
  const hasExplicitVariants = Array.isArray(rawVariants) && rawVariants.length > 0;
  const entries = hasExplicitVariants ? rawVariants : [record];
  return entries.map((raw, index): ImportedVariant => {
    const variant = objectRecord(raw);
    const pricePaise = priceOrZero(firstValue(variant, ["sale", "price", "selling_price", "sellingPrice", "sale_price", "salePrice", "discountPrice"]));
    const optionValuesSource = objectRecord(firstValue(variant, ["optionValues", "option_values", "options", "attributes"]));
    const parsedOptions = Object.fromEntries(
      Object.entries(optionValuesSource)
        .map(([key, value]) => [key, sourceString(value)] as const)
        .filter(([, value]) => value !== null),
    );
    const rawVariantName = hasExplicitVariants
      ? (sourceString(firstValue(variant, ["name", "title", "variant_name", "variantName", "label"])) ?? `${title} ${index + 1}`)
      : "Default Title";
    const variantName = (rawVariantName || "Default Title").slice(0, 160);
    const optionValues = Object.keys(parsedOptions).length > 0
      ? parsedOptions
      : { title: variantName };
    return {
      sku: externalSku("ranbazaar", sourceId, index + 1),
      name: variantName,
      optionValues,
      pricePaise,
      compareAtPricePaise: priceToPaise(firstValue(variant, ["mrp", "MRP", "compare_at_price", "compareAtPrice", "original_price", "originalPrice"])),
      weightGrams: integerValue(firstValue(variant, ["weightGrams", "weight_grams", "grams", "weight"])),
      inventoryPolicy: pricePaise === 0 ? "MADE_TO_ORDER" : "DENY",
      isActive: availability(firstValue(variant, ["available", "isAvailable", "inStock", "in_stock", "availability", "stock_status"])),
      sortOrder: index,
    };
  });
}

/** Maps a parsed Ranbazaar product JSON record (from API or __NEXT_DATA__). */
export function mapRanbazaarProductRecord(rawRecord: unknown, sourceSlug?: string): ImportedExternalProduct {
  const record = objectRecord(rawRecord);
  const title = sourceString(firstValue(record, ["name", "product_name", "productName", "title"]));
  const externalId = sourceString(firstValue(record, ["id", "_id", "product_id", "productId", "slug"])) ?? sourceSlug;
  if (!title) throw new Error(`Ranbazaar product ${sourceSlug ?? "unknown"} has no title.`);
  if (!externalId) throw new Error(`Ranbazaar product ${sourceSlug ?? "unknown"} has no external id.`);
  if (title.length > 180) throw new Error(`Ranbazaar title exceeds Product.name's 180-character limit: ${sourceSlug ?? title}.`);
  const description = sanitizeSourceHtml(firstValue(record, ["description", "product_description", "productDescription", "long_description", "longDescription", "details"]));
  const variants = ranbazaarVariants(record, externalId, title);
  const baseVariant = variants[0];
  const tagsValue = firstValue(record, ["tags", "tag", "product_tags", "productTags", "metaTags"]);
  const tags = Array.isArray(tagsValue)
    ? tagsValue.flatMap((tag) => sourceString(tag) ?? [])
    : uniqueStrings((stringValue(tagsValue) ?? "").split(","));
  const categoryHints = valueAsCategoryHints(firstValue(record, ["categories", "category", "category_name", "categoryName", "category_slug", "categorySlug"]));
  const pkg = firstValue(record, ["package", "packageDetails"]);
  const specs = sourceSpecs(record);
  const dimensions = (specs || pkg) ? { ...(specs ?? {}), ...(pkg ? { package: pkg } : {}) } : null;

  return {
    source: "ranbazaar",
    externalId,
    externalKey: deriveExternalKey("ranbazaar", externalId),
    title,
    description,
    shortDescription: sourceShortDescription(description),
    tags,
    images: imageRecords(extractRanbazaarImages(record), title),
    variants,
    basePricePaise: baseVariant?.pricePaise ?? 0,
    compareAtPricePaise: baseVariant?.compareAtPricePaise ?? null,
    categoryHints,
    dimensions,
  };
}

/** Parses a server-rendered Ranbazaar product page without executing source JavaScript. */
export function mapRanbazaarProductPage(html: string, sourceSlug: string): ImportedExternalProduct {
  const record = likelyProductRecord(extractNextData(html));
  return mapRanbazaarProductRecord(record, sourceSlug);
}

export function extractRanbazaarProductSlugs(html: string) {
  const result = new Set<string>();
  const productLink = /(?:https?:\/\/[^/]+)?\/product\/([A-Za-z0-9][A-Za-z0-9._~-]*)/gi;
  for (const match of html.matchAll(productLink)) result.add(decodeURIComponent(match[1]));
  return [...result].sort((left, right) => left.localeCompare(right, "en"));
}

export function extractRanbazaarCategoryUrls(html: string) {
  const result = new Set<string>();
  const categoryLink = /(?:https?:\/\/[^/]+)?(\/(?:category|categories)\/[A-Za-z0-9][A-Za-z0-9._~\/-]*)/gi;
  for (const match of html.matchAll(categoryLink)) result.add(match[1]);
  return [...result].sort((left, right) => left.localeCompare(right, "en"));
}
