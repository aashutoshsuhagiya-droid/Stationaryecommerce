import assert from "node:assert/strict";
import test from "node:test";

import { resizeArtworkGeometry } from "./artwork-resize";

const origin = { x: 100, y: 80, width: 200, height: 100, rotation: 0 };

test("resizes from every side while keeping the opposite edge anchored", () => {
  assert.deepEqual(resizeArtworkGeometry(origin, "east", 40, 0, false), {
    ...origin,
    width: 240,
  });
  assert.deepEqual(resizeArtworkGeometry(origin, "west", -40, 0, false), {
    ...origin,
    x: 60,
    width: 240,
  });
  assert.deepEqual(resizeArtworkGeometry(origin, "north", 0, -30, false), {
    ...origin,
    y: 50,
    height: 130,
  });
  assert.deepEqual(resizeArtworkGeometry(origin, "southwest", -40, 30, false), {
    ...origin,
    x: 60,
    width: 240,
    height: 130,
  });
});

test("keeps image proportions for edge and corner resizing", () => {
  assert.deepEqual(resizeArtworkGeometry(origin, "east", 40, 0, true), {
    ...origin,
    y: 70,
    width: 240,
    height: 120,
  });

  const corner = resizeArtworkGeometry(origin, "southeast", 40, 20, true);
  assert.deepEqual(corner, { ...origin, width: 240, height: 120 });
});

test("uses the rotated local axes and preserves the opposite anchor", () => {
  const rotated = { ...origin, rotation: 90 };
  const result = resizeArtworkGeometry(rotated, "east", 0, 40, false);

  assert.deepEqual(result, {
    x: 80,
    y: 100,
    width: 240,
    height: 100,
    rotation: 90,
  });
});

test("never collapses a layer below the minimum size", () => {
  assert.deepEqual(resizeArtworkGeometry(origin, "northwest", 500, 500, false), {
    x: 280,
    y: 160,
    width: 20,
    height: 20,
    rotation: 0,
  });
});
