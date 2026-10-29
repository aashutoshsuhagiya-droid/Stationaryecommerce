import assert from "node:assert/strict";
import test from "node:test";

import { categorySelectionLabels, groupVendorCategories } from "./vendor-category-options";

const records = [
  { id: "child-late", name: "Late child", description: "", parentId: "parent-b", sortOrder: 20 },
  { id: "orphan", name: "Orphan", description: "", parentId: "missing", sortOrder: 1 },
  { id: "parent-b", name: "Parent B", description: "B description", parentId: null, sortOrder: 20 },
  { id: "child-early", name: "Early child", description: "Early description", parentId: "parent-b", sortOrder: 10 },
  { id: "parent-a", name: "Parent A", description: null, parentId: null, sortOrder: 10 },
] as const;

test("groups roots and children by sort order while dropping orphans", () => {
  assert.deepEqual(groupVendorCategories(records), [
    { id: "parent-a", name: "Parent A", description: "", children: [] },
    {
      id: "parent-b",
      name: "Parent B",
      description: "B description",
      children: [
        { id: "child-early", name: "Early child", description: "Early description", parentId: "parent-b" },
        { id: "child-late", name: "Late child", description: "", parentId: "parent-b" },
      ],
    },
  ]);
});

test("returns no groups for empty input", () => {
  assert.deepEqual(groupVendorCategories([]), []);
});

test("formats known parent and child selections once in grouped order", () => {
  const groups = groupVendorCategories(records);

  assert.deepEqual(
    categorySelectionLabels(groups, ["child-late", "parent-a", "unknown", "child-late", "parent-b"]),
    ["Parent A", "Parent B", "Parent B · Late child"],
  );
});
