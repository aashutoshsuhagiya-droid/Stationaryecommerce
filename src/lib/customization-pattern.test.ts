import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_CUSTOMIZATION_PATTERN_LENGTH,
  customizationPatternIssue,
  isSafeCustomizationPattern,
  normalizeCustomizationPattern,
} from "./customization-pattern";

test("accepts a bounded Unicode allowed-character pattern", () => {
  const pattern = "^[\\p{L} .'-]+$";
  assert.equal(customizationPatternIssue(pattern), undefined);
  assert.equal(isSafeCustomizationPattern(pattern), true);
  assert.equal(new RegExp(pattern, "u").test("Ananya D'Souza"), true);
  assert.equal(new RegExp(pattern, "u").test("Name_123"), false);
});

test("normalizes an empty pattern to no restriction", () => {
  assert.equal(normalizeCustomizationPattern("   "), undefined);
  assert.equal(customizationPatternIssue(null), undefined);
});

test("rejects invalid, oversized and ambiguous repetition patterns safely", () => {
  assert.match(customizationPatternIssue("[") ?? "", /valid JavaScript/i);
  assert.match(customizationPatternIssue("a".repeat(MAX_CUSTOMIZATION_PATTERN_LENGTH + 1)) ?? "", /characters or fewer/i);
  assert.match(customizationPatternIssue("^(a+)+$") ?? "", /character class/i);
  assert.match(customizationPatternIssue("^(a|aa)+$") ?? "", /character class/i);
});
