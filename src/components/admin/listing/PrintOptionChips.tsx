"use client";

import { useState } from "react";
import { Check, Plus } from "lucide-react";

import type { PrintOptionState } from "@/lib/listing-wizard";
import styles from "../admin.module.css";

/**
 * Packaging print options as tap-to-toggle chips, pre-filled from the recipe.
 * Selected chips become the customer's choices as soon as the product is live
 * (no extra charge); a new value can be typed and added in place.
 */
export function PrintOptionChips({
  options,
  onToggle,
}: {
  options: readonly PrintOptionState[];
  onToggle: (key: string, value: string) => void;
}) {
  const [adding, setAdding] = useState<Record<string, string>>({});
  if (!options.length) return null;
  return (
    <fieldset className={styles.listingPrintOptions}>
      <legend>Print options customers can choose</legend>
      <p className={styles.listingMuted}>Tap to switch a choice on or off. Customers see the ones that are on.</p>
      {options.map((option) => (
        <div className={styles.listingPrintOption} key={option.key}>
          <span className={styles.fieldLabel} id={`print-option-${option.key}`}>{option.label}</span>
          <div aria-labelledby={`print-option-${option.key}`} className={styles.listingChipRow} role="group">
            {option.choices.map((choice) => {
              const on = option.selected.includes(choice);
              return (
                <button aria-pressed={on} className={on ? styles.listingChipActive : styles.listingChip} key={choice} onClick={() => onToggle(option.key, choice)} type="button">
                  {on && <Check aria-hidden size={12} />} {choice}
                </button>
              );
            })}
            <form
              className={styles.listingChipAdd}
              onSubmit={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const value = (adding[option.key] ?? "").trim();
                if (value) onToggle(option.key, value);
                setAdding((current) => ({ ...current, [option.key]: "" }));
              }}
            >
              <input
                aria-label={`Add a ${option.label.toLowerCase()} choice`}
                maxLength={120}
                onChange={(event) => setAdding((current) => ({ ...current, [option.key]: event.target.value }))}
                placeholder="Add…"
                value={adding[option.key] ?? ""}
              />
              <button aria-label={`Add ${option.label.toLowerCase()} choice`} type="submit"><Plus aria-hidden size={12} /></button>
            </form>
          </div>
          {option.selected.length === 0 && <small className={styles.listingMuted}>Off — customers won&apos;t be asked about {option.label.toLowerCase()}.</small>}
        </div>
      ))}
    </fieldset>
  );
}
