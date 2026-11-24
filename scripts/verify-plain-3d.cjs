/* Browser check for plain 3D models (docs/research/codex-prompt-plain-3d-models.md).
 * Usage: node scripts/verify-plain-3d.cjs <label> <desktop|mobile|all> [key ...]
 *   label "after" writes docs/research/plain-3d-<viewport>-<key>-<view>.png;
 *   any other label is used as a prefix: plain-3d-<label>-<viewport>-<key>-<view>.png.
 * For each product: open 3D View, shoot every camera view, change the size preset,
 * confirm the 2D studio still shows the photo, add text, and shoot the front again.
 * Results: docs/research/plain-3d-results-<label>.json. Needs `next start -p 3010`. */
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer-core");
const sharp = require("sharp");

const BASE = "http://localhost:3010";
const OUT = path.join(process.cwd(), "docs", "research");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";

const PRODUCTS = {
  "zipper-box": "zipper-box",
  "hanging-box": "hanging-box",
  "brownie-box": "brownie-box",
  "cereal-box": "cereal-box",
  "gift-box": "gift-box",
  "flower-box": "flower-box",
  "perfume-box": "perfume-box",
  "brand-ziplock-pouch": "brand-ziplock-pouch",
  "d2c-mailer-bag": "d2c-mailer-bag",
  "food-delivery-box": "food-delivery-box",
  "laminated-carry-bag": "custom-branded-laminated-carry-bag",
  "d-cut-paper-bag": "d-cut-paper-bag",
  "soap-box": "soap-box",
  "square-box": "square-box",
  "window-box": "window-box",
  // Built-in models: must look as before.
  "name-slips": "unique-customized-premium-shapes-butterfly-name-slips-for-kids-school-notebooks-pack-of-24pcs",
  pencils: "ranbazaar-laser-personalized-name-pencils-box-set-of-20-pcs-2-eraser-sharpener-free",
  bottle: "ranbazaar-stainless-steel-kid-bottle-keep-hot-cool-350ml",
  stickers: "personalized-birthday-special-waterproof-name-stickers-pack-of-88pcs",
  notebooks: "bring-ideas-to-life-custom-notebooks-perfect-for-kids-pack-of-5",
  "name-plate": "safari-jungle-theme-name-sign-acrylic-name-plate",
  "school-labels": "school-starter-label-set-90-pack",
};

const VIEWS = [
  ["iso", "Perspective view"],
  ["front", "Front view"],
  ["left", "Left view"],
  ["right", "Right view"],
  ["back", "Back view"],
  ["top", "Top view"],
];

const VIEWPORTS = {
  desktop: { name: "desktop", width: 1440, height: 960, mobile: false, views: VIEWS.map(([view]) => view) },
  mobile: { name: "mobile", width: 390, height: 844, mobile: true, views: ["iso", "top"] },
};

const [label = "after", which = "all", ...keys] = process.argv.slice(2);
const selected = keys.length ? keys : Object.keys(PRODUCTS);
const viewports = which === "all" ? [VIEWPORTS.desktop, VIEWPORTS.mobile] : [VIEWPORTS[which]];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fileFor = (viewport, key, view) => path.join(OUT, label === "after"
  ? `plain-3d-${viewport}-${key}-${view}.png`
  : `plain-3d-${label}-${viewport}-${key}-${view}.png`);

/** Luminance spread inside the middle of the shot: a photo is busy, plain board is flat. */
async function centreStats(file) {
  const image = sharp(file);
  const { width, height } = await image.metadata();
  const box = { left: Math.round(width * 0.4), top: Math.round(height * 0.35), width: Math.round(width * 0.2), height: Math.round(height * 0.2) };
  const { data, info } = await sharp(file).extract(box).raw().toBuffer({ resolveWithObject: true });
  const luma = [];
  for (let index = 0; index < data.length; index += info.channels) {
    luma.push(0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2]);
  }
  const mean = luma.reduce((sum, value) => sum + value, 0) / luma.length;
  const spread = Math.sqrt(luma.reduce((sum, value) => sum + (value - mean) ** 2, 0) / luma.length);
  return { mean: Math.round(mean), spread: Math.round(spread * 10) / 10 };
}

async function clickButton(page, matcher, scope = "") {
  return page.evaluate(({ matcher, scope }) => {
    const root = scope ? document.querySelector(scope) : document;
    if (!root) return false;
    const button = [...root.querySelectorAll("button")].find((el) => {
      if (el.disabled || el.offsetParent === null) return false;
      if (matcher.title) return el.title === matcher.title;
      return el.textContent.replace(/\s+/g, " ").trim() === matcher.text;
    });
    if (!button) return false;
    button.click();
    return true;
  }, { matcher, scope });
}

async function waitFor3D(page) {
  await page.waitForSelector('[aria-label^="Interactive 3D preview"]', { timeout: 120_000 });
  await page.waitForFunction(() => {
    const container = document.querySelector('[aria-label^="Interactive 3D preview"]');
    return container && ![...container.querySelectorAll('[role="status"]')].some((el) => /Preparing/.test(el.textContent));
  }, { timeout: 120_000 });
  await sleep(4_500);
}

async function shoot(page, file) {
  const container = await page.$('[aria-label^="Interactive 3D preview"]');
  await container.screenshot({ path: file });
  return centreStats(file);
}

async function checkProduct(browser, key, viewport) {
  const slug = PRODUCTS[key];
  const result = { key, slug, viewport: viewport.name, views: {}, errors: [] };
  const page = await browser.newPage();
  page.on("pageerror", (error) => result.errors.push(String(error.message || error)));
  await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1, isMobile: viewport.mobile, hasTouch: viewport.mobile });
  try {
    await page.goto(`${BASE}/products/${slug}`, { waitUntil: "domcontentloaded", timeout: 240_000 });
    await page.waitForSelector('[aria-label="Preview mode"] button', { timeout: 240_000 });
    if (!(await clickButton(page, { text: "3D View" }, '[aria-label="Preview mode"]'))) {
      result.no3D = true;
      return result;
    }
    await waitFor3D(page);
    for (const view of viewport.views) {
      const title = VIEWS.find(([name]) => name === view)[1];
      await clickButton(page, { title });
      await sleep(2_000);
      result.views[view] = await shoot(page, fileFor(viewport.name, key, view));
    }

    // Size presets: pick a different one where there is a choice.
    const presetCount = await page.evaluate(() => {
      const fieldset = [...document.querySelectorAll("fieldset")].find((el) => el.querySelector("legend")?.textContent.includes("Dimensions"));
      const buttons = fieldset ? [...fieldset.querySelectorAll("button[aria-pressed]")].filter((el) => el.querySelector("strong")) : [];
      const next = buttons.find((el) => el.getAttribute("aria-pressed") !== "true");
      if (next) next.click();
      return buttons.length;
    });
    result.sizePresets = presetCount;
    if (presetCount > 1) {
      await sleep(3_500);
      await clickButton(page, { title: "Perspective view" });
      await sleep(2_000);
      result.views["size2-iso"] = await shoot(page, fileFor(viewport.name, key, "size2-iso"));
    }

    // 2D studio: the photo is still behind the design.
    if (await clickButton(page, { text: "2D Studio" }, '[aria-label="Preview mode"]')) {
      await page.waitForFunction(() => document.querySelector("main svg"), { timeout: 60_000 });
      await sleep(2_500);
      result.studioPhoto = await page.evaluate(() => {
        const image = [...document.querySelectorAll("main svg image")].find((el) => (el.getAttribute("href") || el.getAttribute("xlink:href")));
        if (!image) return null;
        const box = image.getBoundingClientRect();
        return { href: (image.getAttribute("href") || image.getAttribute("xlink:href")).slice(0, 120), visible: box.width > 40 && box.height > 40 };
      });
      if (viewport.name === "desktop") {
        const editor = await page.$("main");
        await editor.screenshot({ path: fileFor(viewport.name, key, "2d") });
      }
      // Customer text: "Add text" where the studio allows it, else the name field.
      if (await clickButton(page, { title: "Add text" })) {
        result.textAdded = "Add text (\"Your text\")";
      } else {
        const typed = await page.evaluate(() => {
          const fieldset = [...document.querySelectorAll("fieldset")].find((el) => el.querySelector("legend")?.textContent.includes("Personal details"));
          const input = fieldset?.querySelector('input[type="text"]');
          if (!input) return false;
          input.focus();
          return true;
        });
        if (typed) {
          await page.keyboard.down("Control"); await page.keyboard.press("A"); await page.keyboard.up("Control");
          await page.keyboard.type("Aarav");
          result.textAdded = "name field (\"Aarav\")";
        }
      }
      await sleep(1_000);
      await clickButton(page, { text: "3D View" }, '[aria-label="Preview mode"]');
      await waitFor3D(page);
      await clickButton(page, { title: "Front view" });
      await sleep(2_000);
      result.views["text-front"] = await shoot(page, fileFor(viewport.name, key, "text-front"));
      await clickButton(page, { title: "Perspective view" });
      await sleep(2_000);
      result.views["text-iso"] = await shoot(page, fileFor(viewport.name, key, "text-iso"));
    } else {
      result.no2D = true;
    }
  } catch (error) {
    result.errors.push(String(error.message || error));
  } finally {
    await page.close();
  }
  return result;
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const resultsFile = path.join(OUT, `plain-3d-results-${label}.json`);
  const results = fs.existsSync(resultsFile) ? JSON.parse(fs.readFileSync(resultsFile, "utf8")) : [];
  try {
    for (const viewport of viewports) {
      for (const key of selected) {
        const started = Date.now();
        const result = await checkProduct(browser, key, viewport);
        result.seconds = Math.round((Date.now() - started) / 1000);
        const index = results.findIndex((item) => item.key === key && item.viewport === viewport.name);
        if (index >= 0) results[index] = result; else results.push(result);
        fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
        console.log(JSON.stringify({ key, viewport: viewport.name, seconds: result.seconds, no3D: result.no3D, studioPhoto: Boolean(result.studioPhoto?.visible), textAdded: result.textAdded, presets: result.sizePresets, errors: result.errors.slice(0, 2) }));
      }
    }
  } finally {
    await browser.close();
  }
})();
