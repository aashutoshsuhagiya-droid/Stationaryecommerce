import assert from "node:assert/strict";
import test from "node:test";

import { resolveArtworkTextTypography } from "./artwork-text-policy";
import type { ArtworkTextPolicy } from "./types";

function policy(overrides: Partial<ArtworkTextPolicy> = {}): ArtworkTextPolicy {
  return {
    enabled: true,
    maximumElements: 1,
    permissions: { move: true, resize: true, rotate: true, color: true, font: true },
    geometry: {
      default: { x: 0, y: 0, width: 100, height: 40, rotation: 0 },
      minimumWidth: 10,
      maximumWidth: 100,
      minimumHeight: 10,
      maximumHeight: 40,
      minimumRotation: -180,
      maximumRotation: 180,
    },
    defaultColor: "#112233",
    allowedColors: [],
    defaultFontFamily: "sans",
    allowedFontFamilies: ["sans"],
    ...overrides,
  };
}

test("legacy text policies receive backward-compatible typography defaults", () => {
  assert.deepEqual(resolveArtworkTextTypography(policy()), {
    minimumFontSize: 8,
    maximumFontSize: 180,
    defaultFontSize: 25.6,
    allowedTextAlignments: ["left", "center", "right"],
    defaultTextAlign: "center",
    fontSizeConfigured: false,
    alignmentConfigured: false,
  });
});

test("configured font bounds and alignment remain product-specific", () => {
  assert.deepEqual(resolveArtworkTextTypography(policy({
    minimumFontSize: 12,
    maximumFontSize: 48,
    defaultFontSize: 24,
    allowedTextAlignments: ["left", "right"],
    defaultTextAlign: "right",
  })), {
    minimumFontSize: 12,
    maximumFontSize: 48,
    defaultFontSize: 24,
    allowedTextAlignments: ["left", "right"],
    defaultTextAlign: "right",
    fontSizeConfigured: true,
    alignmentConfigured: true,
  });
});
