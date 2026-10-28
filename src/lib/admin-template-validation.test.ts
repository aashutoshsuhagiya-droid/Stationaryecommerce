import assert from "node:assert/strict";
import test from "node:test";

import { validateAdminTemplate } from "./admin-template-validation";

const validSurface = {
  id: "front" as const,
  label: "Front",
  baseImageUrl: "https://cdn.example.com/front.png",
  sampleText: "Aarav",
  background: "#ffffff",
  foreground: "#111418",
  accent: "#3a3d42",
  safeArea: { x: 10, y: 15, width: 80, height: 70 },
  widthPx: 1772,
  heightPx: 591,
  dpi: 300,
};

const validTemplate = {
  name: "School label",
  theme: "School",
  description: "A reusable school label.",
  thumbnailUrl: "",
  premiumPrice: 0,
  rightsReference: "Merchant-owned artwork",
  surfaces: [validSurface],
};

test("complete front and back surfaces can be published", () => {
  const result = validateAdminTemplate({
    ...validTemplate,
    surfaces: [validSurface, { ...validSurface, id: "back", label: "Back", baseImageUrl: "" }],
  }, true);
  assert.equal(result.success, true);
});

test("packaging templates support additional named production surfaces", () => {
  const result = validateAdminTemplate({
    ...validTemplate,
    surfaces: [
      validSurface,
      { ...validSurface, id: "side-left", label: "Left side" },
      { ...validSurface, id: "gusset-right", label: "Right gusset" },
      { ...validSurface, id: "inside", label: "Inside" },
    ],
  }, true);
  assert.equal(result.success, true);
});

test("an incomplete template may be saved as a draft", () => {
  const result = validateAdminTemplate({
    ...validTemplate,
    surfaces: [{ ...validSurface, widthPx: 0, heightPx: 0, dpi: 0, safeArea: { x: 0, y: 0, width: 0, height: 0 } }],
  }, false);
  assert.equal(result.success, true);
});

test("publishing rejects missing geometry and safe area", () => {
  const result = validateAdminTemplate({
    ...validTemplate,
    surfaces: [{ ...validSurface, widthPx: 0, safeArea: { x: 80, y: 10, width: 30, height: 70 } }],
  }, true);
  assert.equal(result.success, false);
  if (result.success) return;
  assert.deepEqual(result.error.issues.map((issue) => issue.path.join(".")), [
    "surfaces.0.widthPx",
    "surfaces.0.safeArea",
  ]);
});

test("publishing requires a front surface", () => {
  const result = validateAdminTemplate({
    ...validTemplate,
    surfaces: [{ ...validSurface, id: "back", label: "Back" }],
  }, true);
  assert.equal(result.success, false);
  if (result.success) return;
  assert.equal(result.error.issues.some((issue) => issue.path.join(".") === "surfaces"), true);
});

test("duplicate surface identifiers are rejected", () => {
  const result = validateAdminTemplate({ ...validTemplate, surfaces: [validSurface, { ...validSurface }] }, false);
  assert.equal(result.success, false);
});

test("surface identifiers and the eight-surface limit are enforced", () => {
  assert.equal(validateAdminTemplate({
    ...validTemplate,
    surfaces: [{ ...validSurface, id: "Side Left" }],
  }, false).success, false);

  assert.equal(validateAdminTemplate({
    ...validTemplate,
    surfaces: Array.from({ length: 9 }, (_, index) => ({
      ...validSurface,
      id: index === 0 ? "front" : `surface-${index}`,
      label: `Surface ${index + 1}`,
    })),
  }, false).success, false);
});

test("templates accept the narrow first-party product image path", () => {
  assert.equal(validateAdminTemplate({
    ...validTemplate,
    surfaces: [{ ...validSurface, baseImageUrl: "/api/product-images/asset_123" }],
  }, false).success, true);
  assert.equal(validateAdminTemplate({
    ...validTemplate,
    surfaces: [{ ...validSurface, baseImageUrl: "/relative/image.png" }],
  }, false).success, false);
});
