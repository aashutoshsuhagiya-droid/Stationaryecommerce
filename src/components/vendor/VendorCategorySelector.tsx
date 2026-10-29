"use client";

import { Check } from "lucide-react";

import { categorySelectionLabels } from "@/lib/vendor-category-options";
import type { VendorCategoryGroup } from "@/lib/vendor-category-options";

import styles from "./vendor-registration.module.css";

type VendorCategorySelectorProps = {
  groups: VendorCategoryGroup[];
  selected: string[];
  onToggle: (id: string) => void;
  activeParent: string;
  onActiveParent: (id: string) => void;
  maxSelectable?: number;
  error?: string;
};

export function VendorCategorySelector({
  groups,
  selected,
  onToggle,
  activeParent,
  onActiveParent,
  maxSelectable = 30,
  error,
}: VendorCategorySelectorProps) {
  const activeGroup = groups.find((group) => group.id === activeParent);
  const selectedSet = new Set(selected);
  const hasReachedMaximum = selected.length >= maxSelectable;
  const activeGroupHasSelection = activeGroup
    ? selectedSet.has(activeGroup.id) || activeGroup.children.some((child) => selectedSet.has(child.id))
    : false;
  const selectedIdsInGroupOrder = groups.flatMap((group) => [
    ...(selectedSet.has(group.id) ? [group.id] : []),
    ...group.children.filter((child) => selectedSet.has(child.id)).map((child) => child.id),
  ]);
  const selectedLabels = categorySelectionLabels(groups, selected);

  function checkboxDisabled(id: string) {
    return hasReachedMaximum && !selectedSet.has(id);
  }

  return (
    <div className={styles.categoryCascade}>
      <div className={styles.field}>
        <label htmlFor="vendor-category-group">Category group</label>
        <select
          aria-invalid={Boolean(error)}
          id="vendor-category-group"
          onChange={(event) => onActiveParent(event.target.value)}
          value={activeParent}
        >
          <option value="">Choose a category group</option>
          {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
        </select>
      </div>

      {activeGroup ? (
        <>
          <div className={styles.checkList}>
            <label title={activeGroup.description || activeGroup.name}>
              <input
                checked={selectedSet.has(activeGroup.id)}
                disabled={checkboxDisabled(activeGroup.id)}
                onChange={() => onToggle(activeGroup.id)}
                type="checkbox"
              />
              <span><Check aria-hidden="true" /></span>
              All of {activeGroup.name}
            </label>
            {activeGroup.children.map((child) => (
              <label key={child.id} title={`${activeGroup.name} · ${child.name}`}>
                <input
                  checked={selectedSet.has(child.id)}
                  disabled={checkboxDisabled(child.id)}
                  onChange={() => onToggle(child.id)}
                  type="checkbox"
                />
                <span><Check aria-hidden="true" /></span>
                · {child.name}
              </label>
            ))}
          </div>
          {activeGroup.children.length === 0 && !activeGroupHasSelection && (
            <p className={styles.categoryEmptyNote}>No subcategories under this group yet — select the group itself.</p>
          )}
        </>
      ) : (
        <p className={styles.categoryEmptyNote}>Pick a category group to see its subcategories.</p>
      )}

      {hasReachedMaximum && <small className={styles.hint}>Choose up to 30 categories.</small>}

      {selectedLabels.length > 0 && (
        <div aria-label="Selected categories" className={styles.categoryChips} role="list">
          {selectedLabels.map((label, index) => (
            <span className={styles.categoryChip} key={selectedIdsInGroupOrder[index]} role="listitem">
              {label}
              <button aria-label={label} className={styles.categoryChipRemove} onClick={() => onToggle(selectedIdsInGroupOrder[index])} type="button">×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
