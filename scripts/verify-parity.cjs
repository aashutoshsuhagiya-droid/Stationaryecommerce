// Browser parity check for EzPac / Ranbazaar product pages. Run against a production build: npx next start -p 3010, then node scripts/verify-parity.cjs
const puppeteer = require("puppeteer-core");
const path = require("node:path");
const fs = require("node:fs");
const BASE = process.env.BASE || "http://localhost:3010";
const OUT = path.join(process.cwd(), "docs", "research");
const results = [];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => { console.log(...a); results.push(a.join(" ")); };

async function selectByLabel(page, labelText, optionText) {
  return page.evaluate((labelText, optionText) => {
    const label = [...document.querySelectorAll("label")].find((l) => l.querySelector(":scope > span")?.textContent?.trim() === labelText && l.querySelector("select"));
    const select = label?.querySelector("select");
    if (!select) return `no select ${labelText}`;
    const option = [...select.options].find((o) => o.textContent.trim().startsWith(optionText));
    if (!option) return `no option ${optionText} in [${[...select.options].map((o) => o.textContent.trim()).join(" | ")}]`;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
    setter.call(select, option.value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return "ok";
  }, labelText, optionText);
}

async function verifiedPrice(page, timeout = 60000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const state = await page.evaluate(() => {
      const panel = [...document.querySelectorAll("[class*=priceStatus]")][0];
      return panel ? panel.innerText.replace(/\s+/g, " ") : null;
    });
    if (state && /Server-verified/.test(state)) return state;
    if (state && /unavailable|must|between|not an available/i.test(state) && !/Checking/.test(state)) return state;
    await wait(500);
  }
  return "timeout";
}

async function gotoProduct(page, slug) {
  await page.goto(`${BASE}/products/${slug}`, { waitUntil: "networkidle2", timeout: 180000 });
  await wait(2500);
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const page = await browser.newPage();
  page.on("pageerror", (e) => log("PAGEERROR", e.message.slice(0, 200)));
  await page.setViewport({ width: 1366, height: 900 });

  // ---------- EzPac: paan-box ----------
  await gotoProduct(page, "paan-box");
  const spec = await page.evaluate(() => {
    const panel = document.querySelector("[class*=packaging-spec-module__][class*=panel], [class*=panel]");
    const instruction = [...document.querySelectorAll("p")].find((p) => p.textContent.includes("Custom Size"))?.textContent;
    const selects = [...document.querySelectorAll("label")].filter((l) => l.querySelector("select")).map((l) => `${l.querySelector(":scope > span")?.textContent?.trim()}=${l.querySelector("select").selectedOptions[0]?.textContent?.trim()}`);
    return { instruction, selects, hasPanel: Boolean(panel) };
  });
  log("paan-box instruction:", spec.instruction);
  log("paan-box selects:", spec.selects.join(" ; "));
  log("paan-box default quote:", await verifiedPrice(page));
  log("set effects gold:", await selectByLabel(page, "Special Effects", "Gold Foil Stamping"));
  log("set qty 25:", await selectByLabel(page, "Quantity", "25 pcs"));
  await wait(800);
  log("paan-box gold@25 quote (source ₹430.32):", await verifiedPrice(page));
  const slider = await page.$("input[type=range]");
  log("open slider present:", Boolean(slider));
  const badge = await page.evaluate(() => /SHARK TANK INDIA/i.test(document.body.innerText));
  log("shark tank badge:", badge);
  await page.evaluate(() => document.querySelector("main")?.scrollIntoView());
  await wait(1200);
  await page.screenshot({ path: path.join(OUT, "parity-paan-box-3d-closed.png") });
  if (slider) {
    await page.evaluate(() => {
      const input = document.querySelector("input[type=range]");
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(input, "0");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await wait(1500);
    await page.screenshot({ path: path.join(OUT, "parity-paan-box-3d-open.png") });
  }
  // Custom size: Size select → Custom Size → cm → L 12, H 25 → Apply
  log("choose custom size:", await selectByLabel(page, "Size", "Custom Size"));
  await page.waitForSelector("[role=dialog]", { timeout: 10000 });
  await page.evaluate(() => [...document.querySelectorAll("[role=dialog] button")].find((b) => b.textContent.trim() === "cm")?.click());
  await wait(300);
  const dialogValues = await page.evaluate(() => [...document.querySelectorAll("[role=dialog] input")].map((i) => i.value));
  log("dialog values in cm:", dialogValues.join(" x "));
  await page.screenshot({ path: path.join(OUT, "parity-paan-box-custom-size-dialog.png") });
  // invalid first
  const inputs = await page.$$("[role=dialog] input");
  await inputs[0].click(); await page.keyboard.down("Control"); await page.keyboard.press("A"); await page.keyboard.up("Control"); await inputs[0].type("0.2");
  await page.evaluate(() => [...document.querySelectorAll("[role=dialog] button")].find((b) => b.textContent.trim() === "Apply")?.click());
  await wait(300);
  log("invalid size error:", await page.evaluate(() => document.querySelector("[role=dialog] [role=alert]")?.textContent ?? "none"));
  for (const [index, value] of [[0, "12"], [1, "25"]]) { await inputs[index].click(); await page.keyboard.down("Control"); await page.keyboard.press("A"); await page.keyboard.up("Control"); await inputs[index].type(value); }
  await page.evaluate(() => [...document.querySelectorAll("[role=dialog] button")].find((b) => b.textContent.trim() === "Apply")?.click());
  await wait(800);
  log("size after apply:", await page.evaluate(() => [...document.querySelectorAll("label")].find((l) => l.querySelector(":scope > span")?.textContent?.trim() === "Size")?.querySelector("select")?.selectedOptions[0]?.textContent));
  log("custom size quote:", await verifiedPrice(page));
  // Dieline view
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Dieline")?.click());
  await wait(1200);
  log("dieline svg:", await page.evaluate(() => Boolean([...document.querySelectorAll("svg title")].find((t) => /dieline/i.test(t.textContent)) || document.querySelector("svg[aria-labelledby]"))));
  await page.screenshot({ path: path.join(OUT, "parity-paan-box-dieline.png") });
  // Add to cart and view cart
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /^Add to cart$/.test(b.textContent.trim()) && !b.disabled)?.click());
  await wait(1500);
  await page.goto(`${BASE}/cart`, { waitUntil: "networkidle2", timeout: 120000 });
  await wait(1500);
  log("cart:", (await page.evaluate(() => document.querySelector(".cart-customization")?.parentElement?.innerText ?? document.body.innerText.slice(0, 400))).replace(/\s+/g, " ").slice(0, 400));
  await page.screenshot({ path: path.join(OUT, "parity-paan-box-cart.png") });

  // ---------- EzPac: brownie-box, d-cut-paper-bag ----------
  for (const slug of ["brownie-box", "d-cut-paper-bag"]) {
    await gotoProduct(page, slug);
    log(`${slug} selects:`, (await page.evaluate(() => [...document.querySelectorAll("label")].filter((l) => l.querySelector("select")).map((l) => `${l.querySelector(":scope > span")?.textContent?.trim()}=${l.querySelector("select").selectedOptions[0]?.textContent?.trim()} (${l.querySelector("select").options.length})`))).join(" ; "));
    log(`${slug} quote:`, await verifiedPrice(page));
    log(`${slug} slider:`, Boolean(await page.$("input[type=range]")));
    await page.evaluate(() => document.querySelector("main")?.scrollIntoView());
    await wait(1200);
    if (await page.$("input[type=range]")) {
      await page.evaluate(() => {
        const input = document.querySelector("input[type=range]");
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "0");
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await wait(1500);
    }
    await page.screenshot({ path: path.join(OUT, `parity-${slug}-3d.png`) });
    await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Dieline")?.click());
    await wait(1000);
    await page.screenshot({ path: path.join(OUT, `parity-${slug}-dieline.png`) });
  }

  // ---------- Ranbazaar ----------
  await gotoProduct(page, "kids-name-slip-for-notebook-pack-of-36pcs-21");
  const nameInput = await page.$("input[maxlength='29']");
  if (nameInput) { await nameInput.type("Aarav Mehta"); }
  const schoolInput = await page.$("input[maxlength='38']");
  if (schoolInput) { await schoolInput.type("Delhi Public School"); }
  await wait(1500);
  log("name slip quote (waits for the required photo, as on the source):", await verifiedPrice(page, 8000));
  log("name slip no packaging panel:", await page.evaluate(() => !/Custom Size/.test(document.body.innerText)));
  await page.evaluate(() => document.querySelector("main")?.scrollIntoView());
  await wait(800);
  await page.screenshot({ path: path.join(OUT, "parity-ranbazaar-name-slip.png") });

  await gotoProduct(page, "personalized-luggage-tag-for-travel-custom-name-phone-number-bag-tag-for-suitcases");
  log("luggage tag offer:", await page.evaluate(() => [...document.querySelectorAll("[class*=bulkOffer]")].map((n) => n.textContent.trim()).join(" | ")));
  const textInputs = await page.$$("fieldset input[type=text]");
  for (const [index, input] of textInputs.entries()) await input.type(index === 0 ? "Aarav" : "9876543210");
  await wait(600);
  log("luggage tag qty1 quote:", await verifiedPrice(page));
  await page.evaluate(() => document.querySelector("button[aria-label='Increase quantity']")?.click());
  await wait(800);
  log("luggage tag qty2 quote (source ₹175 each):", await verifiedPrice(page));
  await page.screenshot({ path: path.join(OUT, "parity-ranbazaar-bulk-tier.png") });

  // ---------- Mobile ----------
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await gotoProduct(page, "paan-box");
  await page.evaluate(() => [...document.querySelectorAll("label")].find((l) => l.querySelector(":scope > span")?.textContent?.trim() === "Size")?.scrollIntoView());
  await page.screenshot({ path: path.join(OUT, "parity-paan-box-mobile-spec.png") });
  await selectByLabel(page, "Size", "Custom Size");
  await wait(600);
  await page.screenshot({ path: path.join(OUT, "parity-paan-box-mobile-size-dialog.png") });
  await page.keyboard.press("Escape");
  await wait(300);
  log("mobile dialog closes on Escape:", await page.evaluate(() => !document.querySelector("[role=dialog]")));
  await page.evaluate(() => document.querySelector("main")?.scrollIntoView());
  await wait(1500);
  await page.screenshot({ path: path.join(OUT, "parity-paan-box-mobile-3d.png") });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  log("mobile horizontal overflow px:", overflow);

  fs.writeFileSync(path.join(OUT, "parity-browser-results.txt"), results.join("\n") + "\n");
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
