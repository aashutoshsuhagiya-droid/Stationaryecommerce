import assert from "node:assert/strict";
import test from "node:test";

import { buildFilterTree, nextCategoryParam } from "./catalog";
import type { Category } from "./types";

function category(overrides: Partial<Category> & Pick<Category, "id" | "name" | "slug">): Category {
  return {
    id: overrides.id,
    parentId: overrides.parentId ?? null,
    slug: overrides.slug,
    name: overrides.name,
    shortName: overrides.shortName ?? overrides.name,
    description: "",
    image: "",
    artwork: "labels",
    accent: "mint",
    sortOrder: overrides.sortOrder ?? 0,
    featured: false,
    productCount: overrides.productCount ?? 0,
  };
}

test("buildFilterTree sorts parent groups, caps counted children, and retains zero-count roots", () => {
  const tree = buildFilterTree([
    category({ id: "root-b", name: "Root B", slug: "root-b", sortOrder: 2 }),
    category({ id: "child-2", parentId: "root-a", name: "Child two", slug: "child-2", sortOrder: 2, productCount: 4 }),
    category({ id: "root-a", name: "Root A", slug: "root-a", sortOrder: 1, productCount: 1 }),
    category({ id: "child-1", parentId: "root-a", name: "Child one", slug: "child-1", sortOrder: 1, productCount: 3 }),
    category({ id: "child-0", parentId: "root-a", name: "Empty child", slug: "child-0", sortOrder: 0 }),
    category({ id: "child-3", parentId: "root-a", name: "Child three", slug: "child-3", sortOrder: 3, productCount: 2 }),
  ], { groupCap: 2 });

  assert.deepEqual(tree, [
    {
      id: "root-a",
      name: "Root A",
      slug: "root-a",
      count: 1,
      children: [
        { id: "child-1", name: "Child one", slug: "child-1", count: 3 },
        { id: "child-2", name: "Child two", slug: "child-2", count: 4 },
      ],
      moreChildren: 1,
    },
    { id: "root-b", name: "Root B", slug: "root-b", count: 0, children: [], moreChildren: 0 },
  ]);
});

test("nextCategoryParam preserves the API's single-category contract", () => {
  const [group] = buildFilterTree([
    category({ id: "root", name: "Root", slug: "root", productCount: 1 }),
    category({ id: "child-a", parentId: "root", name: "Child A", slug: "child-a", productCount: 2 }),
    category({ id: "child-b", parentId: "root", name: "Child B", slug: "child-b", productCount: 3 }),
  ]);

  assert.ok(group);
  assert.equal(nextCategoryParam(new Set(), group), null);
  assert.equal(nextCategoryParam(new Set(["child-a"]), group), "child-a");
  assert.equal(nextCategoryParam(new Set(["root"]), group), "root");
  assert.equal(nextCategoryParam(new Set(["root", "child-a", "child-b"]), group), "root");
  assert.equal(nextCategoryParam(new Set(["child-a", "child-b"]), group), null);
});
