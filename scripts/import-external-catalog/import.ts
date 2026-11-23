/**
 * One-off external catalog importer.
 *
 * Variants deliberately receive deterministic source-owned SKUs:
 * EXT-{SOURCE}-{externalId}-{variantOrdinal}. Variant 1 is also Product.baseSku.
 * Imported products start as DRAFT unless --publish is explicitly passed.
 */
import "../../prisma/load-env";

import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../../src/generated/prisma/client";
import {
  EZPAC_INDUSTRY_COLLECTION_PRESETS,
  EZPAC_PACKAGING_PRODUCT_TYPE_PRESETS,
} from "../../src/lib/ezpac-packaging-presets";
import {
  EZPAC_SHOPIFY_PRODUCT_MAPPING,
} from "../../src/lib/ezpac-product-mapping";
import { EZPAC_FEATURE_BULLET_LABELS } from "../../src/lib/ezpac-feature-bullets";
import {
  curatedCategorySlugForImport,
  importCategoryPendingReason,
} from "../../src/lib/imported-category-mapping";
import {
  findRanBazaarCategoryMatch,
  flattenRanBazaarTaxonomy,
  getRanBazaarCategoryGroup,
  type CatalogCategoryIdentity,
} from "../../src/lib/ranbazaar-category-presets";
import {
  deriveExternalKey,
  extractNextData,
  extractRanbazaarCategoryUrls,
  extractRanbazaarProductSlugs,
  mapEzpacProduct,
  mapRanbazaarProductPage,
  mapRanbazaarProductRecord,
  nextAvailableSlug,
  objectRecord,
  slugifyCatalogTitle,
  stringValue,
  type ExternalCatalogSource,
  type ImportedExternalProduct,
} from "./catalog-import";
import { STUDIO_PHOTO_UPLOAD, studioPrintArea, withMeasuredMockups, writeStudioPlan } from "./studio-writer";
import { studioEditedInAdmin } from "../../src/lib/studio-design";
import { saveMockupSizes, loadMockupSizes } from "./mockup-sizes";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const ROOT = process.cwd();
const EZPAC_SNAPSHOT = join(ROOT, "docs", "research", "ezpac", "products.json");
const RANBAZAAR_RESEARCH = join(ROOT, "docs", "research", "ranbazaar");
const PLAN_PATH = join(ROOT, "docs", "research", `import-plan-${new Date().toISOString().slice(0, 10)}.json`);
const PROBE_PATH = join(ROOT, "docs", "research", "import-probe.md");
const WAIT_MS = 1_000;
const RETRY_MS = 5_000;

interface CliOptions {
  source: "ezpac" | "ranbazaar" | "both";
  dryRun: boolean;
  publish: boolean;
  offline: boolean;
  /** Reset designs edited in the admin design editor back to the source. */
  forceStudio: boolean;
}

interface FetchFailure {
  source: ExternalCatalogSource;
  slug: string;
  url: string;
  reason: string;
}

interface ProbeFinding {
  source: ExternalCatalogSource;
  details: string[];
}

interface PriceFloorMismatch {
  handle: string;
  mappingPriceRupees: number;
  livePricePaise: number;
}

interface SourceResult {
  source: ExternalCatalogSource;
  products: ImportedExternalProduct[];
  failures: FetchFailure[];
  probe: ProbeFinding;
  unmappedEzpacHandles: string[];
  priceFloorMismatches?: PriceFloorMismatch[];
}

/**
 * Applies the one-time EzPac mapping prefills (structured copy, material, feature
 * labels) to a mapped product. Price prefills are sanity-checked only — the live
 * price always wins (0 means quote-only on the source site).
 */
function applyEzpacPrefills(product: ImportedExternalProduct): PriceFloorMismatch | null {
  const mapping = EZPAC_SHOPIFY_PRODUCT_MAPPING.find((entry) => entry.shopifyHandle === product.sourceHandle);
  if (!mapping) return null;
  const prefills = mapping.prefills;
  if (prefills.materialHint) product.material = prefills.materialHint;
  const structured = {
    ...(prefills.intro ? { intro: prefills.intro } : {}),
    ...(prefills.bestFor?.length ? { bestFor: [...prefills.bestFor] } : {}),
    ...(prefills.featureBullets?.length ? { featureBullets: [...prefills.featureBullets] } : {}),
  };
  if (Object.keys(structured).length) product.structuredDescription = structured;
  if (prefills.featureBullets?.length) {
    product.features = prefills.featureBullets
      .map((bullet) => EZPAC_FEATURE_BULLET_LABELS[bullet])
      .filter((label): label is string => Boolean(label));
  }
  // The source's whole value proposition for packaging types is custom branding.
  if (mapping.presetId) product.customizable = true;
  return prefills.priceRupees > 0 && product.basePricePaise === 0
    ? { handle: mapping.shopifyHandle, mappingPriceRupees: prefills.priceRupees, livePricePaise: product.basePricePaise }
    : null;
}

function applyEzpacPrefillsToAll(products: ImportedExternalProduct[]): PriceFloorMismatch[] {
  return products.flatMap((product) => {
    const mismatch = applyEzpacPrefills(product);
    return mismatch ? [mismatch] : [];
  });
}

function fidelitySummary(products: readonly ImportedExternalProduct[]) {
  return {
    productsWithPersonalizationFields: products.filter((p) => (p.personalizationFields?.length ?? 0) > 0).length,
    personalizationFieldsTotal: products.reduce((n, p) => n + (p.personalizationFields?.length ?? 0), 0),
    photoSlotProducts: products.flatMap((p) => (p.skippedPhotoSlots ?? 0) > 0 ? [{ externalKey: p.externalKey, slots: p.skippedPhotoSlots }] : []),
    personalizationOverflow: products.flatMap((p) => (p.personalizationOverflow ?? 0) > 0 ? [{ externalKey: p.externalKey, overflow: p.personalizationOverflow }] : []),
    bulkTierProducts: products.filter((p) => (p.bulkPriceTiers?.length ?? 0) > 0).length,
    inventoryVariants: products.reduce((n, p) => n + p.variants.filter((v) => v.inventoryPolicy === "CONTINUE" && (v.onHand ?? 0) > 0).length, 0),
    madeToOrderVariants: products.reduce((n, p) => n + p.variants.filter((v) => v.inventoryPolicy === "MADE_TO_ORDER").length, 0),
    taxedProducts: products.filter((p) => (p.taxRateBasisPoints ?? 0) > 0).length,
    seoTitleProducts: products.filter((p) => p.seoTitle).length,
    seoDescriptionProducts: products.filter((p) => p.seoDescription).length,
    seoTruncatedProducts: products.flatMap((p) => p.seoTruncated ? [p.externalKey] : []),
    materialProducts: products.filter((p) => p.material).length,
    structuredDescriptionProducts: products.filter((p) => p.structuredDescription).length,
    customizableProducts: products.filter((p) => p.customizable || (p.personalizationFields?.length ?? 0) > 0).length,
    curatedCategoryMoves: products.filter((p) => p.categoryHints.some((hint) => curatedCategorySlugForImport(slugifyCatalogTitle(hint)))).length,
    pendingCategoryBuckets: [...new Set(products.flatMap((p) => p.categoryHints.flatMap((hint) => {
      const reason = importCategoryPendingReason(slugifyCatalogTitle(hint));
      return reason ? [`${hint} — ${reason}`] : [];
    })))],
  };
}

interface ExistingImportedProduct {
  id: string;
  slug: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  publishedAt: Date | null;
  metadata: Prisma.JsonValue | null;
}

interface PlanRow {
  source: ExternalCatalogSource;
  externalId: string;
  title: string;
  categories: number;
  images: number;
  variants: number;
  pricePaise: number;
  action: "NEW" | "UPDATE";
  slug: string;
}

interface SourceRunSummary {
  source: ExternalCatalogSource;
  discovered: number;
  created: number;
  updated: number;
  failed: FetchFailure[];
  unmappedEzpacHandles: string[];
  fidelity: ReturnType<typeof fidelitySummary>;
  priceFloorMismatches: PriceFloorMismatch[];
}

function usage(message?: string): never {
  if (message) console.error(message);
  console.error("Usage: npm run import:external-catalog -- --source=ezpac|ranbazaar|both [--dry-run] [--publish] [--offline] [--force-studio]");
  process.exit(2);
}

function parseArgs(args: readonly string[]): CliOptions {
  let source: CliOptions["source"] = "both";
  let dryRun = false;
  let publish = false;
  let offline = false;
  let forceStudio = false;
  for (const arg of args) {
    if (arg.startsWith("--source=")) {
      const candidate = arg.slice("--source=".length);
      if (candidate !== "ezpac" && candidate !== "ranbazaar" && candidate !== "both") usage(`Invalid --source value: ${candidate}`);
      source = candidate;
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--publish") {
      publish = true;
    } else if (arg === "--offline") {
      offline = true;
    } else if (arg === "--force-studio") {
      forceStudio = true;
    } else {
      usage(`Unknown argument: ${arg}`);
    }
  }
  return { source, dryRun, publish, offline, forceStudio };
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function sleep(milliseconds: number) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

async function fetchWithRetries(url: string, init?: RequestInit, retries = 3) {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, init);
      if (response.ok) return response;
      lastError = new Error(`${response.status} ${response.statusText}`.trim());
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
    if (attempt < retries) await sleep(RETRY_MS);
  }
  throw lastError ?? new Error("Fetch failed without an error response.");
}

function readJsonFile(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sourceProductsFromEzpacSnapshot() {
  const snapshot = objectRecord(readJsonFile(EZPAC_SNAPSHOT));
  const products = Array.isArray(snapshot.products) ? snapshot.products : [];
  return products.map((product) => mapEzpacProduct(objectRecord(product)));
}

function ezpacMappingCoverage(products: readonly ImportedExternalProduct[]) {
  const known = new Set(EZPAC_SHOPIFY_PRODUCT_MAPPING.map((entry) => entry.shopifyHandle));
  return products.flatMap((product) => product.sourceHandle && !known.has(product.sourceHandle) ? [product.sourceHandle] : []);
}

async function fetchEzpac(offline: boolean): Promise<SourceResult> {
  if (offline) {
    const products = sourceProductsFromEzpacSnapshot();
    const priceFloorMismatches = applyEzpacPrefillsToAll(products);
    return {
      source: "ezpac",
      products,
      failures: [],
      unmappedEzpacHandles: ezpacMappingCoverage(products),
      priceFloorMismatches,
      probe: {
        source: "ezpac",
        details: [`Offline snapshot contains ${products.length} products. Live endpoint was not contacted.`],
      },
    };
  }

  const rawPages: unknown[] = [];
  const products: ImportedExternalProduct[] = [];
  for (let page = 1; ; page += 1) {
    const url = `https://ezpac.in/products.json?limit=250&page=${page}`;
    const response = await fetchWithRetries(url);
    const payload = objectRecord(await response.json());
    const rows = Array.isArray(payload.products) ? payload.products : [];
    if (!rows.length) break;
    rawPages.push(payload);
    products.push(...rows.map((row) => mapEzpacProduct(objectRecord(row))));
  }

  const unmappedEzpacHandles = ezpacMappingCoverage(products);
  const snapshotIsMissing = !existsSync(EZPAC_SNAPSHOT);
  const snapshotIsStale = !snapshotIsMissing && Date.now() - statSync(EZPAC_SNAPSHOT).mtimeMs > 1000 * 60 * 60 * 24 * 30;
  if (snapshotIsMissing || unmappedEzpacHandles.length) {
    writeJson(EZPAC_SNAPSHOT, {
      products: rawPages.flatMap((page) => {
        const rows = objectRecord(page).products;
        return Array.isArray(rows) ? rows : [];
      }),
    });
  }
  const priceFloorMismatches = applyEzpacPrefillsToAll(products);
  return {
    source: "ezpac",
    products,
    failures: [],
    unmappedEzpacHandles,
    priceFloorMismatches,
    probe: {
      source: "ezpac",
      details: [
        `GET /products.json?limit=250 returned ${products.length} products across ${rawPages.length} non-empty page(s).`,
        snapshotIsMissing || unmappedEzpacHandles.length
          ? `Updated the research snapshot (${snapshotIsMissing ? "missing" : "new unmapped handles"}).`
          : `Kept the existing research snapshot${snapshotIsStale ? " (stale but mapping coverage is unchanged)" : ""}.`,
      ],
    },
  };
}

function bundlePathFromHome(html: string) {
  return html.match(/<script\b[^>]*\bsrc=["']([^"']*\/static\/js\/main\.[^"']+\.js)["'][^>]*>/i)?.[1] ?? null;
}

function sourceUrl(path: string) {
  return new URL(path, "https://ranbazaar.com").toString();
}

function findingTextForListing(html: string) {
  const match = html.match(/(?:showing|products?)\s+(\d+)\s+(?:of|\/|out of)\s+(\d+)/i);
  return match ? `Listing reports ${match[1]} of ${match[2]}.` : "No server-rendered listing total was found.";
}

async function fetchRanbazaar(offline: boolean): Promise<SourceResult> {
  const homePath = join(RANBAZAAR_RESEARCH, "home.html");
  const bundleSnapshotPath = join(RANBAZAAR_RESEARCH, "main.js");
  const productSnapshots = join(RANBAZAAR_RESEARCH, "products");

  if (offline) {
    const products: ImportedExternalProduct[] = [];
    if (existsSync(productSnapshots)) {
      const files = readdirSync(productSnapshots).filter((f) => f.endsWith(".json"));
      for (const file of files) {
        try {
          const snapshot = objectRecord(readJsonFile(join(productSnapshots, file)));
          const rawProduct = snapshot.product ?? snapshot.nextData ?? snapshot;
          products.push(mapRanbazaarProductRecord(rawProduct, file.replace(/\.json$/, "")));
        } catch {}
      }
    }
    return {
      source: "ranbazaar",
      products,
      failures: products.length ? [] : [{
        source: "ranbazaar",
        slug: "(discovery)",
        url: "https://ranbazaar.com/",
        reason: "Offline product snapshots contain no products; live discovery is required.",
      }],
      unmappedEzpacHandles: [],
      probe: {
        source: "ranbazaar",
        details: [
          `Offline product snapshots: ${products.length} product(s) in docs/research/ranbazaar/products/.`,
          "Live product pages and list API were not contacted.",
        ],
      },
    };
  }

  const failures: FetchFailure[] = [];
  const homeResponse = await fetchWithRetries("https://ranbazaar.com/");
  const home = await homeResponse.text();
  const previousHome = existsSync(homePath) ? readFileSync(homePath, "utf8") : "";
  const currentBundle = bundlePathFromHome(home);
  const previousBundle = bundlePathFromHome(previousHome);
  if (!existsSync(homePath) || currentBundle !== previousBundle) {
    mkdirSync(RANBAZAAR_RESEARCH, { recursive: true });
    writeFileSync(homePath, home, "utf8");
    if (currentBundle) {
      const bundleResponse = await fetchWithRetries(sourceUrl(currentBundle));
      writeFileSync(bundleSnapshotPath, await bundleResponse.text(), "utf8");
    }
  }

  const allProductsResponse = await fetch("https://api.ckbox.io/api/allproducts", { method: "POST" }).catch((error) => error);
  const allProductsStatus = allProductsResponse instanceof Response ? allProductsResponse.status : "network error";

  // Paginated enumeration via POST https://ranbazaar.com/api/products
  const rawProducts: unknown[] = [];
  let pagesCount = 0;
  for (let page = 1; ; page += 1) {
    try {
      const response = await fetchWithRetries("https://ranbazaar.com/api/products", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ page }),
      });
      const data = objectRecord(await response.json());
      const list = Array.isArray(data.list) ? data.list : [];
      if (!list.length) break;
      pagesCount += 1;
      rawProducts.push(...list);
    } catch (error) {
      failures.push({
        source: "ranbazaar",
        slug: `(page-${page})`,
        url: "https://ranbazaar.com/api/products",
        reason: error instanceof Error ? error.message : String(error),
      });
      break;
    }
  }

  const seenKeys = new Set<string>();
  const products: ImportedExternalProduct[] = [];
  mkdirSync(productSnapshots, { recursive: true });

  for (const raw of rawProducts) {
    const rawRecord = objectRecord(raw);
    const slug = stringValue(rawRecord.slug) ?? stringValue(rawRecord.id);
    const id = stringValue(rawRecord.id) ?? slug;
    if (!id || seenKeys.has(id)) continue;
    seenKeys.add(id);

    try {
      const mapped = mapRanbazaarProductRecord(rawRecord, slug ?? undefined);
      products.push(mapped);
      if (slug) {
        writeJson(join(productSnapshots, `${slug.replace(/[^A-Za-z0-9._-]+/g, "-")}.json`), {
          url: sourceUrl(`/product/${encodeURIComponent(slug)}`),
          product: rawRecord,
        });
      }
    } catch (error) {
      failures.push({
        source: "ranbazaar",
        slug: slug ?? "(unknown)",
        url: sourceUrl(`/product/${encodeURIComponent(slug ?? "")}`),
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    source: "ranbazaar",
    products,
    failures,
    unmappedEzpacHandles: [],
    probe: {
      source: "ranbazaar",
      details: [
        `Homepage bundle: ${currentBundle ?? "not found"}.`,
        `POST https://api.ckbox.io/api/allproducts: ${allProductsStatus}.`,
        `POST https://ranbazaar.com/api/products: enumerated ${products.length} products across ${pagesCount} page(s).`,
        `Saved product snapshot JSONs to docs/research/ranbazaar/products/.`,
      ],
    },
  };
}

function metadataIdentity(metadata: Prisma.JsonValue | null): {
  source: ExternalCatalogSource;
  externalId: string | null;
} | null {
  const record = objectRecord(metadata);
  const importSource = typeof record.importSource === "string" ? record.importSource : null;
  const externalId = typeof record.externalId === "string" ? record.externalId : null;
  return importSource === "ezpac" || importSource === "ranbazaar"
    ? { source: importSource as ExternalCatalogSource, externalId }
    : null;
}

async function existingImports(prisma: PrismaClient) {
  const [products, categories] = await Promise.all([
    prisma.product.findMany({
      select: { id: true, slug: true, status: true, publishedAt: true, metadata: true },
    }),
    prisma.category.findMany({ select: { slug: true } }),
  ]);
  const imported = new Map<string, ExistingImportedProduct>();
  for (const product of products) {
    const identity = metadataIdentity(product.metadata);
    if (identity?.externalId) imported.set(deriveExternalKey(identity.source, identity.externalId), product);
  }
  return {
    imported,
    usedSlugs: new Set(products.map((product) => product.slug)),
    categorySlugs: new Set(categories.map((category) => category.slug)),
  };
}

function plannedCategoryCount(product: ImportedExternalProduct, categorySlugs: ReadonlySet<string>) {
  if (product.source === "ranbazaar") return 1;
  const mapping = EZPAC_SHOPIFY_PRODUCT_MAPPING.find(
    (entry) => entry.shopifyHandle === product.sourceHandle && entry.shopifyTitle === product.title,
  );
  const mappedType = mapping?.presetId
    ? EZPAC_PACKAGING_PRODUCT_TYPE_PRESETS.find((preset) => preset.id === mapping.presetId)
    : undefined;
  if (!mappedType || !categorySlugs.has(mappedType.primarySubcategoryId)) return 1;
  return 1 + mappedType.collectionIds.filter((collectionId) => {
    const collection = EZPAC_INDUSTRY_COLLECTION_PRESETS.find((candidate) => candidate.id === collectionId);
    return Boolean(collection && categorySlugs.has(`collection-${collection.slug}`));
  }).length;
}

function sourceSkuPrefix(source: ExternalCatalogSource, externalId: string) {
  const safeId = externalId.replace(/[^A-Za-z0-9-]+/g, "-").replace(/(^-|-$)/g, "");
  return `EXT-${source === "ezpac" ? "EZPAC" : "RANBAZAAR"}-${safeId}-`;
}

function categorySortOrder(name: string) {
  let hash = 0;
  for (const character of name.toLocaleLowerCase("en-IN")) hash = (hash * 31 + character.charCodeAt(0)) % 1_000_000;
  return hash;
}

function categoryBySlug(categories: readonly CatalogCategoryIdentity[], slug: string) {
  return categories.find((category) => category.slug === slug);
}

function categoryByName(categories: readonly CatalogCategoryIdentity[], name: string, parentId: string | null) {
  const normalized = name.trim().toLocaleLowerCase("en-IN");
  return categories.find((category) => category.parentId === parentId && category.name.trim().toLocaleLowerCase("en-IN") === normalized);
}

function nextCategorySlug(preferred: string, categories: readonly CatalogCategoryIdentity[]) {
  return nextAvailableSlug(preferred, new Set(categories.map((category) => category.slug)));
}

async function ensureFallbackCategory(
  tx: Prisma.TransactionClient,
  categories: CatalogCategoryIdentity[],
  source: ExternalCatalogSource,
  hint: string,
) {
  const sourceName = source === "ezpac" ? "EzPac" : "Ranbazaar";
  const parentName = `Imported · ${sourceName}`;
  const parentSlug = `imported-${source}`;
  let parent = categoryBySlug(categories, parentSlug) ?? categoryByName(categories, parentName, null);
  if (!parent) {
    parent = await tx.category.create({
      data: {
        name: parentName,
        slug: nextCategorySlug(parentSlug, categories),
        parentId: null,
        isActive: true,
        sortOrder: categorySortOrder(parentName),
      },
      select: { id: true, name: true, slug: true, parentId: true },
    });
    categories.push(parent);
  }

  const childName = hint.trim() || "Unclassified";
  let child = categoryByName(categories, childName, parent.id);
  if (!child) {
    child = await tx.category.create({
      data: {
        name: childName.slice(0, 120),
        slug: nextCategorySlug(slugifyCatalogTitle(childName) || "unclassified", categories),
        parentId: parent.id,
        isActive: true,
        sortOrder: categorySortOrder(childName),
      },
      select: { id: true, name: true, slug: true, parentId: true },
    });
    categories.push(child);
  }
  return child;
}

async function resolveEzpacCategories(
  tx: Prisma.TransactionClient,
  product: ImportedExternalProduct,
  categories: CatalogCategoryIdentity[],
) {
  const mapping = EZPAC_SHOPIFY_PRODUCT_MAPPING.find(
    (entry) => entry.shopifyHandle === product.sourceHandle && entry.shopifyTitle === product.title,
  );
  const mappedType = mapping?.presetId
    ? EZPAC_PACKAGING_PRODUCT_TYPE_PRESETS.find((preset) => preset.id === mapping.presetId)
    : undefined;
  if (mappedType) {
    const primary = categoryBySlug(categories, mappedType.primarySubcategoryId);
    if (primary) {
      const collectionIds = mappedType.collectionIds.flatMap((collectionId) => {
        const collection = EZPAC_INDUSTRY_COLLECTION_PRESETS.find((candidate) => candidate.id === collectionId);
        const category = collection && categoryBySlug(categories, `collection-${collection.slug}`);
        return category ? [category.id] : [];
      });
      return [primary.id, ...collectionIds];
    }
  }
  const fallback = await ensureFallbackCategory(tx, categories, "ezpac", product.categoryHints[0] ?? "Unclassified");
  return [fallback.id];
}

async function resolveRanbazaarCategories(
  tx: Prisma.TransactionClient,
  product: ImportedExternalProduct,
  categories: CatalogCategoryIdentity[],
) {
  // A curated home beats an import bucket: the product keeps its slug and simply
  // moves onto a real shelf. Unknown future source categories still fall back.
  const curated = product.categoryHints.flatMap((hint) => {
    const destination = curatedCategorySlugForImport(slugifyCatalogTitle(hint));
    const category = destination ? categories.find((candidate) => candidate.slug === destination) : undefined;
    return category ? [category.id] : [];
  });
  if (curated.length) return [...new Set(curated)];

  const taxonomy = flattenRanBazaarTaxonomy().filter((entry) => entry.kind === "category");
  const resolved = product.categoryHints.flatMap((hint) => {
    const normalized = slugifyCatalogTitle(hint);
    const preset = taxonomy.find((candidate) => candidate.slug === normalized || candidate.name.toLocaleLowerCase("en-IN") === hint.toLocaleLowerCase("en-IN"));
    if (!preset) return [];
    // The group lookup preserves the established Ranbazaar taxonomy as the source of truth.
    const group = getRanBazaarCategoryGroup(preset.id);
    const candidate = findRanBazaarCategoryMatch(group ?? preset, categories);
    return candidate ? [candidate.id] : [];
  });
  if (resolved.length) return [...new Set(resolved)];
  const fallback = await ensureFallbackCategory(tx, categories, "ranbazaar", product.categoryHints[0] ?? "Unclassified");
  return [fallback.id];
}

async function resolveCategories(
  tx: Prisma.TransactionClient,
  product: ImportedExternalProduct,
  categoriesCache: CatalogCategoryIdentity[],
) {
  if (!categoriesCache.length) {
    const fetched = await tx.category.findMany({
      select: { id: true, name: true, slug: true, parentId: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    categoriesCache.push(...fetched);
  }
  return product.source === "ezpac"
    ? resolveEzpacCategories(tx, product, categoriesCache)
    : resolveRanbazaarCategories(tx, product, categoriesCache);
}

async function upsertImportedProduct(
  prisma: PrismaClient,
  product: ImportedExternalProduct,
  existing: ExistingImportedProduct | undefined,
  slug: string,
  publish: boolean,
  categoriesCache: CatalogCategoryIdentity[],
  forceStudio = false,
) {
  // Designs edited in the admin design editor are kept (with their fields, print area and
  // upload settings); the importer refreshes everything else about the product.
  const keepAdminStudio = Boolean(product.studioPlan) && studioEditedInAdmin(existing?.metadata) && !forceStudio;
  // A new mockup needs its size before its design canvas can be laid out (network, so before the transaction).
  if (!keepAdminStudio && product.studioPlan?.unmeasuredMockups.length) {
    const studioPlan = await withMeasuredMockups(product.studioPlan);
    if (studioPlan.unmeasuredMockups.length < product.studioPlan.unmeasuredMockups.length) saveMockupSizes(loadMockupSizes());
    product = { ...product, studioPlan };
  }
  return prisma.$transaction(async (tx) => {
    const categoryIds = await resolveCategories(tx, product, categoriesCache);
    const categoryId = categoryIds[0];
    if (!categoryId) throw new Error(`No category could be resolved for ${product.externalKey}.`);
    const now = new Date();
    const existingMetadata = objectRecord(existing?.metadata);
    const existingConfigurator = objectRecord(existingMetadata.configurator);
    const quantityTiers = (product.bulkPriceTiers ?? []).map((tier) => ({
      minimum: tier.minimum,
      priceDelta: (tier.pricePaise - product.basePricePaise) / 100,
    }));
    const configurator = {
      // 3D enablement keys (allow3D/previewTemplate/productModel/visualization) are owned
      // by the visualization publish flow; re-imports must never clobber them.
      ...existingConfigurator,
      allow2D: true,
      allow3D: product.source === "ranbazaar" ? false : existingConfigurator.allow3D === true,
      quantityMin: 1,
      quantityMax: 100,
      quantityTiers,
      setupCharge: 0,
      // A studio design surface always carries a size; nothing else is invented here.
      printAreas: keepAdminStudio && Array.isArray(existingConfigurator.printAreas)
        ? existingConfigurator.printAreas
        : product.studioPlan?.templates.length ? [studioPrintArea(product.studioPlan)] : [{ id: "primary", label: "Primary print area" }],
      // Photo slots on the designs need uploads.
      ...(!keepAdminStudio && product.studioPlan?.acceptsPhotos ? STUDIO_PHOTO_UPLOAD : {}),
      ...(product.structuredDescription ? { structuredDescription: product.structuredDescription } : {}),
    };
    const metadata = asJson({
      ...existingMetadata,
      importSource: product.source,
      externalId: product.externalId,
      externalKey: product.externalKey,
      externalSlug: slug,
      configurator,
      ...(product.features?.length ? { features: product.features } : {}),
    });
    const baseSku = product.variants[0]?.sku ?? sourceSkuPrefix(product.source, product.externalId).concat("1");
    const data = {
      categoryId,
      name: product.title,
      slug,
      baseSku,
      status: publish ? "ACTIVE" as const : existing?.status ?? "DRAFT" as const,
      shortDescription: product.shortDescription,
      description: product.description,
      basePricePaise: product.basePricePaise,
      compareAtPricePaise: product.compareAtPricePaise,
      customizable: product.customizable === true || (product.personalizationFields?.length ?? 0) > 0,
      material: product.material?.slice(0, 160) ?? null,
      taxRateBasisPoints: product.taxRateBasisPoints ?? 0,
      taxCode: product.taxCode ?? null,
      seoTitle: product.seoTitle ?? null,
      seoDescription: product.seoDescription ?? null,
      dimensions: product.dimensions ? asJson(product.dimensions) : Prisma.DbNull,
      packSize: 1,
      tags: product.tags,
      metadata,
      publishedAt: publish ? existing?.publishedAt ?? now : existing?.publishedAt ?? null,
    };
    const saved = existing
      ? await tx.product.update({ where: { id: existing.id }, data })
      : await tx.product.create({ data });
    await tx.productCategory.deleteMany({
      where: { productId: saved.id, categoryId: { notIn: categoryIds } },
    });
    await tx.productCategory.createMany({
      data: categoryIds.map((linkedCategoryId) => ({ productId: saved.id, categoryId: linkedCategoryId })),
      skipDuplicates: true,
    });

    const desiredImageOrders = product.images.map((image) => image.sortOrder);
    for (const image of product.images) {
      await tx.productImage.upsert({
        where: { productId_sortOrder: { productId: saved.id, sortOrder: image.sortOrder } },
        update: { url: image.url, altText: image.altText, width: image.width, height: image.height },
        create: { productId: saved.id, url: image.url, altText: image.altText, width: image.width, height: image.height, sortOrder: image.sortOrder },
      });
    }
    await tx.productImage.deleteMany({
      where: { productId: saved.id, ...(desiredImageOrders.length ? { sortOrder: { notIn: desiredImageOrders } } : {}) },
    });

    const desiredSkus = new Set(product.variants.map((variant) => variant.sku));
    for (const variant of product.variants) {
      const current = await tx.productVariant.findUnique({ where: { sku: variant.sku }, select: { id: true, productId: true } });
      if (current && current.productId !== saved.id) {
        throw new Error(`Variant SKU collision for ${variant.sku}; it belongs to a different product.`);
      }
      const savedVariant = await tx.productVariant.upsert({
        where: { sku: variant.sku },
        update: {
          productId: saved.id,
          name: variant.name,
          optionValues: asJson(variant.optionValues),
          pricePaise: variant.pricePaise,
          compareAtPricePaise: variant.compareAtPricePaise,
          weightGrams: variant.weightGrams,
          inventoryPolicy: variant.inventoryPolicy,
          isActive: variant.isActive,
          sortOrder: variant.sortOrder,
        },
        create: {
          productId: saved.id,
          sku: variant.sku,
          name: variant.name,
          optionValues: asJson(variant.optionValues),
          pricePaise: variant.pricePaise,
          compareAtPricePaise: variant.compareAtPricePaise,
          weightGrams: variant.weightGrams,
          inventoryPolicy: variant.inventoryPolicy,
          isActive: variant.isActive,
          sortOrder: variant.sortOrder,
        },
        select: { id: true },
      });
      if (variant.inventoryPolicy === "CONTINUE" && typeof variant.onHand === "number" && variant.onHand > 0) {
        await tx.inventory.upsert({
          where: { variantId: savedVariant.id },
          update: { quantityOnHand: variant.onHand, reorderPoint: 5 },
          create: { variantId: savedVariant.id, quantityOnHand: variant.onHand, reorderPoint: 5 },
        });
      } else {
        await tx.inventory.deleteMany({ where: { variantId: savedVariant.id } });
      }
    }
    await tx.productVariant.updateMany({
      where: { productId: saved.id, sku: { startsWith: sourceSkuPrefix(product.source, product.externalId) }, ...(desiredSkus.size ? { sku: { startsWith: sourceSkuPrefix(product.source, product.externalId), notIn: [...desiredSkus] } } : {}) },
      data: { isActive: false },
    });

    if (keepAdminStudio) {
      // The admin owns this product's designs and the fields they bind.
    } else if (product.studioPlan) {
      // Ranbazaar: design templates, their links and the fields they bind, in one pass.
      await writeStudioPlan(tx, saved.id, product.studioPlan);
    } else {
      const desiredFields = product.personalizationFields ?? [];
      for (const field of desiredFields) {
        await tx.productPersonalizationField.upsert({
          where: { productId_key: { productId: saved.id, key: field.key } },
          update: {
            label: field.label,
            inputType: field.inputType,
            isRequired: field.required,
            maxLength: field.maxLength,
            validation: field.validation ? asJson(field.validation) : Prisma.DbNull,
            sortOrder: field.sortOrder,
          },
          create: {
            productId: saved.id,
            key: field.key,
            label: field.label,
            inputType: field.inputType,
            isRequired: field.required,
            maxLength: field.maxLength,
            validation: field.validation ? asJson(field.validation) : Prisma.DbNull,
            sortOrder: field.sortOrder,
          },
        });
      }
      await tx.productPersonalizationField.deleteMany({
        where: {
          productId: saved.id,
          ...(desiredFields.length ? { key: { notIn: desiredFields.map((field) => field.key) } } : {}),
        },
      });
    }
    return saved;
  }, { maxWait: 15000, timeout: 60000 });
}

function printPlan(rows: readonly PlanRow[]) {
  for (const row of rows) {
    console.info(`${row.source} · ${row.externalId} · ${row.title} · ${row.categories} categories · ${row.images} images · ${row.variants} variants · ${row.pricePaise} paise · ${row.action} · ${row.slug}`);
  }
}

function writeProbe(findings: readonly ProbeFinding[], offline: boolean) {
  const body = [
    "# External catalog import probe",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    ...(offline ? ["Status: offline snapshot mode; no live endpoints were contacted.", ""] : []),
    ...findings.flatMap((finding) => [
      `## ${finding.source === "ezpac" ? "EzPac" : "Ranbazaar"}`,
      "",
      ...finding.details.map((detail) => `- ${detail}`),
      "",
    ]),
  ].join("\n");
  writeFileSync(PROBE_PATH, `${body}\n`, "utf8");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const requestedSources: ExternalCatalogSource[] = options.source === "both" ? ["ezpac", "ranbazaar"] : [options.source];
  const results: SourceResult[] = [];
  for (const source of requestedSources) {
    try {
      results.push(source === "ezpac" ? await fetchEzpac(options.offline) : await fetchRanbazaar(options.offline));
    } catch (error) {
      results.push({
        source,
        products: [],
        failures: [{ source, slug: "(source)", url: source === "ezpac" ? "https://ezpac.in/products.json" : "https://ranbazaar.com/", reason: error instanceof Error ? error.message : String(error) }],
        probe: { source, details: [`Source fetch failed: ${error instanceof Error ? error.message : String(error)}`] },
        unmappedEzpacHandles: [],
      });
    }
  }
  writeProbe(results.map((result) => result.probe), options.offline);

  const connectionString = (process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL)?.trim();
  if (!connectionString) throw new Error("DATABASE_URL_POOLED or DATABASE_URL is required for catalog planning and import.");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const state = await existingImports(prisma);
    const categoriesCache: CatalogCategoryIdentity[] = [];
    const rows: PlanRow[] = [];
    const summaries: SourceRunSummary[] = [];
    for (const result of results) {
      let created = 0;
      let updated = 0;
      const failures = [...result.failures];
      for (const product of result.products) {
        const existing = state.imported.get(product.externalKey);
        const previousSlug = typeof objectRecord(existing?.metadata).externalSlug === "string"
          ? String(objectRecord(existing?.metadata).externalSlug)
          : existing?.slug;
        const slug = previousSlug ?? nextAvailableSlug(slugifyCatalogTitle(product.title), state.usedSlugs);
        rows.push({
          source: product.source,
          externalId: product.externalId,
          title: product.title,
          categories: plannedCategoryCount(product, state.categorySlugs),
          images: product.images.length,
          variants: product.variants.length,
          pricePaise: product.basePricePaise,
          action: existing ? "UPDATE" : "NEW",
          slug,
        });
        if (existing) updated += 1;
        else {
          created += 1;
          state.usedSlugs.add(slug);
        }
        if (!options.dryRun) {
          let saved: Awaited<ReturnType<typeof upsertImportedProduct>> | undefined;
          let lastDbError: unknown;
          for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
              saved = await upsertImportedProduct(prisma, product, existing, slug, options.publish, categoriesCache, options.forceStudio);
              break;
            } catch (err) {
              lastDbError = err;
              if (attempt < 2) await sleep(1000);
            }
          }
          if (saved) {
            console.info(`WRITE ${product.externalKey} · ${saved.id} · ${existing ? "UPDATE" : "NEW"}`);
            state.imported.set(product.externalKey, { id: saved.id, slug: saved.slug, status: saved.status, publishedAt: saved.publishedAt, metadata: saved.metadata });
          } else {
            failures.push({ source: product.source, slug: product.sourceHandle ?? product.externalId, url: "database", reason: lastDbError instanceof Error ? lastDbError.message : String(lastDbError) });
            if (existing) updated -= 1;
            else created -= 1;
          }
        }
      }
      summaries.push({
        source: result.source,
        discovered: result.products.length,
        created,
        updated,
        failed: failures,
        unmappedEzpacHandles: result.unmappedEzpacHandles,
        fidelity: fidelitySummary(result.products),
        priceFloorMismatches: result.priceFloorMismatches ?? [],
      });
    }
    printPlan(rows);
    const plan = {
      generatedAt: new Date().toISOString(),
      options,
      rows,
      summaries,
      probes: results.map((result) => result.probe),
    };
    writeJson(PLAN_PATH, plan);
    for (const summary of summaries) {
      console.info(`${summary.source}: discovered ${summary.discovered}, created ${summary.created}, updated ${summary.updated}, failed ${summary.failed.length}.`);
      summary.unmappedEzpacHandles.forEach((handle) => console.warn(`UNMAPPED EzPac handle: ${handle}`));
      summary.priceFloorMismatches.forEach((mismatch) => console.warn(`PRICE FLOOR MISMATCH ${mismatch.handle}: mapping says ₹${mismatch.mappingPriceRupees}, live price is ${mismatch.livePricePaise} paise (live wins).`));
      summary.failed.forEach((failure) => console.error(`FAILED ${failure.source} · ${failure.slug} · ${failure.url} · ${failure.reason}`));
    }
    console.info(`Plan written to ${resolve(PLAN_PATH)}.`);
    if (summaries.some((summary) => summary.failed.length)) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
