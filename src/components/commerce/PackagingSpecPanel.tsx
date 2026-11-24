"use client";

import Link from "next/link";
import { Box, Ruler, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { formatPrice } from "@/lib/data";
import {
  formatPackagingMeasurement,
  formatPackagingSize,
  isPackagingReferenceSize,
  packagingMinimumSizeMm,
  pricePackagingConfiguration,
  toMillimetres,
  type PackagingDisplayUnit,
  type PackagingQuoteSpec,
  type PackagingSizeAxis,
  type PackagingSizeMm,
} from "@/lib/packaging-quote";
import styles from "./packaging-spec.module.css";

/** The source's instruction line, word for word (ezpac.in product pages). */
export const PACKAGING_CUSTOM_SIZE_INSTRUCTION =
  'Click on Size > Select "Custom Size" from the list, pick your unit (mm, inch, or cm), and type in your size.';

const UNIT_LABELS: Record<PackagingDisplayUnit, string> = { mm: "mm", in: "inch", cm: "cm" };
const UNIT_ORDER: PackagingDisplayUnit[] = ["mm", "in", "cm"];
const AXIS_LABELS: Record<PackagingSizeAxis, { name: string; short: string }> = {
  length: { name: "Length", short: "L" },
  width: { name: "Width", short: "W" },
  height: { name: "Height", short: "H" },
};
const CUSTOM_SIZE_VALUE = "__custom-size__";
const CUSTOM_QUANTITY_VALUE = "__custom-quantity__";

function safeUnitPrice(spec: PackagingQuoteSpec, quantity: number, selections: Record<string, string>, sizeMm: PackagingSizeMm) {
  try {
    return pricePackagingConfiguration(spec, quantity, { selections, sizeMm }).unitPaise;
  } catch {
    return undefined;
  }
}

function inputValue(valueMm: number, unit: PackagingDisplayUnit) {
  return formatPackagingMeasurement(valueMm, unit);
}

function CustomSizeDialog({
  spec,
  sizeMm,
  unit,
  onDiscard,
  onApply,
}: {
  spec: PackagingQuoteSpec;
  sizeMm: PackagingSizeMm;
  unit: PackagingDisplayUnit;
  onDiscard: () => void;
  onApply: (sizeMm: PackagingSizeMm, unit: PackagingDisplayUnit) => void;
}) {
  const titleId = useId();
  const firstInput = useRef<HTMLInputElement>(null);
  const [draftUnit, setDraftUnit] = useState<PackagingDisplayUnit>(unit);
  const [values, setValues] = useState<Record<PackagingSizeAxis, string>>(() => ({
    length: inputValue(sizeMm.length, unit),
    width: inputValue(sizeMm.width, unit),
    height: inputValue(sizeMm.height, unit),
  }));
  const [errors, setErrors] = useState<Partial<Record<PackagingSizeAxis, string>>>({});

  useEffect(() => {
    firstInput.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDiscard();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onDiscard]);

  function changeUnit(next: PackagingDisplayUnit) {
    if (next === draftUnit) return;
    // Convert what was typed so the physical size stays the same when the unit changes.
    setValues((current) => Object.fromEntries(spec.sizeAxes.map((axis) => {
      const parsed = Number(current[axis]);
      return [axis, Number.isFinite(parsed) && parsed > 0 ? inputValue(toMillimetres(parsed, draftUnit), next) : current[axis]];
    })) as Record<PackagingSizeAxis, string>);
    setDraftUnit(next);
    setErrors({});
  }

  function apply() {
    const nextErrors: Partial<Record<PackagingSizeAxis, string>> = {};
    const next: PackagingSizeMm = { ...sizeMm };
    for (const axis of spec.sizeAxes) {
      const raw = values[axis]?.trim() ?? "";
      const parsed = Number(raw);
      const minimumMm = packagingMinimumSizeMm(spec, axis);
      const maximumMm = spec.maxSizeMm[axis];
      if (!raw || !Number.isFinite(parsed) || parsed <= 0) {
        nextErrors[axis] = `Enter a ${AXIS_LABELS[axis].name.toLowerCase()} greater than 0.`;
        continue;
      }
      const valueMm = Math.round(toMillimetres(parsed, draftUnit) * 100) / 100;
      if (valueMm < minimumMm - 0.005 || valueMm > maximumMm + 0.005) {
        nextErrors[axis] = `Use ${formatPackagingMeasurement(minimumMm, draftUnit)}–${formatPackagingMeasurement(maximumMm, draftUnit)} ${draftUnit}.`;
        continue;
      }
      next[axis] = valueMm;
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    onApply(next, draftUnit);
  }

  return (
    <div className={styles.dialogBackdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) onDiscard(); }}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className={styles.dialogHeader}>
          <div>
            <strong id={titleId}>Custom Size</strong>
            <small>Manufacture dimensions of the finished {spec.sizeAxes.length === 2 ? "item" : "box"}</small>
          </div>
          <button type="button" className={styles.iconButton} onClick={onDiscard} aria-label="Close custom size"><X /></button>
        </header>
        <div className={styles.unitPills} role="group" aria-label="Unit">
          {UNIT_ORDER.map((candidate) => (
            <button
              type="button"
              key={candidate}
              aria-pressed={draftUnit === candidate}
              className={draftUnit === candidate ? styles.unitActive : ""}
              onClick={() => changeUnit(candidate)}
            >
              {UNIT_LABELS[candidate]}
            </button>
          ))}
        </div>
        <form
          className={styles.dimensionInputs}
          onSubmit={(event) => { event.preventDefault(); apply(); }}
          noValidate
        >
          {spec.sizeAxes.map((axis, index) => (
            <label key={axis} className={errors[axis] ? styles.inputInvalid : ""}>
              <span>{AXIS_LABELS[axis].name}</span>
              <div>
                <b aria-hidden="true">{AXIS_LABELS[axis].short}</b>
                <input
                  ref={index === 0 ? firstInput : undefined}
                  // Text, not type=number: a number input reports "" for half-typed values
                  // without firing change, which would let a stale size be applied.
                  inputMode="decimal"
                  type="text"
                  autoComplete="off"
                  value={values[axis]}
                  aria-invalid={Boolean(errors[axis])}
                  aria-describedby={errors[axis] ? `${titleId}-${axis}-error` : undefined}
                  onChange={(event) => {
                    const value = event.target.value;
                    setValues((current) => ({ ...current, [axis]: value }));
                    setErrors((current) => ({ ...current, [axis]: undefined }));
                  }}
                />
                <em>{draftUnit}</em>
              </div>
              {errors[axis] && <small id={`${titleId}-${axis}-error`} role="alert">{errors[axis]}</small>}
            </label>
          ))}
          <p className={styles.dialogHint}>
            Each side: {formatPackagingMeasurement(Math.min(...spec.sizeAxes.map((axis) => packagingMinimumSizeMm(spec, axis))), draftUnit)}–{formatPackagingMeasurement(Math.max(...spec.sizeAxes.map((axis) => spec.maxSizeMm[axis])), draftUnit)} {draftUnit}. Price updates for the new size.
          </p>
          <div className={styles.dialogActions}>
            <button type="button" onClick={onDiscard}>Discard</button>
            <button type="submit" className={styles.applyButton}>Apply</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function PackagingSpecPanel({
  spec,
  selections,
  onSelectionChange,
  sizeMm,
  displayUnit,
  onSizeChange,
  quantity,
  onQuantityChange,
  bulkQuotePath,
  note,
  onDesign,
  designLabel,
}: {
  spec: PackagingQuoteSpec;
  selections: Record<string, string>;
  onSelectionChange: (selectionId: string, optionId: string) => void;
  sizeMm: PackagingSizeMm;
  displayUnit: PackagingDisplayUnit;
  onSizeChange: (sizeMm: PackagingSizeMm, unit: PackagingDisplayUnit) => void;
  quantity: number;
  onQuantityChange: (quantity: number) => void;
  bulkQuotePath: string;
  /** Optional product-specific production note shown under the instruction. */
  note?: string;
  onDesign: () => void;
  designLabel: string;
}) {
  const baseId = useId();
  const [sizeDialogOpen, setSizeDialogOpen] = useState(false);
  const [customQuantity, setCustomQuantity] = useState(() => !spec.quantity.options.includes(quantity));
  const [quantityDraft, setQuantityDraft] = useState(String(quantity));
  const visibleSelections = spec.selections.filter((selection) => !selection.hidden);
  const referenceSize = isPackagingReferenceSize(spec, sizeMm);
  const quantityOptions = useMemo(() => spec.quantity.options.map((option) => ({
    quantity: option,
    unitPaise: safeUnitPrice(spec, option, selections, sizeMm),
  })), [selections, sizeMm, spec]);
  const unitPaise = safeUnitPrice(spec, quantity, selections, sizeMm);
  const tierRows = useMemo(() => {
    const ordered = [...spec.tiers].sort((left, right) => left.minimum - right.minimum);
    return ordered.map((tier, index) => ({
      minimum: tier.minimum,
      maximum: ordered[index + 1] ? ordered[index + 1].minimum - 1 : spec.quantity.maximum,
      unitPaise: safeUnitPrice(spec, Math.max(tier.minimum, spec.quantity.minimum), selections, sizeMm),
    })).filter((row) => row.minimum <= spec.quantity.maximum);
  }, [selections, sizeMm, spec]);
  const activeTier = [...tierRows].reverse().find((row) => quantity >= row.minimum);

  useEffect(() => {
    setQuantityDraft(String(quantity));
    if (!spec.quantity.options.includes(quantity)) setCustomQuantity(true);
  }, [quantity, spec.quantity.options]);

  function commitQuantityDraft() {
    const parsed = Math.trunc(Number(quantityDraft));
    const next = Number.isFinite(parsed)
      ? Math.min(spec.quantity.maximum, Math.max(spec.quantity.minimum, parsed))
      : spec.quantity.minimum;
    setQuantityDraft(String(next));
    onQuantityChange(next);
  }

  return (
    <div className={styles.panel}>
      {spec.customSize && <p className={styles.instruction}>{PACKAGING_CUSTOM_SIZE_INSTRUCTION}</p>}
      {note && <p className={styles.note}>{note}</p>}

      <div className={styles.fields}>
        <label className={styles.field} htmlFor={`${baseId}-size`}>
          <span>Size</span>
          <div className={styles.sizeRow}>
            <select
              id={`${baseId}-size`}
              value={referenceSize ? "reference" : "applied-custom"}
              onChange={(event) => {
                if (event.target.value === CUSTOM_SIZE_VALUE) setSizeDialogOpen(true);
                else if (event.target.value === "reference") onSizeChange({ ...spec.referenceSizeMm }, displayUnit);
              }}
            >
              <option value="reference">{formatPackagingSize(spec, spec.referenceSizeMm, displayUnit)}</option>
              {!referenceSize && <option value="applied-custom">{formatPackagingSize(spec, sizeMm, displayUnit)} (custom)</option>}
              {spec.customSize && <option value={CUSTOM_SIZE_VALUE}>Custom Size</option>}
            </select>
            {spec.customSize && (
              <button type="button" className={styles.sizeEdit} onClick={() => setSizeDialogOpen(true)} aria-label="Edit custom size">
                <Ruler />
              </button>
            )}
          </div>
          {!referenceSize && <small>Custom size priced from its die-cut sheet area; the listed size is priced exactly.</small>}
        </label>

        {visibleSelections.map((selection) => (
          <label className={styles.field} key={selection.id} htmlFor={`${baseId}-${selection.id}`}>
            <span>{selection.name}</span>
            <select
              id={`${baseId}-${selection.id}`}
              value={selections[selection.id] ?? selection.defaultOptionId}
              onChange={(event) => onSelectionChange(selection.id, event.target.value)}
              disabled={selection.options.length < 2}
            >
              {selection.options.map((option) => (
                <option key={option.id} value={option.id}>{option.name}</option>
              ))}
            </select>
          </label>
        ))}

        <label className={styles.field} htmlFor={`${baseId}-quantity`}>
          <span>Quantity</span>
          <select
            id={`${baseId}-quantity`}
            value={customQuantity ? CUSTOM_QUANTITY_VALUE : String(quantity)}
            onChange={(event) => {
              if (event.target.value === CUSTOM_QUANTITY_VALUE) {
                setCustomQuantity(true);
                return;
              }
              setCustomQuantity(false);
              onQuantityChange(Number(event.target.value));
            }}
          >
            {quantityOptions.map((option) => (
              <option key={option.quantity} value={option.quantity}>
                {option.quantity} pcs{option.unitPaise !== undefined ? ` — ${formatPrice(option.unitPaise / 100)}/piece` : ""}
              </option>
            ))}
            {spec.quantity.custom && <option value={CUSTOM_QUANTITY_VALUE}>Custom quantity</option>}
          </select>
          {customQuantity && (
            <div className={styles.customQuantity}>
              <input
                aria-label="Custom quantity in pieces"
                type="number"
                inputMode="numeric"
                min={spec.quantity.minimum}
                max={spec.quantity.maximum}
                step={1}
                value={quantityDraft}
                onChange={(event) => setQuantityDraft(event.target.value)}
                onBlur={commitQuantityDraft}
                onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commitQuantityDraft(); } }}
              />
              <span>pcs ({spec.quantity.minimum}–{spec.quantity.maximum})</span>
            </div>
          )}
        </label>
      </div>

      <div className={styles.unitPrice} aria-live="polite">
        <strong>{unitPaise !== undefined ? `${formatPrice(unitPaise / 100)}/piece` : "Price unavailable"}</strong>
        {unitPaise !== undefined && <small>{quantity} pcs · {formatPrice((unitPaise * quantity) / 100)} total</small>}
      </div>

      {tierRows.length > 1 && (
        <details className={styles.tiers}>
          <summary>Bulk pricing for this specification</summary>
          <table>
            <thead><tr><th scope="col">Quantity</th><th scope="col">Price / piece</th></tr></thead>
            <tbody>
              {tierRows.map((row) => (
                <tr key={row.minimum} className={activeTier?.minimum === row.minimum ? styles.activeTier : ""}>
                  <td>{row.minimum === row.maximum ? row.minimum : `${row.minimum}–${row.maximum}`} pcs</td>
                  <td>{row.unitPaise !== undefined ? formatPrice(row.unitPaise / 100) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      <button type="button" className={styles.designButton} onClick={onDesign}>
        <Box /> {designLabel}
      </button>
      <Link className={styles.bulkLink} href={bulkQuotePath}>Bulk Order ({spec.quantity.maximum}+ Qty)</Link>

      {sizeDialogOpen && (
        <CustomSizeDialog
          spec={spec}
          sizeMm={sizeMm}
          unit={displayUnit}
          onDiscard={() => setSizeDialogOpen(false)}
          onApply={(nextSize, nextUnit) => {
            setSizeDialogOpen(false);
            onSizeChange(nextSize, nextUnit);
          }}
        />
      )}
    </div>
  );
}

