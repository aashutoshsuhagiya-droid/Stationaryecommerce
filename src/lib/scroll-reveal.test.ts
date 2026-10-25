import assert from "node:assert/strict";
import test from "node:test";

import { observeScrollReveal, type ReducedMotionPreference } from "./scroll-reveal";

const target = {} as Element;

test("reveals immediately without creating an observer when reduced motion is preferred", () => {
  const states: string[] = [];
  let factoryCalls = 0;

  observeScrollReveal({
    target,
    motionPreference: { matches: true },
    createObserver: () => {
      factoryCalls += 1;
      return { observe() {}, disconnect() {} };
    },
    onPending: () => states.push("pending"),
    onReveal: () => states.push("visible"),
  });

  assert.deepEqual(states, ["visible"]);
  assert.equal(factoryCalls, 0);
});

test("reveals immediately when IntersectionObserver is unavailable", () => {
  const states: string[] = [];

  observeScrollReveal({
    target,
    motionPreference: { matches: false },
    onPending: () => states.push("pending"),
    onReveal: () => states.push("visible"),
  });

  assert.deepEqual(states, ["visible"]);
});

test("reveals once when the observed element intersects", () => {
  const states: string[] = [];
  let listener: ((entries: ReadonlyArray<{ isIntersecting: boolean }>) => void) | undefined;
  let observedTarget: Element | undefined;
  let disconnects = 0;

  const cleanup = observeScrollReveal({
    target,
    motionPreference: { matches: false },
    createObserver: (nextListener) => {
      listener = nextListener;
      return {
        observe: (element) => { observedTarget = element; },
        disconnect: () => { disconnects += 1; },
      };
    },
    onPending: () => states.push("pending"),
    onReveal: () => states.push("visible"),
  });

  assert.equal(observedTarget, target);
  assert.deepEqual(states, ["pending"]);

  listener?.([{ isIntersecting: false }]);
  assert.deepEqual(states, ["pending"]);

  listener?.([{ isIntersecting: true }]);
  listener?.([{ isIntersecting: true }]);
  assert.deepEqual(states, ["pending", "visible"]);
  assert.equal(disconnects, 1);

  cleanup();
  assert.equal(disconnects, 1);
});

test("an active reduced-motion preference change reveals and stops observation", () => {
  let preferenceListener: ((matches: boolean) => void) | undefined;
  let unsubscribes = 0;
  let disconnects = 0;
  const states: string[] = [];
  const motionPreference: ReducedMotionPreference = {
    matches: false,
    subscribe(listener) {
      preferenceListener = listener;
      return () => { unsubscribes += 1; };
    },
  };

  observeScrollReveal({
    target,
    motionPreference,
    createObserver: () => ({
      observe() {},
      disconnect() { disconnects += 1; },
    }),
    onPending: () => states.push("pending"),
    onReveal: () => states.push("visible"),
  });

  preferenceListener?.(true);

  assert.deepEqual(states, ["pending", "visible"]);
  assert.equal(disconnects, 1);
  assert.equal(unsubscribes, 1);
});
