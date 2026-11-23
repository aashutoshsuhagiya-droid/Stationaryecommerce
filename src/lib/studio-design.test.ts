import assert from "node:assert/strict";
import test from "node:test";

import {
  boundFieldKeys,
  defaultDesignPayload,
  defaultStudioDesign,
  DEFAULT_STUDIO_FIELD,
  fieldOnlyOnLayer,
  isStudioTemplateSlug,
  newStudioPhotoSlot,
  newStudioTextLayer,
  planStudioFields,
  pruneUnusedStudioFields,
  rescaleStudioConfig,
  snapToCentre,
  studioCanvasForImage,
  studioEditedInAdmin,
  studioKeyFromLabel,
  studioSaveSchema,
  studioTemplateData,
  uniqueStudioKey,
  withOneDefaultDesign,
  type StudioDesignInput,
  type StudioFieldInput,
} from "./studio-design";
import { missingStudioPhotos } from "./studio-photo";
import { readStudioConfig, STUDIO_LINE_HEIGHT } from "./studio-template";
import { normalizeTemplateProduction } from "./template-production";

const MOCKUP = "https://dyuh5x5qbqu9p.cloudfront.net/productimages/slip.webp";
const nameField: StudioFieldInput = { key: "your-name", label: "Your name", required: true, maxLength: 13, placeholder: "YOUR NAME" };

function design(overrides: Partial<StudioDesignInput> = {}, canvas = { width: 600, height: 386 }): StudioDesignInput {
  return {
    name: "Design 1",
    isDefault: true,
    studio: { version: 1, canvas, background: { url: MOCKUP, color: null }, texts: [newStudioTextLayer(canvas, "your-name", "YOUR NAME")], photos: [] },
    ...overrides,
  };
}

const payload = (designs: StudioDesignInput[], fields: StudioFieldInput[] = [nameField]) => ({ productId: "prod_1", designs, fields });
const messages = (input: unknown) => {
  const result = studioSaveSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
};

test("a saved design is a template the storefront and production can read", () => {
  const studio = design().studio;
  const data = studioTemplateData(studio);
  const config = readStudioConfig(data.previewConfig);
  assert.ok(config, "the storefront reads the studio block");
  assert.deepEqual(config.canvas, { width: 600, height: 386 });
  assert.equal(config.texts[0].fieldKey, "your-name");
  assert.deepEqual({ w: data.productionWidthPx, h: data.productionHeightPx, dpi: data.productionDpi }, { w: 600, h: 386, dpi: 300 });
  assert.equal(data.thumbnailUrl, MOCKUP);
  for (const key of ["background", "foreground", "accent"] as const) assert.match(String(data.previewConfig[key]), /^#[\da-f]{3,8}$/iu, key);
  const production = normalizeTemplateProduction({ ...data, previewConfig: data.previewConfig, productionConfig: data.productionConfig });
  assert.equal(production.widthPx, 600);
});

test("the save payload: a valid design passes, and every broken binding or placement is named", () => {
  assert.deepEqual(messages(payload([design()])), []);
  assert.match(messages(payload([design()], []))[0], /field that does not exist/u, "text bound to a missing field");
  assert.match(messages(payload([design()], [nameField, { ...nameField, key: "class", label: "Class" }]))[0], /"Class" is not shown on any design/u);
  const outside = design();
  outside.studio.texts[0] = { ...outside.studio.texts[0], x: 700 };
  assert.match(messages(payload([outside])).join(" "), /outside the design/u);
  const sampleOnly = design({ studio: { ...design().studio, texts: [] } });
  assert.deepEqual(messages(payload([sampleOnly], [])), [], "a picture-only design (as the reference has) is allowed");
  const twoPhotos = design();
  twoPhotos.studio.photos = [newStudioPhotoSlot(twoPhotos.studio.canvas, "photo"), newStudioPhotoSlot(twoPhotos.studio.canvas, "photo")];
  assert.match(messages(payload([twoPhotos])).join(" "), /share the key "photo"/u);
  assert.match(messages(payload([design(), design({ name: "Design 2" })])).join(" "), /Choose one design to show first/u);
  assert.match(messages(payload([design({ studio: { ...design().studio, background: { url: "http://example.test/a.png", color: null } } })])).join(" "), /https image/u);
  assert.deepEqual(messages(payload([design({ studio: { ...design().studio, background: { url: "/api/product-images/abc_123", color: "#ffffff" } } })])), [], "uploaded images are fine");
  const badFont = design();
  badFont.studio.texts[0] = { ...badFont.studio.texts[0], fontId: "gilroy" as never };
  assert.match(messages(payload([badFont])).join(" "), /studio fonts/u);
});

test("exactly one design is shown first", () => {
  assert.deepEqual(withOneDefaultDesign([{ isDefault: false }, { isDefault: false }]).map((item) => item.isDefault), [true, false]);
  assert.deepEqual(withOneDefaultDesign([{ isDefault: false }, { isDefault: true }]).map((item) => item.isDefault), [false, true]);
});

test("saving manages only the fields designs bind: unused ones go, others are never touched", () => {
  const plan = planStudioFields({
    existing: [{ key: "your-name", inputType: "text" }, { key: "school", inputType: "text" }, { key: "class-details", inputType: "select" }],
    previouslyBound: ["your-name", "school"],
    fields: [nameField],
  });
  assert.deepEqual(plan.deletes, ["school"], "a field no design shows any more is removed");
  assert.deepEqual(plan.conflicts, []);
  const conflict = planStudioFields({ existing: [{ key: "class-details", inputType: "select" }], previouslyBound: [], fields: [{ ...nameField, key: "class-details" }] });
  assert.deepEqual(conflict.conflicts, ["class-details"], "a dropdown is never overwritten by a text field");
});

test("removing text keeps a field another design still shows, and drops it when it was the last one", () => {
  const designs = [design(), design({ name: "Design 2", isDefault: false })];
  assert.equal(fieldOnlyOnLayer(designs, 0, 0), null, "Design 2 still shows the name");
  const afterRemoval = [{ ...designs[0], studio: { ...designs[0].studio, texts: [] } }, designs[1]];
  assert.deepEqual(pruneUnusedStudioFields([nameField], afterRemoval).removed, []);
  const single = [design()];
  assert.equal(fieldOnlyOnLayer(single, 0, 0), "your-name");
  assert.deepEqual(pruneUnusedStudioFields([nameField], [{ studio: { texts: [] } }]), { fields: [], removed: ["your-name"] });
  assert.deepEqual(boundFieldKeys(designs), ["your-name"]);
});

test("new layers start centred in the middle 60%, sized for the canvas", () => {
  const canvas = { width: 600, height: 386 };
  const text = newStudioTextLayer(canvas, "your-name", "Your name");
  assert.deepEqual({ x: text.x, width: text.width }, { x: 120, width: 360 });
  const centreY = text.y + (text.fontSize * STUDIO_LINE_HEIGHT) / 2;
  assert.ok(Math.abs(centreY - canvas.height / 2) <= 1, "vertically centred");
  assert.equal(text.autoFit, true, "long names shrink instead of overflowing");
  const slot = newStudioPhotoSlot(canvas, "photo");
  assert.equal(slot.width, Math.round(386 * 0.4));
  assert.equal(slot.stacking, "over", "visible on an opaque mockup");
  assert.equal(Math.round(slot.x + slot.width / 2), 300);
});

test("a first design from the product photo fits the photo and binds one name field", () => {
  const config = defaultStudioDesign("/api/product-images/abc", { width: 1200, height: 800 });
  assert.deepEqual(config.canvas, { width: 600, height: 400 });
  assert.equal(config.texts[0].fieldKey, DEFAULT_STUDIO_FIELD.key);
  assert.deepEqual(studioCanvasForImage(null), { width: 600, height: 600 });
});

test("a new personalised listing gets a valid first design from its photo; others get none", () => {
  const fields = [
    { key: "class-details", label: "Class", inputType: "select", required: false, maxLength: null },
    { key: "name", label: "Child name", inputType: "text", required: true, maxLength: 18, placeholder: "" },
  ];
  const payload = defaultDesignPayload({ productId: "prod_1", imageUrl: "/api/product-images/img_1", imageSize: { width: 1000, height: 800 }, fields });
  assert.ok(payload);
  assert.deepEqual(messages(payload), [], "the save API accepts it as is");
  assert.deepEqual(payload.fields, [{ key: "name", label: "Child name", required: true, maxLength: 18, placeholder: "Child name" }]);
  assert.deepEqual(payload.designs[0].studio.canvas, { width: 600, height: 480 });
  assert.equal(payload.designs[0].studio.texts[0].fieldKey, "name");
  assert.equal(defaultDesignPayload({ productId: "p", imageUrl: "/api/product-images/pending", imageSize: null, fields }), null, "the wizard's placeholder is not a photo");
  assert.equal(defaultDesignPayload({ productId: "p", imageUrl: "", imageSize: null, fields }), null, "no photo, no design");
  assert.equal(defaultDesignPayload({ productId: "p", imageUrl: "/api/product-images/x", imageSize: null, fields: [fields[0]] }), null, "no text field, no design");
  assert.equal(defaultDesignPayload({ productId: "p", imageUrl: "/api/product-images/x", imageSize: null, fields: [{ ...fields[1], customerVisible: false }] }), null, "hidden fields are skipped");
});

test("a replaced mockup with another shape keeps every layer in its relative place", () => {
  const original = design({}, { width: 600, height: 600 }).studio;
  original.photos = [{ fieldKey: "photo", x: 100, y: 300, width: 200, height: 200, shape: "circle", stacking: "under" }];
  const scaled = rescaleStudioConfig(original, { width: 600, height: 300 });
  assert.deepEqual(scaled.canvas, { width: 600, height: 300 });
  assert.deepEqual({ y: scaled.photos[0].y, height: scaled.photos[0].height, x: scaled.photos[0].x }, { y: 150, height: 100, x: 100 });
  assert.equal(scaled.texts[0].fontSize, original.texts[0].fontSize / 2, "text shrinks with the smaller side");
});

test("snapping, keys and the admin-edit mark", () => {
  assert.deepEqual(snapToCentre(197, 200, 600), { value: 200, snapped: true });
  assert.deepEqual(snapToCentre(180, 200, 600), { value: 180, snapped: false });
  assert.equal(studioKeyFromLabel("Your Name!", "field"), "your-name");
  assert.equal(studioKeyFromLabel("123", "field"), "field");
  assert.equal(uniqueStudioKey("photo", ["photo", "photo-2"]), "photo-3");
  assert.equal(studioEditedInAdmin({ studioEditedAt: "2026-11-22T10:00:00.000Z" }), true);
  assert.equal(studioEditedInAdmin({}), false);
  assert.equal(isStudioTemplateSlug("st-prod-ab12cd34"), true);
  assert.equal(isStudioTemplateSlug("school-theme"), false);
});

test("photo slot label and 'optional' survive storage; an optional slot never blocks the order", () => {
  const studio = design().studio;
  studio.photos = [
    { ...newStudioPhotoSlot(studio.canvas, "photo"), label: "Child photo" },
    { ...newStudioPhotoSlot(studio.canvas, "logo"), required: false },
  ];
  const config = readStudioConfig(studioTemplateData(studio).previewConfig);
  assert.ok(config);
  assert.equal(config.photos[0].label, "Child photo");
  assert.equal(config.photos[1].required, false);
  assert.deepEqual(missingStudioPhotos(config, []), ["photo"], "only the required slot is missing");
});
