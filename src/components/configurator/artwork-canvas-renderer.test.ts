import assert from "node:assert/strict";
import test from "node:test";

import {
  renderLayerToContext,
  wrapTextLines,
} from "./artwork-canvas-renderer";
import type { ArtworkLayer } from "./artwork-types";

const measureByCharacter = (value: string) => Array.from(value).length * 10;

test("wraps text with measured widths and respects the line limit", () => {
  assert.deepEqual(
    wrapTextLines("Alpha beta gamma", 100, 3, measureByCharacter),
    ["Alpha beta", "gamma"],
  );
  assert.deepEqual(
    wrapTextLines("Alpha beta gamma", 100, 1, measureByCharacter),
    ["Alpha beta"],
  );
});

test("keeps explicit line breaks and splits words wider than the box", () => {
  assert.deepEqual(
    wrapTextLines("First\nabcdefgh", 40, 4, measureByCharacter),
    ["Firs", "t", "abcd", "efgh"],
  );
});

test("draws centered text lines without using the fillText maxWidth argument", () => {
  const fillCalls: unknown[][] = [];
  const context = {
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    measureText: (value: string) => ({ width: measureByCharacter(value) }),
    fillText: (...args: unknown[]) => fillCalls.push(args),
    globalAlpha: 1,
    font: "",
    fillStyle: "",
    textAlign: "start",
    textBaseline: "alphabetic",
  } as unknown as CanvasRenderingContext2D;
  const layer: ArtworkLayer = {
    id: "text",
    type: "text",
    name: "Text",
    x: 0,
    y: 0,
    width: 100,
    height: 80,
    rotation: 0,
    opacity: 1,
    text: "Alpha beta gamma",
    fontSize: 20,
  };

  renderLayerToContext(context, layer);

  assert.equal(fillCalls.length, 2);
  assert.ok(fillCalls.every((args) => args.length === 3));
  assert.deepEqual(fillCalls.map(([line]) => line), ["Alpha beta", "gamma"]);
});
