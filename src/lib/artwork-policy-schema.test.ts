import assert from "node:assert/strict";
import test from "node:test";

import { productArtworkPolicySchema } from "./artwork-policy-schema";
import type { ProductArtworkPolicy } from "./types";

function validPolicy(): ProductArtworkPolicy {
  const geometry = {
    default: { x: 20, y: 20, width: 60, height: 30, rotation: 0 },
    minimumWidth: 10,
    maximumWidth: 160,
    minimumHeight: 10,
    maximumHeight: 80,
    minimumRotation: -30,
    maximumRotation: 30,
  };
  const permissions = { move: true, resize: true, rotate: true, color: true, font: true };
  return {
    maximumElements: 4,
    surfaces: [{
      id: "front",
      label: "Front",
      coordinateSpace: { width: 200, height: 100 },
      printableBounds: { x: 10, y: 10, width: 180, height: 80 },
      text: {
        enabled: true,
        maximumElements: 2,
        permissions,
        geometry,
        defaultColor: "#17324d",
        allowedColors: ["#17324d"],
        defaultFontFamily: "rounded" as const,
        allowedFontFamilies: ["rounded" as const],
        defaultFontSize: 24,
        minimumFontSize: 12,
        maximumFontSize: 48,
        defaultTextAlign: "center" as const,
        allowedTextAlignments: ["left" as const, "center" as const],
      },
      image: {
        enabled: true,
        maximumElements: 1,
        permissions,
        geometry,
        allowedMimeTypes: ["image/png" as const],
        maximumBytes: 2_000_000,
        minimumSourceWidth: 300,
        maximumSourceWidth: 10_000,
        minimumSourceHeight: 300,
        maximumSourceHeight: 10_000,
        allowedAspectRatios: [],
        aspectRatioTolerance: 0.02,
        allowTransparency: true,
        allowCrop: false,
        required: false,
        approvalRequired: true,
        chargePerImagePaise: 5000,
      },
    }],
  };
}

test("product artwork policy schema accepts a bounded production policy", () => {
  assert.equal(productArtworkPolicySchema.safeParse(validPolicy()).success, true);
});

test("product artwork policy schema rejects unsafe geometry and incomplete upload rules", () => {
  const policy = validPolicy();
  policy.surfaces[0].printableBounds.width = 300;
  policy.surfaces[0].image.allowedMimeTypes = [];
  const parsed = productArtworkPolicySchema.safeParse(policy);
  assert.equal(parsed.success, false);
  if (parsed.success) return;
  assert.ok(parsed.error.issues.some((issue) => issue.path.includes("printableBounds")));
  assert.ok(parsed.error.issues.some((issue) => issue.path.includes("allowedMimeTypes")));
});

test("product artwork policy schema rejects invalid typography ranges", () => {
  const policy = validPolicy();
  policy.surfaces[0].text.minimumFontSize = 40;
  policy.surfaces[0].text.maximumFontSize = 20;
  policy.surfaces[0].text.defaultTextAlign = "right";
  const parsed = productArtworkPolicySchema.safeParse(policy);
  assert.equal(parsed.success, false);
  if (parsed.success) return;
  assert.ok(parsed.error.issues.some((issue) => issue.path.includes("maximumFontSize")));
  assert.ok(parsed.error.issues.some((issue) => issue.path.includes("defaultTextAlign")));
});
