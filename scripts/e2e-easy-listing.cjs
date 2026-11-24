/* End-to-end: list 4 products as a first-time admin, desktop and 390 px mobile.
 * Usage: node scripts/e2e-easy-listing.cjs <photoDir> [desktop|mobile|all]
 * Writes docs/research/easy-listing-*.png and docs/research/easy-listing-results.json.
 * Reads SEED_ADMIN_PASSWORD from .env.local and never prints it. */
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer-core");

const BASE = "http://localhost:3010";
const OUT = path.join(process.cwd(), "docs", "research");
const photoDir = process.argv[2];
const which = process.argv[3] || "all";
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).flatMap((line) => {
  const match = /^([A-Z_]+)=(.*)$/.exec(line);
  return match ? [[match[1], match[2].replace(/^"|"$/g, "")]] : [];
}));

const PRODUCTS = [
  { key: "name-slips", file: "IMG_20261123_101512.webp", label: "Name slips", expect: "2D only", price: "249" },
  { key: "pen", file: "pencil-box-set.webp", label: "Pens & pencils", expect: "2D + built-in 3D", price: "299" },
  { key: "soap-box", file: "soap-box.png", label: "Soap box", expect: "3D template", price: "45", search: "soap" },
  { key: "paper-bag", file: "IMG_4410.webp", label: "Paper bag", expect: "3D", price: "1299", search: "paper bag" },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = fs.existsSync("docs/research/easy-listing-results.json") ? JSON.parse(fs.readFileSync("docs/research/easy-listing-results.json", "utf8")) : [];

async function shot(page, name) {
  await sleep(350);
  await page.screenshot({ path: path.join(OUT, `easy-listing-${name}.png`) });
}

async function clickText(page, text, scope = "") {
  // Buttons and links only, matched on their own text, so hint copy is never clicked.
  const selector = `${scope} :is(button, a)`.trim();
  const usable = (el, label) => el.textContent.trim() === label && el.offsetParent !== null && !el.disabled;
  await page.waitForFunction((sel, label) => [...document.querySelectorAll(sel)].some((el) => el.textContent.trim() === label && el.offsetParent !== null && !el.disabled), { timeout: 60_000 }, selector, text);
  for (const handle of await page.$$(selector)) {
    if (await handle.evaluate(usable, text)) { await handle.click(); return; }
  }
  throw new Error(`No clickable ${text}`);
}

async function login(browser) {
  const page = await browser.newPage();
  await page.goto(`${BASE}/login?next=/admin/products`, { waitUntil: "networkidle2" });
  await page.type("#email", "admin@naamly.com");
  await page.type("#password", env.SEED_ADMIN_PASSWORD || "");
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => undefined), page.click("button[type=submit]")]);
  await page.close();
}

async function listOne(browser, product, viewport) {
  const tag = `${viewport.name}-${product.key}`;
  const page = await browser.newPage();
  await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1, isMobile: viewport.mobile, hasTouch: viewport.mobile });
  const errors = [];
  const apiTimes = [];
  const requestStarts = new Map();
  page.on("pageerror", (error) => errors.push(String(error.message || error)));
  page.on("request", (request) => { if (/\/api\/admin\/(listings|catalog)/.test(request.url())) requestStarts.set(request, Date.now()); });
  page.on("requestfinished", (request) => {
    const start = requestStarts.get(request);
    if (start) apiTimes.push(`${request.method()} ${request.url().replace(BASE, "").slice(0, 40)} ${request.response()?.status()} ${Date.now() - start}ms${request.response()?.headers()["server-timing"] ? ` [${request.response().headers()["server-timing"]}]` : ""}`);
  });
  await page.goto(`${BASE}/admin/products`, { waitUntil: "networkidle2" });
  await page.evaluate(() => window.localStorage.removeItem("naamly.admin.listing-wizard.v1"));
  await page.waitForSelector("::-p-text(Add product)", { visible: true, timeout: 60_000 });
  // The product list loads slowly; wait for its rows so the category pictures are ready.
  await page.waitForSelector("table tbody tr", { timeout: 60_000 }).catch(() => undefined);

  let clicks = 0;
  const started = Date.now();
  const timings = {};
  // 1. Add product
  await clickText(page, "Add product"); clicks += 1;
  await page.waitForSelector("::-p-text(Drop product photos here)", { visible: true });
  if (viewport.name === "desktop" && product.key === "name-slips") await shot(page, `${tag}-0-empty`);
  // 2. Choose photos → pick the file in the OS dialog (2 clicks for a person)
  const [chooser] = await Promise.all([page.waitForFileChooser(), clickText(page, "Choose photos")]);
  await chooser.accept([path.join(photoDir, product.file)]); clicks += 2;
  await page.waitForFunction(() => Boolean(document.querySelector("progress[value='100']")), { timeout: 60_000 });
  timings.photoUploaded = Date.now() - started;
  await shot(page, `${tag}-1-photo`);
  // 3. Continue
  await clickText(page, "Continue"); clicks += 1;
  timings.step2 = Date.now() - started;
  await page.waitForSelector("::-p-text(What are you selling?)", { visible: true });
  await sleep(300);
  const selectedLabel = await page.evaluate(() => document.querySelector("button[aria-pressed='true'] strong")?.textContent ?? "");
  if (selectedLabel !== product.label) {
    const visibleCard = await page.$$eval("button[aria-pressed] strong", (nodes, label) => nodes.some((node) => node.textContent === label), product.label);
    if (!visibleCard && product.search) {
      await page.click("input[aria-label='Something else? Type it']"); clicks += 1;
      await page.keyboard.type(product.search);
      await sleep(200);
    }
    const card = await page.waitForSelector(`button[aria-pressed] ::-p-text(${product.label})`, { visible: true });
    await card.click(); clicks += 1;
  }
  await shot(page, `${tag}-2-what`);
  // 4. Continue
  await clickText(page, "Continue"); clicks += 1;
  await page.waitForSelector("::-p-text(Name it, price it, publish)", { visible: true });
  timings.step3 = Date.now() - started;
  // 5. Price
  const price = await page.waitForSelector("input[type=number][placeholder]", { visible: true });
  await price.click(); clicks += 1;
  await page.keyboard.type(product.price);
  await shot(page, `${tag}-3-price`);
  // Verification-only (not counted): the live 3D preview before saving.
  if (viewport.name === "desktop") {
    const tab3d = await page.$("[role=tab] ::-p-text(3D)");
    if (tab3d) {
      await tab3d.click();
      await sleep(2500);
      await shot(page, `${tag}-3b-preview-3d`);
      const tab2d = await page.$("[role=tab] ::-p-text(2D customiser)");
      if (tab2d) { await tab2d.click(); await sleep(1200); await shot(page, `${tag}-3c-preview-2d`); }
    }
  }
  // 6. Publish
  timings.beforePublish = Date.now() - started;
  await clickText(page, "Publish", "footer"); clicks += 1;
  await page.waitForSelector("#listing-success-title", { visible: true, timeout: 120_000 });
  timings.published = Date.now() - started;
  await sleep(600);
  const success = await page.evaluate(() => ({
    title: document.querySelector("#listing-success-title")?.textContent ?? "",
    notes: [...document.querySelectorAll("section[aria-labelledby='listing-success-title'] p")].map((node) => node.textContent),
    href: document.querySelector("a[target=_blank][href^='/products/']")?.getAttribute("href") ?? "",
  }));
  await shot(page, `${tag}-4-success`);
  // 7. View on store (new tab)
  const [store] = await Promise.all([
    new Promise((resolve) => browser.once("targetcreated", async (target) => resolve(await target.page()))),
    clickText(page, "View on store"),
  ]); clicks += 1;
  await store.setViewport({ width: viewport.width, height: viewport.height, isMobile: viewport.mobile, hasTouch: viewport.mobile });
  await store.waitForSelector("h1", { timeout: 90_000 });
  await store.waitForNetworkIdle({ idleTime: 600, timeout: 60_000 }).catch(() => undefined);
  timings.live = Date.now() - started;
  await store.screenshot({ path: path.join(OUT, `easy-listing-${tag}-5-live.png`) });
  // Verification: 2D customiser with a typed name, then 3D.
  const has2D = Boolean(await store.$("button[title='2D design editor']"));
  const has3D = Boolean(await store.$("button[title='3D interactive model']"));
  if (has2D) {
    await store.click("button[title='2D design editor']");
    const field = await store.$("aside[aria-label='Product configuration'] input[type=text]");
    if (field) { await field.click({ clickCount: 3 }); await field.type("Aarav"); }
    await sleep(1500);
    await store.screenshot({ path: path.join(OUT, `easy-listing-${tag}-6-live-2d.png`) });
  }
  if (has3D) {
    await store.click("button[title='3D interactive model']");
    await sleep(4500);
    await store.screenshot({ path: path.join(OUT, `easy-listing-${tag}-7-live-3d.png`) });
  }
  const record = {
    tag, viewport: viewport.name, product: product.key, expect: product.expect, clicks,
    secondsToPublished: Math.round(timings.published / 100) / 10,
    secondsToLivePage: Math.round(timings.live / 100) / 10,
    href: success.href, title: success.title, notes: success.notes, has2D, has3D,
    pageErrors: errors.slice(0, 5),
    timings: Object.fromEntries(Object.entries(timings).map(([key, value]) => [key, Math.round(value / 100) / 10])),
    apiTimes,
  };
  console.log(JSON.stringify(record));
  const index = results.findIndex((item) => item.tag === tag);
  if (index >= 0) results[index] = record; else results.push(record);
  fs.writeFileSync("docs/research/easy-listing-results.json", JSON.stringify(results, null, 2));
  await store.close();
  await page.close();
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1366,900"],
  });
  try {
    await login(browser);
    const viewports = [
      { name: "desktop", width: 1366, height: 900, mobile: false },
      { name: "mobile", width: 390, height: 844, mobile: true },
    ].filter((viewport) => which === "all" || viewport.name === which);
    const only = process.argv[4];
    for (const viewport of viewports) {
      for (const product of PRODUCTS.filter((item) => !only || item.key === only)) {
        try { await listOne(browser, product, viewport); }
        catch (error) {
          console.log(JSON.stringify({ tag: `${viewport.name}-${product.key}`, failed: String(error && error.message || error) }));
          const pages = await browser.pages();
          const last = pages[pages.length - 1];
          await last.screenshot({ path: path.join(OUT, `easy-listing-${viewport.name}-${product.key}-FAILED.png`) }).catch(() => undefined);
        }
      }
    }
  } finally {
    await browser.close();
  }
})();
