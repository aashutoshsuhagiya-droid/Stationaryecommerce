/**
 * EzPac packaging specification import: captures the real Pacdora CPQ
 * configuration and measured prices from each ezpac.in product page, then stores
 * them as `metadata.configurator.packagingQuote` (see src/lib/packaging-quote.ts).
 *
 *   npm run import:external-catalog:ezpac-quotation                 # capture (resumable)
 *   npm run import:external-catalog:ezpac-quotation -- --recapture  # capture everything again
 *   npm run import:external-catalog:ezpac-quotation -- --apply --dry-run
 *   npm run import:external-catalog:ezpac-quotation -- --apply
 *   ... --only=<our slug>  limits either phase to one product
 *
 * Capture drives one headless Chrome session the way a visitor does: it opens a
 * product page, records the quotation request the Pacdora widget itself sends
 * (and the visitor token it uses), then asks the same endpoint for a dense
 * quantity ladder at the default options and for each non-default option of
 * every visible selection over the same ladder (~8 calls per product, spaced out).
 * Raw evidence goes to docs/research/ezpac/pacdora-quotations.json; the token is
 * never written anywhere.
 *
 * Apply maps each capture with ezpac-quotation-map.ts, re-predicts every measured
 * price and refuses a product whose prediction is off by more than one paisa. It
 * only sets `configurator.packagingQuote`; every other metadata key is kept.
 */
import "../../prisma/load-env";

import { PrismaPg } from "@prisma/adapter-pg";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import puppeteer, { type Browser, type HTTPRequest, type HTTPResponse, type Page } from "puppeteer-core";
import { PrismaClient } from "../../src/generated/prisma/client";
import { EZPAC_SHOPIFY_PRODUCT_MAPPING } from "../../src/lib/ezpac-product-mapping";
import {
  PACDORA_CAPTURE_VERSION,
  dielineKindForEzpacProduct,
  mapPacdoraCaptureToSpec,
  verifyPacdoraSpec,
  type PacdoraCaptureEntry,
  type PacdoraQuotationBody,
  type PacdoraQuotationPoint,
} from "./ezpac-quotation-map";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const ORIGIN = "https://ezpac.in";
const QUOTATION_URL = "https://cpq.pacdora.com/api/open/quotation";
const CAPTURE_FILE = join(process.cwd(), "docs", "research", "ezpac", "pacdora-quotations.json");
const REPORT_FILE = join(process.cwd(), "docs", "research", "ezpac", "pacdora-quotation-report.json");
const DENSE_QUANTITIES = [10, 25, 50, 75, 100, 150, 200, 250, 300, 400, 500, 600, 750, 900, 1000];
const PAGE_GAP_MS = 2_500;
const CALL_GAP_MS = 800;

interface CaptureFile {
  capturedWith: { origin: string; denseQuantities: number[]; note: string };
  app: { sizeUnit?: { defaultUnit?: string; selectableUnits?: string[] } } | null;
  products: Record<string, PacdoraCaptureEntry>;
}

type Json = Record<string, unknown>;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const objectRecord = (value: unknown): Json => (value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {});

function loadCapture(): CaptureFile {
  if (!existsSync(CAPTURE_FILE)) {
    return {
      capturedWith: {
        origin: ORIGIN,
        denseQuantities: DENSE_QUANTITIES,
        note: "Pacdora CPQ quotation form and prices as served to a visitor of each ezpac.in product page.",
      },
      app: null,
      products: {},
    };
  }
  return JSON.parse(readFileSync(CAPTURE_FILE, "utf8")) as CaptureFile;
}

function saveCapture(capture: CaptureFile) {
  const ordered = Object.fromEntries(Object.entries(capture.products).sort(([left], [right]) => left.localeCompare(right)));
  writeFileSync(CAPTURE_FILE, `${JSON.stringify({ ...capture, products: ordered }, null, 1)}\n`);
}

function createPrisma() {
  const connectionString = (process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL)?.trim();
  if (!connectionString) throw new Error("DATABASE_URL_POOLED or DATABASE_URL is required.");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

async function loadEzpacProducts(prisma: PrismaClient, only?: string) {
  const products = await prisma.product.findMany({
    where: { metadata: { path: ["importSource"], equals: "ezpac" }, ...(only ? { slug: only } : {}) },
    select: { id: true, slug: true, metadata: true },
    orderBy: { slug: "asc" },
  });
  const snapshot = JSON.parse(readFileSync(join(process.cwd(), "docs", "research", "ezpac", "products.json"), "utf8")) as {
    products?: Array<{ id?: unknown; handle?: unknown }>;
  };
  const handleById = new Map<string, string>();
  for (const row of snapshot.products ?? []) {
    if (row.id !== undefined && typeof row.handle === "string") handleById.set(String(row.id), row.handle);
  }
  return products.map((product) => {
    const metadata = objectRecord(product.metadata);
    const externalId = typeof metadata.externalId === "string" ? metadata.externalId : null;
    const handle = (externalId && handleById.get(externalId)) || (typeof metadata.externalSlug === "string" ? metadata.externalSlug : product.slug);
    return { ...product, handle, metadata };
  });
}

/** Per-page state filled in by request/response listeners. */
interface PageState {
  token: string | null;
  quotationBody: PacdoraQuotationBody | null;
  pageQuotation: PacdoraQuotationPoint[] | null;
  product: PacdoraCaptureEntry["product"];
  app: CaptureFile["app"];
}

function attachListeners(page: Page, state: PageState) {
  page.on("request", (request: HTTPRequest) => {
    const url = request.url();
    const authorization = request.headers().authorization;
    if (url.startsWith("https://cpq.pacdora.com/") && authorization?.startsWith("PacdoraOpen ")) state.token = authorization;
    if (url.startsWith(QUOTATION_URL) && request.method() === "POST" && !state.quotationBody) {
      try {
        state.quotationBody = JSON.parse(request.postData() ?? "null") as PacdoraQuotationBody;
      } catch {
        // A malformed body is reported as "no quotation captured".
      }
    }
  });
  page.on("response", async (response: HTTPResponse) => {
    const url = response.url();
    const method = response.request().method();
    if (method === "OPTIONS") return;
    try {
      if (url.startsWith("https://cpq.pacdora.com/api/open/product") && !state.product) {
        state.product = objectRecord((await response.json() as Json).data) as PacdoraCaptureEntry["product"];
      } else if (url.startsWith(QUOTATION_URL) && method === "POST" && !state.pageQuotation) {
        const data = (await response.json() as Json).data;
        if (Array.isArray(data)) state.pageQuotation = data as PacdoraQuotationPoint[];
      } else if (url.includes("api.pacdora.com/api/v2/open/v1/open/app") && !state.app) {
        const config = objectRecord(objectRecord((await response.json() as Json).data).config);
        const advanced = objectRecord(config.advancedEditor);
        const sizeUnit = objectRecord(advanced.sizeUnit ?? config.sizeUnit);
        state.app = { sizeUnit: { defaultUnit: typeof sizeUnit.defaultUnit === "string" ? sizeUnit.defaultUnit : undefined, selectableUnits: Array.isArray(sizeUnit.selectableUnits) ? sizeUnit.selectableUnits.filter((unit): unit is string => typeof unit === "string") : undefined } };
      }
    } catch {
      // Bodies of redirected or aborted responses are unavailable; nothing to record.
    }
  });
}

/** One quotation call from the page's own origin, with polite back-off. */
async function quote(page: Page, state: PageState, body: PacdoraQuotationBody): Promise<{ points: PacdoraQuotationPoint[] } | { error: string }> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await sleep(CALL_GAP_MS);
    const result = await page.evaluate(async (url, payload, authorization) => {
      try {
        const response = await fetch(url, { method: "POST", headers: { authorization, "content-type": "application/json" }, body: JSON.stringify(payload) });
        const text = await response.text();
        return { status: response.status, text };
      } catch (error) {
        return { status: 0, text: String(error) };
      }
    }, QUOTATION_URL, body, state.token ?? "");
    if (result.status === 429) {
      await sleep(10_000 * (attempt + 1));
      continue;
    }
    try {
      const parsed = JSON.parse(result.text) as { code?: number; msg?: string; data?: unknown };
      if (parsed.code === 200 && Array.isArray(parsed.data)) return { points: parsed.data as PacdoraQuotationPoint[] };
      return { error: `HTTP ${result.status} code ${parsed.code ?? "?"} ${parsed.msg ?? ""}`.trim() };
    } catch {
      return { error: `HTTP ${result.status} unreadable response` };
    }
  }
  return { error: "rate limited" };
}

async function captureProduct(browser: Browser, slug: string, handle: string): Promise<PacdoraCaptureEntry> {
  const capturedAt = new Date().toISOString();
  const base: PacdoraCaptureEntry = { version: PACDORA_CAPTURE_VERSION, slug, handle, capturedAt, modelId: null, quotationBody: null, product: null, pageQuotation: null, dense: null, options: [], selectorText: null };
  const page = await browser.newPage();
  const state: PageState = { token: null, quotationBody: null, pageQuotation: null, product: null, app: null };
  try {
    await page.setViewport({ width: 1440, height: 1000 });
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      const type = request.resourceType();
      const url = request.url();
      // The quotation form loads before any 3D asset; skip the heavy media to spare memory.
      if (type === "image" || type === "media" || type === "font" || /\.(hdr|wasm)(\?|$)/i.test(url)) void request.abort();
      else void request.continue();
    });
    attachListeners(page, state);
    await page.goto(`${ORIGIN}/products/${handle}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    for (let waited = 0; waited < 60 && !(state.quotationBody && state.product && state.pageQuotation); waited += 1) await sleep(1_000);
    const pageData = await page.evaluate(() => {
      const data = (window as unknown as { PRODUCT_DATA?: { variants?: Array<{ metafields?: { modelId?: string } }> } }).PRODUCT_DATA;
      return { hasProductData: Boolean(data), modelIds: (data?.variants ?? []).map((variant) => variant.metafields?.modelId ?? "").filter(Boolean) };
    });
    base.modelId = pageData.modelIds[0] ?? null;
    if (!state.quotationBody || !state.product?.quotationForm) {
      base.skipped = !pageData.hasProductData
        ? "The page has no Pacdora product data."
        : !base.modelId
          ? "The page names no Pacdora model."
          : "The Pacdora widget did not request a quotation.";
      return { ...base, product: state.product, quotationBody: state.quotationBody };
    }
    await sleep(2_000);
    base.selectorText = await page.evaluate(() => (document.querySelector(".pacdora-selector-box") as HTMLElement | null)?.innerText ?? null);
    base.quotationBody = state.quotationBody;
    base.product = {
      title: state.product.title,
      quotationSolutionId: state.product.quotationSolutionId,
      quotationForm: state.product.quotationForm,
    };
    base.pageQuotation = state.pageQuotation;
    if (state.app) capturedApp ??= state.app;

    const form = state.product.quotationForm;
    const minimum = Math.max(1, Number(form.quantity.minQuantity) || 1);
    const quantities = [...new Set([...DENSE_QUANTITIES, ...(form.quantity.options ?? []), minimum])]
      .filter((quantity) => quantity >= minimum && quantity <= 1_000)
      .sort((left, right) => left - right);
    const pageBody = state.quotationBody;
    let dense = await quote(page, state, { ...pageBody, quantity: quantities });
    if ("error" in dense) dense = await quote(page, state, { ...pageBody, quantity: quantities.filter((quantity) => quantity < 1_000) });
    if ("error" in dense) dense = await quote(page, state, { ...pageBody, quantity: quantities.filter((quantity) => (form.quantity.options ?? []).includes(quantity)) });
    if ("error" in dense) {
      base.skipped = `The quantity ladder could not be priced (${dense.error}).`;
      return base;
    }
    const priced = dense.points.filter((point) => typeof point.unit_price === "number" && Number.isFinite(point.unit_price));
    const keep = ({ quantity, unit_price, total_price, real_total_price }: PacdoraQuotationPoint) => ({ quantity, unit_price, total_price, real_total_price });
    base.dense = { quantities: priced.map((point) => point.quantity), points: priced.map(keep) };
    // Options are priced over the same ladder: the highest quantity carries the exact price.
    const ladder = base.dense.quantities;

    for (const selection of form.selections) {
      if (selection.hidden) continue;
      const index = pageBody.section.findIndex((section) => selection.options.some((option) => option.id === section.id));
      for (const option of selection.options) {
        if (pageBody.section[index]?.id === option.id || (index < 0 && option.id === selection.default)) continue;
        const section = index >= 0
          ? pageBody.section.map((entry, position) => (position === index ? { id: option.id } : entry))
          : [...pageBody.section, { id: option.id }];
        const result = await quote(page, state, { ...pageBody, quantity: ladder, section });
        base.options.push({
          selectionId: selection.schema.id,
          optionId: option.id,
          points: "points" in result ? result.points.filter((point) => Number.isFinite(point.unit_price)).map(keep) : null,
          ...("error" in result ? { error: result.error } : {}),
        });
      }
    }
    return base;
  } catch (error) {
    return { ...base, skipped: `Capture failed: ${error instanceof Error ? error.message : String(error)}` };
  } finally {
    await page.close().catch(() => undefined);
  }
}

let capturedApp: CaptureFile["app"] = null;

async function runCapture(only: string | undefined, recapture: boolean) {
  const prisma = createPrisma();
  const products = await loadEzpacProducts(prisma, only).finally(() => prisma.$disconnect());
  const capture = loadCapture();
  capturedApp = capture.app;
  const pending = products.filter((product) => {
    const entry = capture.products[product.slug];
    return recapture || only || !entry || entry.skipped || entry.version !== PACDORA_CAPTURE_VERSION;
  });
  console.info(`${products.length} EzPac products; capturing ${pending.length}.`);
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--disable-gpu", "--no-first-run"] });
  try {
    for (const [index, product] of pending.entries()) {
      if (index) await sleep(PAGE_GAP_MS);
      const entry = await captureProduct(browser, product.slug, product.handle);
      capture.products[product.slug] = entry;
      capture.app = capturedApp;
      saveCapture(capture);
      const summary = entry.skipped
        ? `skipped: ${entry.skipped}`
        : `model ${entry.quotationBody?.model.code} ${entry.dense?.points.length ?? 0} tiers, ${entry.options.length} option probes${entry.options.some((probe) => probe.error) ? " (some failed)" : ""}`;
      console.info(`[${index + 1}/${pending.length}] ${product.slug}: ${summary}`);
    }
  } finally {
    await browser.close();
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Json).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function runApply(only: string | undefined, dryRun: boolean) {
  const capture = loadCapture();
  const appUnit = capture.app?.sizeUnit?.defaultUnit;
  const defaultUnit = appUnit === "mm" || appUnit === "cm" || appUnit === "in" ? appUnit : "in";
  const presetByHandle = new Map(EZPAC_SHOPIFY_PRODUCT_MAPPING.map((mapping) => [mapping.shopifyHandle, "presetId" in mapping ? mapping.presetId ?? null : null]));
  const prisma = createPrisma();
  const report: Array<Json> = [];
  let applied = 0;
  let unchanged = 0;
  let refused = 0;
  try {
    const products = await loadEzpacProducts(prisma, only);
    for (const product of products) {
      const entry = capture.products[product.slug];
      if (!entry) {
        refused += 1;
        report.push({ slug: product.slug, outcome: "not-captured" });
        console.info(`${product.slug}: not captured`);
        continue;
      }
      const configurator = objectRecord(product.metadata.configurator);
      const productModel = typeof configurator.productModel === "string" ? configurator.productModel : null;
      const axes = (["length", "width", "height"] as const).filter((axis) => Number(entry.quotationBody?.model[axis]) > 0);
      const dieline = dielineKindForEzpacProduct({ slug: product.slug, productModel, presetId: presetByHandle.get(product.handle) ?? null, sizeAxes: axes });
      const mapped = mapPacdoraCaptureToSpec(entry, { dieline, defaultUnit });
      if ("error" in mapped) {
        refused += 1;
        report.push({ slug: product.slug, outcome: "refused", reason: mapped.error });
        console.info(`${product.slug}: refused — ${mapped.error}`);
        continue;
      }
      const verification = verifyPacdoraSpec(entry, mapped.spec);
      if (verification.maxErrorPaise > 1) {
        refused += 1;
        const worst = verification.checks.reduce((best, check) => Math.abs(check.expectedPaise - check.predictedPaise) > Math.abs(best.expectedPaise - best.predictedPaise) ? check : best);
        report.push({ slug: product.slug, outcome: "refused", reason: `prediction off by ${verification.maxErrorPaise} paise`, worst });
        console.info(`${product.slug}: refused — prediction off by ${verification.maxErrorPaise} paise (${worst.label} @ ${worst.quantity})`);
        continue;
      }
      const spec = mapped.spec;
      const summary = {
        slug: product.slug,
        modelCode: spec.modelCode,
        dieline: spec.dieline,
        referenceSizeMm: spec.referenceSizeMm,
        defaultUnit: spec.defaultUnit,
        quantity: spec.quantity,
        firstUnitRupees: spec.tiers[0].unitPaise / 100,
        tiers: spec.tiers.length,
        selections: spec.selections.filter((selection) => !selection.hidden).map((selection) => `${selection.name}: ${selection.options.map((option) => option.name).join(" / ")}`),
        verificationChecks: verification.checks.length,
        maxErrorPaise: verification.maxErrorPaise,
        customSize: spec.customSize,
        ...(mapped.notes.length ? { notes: mapped.notes } : {}),
      };
      if (stableJson(configurator.packagingQuote) === stableJson(spec)) {
        unchanged += 1;
        report.push({ ...summary, outcome: "unchanged" });
        console.info(`${product.slug}: unchanged`);
        continue;
      }
      if (dryRun) {
        applied += 1;
        report.push({ ...summary, outcome: configurator.packagingQuote ? "would-update" : "would-add" });
        console.info(`${product.slug}: would ${configurator.packagingQuote ? "update" : "add"} packagingQuote (${summary.selections.join("; ")})`);
        continue;
      }
      // Re-read inside the write so a concurrent admin edit to other keys is never lost.
      await prisma.$transaction(async (tx) => {
        const current = await tx.product.findUniqueOrThrow({ where: { id: product.id }, select: { metadata: true } });
        const metadata = objectRecord(current.metadata);
        await tx.product.update({
          where: { id: product.id },
          data: { metadata: { ...metadata, configurator: { ...objectRecord(metadata.configurator), packagingQuote: spec } } as never },
        });
      }, { timeout: 30_000, maxWait: 10_000 });
      applied += 1;
      report.push({ ...summary, outcome: configurator.packagingQuote ? "updated" : "added" });
      console.info(`${product.slug}: ${configurator.packagingQuote ? "updated" : "added"}`);
    }
  } finally {
    await prisma.$disconnect();
  }
  if (!only) writeFileSync(REPORT_FILE, `${JSON.stringify({ generatedAt: new Date().toISOString(), dryRun, applied, unchanged, refused, products: report }, null, 1)}\n`);
  console.info(`${dryRun ? "Dry run: " : ""}${applied} ${dryRun ? "to write" : "written"}, ${unchanged} unchanged, ${refused} refused.`);
}

async function main() {
  const only = process.argv.find((arg) => arg.startsWith("--only="))?.slice("--only=".length);
  if (process.argv.includes("--apply")) await runApply(only, process.argv.includes("--dry-run"));
  else await runCapture(only, process.argv.includes("--recapture"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
