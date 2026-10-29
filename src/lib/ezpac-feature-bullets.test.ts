import assert from "node:assert/strict";
import test from "node:test";

import {
  EZPAC_BULLET_MATCHERS,
  EZPAC_FEATURE_BULLETS,
  EZPAC_FEATURE_BULLET_LABELS,
} from "./ezpac-feature-bullets";

function matchingBullets(copy: string) {
  const normalized = copy.toLowerCase();
  return EZPAC_BULLET_MATCHERS
    .filter(([, phrases]) => phrases.some((phrase) => normalized.includes(phrase)))
    .map(([bullet]) => bullet);
}

test("EzPac feature bullet labels and matcher keys stay closed and unique", () => {
  const labels = Object.values(EZPAC_FEATURE_BULLET_LABELS);
  assert.equal(new Set(labels).size, labels.length);

  const allowed = new Set(EZPAC_FEATURE_BULLETS);
  assert.ok(EZPAC_BULLET_MATCHERS.every(([bullet]) => allowed.has(bullet)));
});

test("EzPac feature matchers recognize their narrowly scoped export copy", () => {
  assert.deepEqual(matchingBullets("Food-safe material"), ["food-safe"]);
  assert.deepEqual(matchingBullets("Luxury thick-wall construction"), ["thick-wall"]);
  assert.deepEqual(matchingBullets("MOQ starts at just 10 pieces"), ["moq-10"]);
});
