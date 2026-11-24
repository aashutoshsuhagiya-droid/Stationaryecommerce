/**
 * Pure mapping from a captured ezpac.in Pacdora CPQ session to the storefront's
 * PackagingQuoteSpec, plus a verifier that re-predicts every measured price.
 *
 * Capture shape: what the product page itself requested and received, plus a
 * dense quantity probe at the default options and the same quantity ladder for
 * each non-default option of every visible selection (see ezpac-quotation.ts).
 *
 * Exactness: the source rounds unit prices to the paisa but also returns an
 * unrounded line total. Each configuration's first-tier price is recovered in
 * fractional paise from its highest-quantity total, and every tier multiplier is
 * a k/120 fraction, so (base + Σ delta) × multiplier rounds exactly as the source.
 */
import { dielineKindForModel, isPackagingDielineKind, type PackagingDielineKind } from "../../src/lib/packaging-dieline";
import {
  pricePackagingConfiguration,
  readPackagingQuoteSpec,
  type PackagingDisplayUnit,
  type PackagingQuoteSelection,
  type PackagingQuoteSpec,
  type PackagingQuoteTier,
  type PackagingSizeAxis,
  type PackagingSizeMm,
} from "../../src/lib/packaging-quote";

export interface PacdoraQuotationPoint {
  quantity: number;
  unit_price: number;
  total_price?: number;
  /** The source's unrounded line total (rupees, 2 decimals); the only precise price it returns. */
  real_total_price?: number;
}

export interface PacdoraQuotationBody {
  engine: string;
  quotaion_solution: string;
  model: { code: string; length: number; width: number; height: number; size_type?: string; thickness?: number };
  quantity: number[];
  section: Array<{ id: string }>;
  amount_unit?: number;
}

export interface PacdoraSelectionOption {
  id: string;
  name: string;
}

export interface PacdoraSelection {
  hidden: boolean;
  schema: { id: string; name: string };
  default: string;
  options: PacdoraSelectionOption[];
}

export interface PacdoraQuotationForm {
  size: {
    fixed?: boolean;
    hasCustom?: boolean | string;
    minSize?: Partial<PackagingSizeMm>;
    maxSize?: Partial<PackagingSizeMm>;
    options?: unknown[];
    sizeType?: string;
  };
  quantity: {
    default?: number;
    options?: number[];
    hasCustom?: boolean | string;
    minQuantity?: number;
    maxQuantity?: number;
  };
  selections: PacdoraSelection[];
}

/** One non-default option, priced across the same quantity ladder as the defaults. */
export interface PacdoraOptionProbe {
  selectionId: string;
  optionId: string;
  points: PacdoraQuotationPoint[] | null;
  error?: string;
}

/** Capture format; entries of any other version are captured again. */
export const PACDORA_CAPTURE_VERSION = 2;

export interface PacdoraCaptureEntry {
  version?: number;
  slug: string;
  handle: string;
  capturedAt: string;
  modelId: string | null;
  quotationBody: PacdoraQuotationBody | null;
  product: { title?: string; quotationSolutionId?: string; quotationForm?: PacdoraQuotationForm } | null;
  pageQuotation: PacdoraQuotationPoint[] | null;
  dense: { quantities: number[]; points: PacdoraQuotationPoint[] } | null;
  options: PacdoraOptionProbe[];
  selectorText: string | null;
  skipped?: string;
}

/** notes: source details the spec cannot express, for the import report. */
export type PacdoraMapResult = { spec: PackagingQuoteSpec; notes: string[] } | { error: string };

/**
 * Whether the widget lets the customer pick a size. Some products (A4 flyer,
 * planner) carry hasCustom in their form yet render no size row at all.
 */
export function sizeRowShown(selectorText: string | null): boolean | null {
  if (selectorText === null) return null;
  return selectorText.split("\n").some((line) => /size/i.test(line));
}

const toPaise = (rupees: number) => Math.round(rupees * 100);
const truthy = (value: unknown) => value === true || value === "1" || value === 1 || value === "true";

/**
 * The storefront flat layout for an EzPac product. A 3D model wins; otherwise the
 * product type is read from its mapping preset or slug.
 */
export function dielineKindForEzpacProduct(input: {
  slug: string;
  productModel?: string | null;
  presetId?: string | null;
  sizeAxes: readonly PackagingSizeAxis[];
}): PackagingDielineKind {
  const key = `${input.presetId ?? ""} ${input.slug}`.toLowerCase();
  // chocolate-triangle-box is quoted on the same Pacdora model as paan-box (181060).
  if (/\bpaan-box\b|triangle/.test(key)) return "pyramid-box";
  const fromModel = dielineKindForModel(input.productModel ?? undefined);
  if (fromModel) return fromModel;
  // wedding-gift-hamper-box is quoted on the rigid lid-and-base model of unboxing-experience-box.
  if (/hamper/.test(key)) return "rigid-lid-box";
  if (/pillow/.test(key)) return "pillow-box";
  if (/tray/.test(key)) return "tray";
  if (/card|flyer|brochure|sticker|tag|envelope|shagun|money-cover|internary|itinerary|planner/.test(key)) return "flat-sheet";
  if (/bag/.test(key)) return "paper-bag";
  if (/pouch|packet/.test(key)) return "stand-up-pouch";
  if (input.sizeAxes.length < 3) return "flat-sheet";
  return "tuck-end-carton";
}

/** Snap a measured ratio to k/120 when it is within tolerance; the source ladder is built from such fractions. */
export function snapMultiplier(ratio: number, tolerance = 0.0005): number {
  const snapped = Math.round(ratio * 120) / 120;
  return Math.abs(snapped - ratio) <= tolerance ? snapped : ratio;
}

/** Exact unit price in fractional paise, from the source's unrounded line total. */
export function exactUnitPaise(point: PacdoraQuotationPoint): number {
  const total = point.real_total_price ?? point.total_price ?? point.unit_price * point.quantity;
  return (total / point.quantity) * 100;
}

const round4 = (value: number) => Math.round(value * 10_000) / 10_000;

/**
 * Breakpoints of the step price ladder at the default options. Each tier's
 * multiplier is its exact unit price over the first tier's, snapped to the
 * source's k/120 fractions; a quantity starts a tier only where it changes.
 */
export function tiersFromPoints(points: readonly PacdoraQuotationPoint[]): PackagingQuoteTier[] {
  const ordered = [...points].sort((left, right) => left.quantity - right.quantity);
  if (!ordered.length) return [];
  const base = exactUnitPaise(ordered[0]);
  const tiers: PackagingQuoteTier[] = [];
  for (const point of ordered) {
    const multiplier = tiers.length ? snapMultiplier(exactUnitPaise(point) / base) : 1;
    if (tiers.length && Math.abs(tiers[tiers.length - 1].multiplier - multiplier) < 1e-9) continue;
    tiers.push({ minimum: point.quantity, unitPaise: toPaise(point.unit_price), multiplier });
  }
  return tiers;
}

function multiplierAt(tiers: readonly PackagingQuoteTier[], quantity: number) {
  let multiplier = tiers[0]?.multiplier ?? 1;
  for (const tier of tiers) if (quantity >= tier.minimum) multiplier = tier.multiplier;
  return multiplier;
}

/**
 * First-tier unit price in fractional paise, recovered from the highest priced
 * quantity: its total carries the most significant digits of any price returned.
 */
export function coreUnitPaise(points: readonly PacdoraQuotationPoint[], tiers: readonly PackagingQuoteTier[]): number | null {
  const highest = [...points].sort((left, right) => right.quantity - left.quantity)[0];
  if (!highest) return null;
  return exactUnitPaise(highest) / multiplierAt(tiers, highest.quantity);
}

/**
 * The first-tier price (fractional paise) that reproduces every measured unit
 * price of one configuration.
 *
 * The source derives a shown unit price from its already-rounded line total
 * (round2(round2(core × m × q) / q), float artifacts included: 67129.5 / 300 →
 * 223.76), so on a half-paisa boundary its unit prices can disagree with its own
 * totals by a hair, and occasionally with each other. Unit prices are what a
 * customer sees and pays per piece, so the core is chosen where the most of them
 * hold (ties: lower quantities, the price shown on load); the 2-decimal totals
 * only steer the choice within that window towards the most precise estimate.
 */
export function chooseCoreUnitPaise(points: readonly PacdoraQuotationPoint[], tiers: readonly PackagingQuoteTier[]): number | null {
  const estimate = coreUnitPaise(points, tiers);
  if (estimate === null) return null;
  const ordered = [...points].sort((left, right) => left.quantity - right.quantity);
  const bounds = ordered.map((point, index) => {
    const multiplier = multiplierAt(tiers, point.quantity);
    const unit = toPaise(point.unit_price);
    return { low: (unit - 0.5) / multiplier, high: (unit + 0.5) / multiplier, weight: 1 + 1e-3 / (index + 1) };
  });
  let totalLow = -Infinity;
  let totalHigh = Infinity;
  for (const point of ordered) {
    if (typeof point.real_total_price !== "number") continue;
    const scale = 100 / (multiplierAt(tiers, point.quantity) * point.quantity);
    totalLow = Math.max(totalLow, (point.real_total_price - 0.005) * scale);
    totalHigh = Math.min(totalHigh, (point.real_total_price + 0.005) * scale);
  }
  if (!(totalLow < totalHigh)) [totalLow, totalHigh] = [estimate, estimate];
  // Sweep the interval endpoints for the window that satisfies the most unit prices.
  const edges = [...new Set(bounds.flatMap((bound) => [bound.low, bound.high]))].sort((left, right) => left - right);
  let unitLow = estimate;
  let unitHigh = estimate;
  let best = -1;
  for (let index = 0; index + 1 < edges.length; index += 1) {
    const middle = (edges[index] + edges[index + 1]) / 2;
    const score = bounds.reduce((total, bound) => total + (middle >= bound.low && middle < bound.high ? bound.weight : 0), 0);
    const nearer = Math.abs(middle - estimate) < Math.abs((unitLow + unitHigh) / 2 - estimate);
    if (score > best + 1e-12 || (Math.abs(score - best) <= 1e-12 && nearer)) {
      best = score;
      [unitLow, unitHigh] = [edges[index], edges[index + 1]];
    }
  }
  if (!(unitLow < unitHigh)) return estimate;
  // Preferred window: unit window ∩ total bound; when they miss, the edge of the
  // unit window nearest the totals.
  const edge = Math.min(1e-4, (unitHigh - unitLow) / 2);
  let low = Math.max(unitLow, totalLow);
  let high = Math.min(unitHigh, totalHigh);
  if (!(low < high)) {
    if (totalHigh <= unitLow) [low, high] = [unitLow, unitLow + edge];
    else [low, high] = [unitHigh - edge, unitHigh];
  }
  const inside = (value: number) => value > low + 1e-9 && value < high - 1e-9;
  const target = inside(estimate) ? estimate : (low + high) / 2;
  for (let decimals = 4; decimals <= 10; decimals += 1) {
    const rounded = Math.round(target * 10 ** decimals) / 10 ** decimals;
    if (inside(rounded)) return rounded;
  }
  return target;
}

/** The shortest delta (4–10 decimals) that reproduces as many prices of its ladder as the exact one. */
function compactDelta(base: number, delta: number, points: readonly PacdoraQuotationPoint[], tiers: readonly PackagingQuoteTier[]) {
  const reproduced = (candidate: number) => points.filter((point) =>
    Math.round((base + candidate) * multiplierAt(tiers, point.quantity)) === toPaise(point.unit_price)).length;
  const target = reproduced(delta);
  for (let decimals = 4; decimals <= 10; decimals += 1) {
    const rounded = Math.round(delta * 10 ** decimals) / 10 ** decimals;
    if (reproduced(rounded) >= target) return rounded;
  }
  return delta;
}

function sizeFrom(value: Partial<PackagingSizeMm> | undefined, fallback: number): PackagingSizeMm {
  const read = (entry: unknown) => (typeof entry === "number" && Number.isFinite(entry) && entry >= 0 ? entry : fallback);
  return { length: read(value?.length), width: read(value?.width), height: read(value?.height) };
}

export function mapPacdoraCaptureToSpec(
  entry: PacdoraCaptureEntry,
  options: { dieline: PackagingDielineKind; defaultUnit: PackagingDisplayUnit },
): PacdoraMapResult {
  if (entry.skipped) return { error: entry.skipped };
  const form = entry.product?.quotationForm;
  const body = entry.quotationBody;
  if (!form || !body) return { error: "No quotation form or page quotation was captured." };
  if (!entry.dense?.points.length) return { error: "No quantity prices were captured." };
  const notes: string[] = [];
  const shown = sizeRowShown(entry.selectorText);
  const customSize = truthy(form.size.hasCustom) && shown !== false;
  const presets = Array.isArray(form.size.options) ? form.size.options : [];
  if (presets.length) {
    // Listed sizes are priced by the source per size; with custom sizing on they stay
    // orderable as a custom size, otherwise the spec cannot offer them at all.
    if (!customSize) return { error: `The source sells only ${presets.length} listed sizes (${presets.join(", ")}); the spec holds one reference size.` };
    notes.push(`Listed size${presets.length === 1 ? "" : "s"} ${presets.join(", ")} not shown as a choice; orderable as a custom size.`);
  }
  if (truthy(form.size.hasCustom) && shown === false) notes.push("The source shows no size choice, so custom size is off.");

  const referenceSizeMm: PackagingSizeMm = {
    length: Number(body.model.length) || 0,
    width: Number(body.model.width) || 0,
    height: Number(body.model.height) || 0,
  };
  const sizeAxes = (["length", "width", "height"] as const).filter((axis) => referenceSizeMm[axis] > 0);
  if (!sizeAxes.length) return { error: "The source model has no size." };
  const minSizeMm = sizeFrom(form.size.minSize, 0);
  const maxSizeMm = sizeFrom(form.size.maxSize, 0);
  for (const axis of sizeAxes) maxSizeMm[axis] = Math.max(maxSizeMm[axis], referenceSizeMm[axis]);

  const tiers = tiersFromPoints(entry.dense.points);
  const firstTier = tiers[0];
  const baseCore = chooseCoreUnitPaise([...entry.dense.points, ...(entry.pageQuotation ?? [])], tiers);
  if (!firstTier || firstTier.unitPaise <= 0 || baseCore === null || !(baseCore > 0)) return { error: "The source prices this product at zero." };
  const pricedQuantities = entry.dense.points.map((point) => point.quantity);
  const highestPriced = Math.max(...pricedQuantities);
  // Never below the first measured quantity: nothing under it was priced by the source.
  const minimum = Math.max(1, Number(form.quantity.minQuantity) || 0, firstTier.minimum);
  const maximum = Math.min(1_000, highestPriced);
  const sourceDefault = Number(form.quantity.default) || minimum;
  const quantityOptions = [...new Set([...(form.quantity.options ?? []), ...(pricedQuantities.includes(1_000) && maximum >= 1_000 ? [1_000] : [])])]
    .filter((quantity) => Number.isSafeInteger(quantity) && quantity >= minimum && quantity <= maximum)
    .sort((left, right) => left - right);

  const sectionIds = body.section.map((section) => section.id);
  const selections: PackagingQuoteSelection[] = [];
  for (const selection of form.selections) {
    const pageDefault = selection.options.find((option) => sectionIds.includes(option.id))?.id;
    const defaultOptionId = pageDefault ?? selection.default;
    const defaultOption = selection.options.find((option) => option.id === defaultOptionId);
    if (!defaultOption) return { error: `${selection.schema.name} has no default option.` };
    const mappedOptions = [];
    for (const option of selection.options) {
      if (option.id === defaultOptionId) {
        mappedOptions.push({ id: option.id, name: option.name.trim(), deltaPaise: 0 });
        continue;
      }
      if (selection.hidden) continue;
      const probe = entry.options.find((candidate) => candidate.selectionId === selection.schema.id && candidate.optionId === option.id);
      const optionCore = probe?.points?.length ? chooseCoreUnitPaise(probe.points, tiers) : null;
      if (optionCore === null) {
        return { error: `${selection.schema.name}: ${option.name.trim()} was not priced${probe?.error ? ` (${probe.error})` : ""}.` };
      }
      mappedOptions.push({ id: option.id, name: option.name.trim(), deltaPaise: compactDelta(baseCore, optionCore - baseCore, probe!.points!, tiers) });
    }
    // Default first, then the source order.
    mappedOptions.sort((left, right) => (left.id === defaultOptionId ? -1 : right.id === defaultOptionId ? 1 : 0));
    selections.push({
      id: selection.schema.id,
      name: selection.schema.name.trim(),
      hidden: selection.hidden === true,
      defaultOptionId,
      options: mappedOptions,
    });
  }

  const candidate: PackagingQuoteSpec = {
    source: "pacdora",
    modelCode: String(body.model.code),
    capturedAt: entry.capturedAt,
    dieline: options.dieline,
    referenceSizeMm,
    sizeAxes,
    minSizeMm,
    maxSizeMm,
    customSize,
    defaultUnit: options.defaultUnit,
    quantity: {
      options: quantityOptions,
      default: Math.min(maximum, Math.max(minimum, sourceDefault)),
      minimum,
      maximum,
      custom: truthy(form.quantity.hasCustom),
    },
    baseUnitPaise: baseCore,
    tiers,
    selections,
  };
  // The storefront reads specs defensively; a spec it would discard is a mapping bug.
  const spec = readPackagingQuoteSpec(candidate, isPackagingDielineKind);
  if (!spec) return { error: "The mapped spec does not pass the storefront reader." };
  return { spec, notes };
}

export interface PacdoraVerification {
  maxErrorPaise: number;
  checks: Array<{ label: string; quantity: number; expectedPaise: number; predictedPaise: number }>;
}

/** Re-predicts every measured price: the defaults and every option at every probed quantity. */
export function verifyPacdoraSpec(entry: PacdoraCaptureEntry, spec: PackagingQuoteSpec): PacdoraVerification {
  const checks: PacdoraVerification["checks"] = [];
  const orderable = (quantity: number) => quantity >= spec.quantity.minimum
    && quantity <= spec.quantity.maximum
    && (spec.quantity.custom || spec.quantity.options.includes(quantity));
  const check = (label: string, points: readonly PacdoraQuotationPoint[] | null | undefined, selections: Record<string, string> = {}) => {
    for (const point of points ?? []) {
      if (!orderable(point.quantity)) continue;
      checks.push({
        label,
        quantity: point.quantity,
        expectedPaise: toPaise(point.unit_price),
        predictedPaise: pricePackagingConfiguration(spec, point.quantity, { selections }).unitPaise,
      });
    }
  };
  check("defaults", entry.dense?.points);
  check("page", entry.pageQuotation);
  for (const probe of entry.options) {
    const selection = spec.selections.find((candidate) => candidate.id === probe.selectionId);
    const option = selection?.options.find((candidate) => candidate.id === probe.optionId);
    if (!selection || selection.hidden || !option) continue;
    check(`${selection.name}: ${option.name}`, probe.points, { [probe.selectionId]: probe.optionId });
  }
  return {
    maxErrorPaise: checks.reduce((maximum, entry) => Math.max(maximum, Math.abs(entry.expectedPaise - entry.predictedPaise)), 0),
    checks,
  };
}
