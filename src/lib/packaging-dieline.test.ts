import assert from "node:assert/strict";
import test from "node:test";
import {
  PACKAGING_DIELINE_KINDS,
  buildPackagingDieline,
  dielineKindForModel,
  isPackagingDielineKind,
  packagingSheetAreaMm2,
  type PackagingDielineKind,
} from "./packaging-dieline";
import type { PackagingSizeAxis, PackagingSizeMm } from "./packaging-quote";

/** A realistic manufacture size for each layout. */
const TYPICAL: Record<PackagingDielineKind, PackagingSizeMm> = {
  "tuck-end-carton": { length: 80, width: 50, height: 140 },
  "mailer-box": { length: 250, width: 200, height: 80 },
  "rigid-lid-box": { length: 200, width: 150, height: 60 },
  "pyramid-box": { length: 100.6, width: 0, height: 199.6 },
  "paper-bag": { length: 250, width: 100, height: 320 },
  "stand-up-pouch": { length: 150, width: 80, height: 220 },
  "mailer-envelope": { length: 230, width: 0, height: 320 },
  "pillow-box": { length: 150, width: 40, height: 200 },
  tray: { length: 200, width: 150, height: 50 },
  "flat-sheet": { length: 90, width: 0, height: 55 },
};

const ALL_AXES: PackagingSizeAxis[] = ["length", "width", "height"];
/** Axes each layout's geometry depends on; the others must not change the sheet. */
const AXES_USED: Record<PackagingDielineKind, PackagingSizeAxis[]> = {
  "tuck-end-carton": ALL_AXES,
  "mailer-box": ALL_AXES,
  "rigid-lid-box": ALL_AXES,
  "pyramid-box": ["length", "height"],
  "paper-bag": ALL_AXES,
  "stand-up-pouch": ALL_AXES,
  "mailer-envelope": ["length", "height"],
  "pillow-box": ALL_AXES,
  tray: ALL_AXES,
  "flat-sheet": ["length", "height"],
};
/** Layouts that use a depth and fall back to the length when the product has no width axis. */
const DEPTH_KINDS = PACKAGING_DIELINE_KINDS.filter((kind) => AXES_USED[kind].includes("width"));
/** Layouts with a panel edge exactly equal to W (the pillow's thickness only shapes its end flaps). */
const W_EDGE_KINDS: PackagingDielineKind[] = ["tuck-end-carton", "mailer-box", "rigid-lid-box", "paper-bag", "stand-up-pouch", "tray"];

const scaled = (size: PackagingSizeMm, factors: Partial<Record<PackagingSizeAxis, number>>): PackagingSizeMm => ({
  length: size.length * (factors.length ?? 1),
  width: size.width * (factors.width ?? 1),
  height: size.height * (factors.height ?? 1),
});

interface Subpath {
  points: Array<[number, number]>;
  arc: boolean;
}

/** Flattens the SVG path data the dieline emits (M, L, Q, A, Z) into polylines. */
function flatten(path: string): Subpath[] {
  const tokens = path.match(/[MLQAZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  const subpaths: Subpath[] = [];
  let current: Subpath | undefined;
  let index = 0;
  const next = () => Number(tokens[index++]);
  while (index < tokens.length) {
    const command = tokens[index++];
    if (command === "M") {
      current = { points: [[next(), next()]], arc: false };
      subpaths.push(current);
    } else if (command === "L") {
      current?.points.push([next(), next()]);
    } else if (command === "Q" && current) {
      const [x0, y0] = current.points[current.points.length - 1];
      const cx = next();
      const cy = next();
      const x = next();
      const y = next();
      for (let step = 1; step <= 16; step += 1) {
        const t = step / 16;
        current.points.push([
          (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cx + t * t * x,
          (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * y,
        ]);
      }
    } else if (command === "A" && current) {
      const radius = next();
      next();
      next();
      next();
      next();
      const x = next();
      const y = next();
      const [x0, y0] = current.points[current.points.length - 1];
      // The dieline only draws full circles as two half arcs; keep their top and bottom too.
      current.points.push([(x0 + x) / 2, (y0 + y) / 2 - radius], [(x0 + x) / 2, (y0 + y) / 2 + radius], [x, y]);
      current.arc = true;
    } else if (command !== "Z") {
      throw new Error(`Unexpected path token ${command}`);
    }
  }
  return subpaths;
}

const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
  (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/** True when two segments cross at a single interior point. */
function properlyCross(a: [number, number], b: [number, number], c: [number, number], d: [number, number]) {
  const eps = 1e-6;
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return ((d1 > eps && d2 < -eps) || (d1 < -eps && d2 > eps)) && ((d3 > eps && d4 < -eps) || (d3 < -eps && d4 > eps));
}

function selfIntersections(points: Array<[number, number]>) {
  const ring = points.filter((point, index) => index === 0 || Math.hypot(point[0] - points[index - 1][0], point[1] - points[index - 1][1]) > 1e-9);
  const count = ring.length;
  const hits: string[] = [];
  for (let i = 0; i < count; i += 1) {
    for (let j = i + 2; j < count; j += 1) {
      if (i === 0 && j === count - 1) continue;
      if (properlyCross(ring[i], ring[(i + 1) % count], ring[j], ring[(j + 1) % count])) hits.push(`${i}×${j}`);
    }
  }
  return hits;
}

test("dielineKindForModel maps each 3D product model to its flat layout", () => {
  assert.equal(dielineKindForModel("folding-carton"), "tuck-end-carton");
  assert.equal(dielineKindForModel("rectangular-box"), "tuck-end-carton");
  assert.equal(dielineKindForModel("square-box"), "tuck-end-carton");
  assert.equal(dielineKindForModel("product-sleeve"), "tuck-end-carton");
  assert.equal(dielineKindForModel("mailer-box"), "mailer-box");
  assert.equal(dielineKindForModel("rigid-lid-box"), "rigid-lid-box");
  assert.equal(dielineKindForModel("pyramid-box"), "pyramid-box");
  assert.equal(dielineKindForModel("paper-bag"), "paper-bag");
  assert.equal(dielineKindForModel("stand-up-pouch"), "stand-up-pouch");
  assert.equal(dielineKindForModel("mailer-envelope"), "mailer-envelope");
  assert.equal(dielineKindForModel("label-pack"), undefined);
  assert.equal(dielineKindForModel(""), undefined);
  assert.equal(dielineKindForModel(undefined), undefined);
});

test("isPackagingDielineKind accepts exactly the listed kinds", () => {
  for (const kind of PACKAGING_DIELINE_KINDS) assert.equal(isPackagingDielineKind(kind), true);
  for (const value of ["", "box", "Tuck-End-Carton", 3, null, undefined, {}]) assert.equal(isPackagingDielineKind(value), false);
});

test("every kind yields a finite, positive sheet with cut lines, folds and labelled panels", () => {
  for (const kind of PACKAGING_DIELINE_KINDS) {
    for (const size of [TYPICAL[kind], { ...TYPICAL[kind], width: 0 }]) {
      const dieline = buildPackagingDieline(kind, size);
      assert.equal(dieline.kind, kind);
      assert.ok(Number.isFinite(dieline.widthMm) && dieline.widthMm > 0, `${kind} width`);
      assert.ok(Number.isFinite(dieline.heightMm) && dieline.heightMm > 0, `${kind} height`);
      assert.ok(dieline.cuts.length > 0, `${kind} has cut lines`);
      assert.ok(dieline.folds.length > 0, `${kind} has fold or guide lines`);
      for (const path of [...dieline.cuts, ...dieline.folds, ...dieline.glue]) {
        assert.match(path, /^M-?\d/, `${kind} path starts with a move`);
        assert.doesNotMatch(path, /NaN|Infinity|undefined/, `${kind} path is numeric`);
      }
      assert.ok(dieline.panels.some((panel) => panel.id === "front" && panel.label === "Front"), `${kind} has a Front panel`);
      assert.equal(packagingSheetAreaMm2(kind, size), dieline.widthMm * dieline.heightMm);
    }
  }
});

test("panels are unique and lie inside the sheet", () => {
  for (const kind of PACKAGING_DIELINE_KINDS) {
    for (const size of [TYPICAL[kind], scaled(TYPICAL[kind], { length: 0.5 }), scaled(TYPICAL[kind], { height: 2 }), { ...TYPICAL[kind], width: 0 }]) {
      const dieline = buildPackagingDieline(kind, size);
      assert.equal(new Set(dieline.panels.map((panel) => panel.id)).size, dieline.panels.length, `${kind} panel ids are unique`);
      for (const panel of dieline.panels) {
        assert.ok(panel.width > 0 && panel.height > 0, `${kind}/${panel.id} has an area`);
        assert.ok(panel.x >= -1e-6 && panel.y >= -1e-6, `${kind}/${panel.id} starts inside`);
        assert.ok(panel.x + panel.width <= dieline.widthMm + 1e-6, `${kind}/${panel.id} ends inside horizontally`);
        assert.ok(panel.y + panel.height <= dieline.heightMm + 1e-6, `${kind}/${panel.id} ends inside vertically`);
      }
    }
  }
});

test("the sheet bounding box is exactly the extent of the cut lines", () => {
  for (const kind of PACKAGING_DIELINE_KINDS) {
    const dieline = buildPackagingDieline(kind, TYPICAL[kind]);
    const points = dieline.cuts.flatMap((path) => flatten(path).flatMap((subpath) => subpath.points));
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    // Path data is written to 0.01 mm.
    const tolerance = 0.02;
    assert.ok(Math.abs(Math.min(...xs)) <= tolerance, `${kind} left edge`);
    assert.ok(Math.abs(Math.min(...ys)) <= tolerance, `${kind} top edge`);
    assert.ok(Math.abs(Math.max(...xs) - dieline.widthMm) <= tolerance, `${kind} right edge`);
    assert.ok(Math.abs(Math.max(...ys) - dieline.heightMm) <= tolerance, `${kind} bottom edge`);
    for (const path of [...dieline.folds, ...dieline.glue]) {
      for (const [x, y] of flatten(path).flatMap((subpath) => subpath.points)) {
        assert.ok(x >= -tolerance && y >= -tolerance && x <= dieline.widthMm + tolerance && y <= dieline.heightMm + tolerance, `${kind} folds and glue stay on the sheet`);
      }
    }
  }
});

test("cut outlines never cross themselves across a range of sizes", () => {
  const factors = [0.6, 1, 1.7];
  for (const kind of PACKAGING_DIELINE_KINDS) {
    const axes = AXES_USED[kind];
    const combinations = axes.reduce<Array<Partial<Record<PackagingSizeAxis, number>>>>(
      (sets, axis) => sets.flatMap((set) => factors.map((factor) => ({ ...set, [axis]: factor }))),
      [{}],
    );
    for (const combination of combinations) {
      const size = scaled(TYPICAL[kind], combination);
      for (const path of buildPackagingDieline(kind, size).cuts) {
        for (const subpath of flatten(path)) {
          if (subpath.arc) continue;
          assert.deepEqual(selfIntersections(subpath.points), [], `${kind} ${JSON.stringify(size)}`);
        }
      }
    }
  }
});

test("sheet area grows with every axis a kind uses and ignores the rest", () => {
  for (const kind of PACKAGING_DIELINE_KINDS) {
    const base = TYPICAL[kind];
    const area = packagingSheetAreaMm2(kind, base);
    for (const axis of ALL_AXES) {
      if (base[axis] === 0) continue;
      const larger = packagingSheetAreaMm2(kind, scaled(base, { [axis]: 1.1 }));
      const largest = packagingSheetAreaMm2(kind, scaled(base, { [axis]: 1.5 }));
      const smaller = packagingSheetAreaMm2(kind, scaled(base, { [axis]: 0.8 }));
      if (AXES_USED[kind].includes(axis)) {
        assert.ok(smaller < area && area < larger && larger < largest, `${kind} area grows with ${axis}`);
      } else {
        assert.equal(larger, area, `${kind} ignores ${axis}`);
      }
    }
    if (!AXES_USED[kind].includes("width")) {
      assert.equal(packagingSheetAreaMm2(kind, { ...base, width: 123 }), area, `${kind} ignores width`);
    }
  }
});

test("doubling every axis roughly quadruples the sheet area", () => {
  // Pure geometry scales with the square of size; glue flaps, tucks and turn-ins
  // are clamped to practical mm ranges (8-25 mm), which keeps growth slightly
  // below 4x but never above it.
  for (const kind of PACKAGING_DIELINE_KINDS) {
    const base = TYPICAL[kind];
    const ratio = packagingSheetAreaMm2(kind, scaled(base, { length: 2, width: 2, height: 2 })) / packagingSheetAreaMm2(kind, base);
    assert.ok(ratio >= 3.5 && ratio <= 4 + 1e-9, `${kind} doubles to ${ratio.toFixed(3)}x`);
  }
});

test("a product without a width axis uses its length as depth and shows no W dimension", () => {
  for (const kind of DEPTH_KINDS) {
    const size = { ...TYPICAL[kind], width: 0 };
    const withoutWidth = buildPackagingDieline(kind, size);
    const squared = buildPackagingDieline(kind, { ...size, width: size.length });
    assert.equal(withoutWidth.widthMm, squared.widthMm, `${kind} sheet width`);
    assert.equal(withoutWidth.heightMm, squared.heightMm, `${kind} sheet height`);
    assert.deepEqual(withoutWidth.cuts, squared.cuts, `${kind} cut lines`);
    assert.ok(!withoutWidth.dimensions.some((dimension) => dimension.label === "W"), `${kind} hides W`);
  }
  for (const kind of W_EDGE_KINDS) {
    assert.ok(buildPackagingDieline(kind, TYPICAL[kind]).dimensions.some((dimension) => dimension.label === "W"), `${kind} shows W`);
  }
  // A flat sheet is length × height, or length × width for a product sized that way.
  const card = buildPackagingDieline("flat-sheet", { length: 90, width: 0, height: 55 });
  assert.deepEqual([card.widthMm, card.heightMm], [90, 55]);
  const label = buildPackagingDieline("flat-sheet", { length: 90, width: 55, height: 0 });
  assert.deepEqual([label.widthMm, label.heightMm], [90, 55]);
  assert.deepEqual(label.dimensions.map((dimension) => dimension.label), ["L", "W"]);
});

test("dimension annotations span the L, W and H edges", () => {
  const span = (dimension: { x1: number; y1: number; x2: number; y2: number }) => Math.hypot(dimension.x2 - dimension.x1, dimension.y2 - dimension.y1);
  const exactL: PackagingDielineKind[] = ["tuck-end-carton", "mailer-box", "rigid-lid-box", "pyramid-box", "paper-bag", "stand-up-pouch", "mailer-envelope", "tray", "flat-sheet"];
  const exactH: PackagingDielineKind[] = ["tuck-end-carton", "mailer-box", "rigid-lid-box", "paper-bag", "stand-up-pouch", "mailer-envelope", "pillow-box", "tray", "flat-sheet"];
  for (const kind of PACKAGING_DIELINE_KINDS) {
    const size = TYPICAL[kind];
    const dieline = buildPackagingDieline(kind, size);
    const labels = dieline.dimensions.map((dimension) => dimension.label);
    assert.ok(labels.includes("L") && labels.includes("H"), `${kind} labels L and H`);
    assert.ok(labels.every((label) => label === "L" || label === "W" || label === "H"), `${kind} labels`);
    for (const dimension of dieline.dimensions) {
      assert.ok(dimension.x1 === dimension.x2 || dimension.y1 === dimension.y2, `${kind} ${dimension.label} is horizontal or vertical`);
      if (dimension.label === "L" && exactL.includes(kind)) assert.ok(Math.abs(span(dimension) - size.length) < 1e-6, `${kind} L span`);
      if (dimension.label === "W") assert.ok(Math.abs(span(dimension) - size.width) < 1e-6, `${kind} W span`);
      if (dimension.label === "H" && exactH.includes(kind)) assert.ok(Math.abs(span(dimension) - size.height) < 1e-6, `${kind} H span`);
    }
  }
});

test("pyramid faces fan round one apex with the slant height of the requested box height", () => {
  const size = TYPICAL["pyramid-box"];
  const dieline = buildPackagingDieline("pyramid-box", size);
  const slant = Math.hypot(size.height, size.length / (2 * Math.sqrt(3)));
  const lateral = Math.hypot(slant, size.length / 2);
  // The first three folds are the shared lateral edges, all starting at the apex.
  const edges = dieline.folds.slice(0, 3).map((path) => flatten(path)[0].points);
  for (const [[x1, y1], [x2, y2]] of edges) {
    assert.deepEqual([x1, y1], edges[0][0], "lateral folds share the apex");
    assert.ok(Math.abs(Math.hypot(x2 - x1, y2 - y1) - lateral) < 0.02, "lateral edge length");
  }
  const height = dieline.dimensions.find((dimension) => dimension.label === "H");
  assert.ok(height && Math.abs(Math.abs(height.y2 - height.y1) - slant) < 1e-6, "H annotation spans the face from apex to base");
});

test("pyramid sheet area tracks the source pricing engine's custom-size ratios", () => {
  // Ratios measured from the source's pricing engine, which is proportional to its
  // own die-cut sheet area plus press-imposition noise. That noise is ~11%: a
  // quadratic through the L×0.5, L×1 and L×2 points predicts L×1.5 at 1.80, the
  // engine says 1.604. So each ratio must land within 12% and the set within 8%
  // RMS (log); our net measures about 6.7% RMS, worst point L×2 at −11%.
  const reference: PackagingSizeMm = { length: 100.6, width: 0, height: 199.6 };
  const measured: Array<[string, Partial<Record<PackagingSizeAxis, number>>, number]> = [
    ["L×0.5", { length: 0.5 }, 0.455],
    ["L×1.5", { length: 1.5 }, 1.604],
    ["L×2", { length: 2 }, 2.851],
    ["H×0.5", { height: 0.5 }, 0.7135],
    ["H×1.5", { height: 1.5 }, 1.421],
    ["H×2", { height: 2 }, 1.794],
    ["L×2 & H×2", { length: 2, height: 2 }, 3.994],
  ];
  const referenceArea = packagingSheetAreaMm2("pyramid-box", reference);
  let squaredLogError = 0;
  for (const [name, factors, target] of measured) {
    const ratio = packagingSheetAreaMm2("pyramid-box", scaled(reference, factors)) / referenceArea;
    assert.ok(Math.abs(ratio / target - 1) <= 0.12, `${name}: ${ratio.toFixed(3)} vs ${target}`);
    squaredLogError += Math.log(ratio / target) ** 2;
  }
  assert.ok(Math.sqrt(squaredLogError / measured.length) <= 0.08, "RMS log error");
});

test("missing, zero and invalid sizes still produce a usable sheet", () => {
  const sizes = [
    { length: 0, width: 0, height: 0 },
    { length: Number.NaN, width: -5, height: 100 },
    { length: 120, width: 0, height: 0 },
    { length: Number.POSITIVE_INFINITY, width: 40, height: 60 },
  ];
  for (const kind of PACKAGING_DIELINE_KINDS) {
    for (const size of sizes) {
      const dieline = buildPackagingDieline(kind, size);
      assert.ok(Number.isFinite(dieline.widthMm) && dieline.widthMm > 0, `${kind} ${JSON.stringify(size)} width`);
      assert.ok(Number.isFinite(dieline.heightMm) && dieline.heightMm > 0, `${kind} ${JSON.stringify(size)} height`);
      assert.ok(Number.isFinite(packagingSheetAreaMm2(kind, size)));
    }
  }
});
