import assert from "node:assert/strict";
import test from "node:test";

import {
  applyTextTransform,
  layoutStudioText,
  readStudioConfig,
  STUDIO_LINE_HEIGHT,
  type StudioTextLayer,
} from "./studio-template";
import { studioFontForSource, studioFontStack } from "./studio-fonts";

/** Monospace stand-in for canvas measureText: each glyph is 0.6 em, plus letter spacing. */
const measure = (text: string, fontSize: number, layer: StudioTextLayer) =>
  text.length * fontSize * 0.6 + Math.max(0, text.length - 1) * layer.letterSpacing;

const parkerLayer: StudioTextLayer = {
  fieldKey: "your-name",
  x: 342,
  y: 285,
  width: 200,
  height: null,
  placeholder: "YOUR NAME",
  fontId: "montserrat",
  fontSize: 24,
  fontWeight: 700,
  color: "#fad000",
  textAlign: "center",
  rotation: 0,
  textTransform: "capitalize",
  letterSpacing: 0,
  autoFit: false,
};

test("Parker pen: the name sits in the measured 200 × 36 box, centred, at 342,285", () => {
  const layout = layoutStudioText(parkerLayer, "aarav", measure);
  assert.equal(layout.text, "Aarav", "capitalize raises the first letter");
  assert.equal(layout.lines.length, 1);
  assert.equal(layout.lineHeight, 36, "24 px text in a 36 px line, as rendered live");
  assert.equal(layout.boxHeight, 36);
  assert.equal(layout.anchorX, 100, "centre alignment anchors at half the 200 px width");
  assert.deepEqual(layout.lineCenters, [18]);
  assert.deepEqual(layout.pivot, { x: 442, y: 303 });
});

test("an empty field shows the source placeholder on the mockup", () => {
  const layout = layoutStudioText(parkerLayer, "   ", measure);
  assert.equal(layout.isPlaceholder, true);
  assert.equal(layout.text, "YOUR NAME", "capitalize leaves an all-caps placeholder as it is");
});

test("casing follows CSS text-transform", () => {
  assert.equal(applyTextTransform("aarav sharma", "capitalize"), "Aarav Sharma");
  assert.equal(applyTextTransform("AARAV sharma", "capitalize"), "AARAV Sharma", "capitalize never lowercases");
  assert.equal(applyTextTransform("aarav sharma", "uppercase"), "AARAV SHARMA");
  assert.equal(applyTextTransform("Aarav", "none"), "Aarav");
});

test("auto-fit shrinks long text into the box instead of wrapping", () => {
  const fit = layoutStudioText({ ...parkerLayer, autoFit: true }, "aaravsharmakumar", measure);
  assert.equal(fit.lines.length, 1);
  assert.ok(fit.fontSize < 24, "shrinks");
  assert.ok(Math.abs(measure(fit.text, fit.fontSize, parkerLayer) - 200) < 1e-6, "exactly fills the width");
  assert.equal(fit.lineHeight, fit.fontSize * STUDIO_LINE_HEIGHT);
});

test("without auto-fit, long text wraps onto more lines like the reference's CSS box", () => {
  const wrapped = layoutStudioText(parkerLayer, "aarav sharma kumar", measure);
  assert.ok(wrapped.lines.length > 1);
  assert.equal(wrapped.boxHeight, wrapped.lines.length * 36);
  assert.deepEqual(wrapped.lineCenters.slice(0, 2), [18, 54]);
});

test("a substitute font with a glyph scale draws larger glyphs on the source line box", () => {
  // Bottle sticker: Roundkey Medium 85 px → Bebas Neue, drawn 1.55× and nudged down so the capitals match.
  const bottle: StudioTextLayer = { ...parkerLayer, fontId: "bebas-neue", fontSize: 85, width: 753, textTransform: "uppercase" };
  const layout = layoutStudioText(bottle, "aarav", measure);
  assert.equal(layout.fontSize, 85 * 1.55, "glyphs at 85 × 1.55");
  assert.equal(layout.lineHeight, 127.5, "the line box stays 1.5 × the source size, so the text does not move");
  assert.ok(Math.abs(layout.lineCenters[0] - (63.75 + 0.053 * 85 * 1.55)) < 1e-9, "the line centre, nudged by the font's glyph shift");
  assert.equal(layout.boxHeight, 127.5);
  // Wrapping and auto-fit measure the glyphs that are actually drawn.
  const fit = layoutStudioText({ ...bottle, width: 300, autoFit: true }, "aaravsharma", measure);
  assert.ok(Math.abs(measure(fit.text, fit.fontSize, bottle) - 300) < 1e-6, "the drawn text exactly fills the width");
  assert.ok(Math.abs(fit.lineHeight - (fit.fontSize / 1.55) * STUDIO_LINE_HEIGHT) < 1e-9);
});

test("rotation pivots on the box centre; alignment moves the anchor", () => {
  const rotated = layoutStudioText({ ...parkerLayer, rotation: 90 }, "Aarav", measure);
  assert.deepEqual(rotated.pivot, { x: 442, y: 303 });
  assert.equal(layoutStudioText({ ...parkerLayer, textAlign: "left" }, "Aarav", measure).anchorX, 0);
  assert.equal(layoutStudioText({ ...parkerLayer, textAlign: "right" }, "Aarav", measure).anchorX, 200);
});

test("studio config is read defensively: malformed layers are dropped, not drawn", () => {
  const config = readStudioConfig({
    studio: {
      version: 1,
      canvas: { width: 600, height: 600 },
      background: { url: "https://cdn.example.test/pen.webp", color: "#f4f5f6" },
      texts: [
        { ...parkerLayer },
        { fieldKey: "Bad Key", x: 0, y: 0, width: 10 },
        { fieldKey: "no-width", x: 0, y: 0, width: 0 },
      ],
      photos: [{ fieldKey: "photo", x: 89, y: 0, width: 424, height: 601, stacking: "under" }],
    },
  });
  assert.ok(config);
  assert.equal(config.texts.length, 1);
  assert.equal(config.photos[0].stacking, "under");
  assert.equal(readStudioConfig({ studio: { version: 1, canvas: { width: 600, height: 600 }, background: { url: "javascript:alert(1)" } } }), undefined);
  assert.equal(readStudioConfig({}), undefined);
});

test("source fonts map to shippable open fonts, with the browser variable first", () => {
  assert.equal(studioFontForSource("Gilroy Extrabold"), "montserrat");
  assert.equal(studioFontForSource("Allura-Regular"), "allura");
  assert.equal(studioFontForSource("Roundkey Medium"), "bebas-neue");
  assert.equal(studioFontForSource("Elmessiri bold"), "el-messiri");
  assert.equal(studioFontForSource("Unknown Display"), "montserrat");
  assert.equal(
    studioFontStack("montserrat", (name) => (name === "--font-studio-montserrat" ? "'__Montserrat_abc'" : "")),
    "'__Montserrat_abc', 'Montserrat', Arial, sans-serif",
  );
  assert.equal(studioFontStack("serif"), "Georgia, 'Times New Roman', serif");
});
