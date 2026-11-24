/**
 * Packaging specification pricing, reproduced from the source site's quotation
 * engine (EzPac uses Pacdora CPQ). Measured on 2026-11-23 against ezpac.in:
 *
 *   unit price = sheet-area factor(size) × Σ(option coefficients) × quantity multiplier
 *
 * - Every selected option adds a fixed amount to the unit price at a given size
 *   and quantity, and every amount scales by the same quantity multiplier.
 * - A custom quantity is priced at the highest tier at or below it.
 * - Size changes the sheet area of the die-cut; the source engine derives it
 *   from its own dieline (with press-sheet imposition), so a custom size is
 *   priced from our dieline's sheet area relative to the reference size. At
 *   the reference size every price matches the source to the paisa.
 *
 * The spec is plain data stored on the product (`metadata.configurator.packagingQuote`);
 * nothing here knows about any one product.
 */
import { packagingSheetAreaMm2, type PackagingDielineKind } from "./packaging-dieline";

export type PackagingDisplayUnit = "mm" | "cm" | "in";
export type PackagingSizeAxis = "length" | "width" | "height";

export interface PackagingSizeMm {
  length: number;
  width: number;
  height: number;
}

export interface PackagingQuoteOption {
  id: string;
  name: string;
  /**
   * Unit-price change versus the default option, in paise, at the reference size
   * and first tier. Fractional: measured from the source's unrounded totals
   * (real_total_price / quantity), so later tiers round exactly as the source does.
   */
  deltaPaise: number;
}

export interface PackagingQuoteSelection {
  /** Stable key for the selection group, e.g. the source schema id. */
  id: string;
  /** Customer-facing group name exactly as the source shows it, e.g. "Finishing". */
  name: string;
  /** Hidden groups are always priced at their default and never shown. */
  hidden: boolean;
  defaultOptionId: string;
  options: PackagingQuoteOption[];
}

export interface PackagingQuoteTier {
  minimum: number;
  /** Unit price at the reference size with every default option, in paise. */
  unitPaise: number;
  /** unitPaise / first tier's unitPaise; stored so rounding of measured prices never compounds. */
  multiplier: number;
}

export interface PackagingQuoteSpec {
  source: "pacdora";
  /** Source model reference, kept for re-capture and audit. */
  modelCode: string;
  capturedAt: string;
  /** Flat-sheet layout used for the dieline view and for custom-size area scaling. */
  dieline: PackagingDielineKind;
  /** Size every measured price refers to (manufacture dimensions). A 0 axis is not part of this product's size. */
  referenceSizeMm: PackagingSizeMm;
  /** Axes the customer sizes, in display order. */
  sizeAxes: PackagingSizeAxis[];
  minSizeMm: PackagingSizeMm;
  maxSizeMm: PackagingSizeMm;
  customSize: boolean;
  defaultUnit: PackagingDisplayUnit;
  quantity: {
    /** Quantities offered in the source's quantity list. */
    options: number[];
    default: number;
    minimum: number;
    /** Highest quantity the source prices online; larger runs go to a bulk quote. */
    maximum: number;
    custom: boolean;
  };
  /**
   * First-tier unit price for the default options at the reference size, in
   * fractional paise before rounding (source real_total_price / quantity × 100).
   * Every price is derived from this, so rounding never compounds.
   */
  baseUnitPaise: number;
  tiers: PackagingQuoteTier[];
  selections: PackagingQuoteSelection[];
}

export interface PackagingSelectionInput {
  /** selection id → option id. Missing groups use their default. */
  selections?: Record<string, string>;
  sizeMm?: Partial<PackagingSizeMm>;
  displayUnit?: PackagingDisplayUnit;
}

export interface PackagingPriceAdjustment {
  referenceId: string;
  label: string;
  /** Unit-price change in paise at the requested size and quantity. */
  amountPaise: number;
}

export interface PackagingPriceResult {
  unitPaise: number;
  lineTotalPaise: number;
  /** Unit price for the default options at the requested size and quantity. */
  baseUnitPaise: number;
  adjustments: PackagingPriceAdjustment[];
  tier: PackagingQuoteTier;
  sizeMm: PackagingSizeMm;
  sizeFactor: number;
  isCustomSize: boolean;
  selections: Array<{ selectionId: string; selectionName: string; optionId: string; optionName: string }>;
}

export type PackagingPriceIssue =
  | { code: "QUANTITY_OUT_OF_RANGE"; message: string; minimum: number; maximum: number }
  | { code: "SELECTION_INVALID"; message: string; selectionId: string }
  | { code: "SIZE_INVALID"; message: string; axis: PackagingSizeAxis }
  | { code: "CUSTOM_SIZE_NOT_SUPPORTED"; message: string };

export class PackagingPriceError extends Error {
  constructor(readonly issue: PackagingPriceIssue) {
    super(issue.message);
    this.name = "PackagingPriceError";
  }
}

const MM_PER_UNIT: Record<PackagingDisplayUnit, number> = { mm: 1, cm: 10, in: 25.4 };

/** Safety floor for any customer-entered side; never above the product's own listed size. */
export const PACKAGING_MIN_SIZE_MM = 10;

export function packagingMinimumSizeMm(spec: Pick<PackagingQuoteSpec, "minSizeMm" | "referenceSizeMm">, axis: PackagingSizeAxis) {
  return Math.max(spec.minSizeMm[axis], Math.min(PACKAGING_MIN_SIZE_MM, spec.referenceSizeMm[axis]));
}

export function toMillimetres(value: number, unit: PackagingDisplayUnit) {
  return value * MM_PER_UNIT[unit];
}

export function fromMillimetres(valueMm: number, unit: PackagingDisplayUnit) {
  return valueMm / MM_PER_UNIT[unit];
}

/** The source shows inches to 4 decimals ("3.9606 x 7.8583 in"); cm to 2, mm to 1. */
export function formatPackagingMeasurement(valueMm: number, unit: PackagingDisplayUnit) {
  const precision = unit === "in" ? 4 : unit === "cm" ? 2 : 1;
  return String(Number(fromMillimetres(valueMm, unit).toFixed(precision)));
}

export function formatPackagingSize(spec: Pick<PackagingQuoteSpec, "sizeAxes">, sizeMm: PackagingSizeMm, unit: PackagingDisplayUnit) {
  return `${spec.sizeAxes.map((axis) => formatPackagingMeasurement(sizeMm[axis], unit)).join(" x ")} ${unit}`;
}

/** The tier a quantity is priced at: the highest tier minimum at or below it. */
export function packagingTierFor(spec: PackagingQuoteSpec, quantity: number): PackagingQuoteTier {
  const ordered = [...spec.tiers].sort((left, right) => left.minimum - right.minimum);
  let tier = ordered[0];
  for (const candidate of ordered) if (quantity >= candidate.minimum) tier = candidate;
  return tier;
}

export function packagingDefaultSelections(spec: PackagingQuoteSpec): Record<string, string> {
  return Object.fromEntries(spec.selections.map((selection) => [selection.id, selection.defaultOptionId]));
}

/** Validates and completes a customer's size; axes outside `sizeAxes` keep the reference value. */
export function resolvePackagingSize(spec: PackagingQuoteSpec, requested: Partial<PackagingSizeMm> | undefined): PackagingSizeMm {
  const size: PackagingSizeMm = { ...spec.referenceSizeMm };
  if (!requested) return size;
  let custom = false;
  for (const axis of spec.sizeAxes) {
    const value = requested[axis];
    if (value === undefined) continue;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new PackagingPriceError({ code: "SIZE_INVALID", message: `Enter a valid ${axis}.`, axis });
    }
    const minimum = packagingMinimumSizeMm(spec, axis);
    const maximum = spec.maxSizeMm[axis];
    if (value < minimum - 0.005 || value > maximum + 0.005) {
      throw new PackagingPriceError({
        code: "SIZE_INVALID",
        message: `${axis[0].toUpperCase()}${axis.slice(1)} must be between ${minimum} mm and ${maximum} mm.`,
        axis,
      });
    }
    const rounded = Math.round(value * 100) / 100;
    if (Math.abs(rounded - spec.referenceSizeMm[axis]) > 0.05) custom = true;
    size[axis] = rounded;
  }
  if (custom && !spec.customSize) {
    throw new PackagingPriceError({ code: "CUSTOM_SIZE_NOT_SUPPORTED", message: "This product is only available in its listed size." });
  }
  return size;
}

/**
 * 3D preview dimensions for a manufacture size: length runs across the front,
 * height up, width front-to-back. A two-axis product reuses its length as depth.
 */
export function packagingPreviewDimensionsMm(sizeMm: PackagingSizeMm): { width: number; height: number; depth: number } {
  const height = sizeMm.height > 0 ? sizeMm.height : sizeMm.width;
  return {
    width: sizeMm.length,
    height: height > 0 ? height : sizeMm.length,
    depth: sizeMm.width > 0 ? sizeMm.width : sizeMm.length,
  };
}

export function isPackagingReferenceSize(spec: PackagingQuoteSpec, sizeMm: PackagingSizeMm) {
  return spec.sizeAxes.every((axis) => Math.abs(sizeMm[axis] - spec.referenceSizeMm[axis]) <= 0.05);
}

export function packagingSizeFactor(spec: PackagingQuoteSpec, sizeMm: PackagingSizeMm) {
  if (isPackagingReferenceSize(spec, sizeMm)) return 1;
  const reference = packagingSheetAreaMm2(spec.dieline, spec.referenceSizeMm);
  const requested = packagingSheetAreaMm2(spec.dieline, sizeMm);
  if (!(reference > 0) || !(requested > 0)) return 1;
  return requested / reference;
}

/**
 * Authoritative unit and line price for one packaging configuration. Throws
 * PackagingPriceError for any input the source would not accept.
 */
export function pricePackagingConfiguration(
  spec: PackagingQuoteSpec,
  quantity: number,
  input: PackagingSelectionInput = {},
): PackagingPriceResult {
  if (!Number.isInteger(quantity) || quantity < spec.quantity.minimum || quantity > spec.quantity.maximum) {
    throw new PackagingPriceError({
      code: "QUANTITY_OUT_OF_RANGE",
      message: `Order between ${spec.quantity.minimum} and ${spec.quantity.maximum} pieces.`,
      minimum: spec.quantity.minimum,
      maximum: spec.quantity.maximum,
    });
  }
  if (!spec.quantity.custom && !spec.quantity.options.includes(quantity)) {
    throw new PackagingPriceError({
      code: "QUANTITY_OUT_OF_RANGE",
      message: `Choose one of the listed quantities: ${spec.quantity.options.join(", ")}.`,
      minimum: spec.quantity.minimum,
      maximum: spec.quantity.maximum,
    });
  }
  const requestedSelections = input.selections ?? {};
  for (const selectionId of Object.keys(requestedSelections)) {
    if (!spec.selections.some((selection) => selection.id === selectionId)) {
      throw new PackagingPriceError({ code: "SELECTION_INVALID", message: "A chosen specification is not available for this product.", selectionId });
    }
  }
  const chosen = spec.selections.map((selection) => {
    const requested = requestedSelections[selection.id];
    const optionId = selection.hidden || requested === undefined ? selection.defaultOptionId : requested;
    const option = selection.options.find((candidate) => candidate.id === optionId);
    if (!option) {
      throw new PackagingPriceError({
        code: "SELECTION_INVALID",
        message: `${selection.name} is not an available option.`,
        selectionId: selection.id,
      });
    }
    return { selection, option };
  });

  const sizeMm = resolvePackagingSize(spec, input.sizeMm);
  const sizeFactor = packagingSizeFactor(spec, sizeMm);
  const tier = packagingTierFor(spec, quantity);
  const firstTier = packagingTierFor(spec, 0);
  const scale = tier.multiplier * sizeFactor;
  const exactBase = spec.baseUnitPaise > 0 ? spec.baseUnitPaise : firstTier.unitPaise;
  const baseUnitPaise = Math.round(exactBase * scale);
  const core = chosen.reduce((total, { option }) => total + option.deltaPaise, exactBase);
  const unitPaise = Math.max(0, Math.round(core * scale));
  // Adjustments explain the difference from the default options; their rounding
  // remainder goes to the largest one so they always sum to the unit price.
  const adjustments: PackagingPriceAdjustment[] = chosen
    .filter(({ option }) => option.deltaPaise !== 0)
    .map(({ selection, option }) => ({
      referenceId: `${selection.id}:${option.id}`,
      label: `${selection.name}: ${option.name}`,
      amountPaise: Math.round(option.deltaPaise * scale),
    }));
  const remainder = unitPaise - baseUnitPaise - adjustments.reduce((total, adjustment) => total + adjustment.amountPaise, 0);
  if (remainder !== 0 && adjustments.length) {
    const largest = adjustments.reduce((best, adjustment) => Math.abs(adjustment.amountPaise) > Math.abs(best.amountPaise) ? adjustment : best);
    largest.amountPaise += remainder;
  }
  return {
    unitPaise,
    lineTotalPaise: unitPaise * quantity,
    baseUnitPaise: adjustments.length ? baseUnitPaise : unitPaise,
    adjustments,
    tier,
    sizeMm,
    sizeFactor,
    isCustomSize: !isPackagingReferenceSize(spec, sizeMm),
    selections: chosen.map(({ selection, option }) => ({
      selectionId: selection.id,
      selectionName: selection.name,
      optionId: option.id,
      optionName: option.name,
    })),
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const positiveInteger = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;
const finiteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const shortText = (value: unknown, max = 160): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= max;

function readSize(value: unknown): PackagingSizeMm | undefined {
  if (!isRecord(value)) return undefined;
  const size = { length: value.length, width: value.width, height: value.height };
  return Object.values(size).every((entry) => finiteNumber(entry) && entry >= 0 && entry <= 10_000)
    ? size as PackagingSizeMm
    : undefined;
}

/**
 * Reads a stored spec defensively. Anything malformed yields undefined, so a bad
 * record falls back to the product's catalog price instead of breaking the page.
 */
export function readPackagingQuoteSpec(value: unknown, isDielineKind: (kind: unknown) => kind is PackagingDielineKind): PackagingQuoteSpec | undefined {
  if (!isRecord(value) || value.source !== "pacdora" || !shortText(value.modelCode, 80) || !shortText(value.capturedAt, 40)) return undefined;
  if (!isDielineKind(value.dieline)) return undefined;
  const referenceSizeMm = readSize(value.referenceSizeMm);
  const minSizeMm = readSize(value.minSizeMm);
  const maxSizeMm = readSize(value.maxSizeMm);
  if (!referenceSizeMm || !minSizeMm || !maxSizeMm) return undefined;
  const axes = Array.isArray(value.sizeAxes) ? value.sizeAxes : [];
  if (!axes.length || axes.length > 3 || !axes.every((axis) => axis === "length" || axis === "width" || axis === "height")) return undefined;
  const sizeAxes = [...new Set(axes as PackagingSizeAxis[])];
  if (sizeAxes.some((axis) => !(referenceSizeMm[axis] > 0) || maxSizeMm[axis] < referenceSizeMm[axis])) return undefined;
  const unit = value.defaultUnit;
  if (unit !== "mm" && unit !== "cm" && unit !== "in") return undefined;
  const quantity = value.quantity;
  if (!isRecord(quantity)) return undefined;
  const options = Array.isArray(quantity.options) ? quantity.options.filter(positiveInteger) : [];
  if (!positiveInteger(quantity.minimum) || !positiveInteger(quantity.maximum) || !positiveInteger(quantity.default)) return undefined;
  if (quantity.minimum > quantity.maximum || quantity.default < quantity.minimum || quantity.default > quantity.maximum || quantity.maximum > 1_000) return undefined;
  const tiers = Array.isArray(value.tiers) ? value.tiers : [];
  const parsedTiers: PackagingQuoteTier[] = [];
  for (const tier of tiers) {
    if (!isRecord(tier) || !positiveInteger(tier.minimum) || !Number.isSafeInteger(tier.unitPaise) || (tier.unitPaise as number) < 0 || !finiteNumber(tier.multiplier) || tier.multiplier <= 0 || tier.multiplier > 1.000001) return undefined;
    parsedTiers.push({ minimum: tier.minimum, unitPaise: tier.unitPaise as number, multiplier: tier.multiplier });
  }
  parsedTiers.sort((left, right) => left.minimum - right.minimum);
  if (!parsedTiers.length || parsedTiers[0].minimum > quantity.minimum || new Set(parsedTiers.map((tier) => tier.minimum)).size !== parsedTiers.length) return undefined;
  const selections: PackagingQuoteSelection[] = [];
  for (const rawSelection of Array.isArray(value.selections) ? value.selections : []) {
    if (!isRecord(rawSelection) || !shortText(rawSelection.id, 80) || !shortText(rawSelection.name, 80) || typeof rawSelection.hidden !== "boolean" || !shortText(rawSelection.defaultOptionId, 80)) return undefined;
    const selectionOptions: PackagingQuoteOption[] = [];
    for (const rawOption of Array.isArray(rawSelection.options) ? rawSelection.options : []) {
      if (!isRecord(rawOption) || !shortText(rawOption.id, 80) || !shortText(rawOption.name, 160) || !finiteNumber(rawOption.deltaPaise) || Math.abs(rawOption.deltaPaise) > 100_000_000) return undefined;
      selectionOptions.push({ id: rawOption.id, name: rawOption.name.trim(), deltaPaise: rawOption.deltaPaise as number });
    }
    if (!selectionOptions.some((option) => option.id === rawSelection.defaultOptionId)) return undefined;
    selections.push({ id: rawSelection.id, name: rawSelection.name.trim(), hidden: rawSelection.hidden, defaultOptionId: rawSelection.defaultOptionId, options: selectionOptions });
  }
  if (new Set(selections.map((selection) => selection.id)).size !== selections.length) return undefined;
  // Older captures without the exact base fall back to the rounded first-tier price.
  const baseUnitPaise = finiteNumber(value.baseUnitPaise) && value.baseUnitPaise > 0 && value.baseUnitPaise <= 100_000_000
    ? value.baseUnitPaise
    : parsedTiers[0].unitPaise;
  return {
    source: "pacdora",
    modelCode: value.modelCode,
    capturedAt: value.capturedAt,
    dieline: value.dieline,
    referenceSizeMm,
    sizeAxes,
    minSizeMm,
    maxSizeMm,
    customSize: value.customSize === true,
    defaultUnit: unit,
    quantity: {
      options: [...new Set(options)].sort((left, right) => left - right).filter((entry) => entry >= (quantity.minimum as number) && entry <= (quantity.maximum as number)),
      default: quantity.default,
      minimum: quantity.minimum,
      maximum: quantity.maximum,
      custom: quantity.custom === true,
    },
    baseUnitPaise,
    tiers: parsedTiers,
    selections,
  };
}
