import assert from "node:assert/strict";
import test from "node:test";

import {
  getContrastRatio,
  getReadableTextColor,
  setPersonalizedNameColor,
} from "./artwork-color";
import type { ArtworkDocument } from "./artwork-types";

test("chooses white text for a dark theme and ink text for white", () => {
  assert.equal(getReadableTextColor("#17324D", "#17324D"), "#FFFFFF");
  assert.equal(getReadableTextColor("#FFFFFF", "#FFFFFF"), "#111418");
  assert.ok(getContrastRatio("#FFFFFF", "#17324D") >= 4.5);
});

test("theme changes update only the required personalized-name layer", () => {
  const document: ArtworkDocument = {
    version: 1,
    activeSurfaceId: "front",
    updatedAt: "2026-10-23T00:00:00.000Z",
    surfaces: [{
      id: "front",
      label: "Front",
      layers: [
        {
          id: "personalization-name",
          type: "text",
          name: "Name",
          x: 0,
          y: 0,
          width: 100,
          height: 40,
          rotation: 0,
          opacity: 1,
          text: "Aarav",
          color: "#17324D",
        },
        {
          id: "user-caption",
          type: "text",
          name: "Caption",
          x: 0,
          y: 50,
          width: 100,
          height: 40,
          rotation: 0,
          opacity: 1,
          text: "Keep my colour",
          color: "#D25760",
        },
      ],
    }],
  };

  const themed = setPersonalizedNameColor(document, "#FFFFFF");
  assert.equal(themed.surfaces[0].layers[0].color, "#FFFFFF");
  assert.equal(themed.surfaces[0].layers[1].color, "#D25760");
});
