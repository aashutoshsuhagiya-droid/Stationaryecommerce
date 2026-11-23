import assert from "node:assert/strict";
import test from "node:test";

import {
  IMPORTED_CATEGORY_MAP,
  IMPORTED_CATEGORY_PENDING,
  curatedCategorySlugForImport,
  importCategoryPendingReason,
} from "./imported-category-mapping";
import { CATEGORY_LISTING_PLAYBOOK } from "./category-listing-playbook";

test("every mapped destination is a shelf the listing playbook knows", () => {
  const shelves = new Set(CATEGORY_LISTING_PLAYBOOK.map((recipe) => recipe.categorySlug));
  for (const [source, destination] of Object.entries(IMPORTED_CATEGORY_MAP)) {
    assert.ok(shelves.has(destination), `${source} points at ${destination}, which has no recipe`);
    assert.notEqual(source, destination);
  }
});

test("a source category is either mapped or explicitly pending, never both", () => {
  for (const source of Object.keys(IMPORTED_CATEGORY_PENDING)) {
    assert.equal(IMPORTED_CATEGORY_MAP[source], undefined, `${source} cannot be mapped and pending`);
    assert.ok(IMPORTED_CATEGORY_PENDING[source].length > 10, `${source} needs a real reason`);
  }
});

test("lookups are safe for unknown and empty values", () => {
  assert.equal(curatedCategorySlugForImport("premium-name-slips"), "customized-name-slips");
  assert.equal(curatedCategorySlugForImport("cake-topper"), "personalized-gifts");
  assert.equal(curatedCategorySlugForImport("something-new"), undefined);
  assert.equal(curatedCategorySlugForImport(undefined), undefined);
  assert.equal(curatedCategorySlugForImport(""), undefined);
  assert.ok(importCategoryPendingReason("t-shirts")?.includes("garments"));
  assert.equal(importCategoryPendingReason("premium-name-slips"), undefined);
});
