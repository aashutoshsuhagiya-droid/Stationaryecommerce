// Temporary probe: lists the customer-facing editor controls on a live Ranbazaar product page.
const puppeteer = require("puppeteer-core");
const slug = process.argv[2] || "parker-classic-matte-bp-ball-pen-engraved-your-name-on-pen-with-box-black";
const out = process.argv[3] || "C:/Users/aashu/AppData/Local/Temp/rbprobe";
(async () => {
  const browser = await puppeteer.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: "new",
    args: ["--window-size=1440,1000"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(`https://ranbazaar.com/product/${slug}`, { waitUntil: "networkidle2", timeout: 90000 });
  await new Promise((r) => setTimeout(r, 4000));
  await page.screenshot({ path: `${out}/${slug.slice(0, 40)}-1.png` });
  const controls = await page.evaluate(() => {
    const seen = new Set();
    const items = [];
    for (const el of document.querySelectorAll("button, [role=button], input, select, label, a.btn, [title], [aria-label], i[class*=bi-], svg[class]")) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const text = (el.innerText || el.value || "").trim().slice(0, 60);
      const desc = [el.tagName.toLowerCase(), el.type || "", text, el.getAttribute("title") || "", el.getAttribute("aria-label") || "", el.getAttribute("placeholder") || "", (el.className && el.className.baseVal === undefined ? el.className : "").toString().slice(0, 80)].join(" | ");
      if (seen.has(desc)) continue;
      seen.add(desc);
      items.push(desc);
    }
    return items;
  });
  console.log(controls.join("\n"));
  // Try opening the customise/editor view if a button exists.
  const clicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button, a")].find((b) => /customi[sz]e|personali[sz]e|edit design|start/i.test(b.innerText || ""));
    if (btn) { btn.click(); return btn.innerText.trim(); }
    return null;
  });
  console.log("CLICKED:", clicked);
  if (clicked) {
    await new Promise((r) => setTimeout(r, 4000));
    await page.screenshot({ path: `${out}/${slug.slice(0, 40)}-2.png` });
    const after = await page.evaluate(() => [...document.querySelectorAll("button, [role=button], input, select, [title], [aria-label]")]
      .filter((el) => el.getBoundingClientRect().width)
      .map((el) => [el.tagName.toLowerCase(), el.type || "", (el.innerText || el.value || "").trim().slice(0, 50), el.getAttribute("title") || "", el.getAttribute("aria-label") || "", el.getAttribute("placeholder") || ""].join(" | ")));
    console.log("AFTER:\n" + [...new Set(after)].join("\n"));
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
