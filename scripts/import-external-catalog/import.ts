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

interface SourceResult {
  source: ExternalCatalogSource;
  products: ImportedExternalProduct[];
  failures: FetchFailure[];
  probe: ProbeFinding;
  unmappedEzpacHandles: string[];
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
}

function usage(message?: string): never {
  if (message) console.error(message);
  console.error("Usage: npm run import:external-catalog -- --source=ezpac|ranbazaar|both [--dry-run] [--publish] [--offline]");
  process.exit(2);
}

function parseArgs(args: readonly string[]): CliOptions {
  let source: CliOptions["source"] = "both";
  let dryRun = false;
  let publish = false;
  let offline = false;
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
    } else {
      usage(`Unknown argument: ${arg}`);
    }
  }
  return { source, dryRun, publish, offline };
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
    return {
      source: "ezpac",
      products,
      failures: [],
      unmappedEzpacHandles: ezpacMappingCoverage(products),
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
  return {
    source: "ezpac",
    products,
    failures: [],
    unmappedEzpacHandles,
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
) {
  return prisma.$transaction(async (tx) => {
    const categoryIds = await resolveCategories(tx, product, categoriesCache);
    const categoryId = categoryIds[0];
    if (!categoryId) throw new Error(`No category could be resolved for ${product.externalKey}.`);
    const now = new Date();
    const existingMetadata = objectRecord(existing?.metadata);
    const metadata = asJson({
      ...existingMetadata,
      importSource: product.source,
      externalId: product.externalId,
      externalKey: product.externalKey,
      externalSlug: slug,
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
      material: null,
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
      await tx.productVariant.upsert({
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
      });
    }
    await tx.productVariant.updateMany({
      where: { productId: saved.id, sku: { startsWith: sourceSkuPrefix(product.source, product.externalId) }, ...(desiredSkus.size ? { sku: { startsWith: sourceSkuPrefix(product.source, product.externalId), notIn: [...desiredSkus] } } : {}) },
      data: { isActive: false },
    });
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
              saved = await upsertImportedProduct(prisma, product, existing, slug, options.publish, categoriesCache);
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
      summaries.push({ source: result.source, discovered: result.products.length, created, updated, failed: failures, unmappedEzpacHandles: result.unmappedEzpacHandles });
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
