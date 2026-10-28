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

test("renders a non-empty fragment for a long word in a one-line narrow box", () => {
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
    id: "narrow-text",
    type: "text",
    name: "Narrow text",
    x: 0,
    y: 0,
    width: 5,
    height: 5,
    rotation: 0,
    opacity: 1,
    text: "averylongunbrokenword",
    fontSize: 20,
  };

  renderLayerToContext(context, layer);

  assert.equal(fillCalls.length, 1);
  assert.equal(typeof fillCalls[0][0], "string");
  assert.notEqual(fillCalls[0][0], "");
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

test("renders configured left alignment from the text box edge", () => {
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
    textAlign: "center",
    textBaseline: "alphabetic",
  } as unknown as CanvasRenderingContext2D;
  const layer: ArtworkLayer = {
    id: "left-text",
    type: "text",
    name: "Left text",
    x: 0,
    y: 0,
    width: 100,
    height: 40,
    rotation: 0,
    opacity: 1,
    text: "Alpha",
    fontSize: 20,
    textAlign: "left",
  };

  renderLayerToContext(context, layer);

  assert.equal(context.textAlign, "left");
  assert.equal(fillCalls[0][1], -50);
});
