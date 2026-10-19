import assert from "node:assert/strict";
import test from "node:test";

import { consumeRateLimit } from "./rate-limit";

test("rate limiter allows the configured request count and then blocks", () => {
  const input = { namespace: `test-${crypto.randomUUID()}`, identifier: "203.0.113.10", limit: 2, windowMs: 1_000, now: 10_000 };
  assert.equal(consumeRateLimit(input).allowed, true);
  assert.equal(consumeRateLimit(input).allowed, true);
  const blocked = consumeRateLimit(input);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.equal(blocked.retryAfterSeconds, 1);
});

test("rate limiter opens a new window after expiry", () => {
  const namespace = `test-${crypto.randomUUID()}`;
  consumeRateLimit({ namespace, identifier: "203.0.113.11", limit: 1, windowMs: 1_000, now: 20_000 });
  const nextWindow = consumeRateLimit({ namespace, identifier: "203.0.113.11", limit: 1, windowMs: 1_000, now: 21_001 });
  assert.equal(nextWindow.allowed, true);
});
