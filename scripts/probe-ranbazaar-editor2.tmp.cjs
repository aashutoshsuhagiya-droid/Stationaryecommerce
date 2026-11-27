// Temporary probe: opens the Ranbazaar customise view, types a name / uploads a photo, tests drag, measures canvas.
const puppeteer = require("puppeteer-core");
const fs = require("fs");
const slug = process.argv[2];
const out = "C:/Users/aashu/AppData/Local/Temp/rbprobe";
const tag = slug.slice(0, 20);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new" });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(`https://ranbazaar.com/product/${slug}`, { waitUntil: "networkidle2", timeout: 90000 });
  await sleep(3000);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /customi[sz]e/i.test(b.innerText))?.click());
  await sleep(4000);
  const describe = () => page.evaluate(() => {
    const els = [...document.querySelectorAll("body *")].filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.top < 1000 && r.left < 700 && r.top > 100 && (e.tagName === "IMG" || e.tagName === "CANVAS" || e.tagName === "INPUT" || getComputedStyle(e).backgroundImage !== "none" || (e.children.length === 0 && e.innerText?.trim()));
    });
    return els.slice(0, 40).map((e) => {
      const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
      return `${e.tagName} ${e.className?.toString().slice(0, 50)} [${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}] text="${(e.innerText || e.value || "").trim().slice(0, 30)}" font=${cs.fontFamily.slice(0, 30)} ${cs.fontSize} ${cs.fontWeight} color=${cs.color} transform=${cs.textTransform} rot=${cs.transform.slice(0, 30)} draggable=${e.draggable} cursor=${cs.cursor}`;
    });
  });
  console.log("RIGHT PANEL:\n" + (await page.evaluate(() => [...document.querySelectorAll("button, input, select, textarea, label, small, .text-danger")]
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width && r.left > 680 && r.top < 1000; })
    .map((e) => `${e.tagName} ${e.type || ""} "${(e.innerText || e.value || "").trim().slice(0, 40)}" ph="${e.placeholder || ""}" max=${e.maxLength ?? ""} title="${e.title || ""}" icon=${e.querySelector("i,svg")?.getAttribute("class") || ""}`))).join("\n"));
  console.log("CANVAS BEFORE:\n" + (await describe()).join("\n"));

  const textInputs = await page.$$("input[type=text]:not([name=searchTerm])");
  for (const input of textInputs) {
    const box = await input.boundingBox();
    if (box && box.x > 680) { await input.click(); await input.type("Aarav Sharma Long Name"); }
  }
  const file = await page.$("input[type=file]");
  if (file) {
    const png = `${out}/test-photo.png`;
    if (!fs.existsSync(png)) {
      // 1x1 is too small for some validators; write a small solid PNG via canvas in page.
      const data = await page.evaluate(() => { const c = document.createElement("canvas"); c.width = 400; c.height = 500; const g = c.getContext("2d"); g.fillStyle = "#3a7"; g.fillRect(0, 0, 400, 500); g.fillStyle = "#fff"; g.font = "60px sans-serif"; g.fillText("PHOTO", 90, 260); return c.toDataURL("image/png").split(",")[1]; });
      fs.writeFileSync(png, Buffer.from(data, "base64"));
    }
    await file.uploadFile(png);
    await sleep(4000);
  }
  await page.screenshot({ path: `${out}/${tag}-typed.png` });
  console.log("CANVAS AFTER:\n" + (await describe()).join("\n"));
  console.log("RIGHT PANEL AFTER:\n" + (await page.evaluate(() => [...document.querySelectorAll("button, input, select, textarea, label, small, .text-danger, span")]
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width && r.left > 680 && r.top < 1000 && r.top > 100; })
    .map((e) => `${e.tagName} ${e.type || ""} "${(e.innerText || e.value || "").trim().slice(0, 40)}" icon=${e.querySelector("i,svg")?.getAttribute("class") || ""}`))).join("\n"));

  // Drag test in the middle of the canvas area.
  for (const h of await page.$$(".react-draggable")) {
    const b = await h.boundingBox();
    if (!b) continue;
    console.log("DRAG FROM", JSON.stringify(b));
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 - 80, b.y + b.height / 2 + 60, { steps: 12 });
    await page.mouse.up();
    console.log("DRAG TO", JSON.stringify(await h.boundingBox()));
  }
  for (const b of await page.$$("button")) {
    const box = await b.boundingBox();
    const icon = await b.evaluate((e) => e.querySelector("i,svg")?.getAttribute("class") || "");
    if (!box || box.x < 1090 || box.y > 300 || !icon) continue;
    await b.click();
    await sleep(300);
    const t = await page.evaluate(() => [...document.querySelectorAll("img")]
      .filter((i) => i.getBoundingClientRect().left < 680 && i.getBoundingClientRect().width)
      .map((i) => i.style.cssText.slice(0, 160)).join(" || "));
    console.log("BTN", icon, "=>", t);
  }
  await sleep(1000);
  await page.screenshot({ path: `${out}/${tag}-dragged.png` });
  // Right-click (bundle has handleContextMenu).
  await page.mouse.click(360, 450, { button: "right" });
  await sleep(800);
  await page.screenshot({ path: `${out}/${tag}-context.png` });
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
