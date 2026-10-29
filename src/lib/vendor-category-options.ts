export type VendorCategoryGroup = {
  id: string;
  name: string;
  description: string;
  children: Array<{
    id: string;
    name: string;
    description: string;
    parentId: string;
  }>;
};

type VendorCategoryRecord = {
  id: string;
  name: string;
  description: string | null;
  parentId: string | null;
  sortOrder: number;
};

const bySortOrder = (left: VendorCategoryRecord, right: VendorCategoryRecord) =>
  left.sortOrder - right.sortOrder;

export function groupVendorCategories(records: readonly VendorCategoryRecord[]): VendorCategoryGroup[] {
  const roots = records.filter((record) => record.parentId === null).sort(bySortOrder);
  const rootIds = new Set(roots.map((root) => root.id));

  return roots.map((root) => ({
    id: root.id,
    name: root.name,
    description: root.description ?? "",
    children: records
      .filter((record) => record.parentId === root.id && rootIds.has(root.id))
      .sort(bySortOrder)
      .map((child) => ({
        id: child.id,
        name: child.name,
        description: child.description ?? "",
        parentId: child.parentId as string,
      })),
  }));
}

export function categorySelectionLabels(
  groups: readonly VendorCategoryGroup[],
  selectedIds: readonly string[],
): string[] {
  const selected = new Set(selectedIds);
  const labels: string[] = [];

  for (const group of groups) {
    if (selected.has(group.id)) labels.push(group.name);
    for (const child of group.children) {
      if (selected.has(child.id)) labels.push(`${group.name} · ${child.name}`);
    }
  }

  return labels;
}

export function selectedCategoryActiveParent(
  groups: readonly VendorCategoryGroup[],
  selectedIds: readonly string[],
): string {
  for (const id of selectedIds) {
    const group = groups.find((candidate) => candidate.children.some((child) => child.id === id));
    if (group) return group.id;
  }

  for (const id of selectedIds) {
    if (groups.some((group) => group.id === id)) return id;
  }

  return "";
}
