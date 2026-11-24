import assert from "node:assert/strict";
import test from "node:test";

import { pricePackagingConfiguration } from "../../src/lib/packaging-quote";
import {
  coreUnitPaise,
  dielineKindForEzpacProduct,
  exactUnitPaise,
  mapPacdoraCaptureToSpec,
  snapMultiplier,
  tiersFromPoints,
  verifyPacdoraSpec,
  type PacdoraCaptureEntry,
  type PacdoraQuotationPoint,
} from "./ezpac-quotation-map";

// Measured on ezpac.in/products/paan-box (Pacdora model 181060) on 2026-11-23:
// [quantity, unit_price, real_total_price] per configuration.
type Row = [number, number, number];
const DEFAULTS: Row[] = [
  [10, 221.31, 2213.06], [25, 184.42, 4610.54], [50, 147.54, 7376.87], [60, 147.54, 8852.24], [75, 129.1, 9682.14],
  [100, 110.65, 11065.3], [150, 110.65, 16597.95], [200, 103.28, 20655.23], [300, 95.9, 28769.79],
  [500, 92.21, 46105.43], [750, 81.15, 60859.16], [1000, 73.77, 73768.68],
];
const LADDERS: Record<string, Row[]> = {
  "fin-gloss": [[10, 215.4, 2154.05], [25, 179.5, 4487.59], [50, 143.6, 7180.15], [75, 125.65, 9423.95], [100, 107.7, 10770.23], [200, 100.52, 20104.42], [300, 93.34, 28002.59], [500, 89.75, 44875.95], [750, 78.98, 59236.25]],
  "fin-velvet": [[10, 250.81, 2508.14], [25, 209.01, 5225.28], [50, 167.21, 8360.45], [75, 146.31, 10973.09], [100, 125.41, 12540.68], [200, 117.05, 23409.26], [300, 108.69, 32605.76], [500, 104.51, 52252.82], [750, 91.96, 68973.72]],
  "side-both": [[10, 280.32, 2803.21], [25, 233.6, 5840.02], [50, 186.88, 9344.03], [75, 163.52, 12264.04], [100, 140.16, 14016.05], [200, 130.82, 26163.29], [300, 121.47, 36441.73], [500, 116.8, 58400.21], [750, 102.78, 77088.27]],
  "fx-gold": [[10, 516.38, 5163.81], [25, 430.32, 10757.93], [50, 344.25, 17212.69], [75, 301.22, 22591.66], [100, 258.19, 25819.04], [200, 240.98, 48195.54], [300, 223.76, 67129.5], [500, 215.16, 107579.33], [750, 189.34, 142004.71]],
  "fx-uv": [[10, 575.4, 5753.96], [25, 479.5, 11987.41], [50, 383.6, 19179.86], [75, 335.65, 25173.56], [100, 287.7, 28769.79], [200, 268.52, 53703.6], [300, 249.34, 74801.44], [500, 239.75, 119874.11], [750, 210.98, 158233.82]],
};
const SELECTION_OF: Record<string, string> = { "fin-gloss": "s-finish", "fin-velvet": "s-finish", "side-both": "s-sides", "fx-gold": "s-fx", "fx-uv": "s-fx" };
const points = (rows: Row[]): PacdoraQuotationPoint[] => rows.map(([quantity, unit_price, real_total_price]) => ({ quantity, unit_price, real_total_price }));

const option = (id: string, name: string) => ({ id, name });
const selection = (id: string, name: string, hidden: boolean, options: Array<{ id: string; name: string }>) => ({
  hidden,
  schema: { id, name },
  default: options[0].id,
  options,
});

function paanBoxCapture(): PacdoraCaptureEntry {
  return {
    version: 2,
    slug: "paan-box",
    handle: "paan-box",
    capturedAt: "2026-11-23T14:30:00.000Z",
    modelId: "181060",
    quotationBody: {
      engine: "simple-20241212",
      quotaion_solution: "fLwOv5fER02NGnnaMGmS",
      model: { code: "181060", length: 100.6, width: 0, height: 199.6, size_type: "die-cut", thickness: 0.5 },
      quantity: [10, 25, 50, 75, 100, 200, 300, 500, 750],
      section: [{ id: "mat-white" }, { id: "print-full" }, { id: "fin-matte" }, { id: "side-out" }, { id: "paste" }, { id: "area-std" }, { id: "fx-none" }],
      amount_unit: 2,
    },
    product: {
      title: "Box with Pasting ",
      quotationSolutionId: "fLwOv5fER02NGnnaMGmS",
      quotationForm: {
        size: { fixed: true, hasCustom: true, minSize: { length: 0, width: 0, height: 0 }, maxSize: { length: 2000, width: 2000, height: 2000 }, options: [] },
        quantity: { default: 10, options: [10, 25, 50, 75, 100, 200, 300, 500, 750], hasCustom: "1", minQuantity: 10, maxQuantity: 10000 },
        selections: [
          selection("s-material", "Material", false, [option("mat-white", "White card board 220- 300 gsm")]),
          selection("s-print", "Print", true, [option("print-full", "Full Color")]),
          selection("s-finish", "Finishing", false, [option("fin-matte", "Matte Lamination"), option("fin-gloss", "Gloss Lamination"), option("fin-velvet", "Velvett Lamination")]),
          selection("s-sides", "Printing sides", false, [option("side-out", "Outside"), option("side-both", "Outside & Inside")]),
          selection("s-paste", "Pasting", true, [option("paste", "Pasting")]),
          selection("s-area", "Area", true, [option("area-std", "standard size")]),
          selection("s-fx", "Special Effects", false, [option("fx-none", "No Effect"), option("fx-gold", "Gold Foil Stamping"), option("fx-uv", "UV Effect")]),
        ],
      },
    },
    pageQuotation: points(DEFAULTS.filter(([quantity]) => [10, 25, 50, 75, 100, 200, 300, 500, 750].includes(quantity))),
    dense: { quantities: DEFAULTS.map(([quantity]) => quantity), points: points(DEFAULTS) },
    options: Object.entries(LADDERS).map(([optionId, rows]) => ({ selectionId: SELECTION_OF[optionId], optionId, points: points(rows) })),
    selectorText: "Size\n3.9606 x 7.8583 in\nMaterial\nWhite card board 220- 300 gsm",
  };
}

function paanBoxSpec() {
  const result = mapPacdoraCaptureToSpec(paanBoxCapture(), { dieline: "pyramid-box", defaultUnit: "in" });
  assert.ok("spec" in result, "error" in result ? result.error : "");
  return result.spec;
}

test("the paan-box capture maps to a spec the storefront accepts", () => {
  const spec = paanBoxSpec();
  assert.deepEqual(spec.referenceSizeMm, { length: 100.6, width: 0, height: 199.6 });
  assert.deepEqual(spec.sizeAxes, ["length", "height"]);
  assert.equal(spec.defaultUnit, "in");
  assert.equal(spec.customSize, true);
  assert.deepEqual(spec.quantity, { options: [10, 25, 50, 75, 100, 200, 300, 500, 750, 1000], default: 10, minimum: 10, maximum: 1000, custom: true });
  // 60 and 150 price like 50 and 100, so they are not breakpoints.
  assert.deepEqual(spec.tiers.map((tier) => tier.minimum), [10, 25, 50, 75, 100, 200, 300, 500, 750, 1000]);
  assert.deepEqual(spec.tiers.map((tier) => Math.round(tier.multiplier * 120)), [120, 100, 80, 70, 60, 56, 52, 50, 44, 40]);
  assert.ok(Math.abs(spec.baseUnitPaise - 22130.6) < 0.01, `base ${spec.baseUnitPaise}`);
  const visible = spec.selections.filter((group) => !group.hidden).map((group) => `${group.name}: ${group.options.map((entry) => entry.name).join(" / ")}`);
  assert.deepEqual(visible, [
    "Material: White card board 220- 300 gsm",
    "Finishing: Matte Lamination / Gloss Lamination / Velvett Lamination",
    "Printing sides: Outside / Outside & Inside",
    "Special Effects: No Effect / Gold Foil Stamping / UV Effect",
  ]);
  // Hidden groups keep only their default and never change the price.
  for (const group of spec.selections.filter((entry) => entry.hidden)) {
    assert.equal(group.options.length, 1);
    assert.equal(group.options[0].deltaPaise, 0);
  }
});

test("every measured paan-box price is reproduced to the paisa, for every option at every tier", () => {
  const spec = paanBoxSpec();
  for (const [quantity, unit] of DEFAULTS) {
    assert.equal(pricePackagingConfiguration(spec, quantity).unitPaise, Math.round(unit * 100), `defaults at ${quantity}`);
  }
  for (const [optionId, rows] of Object.entries(LADDERS)) {
    for (const [quantity, unit] of rows) {
      const priced = pricePackagingConfiguration(spec, quantity, { selections: { [SELECTION_OF[optionId]]: optionId } });
      assert.equal(priced.unitPaise, Math.round(unit * 100), `${optionId} at ${quantity}`);
      assert.equal(priced.lineTotalPaise, priced.unitPaise * quantity);
    }
  }
  const verification = verifyPacdoraSpec(paanBoxCapture(), spec);
  assert.equal(verification.maxErrorPaise, 0);
  assert.ok(verification.checks.length >= 60, `${verification.checks.length} checks`);
  // Custom quantities use the tier at or below them, as on the source.
  assert.equal(pricePackagingConfiguration(spec, 24).unitPaise, 22_131);
  assert.equal(pricePackagingConfiguration(spec, 999).unitPaise, 8_115);
});

test("exact cores come from the unrounded high-quantity totals", () => {
  const tiers = tiersFromPoints(points(DEFAULTS));
  assert.ok(Math.abs(exactUnitPaise({ quantity: 10, unit_price: 215.4, real_total_price: 2154.05 }) - 21540.5) < 1e-9);
  // Gloss at 10 is 215.405 by its 10-pc total; its 750-pc total shows the real core is just under that.
  const gloss = coreUnitPaise(points(LADDERS["fin-gloss"]), tiers)!;
  assert.ok(gloss > 21540.4 && gloss < 21540.5, `gloss core ${gloss}`);
  assert.equal(Math.round(gloss), 21540);
  assert.equal(snapMultiplier(18442 / 22131), 5 / 6);
  assert.equal(snapMultiplier(0.123456), 0.123456);
  const merged = tiersFromPoints([
    { quantity: 25, unit_price: 184.42, real_total_price: 4610.54 },
    { quantity: 10, unit_price: 221.31, real_total_price: 2213.06 },
    { quantity: 24, unit_price: 221.31, real_total_price: 5311.35 },
  ]);
  assert.deepEqual(merged.map((tier) => [tier.minimum, tier.unitPaise]), [[10, 22131], [25, 18442]]);
});

test("unpriced options, drifting ladders and preset-size products are refused, not guessed", () => {
  const missing = paanBoxCapture();
  missing.options = missing.options.filter((probe) => probe.optionId !== "fx-uv");
  const refused = mapPacdoraCaptureToSpec(missing, { dieline: "pyramid-box", defaultUnit: "in" });
  assert.ok("error" in refused && /UV Effect/.test(refused.error));

  // An option whose ladder does not follow the shared multipliers fails verification.
  const drifting = paanBoxCapture();
  drifting.options[0].points = drifting.options[0].points!.map((point) => point.quantity === 25 ? { ...point, unit_price: point.unit_price + 0.05 } : point);
  const mapped = mapPacdoraCaptureToSpec(drifting, { dieline: "pyramid-box", defaultUnit: "in" });
  assert.ok("spec" in mapped);
  assert.ok(verifyPacdoraSpec(drifting, mapped.spec).maxErrorPaise > 1);

  // A product sold only in listed sizes cannot be held by one reference size.
  const fixedSizes = paanBoxCapture();
  fixedSizes.product!.quotationForm!.size.options = ["0×90×140", "0×100×150"];
  fixedSizes.product!.quotationForm!.size.hasCustom = false;
  assert.ok("error" in mapPacdoraCaptureToSpec(fixedSizes, { dieline: "stand-up-pouch", defaultUnit: "in" }));
  // With custom sizing on, an extra listed size stays orderable as a custom size.
  const extraSize = paanBoxCapture();
  extraSize.product!.quotationForm!.size.options = ["101.6×50.8×50"];
  const withNote = mapPacdoraCaptureToSpec(extraSize, { dieline: "pyramid-box", defaultUnit: "in" });
  assert.ok("spec" in withNote && withNote.spec.customSize && /101\.6×50\.8×50/.test(withNote.notes.join(" ")));
  // No size row on the page (A4 flyer): the reference size is fixed.
  const noSizeRow = { ...paanBoxCapture(), selectorText: "Paper\n100 GSM Paper\nPrinting\nOne Side\nQuantity\n10 pcs" };
  const fixed = mapPacdoraCaptureToSpec(noSizeRow, { dieline: "flat-sheet", defaultUnit: "in" });
  assert.ok("spec" in fixed && fixed.spec.customSize === false);

  const skipped = { ...paanBoxCapture(), skipped: "No Pacdora model on the page." };
  assert.deepEqual(mapPacdoraCaptureToSpec(skipped, { dieline: "flat-sheet", defaultUnit: "in" }), { error: "No Pacdora model on the page." });
});

test("dieline kinds follow the 3D model first, then the product type", () => {
  assert.equal(dielineKindForEzpacProduct({ slug: "paan-box", productModel: "folding-carton", sizeAxes: ["length", "height"] }), "pyramid-box");
  assert.equal(dielineKindForEzpacProduct({ slug: "brownie-box", productModel: "folding-carton", sizeAxes: ["length", "width", "height"] }), "tuck-end-carton");
  assert.equal(dielineKindForEzpacProduct({ slug: "chocolate-triangle-box", sizeAxes: ["length", "height"] }), "pyramid-box");
  assert.equal(dielineKindForEzpacProduct({ slug: "wedding-gift-hamper-box", sizeAxes: ["length", "width", "height"] }), "rigid-lid-box");
  assert.equal(dielineKindForEzpacProduct({ slug: "gift-box", productModel: "rigid-lid-box", sizeAxes: ["length", "width", "height"] }), "rigid-lid-box");
  assert.equal(dielineKindForEzpacProduct({ slug: "d-cut-paper-bag", productModel: "paper-bag", sizeAxes: ["length", "width", "height"] }), "paper-bag");
  assert.equal(dielineKindForEzpacProduct({ slug: "soap-pillow-box", sizeAxes: ["length", "width", "height"] }), "pillow-box");
  assert.equal(dielineKindForEzpacProduct({ slug: "food-tray", sizeAxes: ["length", "width", "height"] }), "tray");
  assert.equal(dielineKindForEzpacProduct({ slug: "business-card", sizeAxes: ["length", "width", "height"] }), "flat-sheet");
  assert.equal(dielineKindForEzpacProduct({ slug: "wedding-luggage-tags", sizeAxes: ["length", "height"] }), "flat-sheet");
  assert.equal(dielineKindForEzpacProduct({ slug: "popcorn-box", sizeAxes: ["length", "width", "height"] }), "tuck-end-carton");
});
