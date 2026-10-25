import assert from "node:assert/strict";
import test from "node:test";

import { calculateDesignCompletion } from "./design-completion";

test("calculates progress in the canonical visible checklist order", () => {
  const completion = calculateDesignCompletion({
    preview: true,
    size: true,
    name: false,
    theme: true,
  });

  assert.deepEqual(completion.steps, [
    { id: "name", label: "Name", complete: false },
    { id: "theme", label: "Theme", complete: true },
    { id: "size", label: "Size", complete: true },
    { id: "preview", label: "Preview", complete: true },
  ]);
  assert.equal(completion.completed, 3);
  assert.equal(completion.total, 4);
  assert.equal(completion.percentage, 75);
  assert.equal(completion.isReady, false);
});

test("omits unavailable requirements from the denominator", () => {
  const completion = calculateDesignCompletion({
    name: true,
    size: true,
    preview: true,
  });

  assert.deepEqual(completion.steps.map((step) => step.label), ["Name", "Size", "Preview"]);
  assert.equal(completion.completed, 3);
  assert.equal(completion.total, 3);
  assert.equal(completion.percentage, 100);
  assert.equal(completion.isReady, true);
});

test("uses a neutral empty result when no design checks apply", () => {
  assert.deepEqual(calculateDesignCompletion({}), {
    steps: [],
    completed: 0,
    total: 0,
    percentage: 0,
    isReady: false,
  });
});
