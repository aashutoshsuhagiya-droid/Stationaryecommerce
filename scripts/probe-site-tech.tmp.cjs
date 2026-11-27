// Temporary probe: lists scripts, iframes, canvases and network hosts a page loads, to identify 3D/customizer vendors.
const puppeteer = require("puppeteer-core");
const url = process.argv[2];
const shot = process.argv[3];
(async () => {
  const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new" });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  const requests = new Set();
  page.on("request", (r) => { try { const u = new URL(r.url()); requests.add(`${u.hostname}${u.pathname.slice(0, 90)}`); } catch {} });
  await page.goto(url, { waitUntil: "networkidle2", timeout: 90000 });
  await new Promise((r) => setTimeout(r, 6000));
  await page.evaluate(() => window.scrollTo(0, 600));
  await new Promise((r) => setTimeout(r, 3000));
  if (shot) await page.screenshot({ path: shot });
  const info = await page.evaluate(() => ({
    title: document.title,
    generator: document.querySelector("meta[name=generator]")?.content || "",
    shopify: typeof window.Shopify !== "undefined",
    next: Boolean(document.getElementById("__NEXT_DATA__")),
    react: Boolean(document.querySelector("[data-reactroot], #root")),
    canvases: [...document.querySelectorAll("canvas")].map((c) => `${c.width}x${c.height} ${c.className} webgl=${Boolean(c.getContext && (c.getContext("webgl2") || c.getContext("webgl")))}`),
    modelViewer: document.querySelectorAll("model-viewer").length,
    iframes: [...document.querySelectorAll("iframe")].map((f) => f.src.slice(0, 120)),
    globals: ["THREE", "BABYLON", "fabric", "Konva", "Zakeke", "pacdora", "Pacdora", "Customily", "Threekit"].filter((k) => k in window),
    buttons: [...document.querySelectorAll("button, a")].map((b) => (b.innerText || "").trim()).filter((t) => /3d|customi|design|mockup|preview|personali/i.test(t)).slice(0, 15),
  }));
  console.log(JSON.stringify(info, null, 2));
  const hosts = {};
  for (const r of requests) { const h = r.split("/")[0]; hosts[h] = (hosts[h] || 0) + 1; }
  console.log("HOSTS:", JSON.stringify(hosts, null, 1));
  console.log("INTERESTING:\n" + [...requests].filter((r) => /3d|glb|gltf|three|babylon|model|mockup|custom|pacdora|zakeke|threekit|extensions|apps/i.test(r)).slice(0, 40).join("\n"));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
