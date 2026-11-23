import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { parseRanbazaarStudio, readableFieldLabel, sourcePx } from "./ranbazaar-studio";

const fixture = (slug: string) =>
  JSON.parse(readFileSync(`docs/research/ranbazaar/products/${slug}.json`, "utf8")).product;

const PARKER = "parker-classic-matte-bp-ball-pen-engraved-your-name-on-pen-with-box-black";
const EXAM_BOARD = "add-a-personal-touch-to-exam-boards-custom-names-and-photos-for-kids";

test("Parker pen: two designs, one shared name field with the source's 13-character limit", () => {
  const studio = parseRanbazaarStudio(fixture(PARKER));
  assert.deepEqual(studio.samples.map((sample) => sample.name), ["Sample_1", "Sample_2"], "Sample_3 has no mockup");
  assert.equal(studio.defaultSampleIndex, 0, "defaultSample 0 is Sample_1");
  assert.equal(studio.fields.length, 1, "the same input on both designs is one field");
  const [name] = studio.fields;
  assert.deepEqual(
    { key: name.key, label: name.label, required: name.required, maxLength: name.maxLength, placeholder: name.placeholder },
    { key: "your-name", label: "Your name", required: true, maxLength: 13, placeholder: "YOUR NAME" },
  );
  for (const sample of studio.samples) {
    assert.deepEqual(sample.texts.map((input) => input.fieldKey), ["your-name"], `${sample.name} binds the shared field`);
  }
});

test("Parker pen: text sits at the measured canvas position with the source style", () => {
  const [first, second] = parseRanbazaarStudio(fixture(PARKER)).samples;
  const input = first.texts[0];
  assert.deepEqual({ x: input.x, y: input.y, width: input.width, height: input.height }, { x: 342, y: 285, width: 200, height: null });
  assert.deepEqual(input.style, {
    sourceFont: "Gilroy Extrabold",
    fontSize: 24,
    fontWeight: 700,
    color: "#fad000",
    textAlign: "center",
    rotation: 0,
    sourceRotation: 0,
    textTransform: "capitalize",
    letterSpacing: 0,
  });
  assert.equal(second.texts[0].width, 210, '"210px" is parsed as 210');
  assert.equal(second.texts[0].style.rotation, 0, "a null rotation is no rotation");
});

test("a stored source rotation is not drawn, matching the reference storefront", () => {
  // Measured on ranbazaar.com: this field stores rotation -48 but renders with rotate(0deg).
  const studio = parseRanbazaarStudio(fixture("create-your-own-exam-board-custom-names-for-kids-personalized-learning"));
  const input = studio.samples[studio.defaultSampleIndex].texts[0];
  assert.equal(input.style.sourceRotation, -48);
  assert.equal(input.style.rotation, 0);
});

test("a 'lighter' single-face source font draws at regular weight, as on the reference", () => {
  // Measured side by side: the shagun envelope's "Aleo Regular" + fontWeight "lighter" renders regular.
  const studio = parseRanbazaarStudio(fixture("beautifully-customized-shagun-envelopes-for-special-moments---pack-of-25"));
  const texts = studio.samples[studio.defaultSampleIndex].texts;
  assert.ok(texts.length >= 3);
  for (const input of texts) assert.deepEqual({ font: input.style.sourceFont, weight: input.style.fontWeight }, { font: "Aleo Regular", weight: 400 });
});

test("the canvas is the mockup fitted into 600 × 600, anchored top-left", async () => {
  const { studioCanvasForMockup } = await import("./ranbazaar-studio");
  // Sizes measured on ranbazaar.com: the Avenger name slip shows 600 × 386, the exam board 422 × 600.
  assert.deepEqual(studioCanvasForMockup({ width: 1400, height: 900 }), { width: 600, height: 386 });
  assert.deepEqual(studioCanvasForMockup({ width: 1013, height: 1440 }), { width: 422, height: 600 });
  assert.deepEqual(studioCanvasForMockup({ width: 1000, height: 1000 }), { width: 600, height: 600 });
  assert.deepEqual(studioCanvasForMockup({ width: 300, height: 150 }), { width: 600, height: 300 }, "small mockups scale up, like CSS contain");
  assert.deepEqual(studioCanvasForMockup(null), { width: 600, height: 600 }, "unknown size → the reference's square box");
});

test("every catalogue mockup has a cached size", async () => {
  const { loadMockupSizes } = await import("./mockup-sizes");
  const { readdirSync } = await import("node:fs");
  const sizes = loadMockupSizes();
  const missing: string[] = [];
  for (const file of readdirSync("docs/research/ranbazaar/products").filter((name) => name.endsWith(".json"))) {
    for (const sample of parseRanbazaarStudio(fixture(file.replace(/\.json$/u, ""))).samples) {
      if (!sizes.has(sample.mockupUrl)) missing.push(sample.mockupUrl);
    }
  }
  assert.deepEqual(missing, [], "run 2d-templates.ts to measure new mockups");
});

test("photo slots become image fields at the source position", () => {
  const studio = parseRanbazaarStudio(fixture(EXAM_BOARD));
  const photoField = studio.fields.find((field) => field.inputType === "image");
  assert.ok(photoField, "the exam board has a photo slot");
  assert.equal(photoField.key, "photo");
  assert.equal(photoField.required, true);
  const slot = studio.samples.flatMap((sample) => sample.photos)[0];
  assert.deepEqual({ x: slot.x, y: slot.y, width: slot.width, height: slot.height }, { x: 89, y: 0, width: 424, height: 601 });
});

test("two inputs with the same slug inside one design stay two fields", () => {
  const studio = parseRanbazaarStudio({
    defaultSample: 0,
    customizeDetails: [{
      name: "Sample_1",
      productImg: "https://example.test/a.webp",
      inputFields: [
        { slug: "kid_name", name: "ENTER YOUR NAME", value: "NAME ONE", x: 10, y: 10, width: "100", maxLength: "20", style: {} },
        { slug: "kid_name", name: "ENTER YOUR NAME", value: "NAME TWO", x: 10, y: 60, width: "100", maxLength: "18", style: {} },
      ],
    }, {
      name: "Sample_2",
      productImg: "https://example.test/b.webp",
      inputFields: [
        { slug: "kid_name", name: "ENTER YOUR NAME", value: "NAME ONE", x: 20, y: 20, width: "100", maxLength: "15", style: {} },
      ],
    }],
  });
  assert.deepEqual(studio.fields.map((field) => field.key), ["kid-name", "kid-name-2"]);
  assert.equal(studio.fields[0].maxLength, 15, "a shared field takes the tightest limit so it fits every design");
  assert.equal(studio.fields[1].maxLength, 18);
});

test("labels read as plain language while the source text stays the placeholder", () => {
  assert.equal(readableFieldLabel("ENTER YOUR NAME", "Kid Name"), "Your name");
  assert.equal(readableFieldLabel("ENETR YOUR SCHOOL NAME", "School Name"), "Your school name");
  assert.equal(readableFieldLabel("Enter Phone", "Customer Name 2"), "Phone", "a misleading source label is not used");
  assert.equal(readableFieldLabel("", "Kid Name"), "Kid name", "a blank name falls back to the source label");
  assert.equal(readableFieldLabel(null, null), "Your text");
});

test("source lengths are parsed from px strings and numbers", () => {
  assert.equal(sourcePx("424px"), 424);
  assert.equal(sourcePx(" 200 "), 200);
  assert.equal(sourcePx(342), 342);
  assert.equal(sourcePx(""), null);
  assert.equal(sourcePx("auto"), null);
});

test("the whole catalogue parses, and no product exceeds the 20-field cap or the 45-character limit", () => {
  const { readdirSync } = require("node:fs") as typeof import("node:fs");
  let samples = 0;
  let fields = 0;
  for (const file of readdirSync("docs/research/ranbazaar/products").filter((name) => name.endsWith(".json"))) {
    const studio = parseRanbazaarStudio(fixture(file.replace(/\.json$/u, "")));
    samples += studio.samples.length;
    fields += studio.fields.length;
    assert.equal(studio.overflow, 0, `${file} overflows the field cap`);
    for (const field of studio.fields) {
      if (field.maxLength !== null) assert.ok(field.maxLength >= 1 && field.maxLength <= 45, `${file} ${field.key}`);
    }
    assert.ok(studio.defaultSampleIndex < Math.max(1, studio.samples.length));
  }
  assert.equal(samples, 1141, "every sample with a mockup becomes a design");
  assert.ok(fields > 0);
});

test("Parker pen templates: two designs, Sample_1 default, layout readable by the storefront", async () => {
  const { studioTemplateRecord } = await import("./ranbazaar-studio");
  const { readStudioConfig } = await import("../../src/lib/studio-template");
  const { normalizeTemplateProduction } = await import("../../src/lib/template-production");
  const studio = parseRanbazaarStudio(fixture(PARKER));
  const records = studio.samples.map((_sample, position) =>
    studioTemplateRecord({ externalId: "abc123", studio, position, includePhotos: false, mockupSize: { width: 1000, height: 1000 } }));

  assert.deepEqual(records.map((record) => record.slug), ["rb-abc123-s0", "rb-abc123-s1"], "slugs are deterministic per source sample");
  assert.deepEqual(records.map((record) => record.isDefault), [true, false]);
  assert.deepEqual(records.map((record) => record.name), ["Design 1", "Design 2"]);

  const config = readStudioConfig(records[0].previewConfig);
  assert.ok(config, "the storefront can read the studio block");
  assert.deepEqual(config.canvas, { width: 600, height: 600 });
  const [layer] = config.texts;
  assert.deepEqual(
    { fieldKey: layer.fieldKey, x: layer.x, y: layer.y, width: layer.width, fontId: layer.fontId, color: layer.color, textTransform: layer.textTransform, placeholder: layer.placeholder },
    { fieldKey: "your-name", x: 342, y: 285, width: 200, fontId: "montserrat", color: "#fad000", textTransform: "capitalize", placeholder: "YOUR NAME" },
  );

  // The legacy preview contract: without it the storefront silently drops the template.
  const preview = records[0].previewConfig as Record<string, unknown>;
  for (const key of ["background", "foreground", "accent"]) assert.match(String(preview[key]), /^#[0-9a-f]{3,8}$/i, key);
  assert.match(String(preview.fontFamily), /^[a-z0-9 ,'-]{1,80}$/i);
  const production = normalizeTemplateProduction(records[0]);
  assert.equal(production.widthPx, 600);
  assert.equal(production.dpi, 300);
});

test("photo slots ride on the design templates and switch uploads on; they are never personalization fields", async () => {
  const { planRanbazaarStudio } = await import("./studio-writer");
  const { readStudioConfig } = await import("../../src/lib/studio-template");
  const plan = planRanbazaarStudio("exam", fixture(EXAM_BOARD), new Map());
  assert.equal(plan.acceptsPhotos, true);
  assert.ok(plan.fields.every((field) => field.inputType === "text"), "no image fields");
  const config = readStudioConfig(plan.templates[0].previewConfig);
  assert.deepEqual(config?.photos, [{
    fieldKey: "photo", x: 89, y: 0, width: 424, height: 601, shape: "rect", stacking: "under",
    sampleUrl: "https://ranbazartesting.s3.ap-south-1.amazonaws.com/productimages/1736936479906-222950906.webp",
  }], "the empty slot shows the source demo photo, like the reference");
  assert.equal(planRanbazaarStudio("parker", fixture(PARKER), new Map()).acceptsPhotos, false);
});

test("upload settings use the stored configurator keys the runtime catalog reads", async () => {
  // runtime-catalog.ts reads a boolean `artworkUpload`, a flat `acceptedMimeTypes` list and
  // `maximumArtworkBytes` (the admin form's format). A nested { enabled, acceptedMimeTypes }
  // object reads back as "uploads on, no types allowed", which silently hides every photo slot.
  const { STUDIO_PHOTO_UPLOAD } = await import("./studio-writer");
  assert.deepEqual(STUDIO_PHOTO_UPLOAD, {
    artworkUpload: true,
    acceptedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    maximumArtworkBytes: 10 * 1024 * 1024,
  });
});

test("a wide mockup's template: canvas, surface and production all follow its aspect", async () => {
  const { studioTemplateRecord } = await import("./ranbazaar-studio");
  const { readStudioConfig } = await import("../../src/lib/studio-template");
  const studio = parseRanbazaarStudio(fixture("avenger-name-slip"));
  const position = studio.defaultSampleIndex;
  const record = studioTemplateRecord({ externalId: "slip", studio, position, includePhotos: false, mockupSize: { width: 1400, height: 900 } });
  const config = readStudioConfig(record.previewConfig);
  assert.deepEqual(config?.canvas, { width: 600, height: 386 });
  assert.deepEqual({ w: record.productionWidthPx, h: record.productionHeightPx }, { w: 600, h: 386 });
  const surface = (record.previewConfig.surfaces as Array<Record<string, unknown>>)[0];
  assert.deepEqual({ w: surface.widthPx, h: surface.heightPx }, { w: 600, h: 386 });
  // The default sample's name sits at the source position inside that canvas (y 20, not 127 as on Sample_1).
  assert.deepEqual({ x: Math.round(config!.texts[0].x), y: Math.round(config!.texts[0].y) }, { x: 69, y: 20 });
});
