import assert from "node:assert/strict";
import test from "node:test";

import { MAX_MENU_ITEMS, truncateMenuItems } from "./menu-truncation";
import type { Category } from "./types";

function category(id: string): Category {
  return {
    id,
    parentId: null,
    slug: id,
    name: id,
    shortName: id,
    description: "",
    image: "",
    artwork: "labels",
    accent: "mint",
    sortOrder: 0,
    featured: false,
    productCount: 0,
  };
}

test("keeps groups at or below the visible menu limit intact", () => {
  const items = Array.from({ length: MAX_MENU_ITEMS }, (_, index) => category(`category-${index}`));

  assert.deepEqual(truncateMenuItems(items), { visible: items, moreCount: 0 });
});

test("shows eight items and reports the remaining menu items", () => {
  const items = Array.from({ length: MAX_MENU_ITEMS + 1 }, (_, index) => category(`category-${index}`));

  const result = truncateMenuItems(items);

  assert.equal(result.visible.length, MAX_MENU_ITEMS);
  assert.equal(result.moreCount, 1);
});

test("returns no visible or hidden menu items for an empty group", () => {
  assert.deepEqual(truncateMenuItems([]), { visible: [], moreCount: 0 });
});
