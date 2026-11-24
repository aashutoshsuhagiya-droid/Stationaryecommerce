import assert from "node:assert/strict";
import test from "node:test";

import {
  LIFESTYLE_PHOTO_NOTE,
  packagingFaces,
  templateShapePlanForCategory,
  visualizationConfirmationFor,
  visualizationShapePlan,
} from "./visualization-shape-presets";
import { CATEGORY_LISTING_PLAYBOOK } from "./category-listing-playbook";
import { resolveVisualizationProductModel } from "./visualization-studio-service-policy";

const MODELS = [
  "folding-carton", "mailer-box", "square-box", "rectangular-box", "rigid-lid-box",
  "paper-bag", "stand-up-pouch", "mailer-envelope", "pyramid-box",
] as const;

test("every shape plan pairs a geometry kind with the dimensions that kind requires", () => {
  const required: Record<string, string[]> = {
    box: ["width", "height", "depth"],
    custom: ["width", "height", "depth"],
    bag: ["width", "height", "gusset"],
    pouch: ["width", "height", "gusset"],
  };
  for (const model of MODELS) {
    const plan = visualizationShapePlan(model);
    assert.ok(plan, `${model} needs a plan`);
    for (const key of required[plan.geometryKind]) {
      assert.ok((plan.dimensions[key] ?? 0) > 0, `${model} is missing ${key}`);
    }
  }
  assert.equal(visualizationShapePlan("label-pack"), undefined, "built-in models are not template shapes");
  assert.equal(visualizationShapePlan(undefined), undefined);
});

test("every plan resolves back to its own model, so publishing and the 3D invariant agree", () => {
  for (const model of MODELS) {
    const plan = visualizationShapePlan(model)!;
    const resolved = resolveVisualizationProductModel({
      productType: plan.model,
      geometry: { kind: plan.geometryKind },
      dimensions: plan.dimensions,
    });
    assert.equal(resolved, model, `${model} would publish as ${resolved}`);
  }
});

test("every model lists all of its faces, and only the front carries the photo", () => {
  const expected: Record<string, string[]> = {
    box: ["front", "back", "left", "right", "top", "bottom"],
    custom: ["front", "back", "left", "right", "top", "bottom"],
    bag: ["front", "back", "gusset-left", "gusset-right", "bottom"],
    pouch: ["front", "back", "gusset"],
  };
  for (const model of MODELS) {
    const plan = visualizationShapePlan(model)!;
    const faces = packagingFaces(plan);
    assert.deepEqual(faces.map((entry) => entry.face), expected[plan.geometryKind], `${model} face list`);
    assert.deepEqual(faces.filter((entry) => entry.textured).map((entry) => entry.face), ["front"]);
  }
});

test("shelf sizes replace the old one-size placeholder, and square boxes stay square", () => {
  const soap = templateShapePlanForCategory("soap-boxes");
  assert.deepEqual(soap?.dimensions, { width: 90, height: 60, depth: 30 });

  const perfume = templateShapePlanForCategory("perfume-cosmetic-boxes");
  assert.deepEqual(perfume?.dimensions, { width: 60, height: 150, depth: 60 });

  const bag = templateShapePlanForCategory("d-cut-paper-bags");
  assert.deepEqual(bag?.dimensions, { width: 250, height: 350, gusset: 80 }, "bags measure a gusset");

  const square = visualizationShapePlan("square-box");
  assert.equal(square?.dimensions.width, square?.dimensions.depth);
});

test("a product's own measured size beats the shelf default", () => {
  const plan = templateShapePlanForCategory("soap-boxes", {
    productDimensions: { width: 110, height: 70, depth: 40 },
  });
  assert.deepEqual(plan?.dimensions, { width: 110, height: 70, depth: 40 });

  const partial = templateShapePlanForCategory("soap-boxes", { productDimensions: { width: 110 } });
  assert.deepEqual(partial?.dimensions, { width: 90, height: 60, depth: 30 }, "an incomplete size is not trusted");
});

test("each shelf gets the model that matches its real shape", () => {
  assert.equal(templateShapePlanForCategory("mailer-bags")?.model, "mailer-envelope");
  assert.equal(templateShapePlanForCategory("mailer-bags")?.geometryKind, "custom");
  assert.equal(templateShapePlanForCategory("gift-event-boxes")?.model, "rigid-lid-box");
  assert.equal(templateShapePlanForCategory("shipping-boxes")?.model, "rectangular-box");
  assert.equal(
    templateShapePlanForCategory("shipping-boxes", { productName: "E-commerce Tuck Mailer" })?.model,
    "mailer-box",
  );
  assert.equal(
    templateShapePlanForCategory("shipping-boxes", { productSlug: "kraft-mailer-box-12" })?.model,
    "mailer-box",
  );
  assert.equal(templateShapePlanForCategory("soap-boxes")?.model, "folding-carton");
});

test("only template shelves get a plan; built-in and no-3D shelves get none", () => {
  assert.equal(templateShapePlanForCategory("customized-name-slips"), undefined, "built-in lane needs no template");
  assert.equal(templateShapePlanForCategory("business-cards"), undefined, "flat print has no model");
  assert.equal(templateShapePlanForCategory("food-trays-delivery"), undefined);
  assert.equal(templateShapePlanForCategory("not-a-shelf"), undefined);
  for (const recipe of CATEGORY_LISTING_PLAYBOOK.filter((item) => item.threeDPath === "template")) {
    assert.ok(templateShapePlanForCategory(recipe.categorySlug), `${recipe.categorySlug} promises a template but cannot build one`);
  }
});

test("a confident crop records its edge colour; a lifestyle shot asks for flat artwork", () => {
  const plan = visualizationShapePlan("folding-carton")!;

  const confident = visualizationConfirmationFor(plan, { confidence: "high", edgeColor: "#c0392b" });
  assert.deepEqual(confident.materialSettings, { artworkConfidence: "high", baseColor: "#c0392b" });
  assert.deepEqual(confident.surfaceMappings, [{ surfaceId: "front", label: "Front", role: "front" }]);
  assert.equal(confident.dimensions.unit, "mm");

  const lifestyle = visualizationConfirmationFor(plan, { confidence: "low", edgeColor: "#808080" });
  assert.equal(lifestyle.materialSettings.artworkNote, LIFESTYLE_PHOTO_NOTE);
  assert.equal("baseColor" in lifestyle.materialSettings, false, "a scene's edge colour is never trusted");

  assert.equal(visualizationConfirmationFor(plan).materialSettings.artworkConfidence, "low");
});
