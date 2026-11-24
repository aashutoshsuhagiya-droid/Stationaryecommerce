"use client";

import { Info, Sparkles } from "lucide-react";

import type { CategoryListingRecipe } from "@/lib/category-listing-playbook";
import { gstNoteFor, priceBandHint } from "@/lib/category-listing-playbook";
import { priceRangeWarning, type PrintOptionState } from "@/lib/listing-wizard";
import { PrintOptionChips } from "./PrintOptionChips";
import styles from "../admin.module.css";

export interface EssentialsValues {
  name: string;
  price: string;
  description: string;
  compareAtPrice: string;
  sku: string;
  skuEdited: boolean;
  gstPercent: 0 | 5 | 18 | null;
  stockOnHand: string;
  productionDaysMin: string;
  productionDaysMax: string;
  quantityMin: string;
  quantityMax: string;
  extraCategoryIds: string[];
}

/**
 * Step 3: name and price up front, an optional description with "Write for me",
 * packaging print options as chips, and everything else under "More options".
 */
export function EssentialsForm({
  values,
  errors,
  showErrors,
  recipe,
  printOptions,
  extraCategoryChoices,
  onChange,
  onWriteDescription,
  onTogglePrintOption,
}: {
  values: EssentialsValues;
  errors: { name?: string; price?: string };
  showErrors: boolean;
  recipe: CategoryListingRecipe | undefined;
  printOptions: readonly PrintOptionState[];
  extraCategoryChoices: ReadonlyArray<{ id: string; name: string }>;
  onChange: (patch: Partial<EssentialsValues>) => void;
  onWriteDescription: () => void;
  onTogglePrintOption: (key: string, value: string) => void;
}) {
  const warning = priceRangeWarning(recipe, values.price);
  const hint = priceBandHint(recipe);
  const gst = values.gstPercent ?? recipe?.gstPercent ?? 18;
  const nameError = showErrors ? errors.name : undefined;
  const priceError = showErrors ? errors.price : undefined;

  return (
    <div className={styles.listingForm}>
      <label className={styles.fieldGroup}>
        <span className={styles.fieldLabel}>Name</span>
        <input aria-describedby={nameError ? "listing-name-error" : undefined} aria-invalid={Boolean(nameError)} className={styles.input} maxLength={180} onChange={(event) => onChange({ name: event.target.value })} value={values.name} />
        {nameError && <small className={styles.listingInlineError} id="listing-name-error">{nameError}</small>}
      </label>
      <label className={styles.fieldGroup}>
        <span className={styles.fieldLabel}>Price (₹)</span>
        <input aria-describedby="listing-price-help" aria-invalid={Boolean(priceError)} className={styles.input} inputMode="decimal" min={0} onChange={(event) => onChange({ price: event.target.value })} placeholder={recipe?.priceBandRupees ? String(recipe.priceBandRupees.min) : "e.g. 249"} type="number" value={values.price} />
        <small id="listing-price-help" className={priceError ? styles.listingInlineError : warning ? styles.listingWarningText : styles.listingMuted}>
          {priceError ?? warning ?? hint ?? "What the customer pays, including GST."}
        </small>
      </label>
      <div className={styles.fieldGroup}>
        <span className={styles.fieldLabel}>
          <label htmlFor="listing-description">Description <small>Optional</small></label>
          <button className={styles.buttonGhost} onClick={onWriteDescription} type="button"><Sparkles aria-hidden size={13} /> Write for me</button>
        </span>
        <textarea className={styles.textarea} id="listing-description" maxLength={10_000} onChange={(event) => onChange({ description: event.target.value })} rows={3} value={values.description} />
      </div>

      <PrintOptionChips onToggle={onTogglePrintOption} options={printOptions} />

      <details className={styles.listingMore}>
        <summary>More options</summary>
        <div className={styles.listingMoreGrid}>
          <label className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>MRP (₹) <small>Shown struck through</small></span>
            <input className={styles.input} inputMode="decimal" min={0} onChange={(event) => onChange({ compareAtPrice: event.target.value })} type="number" value={values.compareAtPrice} />
          </label>
          <label className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>SKU <small>{values.skuEdited ? "Your code" : "Made from the name"}</small></span>
            <input className={styles.input} maxLength={80} onChange={(event) => onChange({ sku: event.target.value, skuEdited: true })} value={values.sku} />
          </label>
          <label className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>
              <span>GST</span>
              <span aria-label={`About GST: ${gstNoteFor(recipe)}`} className={styles.listingTooltip} role="note" tabIndex={0}>
                <Info aria-hidden size={13} /><span role="tooltip">{gstNoteFor(recipe)}</span>
              </span>
            </span>
            <select className={styles.select} onChange={(event) => onChange({ gstPercent: Number(event.target.value) as 0 | 5 | 18 })} value={gst}>
              <option value={0}>No GST</option>
              <option value={5}>5%</option>
              <option value={18}>18%</option>
            </select>
          </label>
          <label className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>Stock <small>Empty = made to order</small></span>
            <input className={styles.input} inputMode="numeric" min={0} onChange={(event) => onChange({ stockOnHand: event.target.value })} placeholder="Made to order" type="number" value={values.stockOnHand} />
          </label>
          <div className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>Production days</span>
            <span className={styles.listingPair}>
              <input aria-label="Fastest production days" className={styles.input} inputMode="numeric" min={0} onChange={(event) => onChange({ productionDaysMin: event.target.value })} placeholder="From" type="number" value={values.productionDaysMin} />
              <input aria-label="Slowest production days" className={styles.input} inputMode="numeric" min={0} onChange={(event) => onChange({ productionDaysMax: event.target.value })} placeholder="To" type="number" value={values.productionDaysMax} />
            </span>
          </div>
          <div className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>Quantity per order</span>
            <span className={styles.listingPair}>
              <input aria-label="Minimum quantity per order" className={styles.input} inputMode="numeric" min={1} onChange={(event) => onChange({ quantityMin: event.target.value })} placeholder="Min 1" type="number" value={values.quantityMin} />
              <input aria-label="Maximum quantity per order" className={styles.input} inputMode="numeric" min={1} onChange={(event) => onChange({ quantityMax: event.target.value })} placeholder="Max 100" type="number" value={values.quantityMax} />
            </span>
          </div>
          {extraCategoryChoices.length > 0 && (
            <fieldset className={styles.listingExtraCategories}>
              <legend className={styles.fieldLabel}>Also show it in</legend>
              {extraCategoryChoices.map((category) => (
                <label key={category.id}>
                  <input
                    checked={values.extraCategoryIds.includes(category.id)}
                    onChange={(event) => onChange({
                      extraCategoryIds: event.target.checked
                        ? [...values.extraCategoryIds, category.id]
                        : values.extraCategoryIds.filter((id) => id !== category.id),
                    })}
                    type="checkbox"
                  /> {category.name}
                </label>
              ))}
            </fieldset>
          )}
        </div>
      </details>
    </div>
  );
}
