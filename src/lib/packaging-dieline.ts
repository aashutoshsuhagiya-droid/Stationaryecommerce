/**
 * Parametric flat-sheet dielines for packaging products. The same geometry
 * drives the storefront "Dieline" view and the sheet area used to price a
 * custom size (see packaging-quote.ts), so what the customer sees is what is priced.
 *
 * Coordinates are millimetres on the flat sheet, origin top-left, y down.
 * Sizes use manufacture dimensions: length (x), width (depth), height (y).
 */
import type { PackagingSizeMm } from "./packaging-quote";

export const PACKAGING_DIELINE_KINDS = [
  "tuck-end-carton",
  "mailer-box",
  "rigid-lid-box",
  "pyramid-box",
  "paper-bag",
  "stand-up-pouch",
  "mailer-envelope",
  "pillow-box",
  "tray",
  "flat-sheet",
] as const;

export type PackagingDielineKind = (typeof PACKAGING_DIELINE_KINDS)[number];

export function isPackagingDielineKind(value: unknown): value is PackagingDielineKind {
  return typeof value === "string" && (PACKAGING_DIELINE_KINDS as readonly string[]).includes(value);
}

export interface PackagingDielinePanel {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PackagingDielineDimension {
  label: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface PackagingDieline {
  kind: PackagingDielineKind;
  /** Bounding box of the flat sheet, mm. */
  widthMm: number;
  heightMm: number;
  /** SVG path data, solid cut lines. */
  cuts: string[];
  /** SVG path data, dashed crease / fold lines. */
  folds: string[];
  /** SVG path data, closed glue-tab outlines. */
  glue: string[];
  panels: PackagingDielinePanel[];
  dimensions: PackagingDielineDimension[];
}

/** Which flat layout a 3D product model unfolds to. */
export function dielineKindForModel(productModel: string | undefined): PackagingDielineKind | undefined {
  switch (productModel) {
    case "folding-carton":
    case "rectangular-box":
    case "square-box":
    case "product-sleeve":
      return "tuck-end-carton";
    case "mailer-box":
      return "mailer-box";
    case "rigid-lid-box":
      return "rigid-lid-box";
    case "pyramid-box":
      return "pyramid-box";
    case "paper-bag":
      return "paper-bag";
    case "stand-up-pouch":
      return "stand-up-pouch";
    case "mailer-envelope":
      return "mailer-envelope";
    default:
      return undefined;
  }
}

export function packagingSheetAreaMm2(kind: PackagingDielineKind, size: PackagingSizeMm): number {
  const { widthMm, heightMm } = buildPackagingDieline(kind, size);
  return Math.max(0, widthMm) * Math.max(0, heightMm);
}

/**
 * Full die-cut layout for one packaging kind at a manufacture size. The sheet
 * bounding box (widthMm × heightMm) is measured from the cut lines, so it is
 * exactly the area packagingSheetAreaMm2 prices.
 *
 * Dimension lines sit on the sheet edge they should be drawn beside (top,
 * bottom, left or right) and span the panel edge that equals L, W or H. A
 * product without a width axis (width 0) uses its length as depth and shows no
 * W dimension.
 */
export function buildPackagingDieline(kind: PackagingDielineKind, size: PackagingSizeMm): PackagingDieline {
  const builder = new DielineBuilder();
  const dims = readDims(size);
  switch (kind) {
    case "tuck-end-carton":
      tuckEndCarton(builder, dims);
      break;
    case "mailer-box":
      mailerBox(builder, dims);
      break;
    case "rigid-lid-box":
      rigidLidBox(builder, dims);
      break;
    case "pyramid-box":
      pyramidBox(builder, dims);
      break;
    case "paper-bag":
      paperBag(builder, dims);
      break;
    case "stand-up-pouch":
      standUpPouch(builder, dims);
      break;
    case "mailer-envelope":
      mailerEnvelope(builder, dims);
      break;
    case "pillow-box":
      pillowBox(builder, dims);
      break;
    case "tray":
      tray(builder, dims);
      break;
    case "flat-sheet":
    default:
      flatSheet(builder, dims);
      break;
  }
  return builder.build(isPackagingDielineKind(kind) ? kind : "flat-sheet");
}

/* ------------------------------------------------------------------------ */
/* Size handling                                                             */
/* ------------------------------------------------------------------------ */

interface Dims {
  /** Length (x on the front panel). */
  l: number;
  /** Depth: the width axis, or the length when the product has no width. */
  d: number;
  /** Height (y on the front panel). */
  h: number;
  hasWidth: boolean;
  hasHeight: boolean;
}

function readDims(size: PackagingSizeMm | undefined): Dims {
  const positive = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0);
  const length = positive(size?.length);
  const width = positive(size?.width);
  const height = positive(size?.height);
  const l = length || width || height || 1;
  return { l, d: width || l, h: height || width || l, hasWidth: width > 0, hasHeight: height > 0 };
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/* ------------------------------------------------------------------------ */
/* Path primitives                                                           */
/* ------------------------------------------------------------------------ */

interface Point {
  x: number;
  y: number;
}

/** Outline vertex; `r` rounds the corner at this vertex. */
interface Vertex extends Point {
  r?: number;
}

type Command =
  | { op: "M" | "L"; x: number; y: number }
  | { op: "Q"; cx: number; cy: number; x: number; y: number }
  | { op: "O"; cx: number; cy: number; r: number }
  | { op: "Z" };

type Path = Command[];

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const pt = (x: number, y: number, r?: number): Vertex => (r && r > 0 ? { x, y, r } : { x, y });
const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
const samePoint = (a: Point, b: Point) => Math.abs(a.x - b.x) < 1e-7 && Math.abs(a.y - b.y) < 1e-7;

function segment(x1: number, y1: number, x2: number, y2: number): Path {
  return [{ op: "M", x: x1, y: y1 }, { op: "L", x: x2, y: y2 }];
}

/** Symmetric parabolic arc from (x1, y) to (x2, y) whose middle sits at y + bulge. */
function arc(x1: number, x2: number, y: number, bulge: number): Path {
  return [{ op: "M", x: x1, y }, { op: "Q", cx: (x1 + x2) / 2, cy: y + 2 * bulge, x: x2, y }];
}

function rectangle(x: number, y: number, width: number, height: number): Path {
  return outline([pt(x, y), pt(x + width, y), pt(x + width, y + height), pt(x, y + height)]);
}

function circle(cx: number, cy: number, r: number): Path {
  return [{ op: "O", cx, cy, r }];
}

/** Closed outline through the vertices (clockwise on screen); duplicate consecutive points are dropped. */
function outline(vertices: Vertex[]): Path {
  const points: Vertex[] = [];
  for (const vertex of vertices) {
    const previous = points[points.length - 1];
    if (previous && samePoint(previous, vertex)) {
      if (vertex.r) previous.r = vertex.r;
      continue;
    }
    points.push({ ...vertex });
  }
  while (points.length > 2 && samePoint(points[0], points[points.length - 1])) points.pop();
  const count = points.length;
  if (count < 2) return [];
  const corners = points.map((point, index) => {
    if (!point.r) return undefined;
    const previous = points[(index - 1 + count) % count];
    const next = points[(index + 1) % count];
    const before = distance(point, previous);
    const after = distance(point, next);
    const radius = Math.min(point.r, before / 2, after / 2);
    if (!(radius > 0)) return undefined;
    return {
      entry: { x: point.x + ((previous.x - point.x) * radius) / before, y: point.y + ((previous.y - point.y) * radius) / before },
      exit: { x: point.x + ((next.x - point.x) * radius) / after, y: point.y + ((next.y - point.y) * radius) / after },
    };
  });
  const path: Path = [];
  const start = corners[0]?.exit ?? points[0];
  path.push({ op: "M", x: start.x, y: start.y });
  for (let index = 1; index <= count; index += 1) {
    const point = points[index % count];
    const corner = corners[index % count];
    if (corner) {
      path.push({ op: "L", x: corner.entry.x, y: corner.entry.y });
      path.push({ op: "Q", cx: point.x, cy: point.y, x: corner.exit.x, y: corner.exit.y });
    } else if (index < count) {
      path.push({ op: "L", x: point.x, y: point.y });
    }
  }
  path.push({ op: "Z" });
  return path;
}

interface FlapOptions {
  /** Chamfer (run along the hinge) at the p0 / p1 end of the free edge. */
  c0?: number;
  c1?: number;
  /** Straight shoulder inset along the hinge before the chamfer starts. */
  i0?: number;
  i1?: number;
  /** Corner radius of the free edge. */
  r?: number;
}

interface Flap {
  /** Outline vertices from p0 round the flap to p1; also the closed flap polygon. */
  vertices: Vertex[];
  /** Axis-aligned label box inside the flap. */
  box: Box;
}

/**
 * A trapezoid flap hinged on p0→p1. Outlines are traced clockwise on screen,
 * so the flap stands out on the left-hand normal (uy, −ux) of the hinge.
 */
function makeFlap(p0: Point, p1: Point, depth: number, options: FlapOptions = {}): Flap {
  const length = distance(p0, p1);
  const ux = (p1.x - p0.x) / length;
  const uy = (p1.y - p0.y) / length;
  const nx = uy;
  const ny = -ux;
  let i0 = options.i0 ?? 0;
  let i1 = options.i1 ?? 0;
  let c0 = options.c0 ?? 0;
  let c1 = options.c1 ?? 0;
  const used = i0 + i1 + c0 + c1;
  const budget = length * 0.9;
  if (used > budget) {
    const scale = budget / used;
    i0 *= scale;
    i1 *= scale;
    c0 *= scale;
    c1 *= scale;
  }
  const at = (along: number, out: number, r?: number) => pt(p0.x + ux * along + nx * out, p0.y + uy * along + ny * out, r);
  const farLength = length - i0 - i1 - c0 - c1;
  const radius = Math.min(options.r ?? 0, farLength / 2, depth / 2);
  const vertices: Vertex[] = [pt(p0.x, p0.y)];
  if (i0 > 0) vertices.push(at(i0, 0));
  vertices.push(at(i0 + c0, depth, radius), at(length - i1 - c1, depth, radius));
  if (i1 > 0) vertices.push(at(length - i1, 0));
  vertices.push(pt(p1.x, p1.y));
  const box = inscribedBox(at(i0 + c0 + farLength / 2, depth / 2), { x: ux, y: uy }, Math.max(0, farLength - 2 * radius) / 2, depth / 2);
  return { vertices, box };
}

/** Largest axis-aligned box inside a rectangle centred on `center` with half-sizes `alongHalf` (direction u) and `acrossHalf`. */
function inscribedBox(center: Point, u: Point, alongHalf: number, acrossHalf: number): Box {
  const p = Math.abs(u.x);
  const q = Math.abs(u.y);
  // A box with half-sizes (a, b) fits when a·p + b·q ≤ alongHalf and a·q + b·p ≤ acrossHalf.
  const fits = (a: number, b: number) => a * p + b * q <= alongHalf + 1e-9 && a * q + b * p <= acrossHalf + 1e-9;
  const candidates: Array<[number, number]> = [];
  if (q < 1e-6) candidates.push([alongHalf, acrossHalf]);
  else if (p < 1e-6) candidates.push([acrossHalf, alongHalf]);
  else {
    const shrink = ([a, b]: [number, number]): [number, number] => {
      const k = Math.min(1, alongHalf / (a * p + b * q || 1), acrossHalf / (a * q + b * p || 1));
      return [a * k, b * k];
    };
    candidates.push(shrink([alongHalf / (2 * p), alongHalf / (2 * q)]));
    candidates.push(shrink([acrossHalf / (2 * q), acrossHalf / (2 * p)]));
    const det = p * p - q * q;
    if (Math.abs(det) > 1e-6) {
      const a = (alongHalf * p - acrossHalf * q) / det;
      const b = (acrossHalf * p - alongHalf * q) / det;
      if (a > 0 && b > 0) candidates.push([a, b]);
    }
  }
  let best: [number, number] = [0, 0];
  for (const candidate of candidates) {
    if (fits(candidate[0], candidate[1]) && candidate[0] * candidate[1] >= best[0] * best[1]) best = candidate;
  }
  return { x: center.x - best[0], y: center.y - best[1], width: 2 * best[0], height: 2 * best[1] };
}

/* ------------------------------------------------------------------------ */
/* Builder                                                                   */
/* ------------------------------------------------------------------------ */

class DielineBuilder {
  private readonly cutPaths: Path[] = [];
  private readonly foldPaths: Path[] = [];
  private readonly gluePaths: Path[] = [];
  private readonly panelList: PackagingDielinePanel[] = [];
  private readonly dimensionList: PackagingDielineDimension[] = [];

  cut(path: Path) {
    if (path.length) this.cutPaths.push(path);
  }

  fold(path: Path) {
    if (path.length) this.foldPaths.push(path);
  }

  glue(path: Path) {
    if (path.length) this.gluePaths.push(path);
  }

  panel(id: string, label: string, box: Box) {
    if (box.width > 0 && box.height > 0) this.panelList.push({ id, label, ...box });
  }

  rectPanel(id: string, label: string, x1: number, y1: number, x2: number, y2: number) {
    this.panel(id, label, { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) });
  }

  dimension(label: "L" | "W" | "H", x1: number, y1: number, x2: number, y2: number) {
    this.dimensionList.push({ label, x1, y1, x2, y2 });
  }

  build(kind: PackagingDielineKind): PackagingDieline {
    const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    const include = (x: number, y: number) => {
      bounds.minX = Math.min(bounds.minX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.maxY = Math.max(bounds.maxY, y);
    };
    for (const path of this.cutPaths) {
      let current: Point = { x: 0, y: 0 };
      for (const command of path) {
        if (command.op === "M" || command.op === "L") {
          include(command.x, command.y);
          current = command;
        } else if (command.op === "Q") {
          include(command.x, command.y);
          // Exact extremes of the quadratic curve, not its control point.
          for (const axis of ["x", "y"] as const) {
            const start = current[axis];
            const control = axis === "x" ? command.cx : command.cy;
            const end = command[axis];
            const denominator = start - 2 * control + end;
            if (Math.abs(denominator) < 1e-12) continue;
            const t = (start - control) / denominator;
            if (t <= 0 || t >= 1) continue;
            const value = (1 - t) * (1 - t) * start + 2 * (1 - t) * t * control + t * t * end;
            const other = axis === "x" ? "y" : "x";
            const otherControl = axis === "x" ? command.cy : command.cx;
            const otherValue = (1 - t) * (1 - t) * current[other] + 2 * (1 - t) * t * otherControl + t * t * command[other];
            if (axis === "x") include(value, otherValue);
            else include(otherValue, value);
          }
          current = { x: command.x, y: command.y };
        } else if (command.op === "O") {
          include(command.cx - command.r, command.cy - command.r);
          include(command.cx + command.r, command.cy + command.r);
        }
      }
    }
    if (!Number.isFinite(bounds.minX)) {
      bounds.minX = 0;
      bounds.minY = 0;
      bounds.maxX = 0;
      bounds.maxY = 0;
    }
    const dx = -bounds.minX;
    const dy = -bounds.minY;
    const serialize = (path: Path) => pathData(path, dx, dy);
    return {
      kind,
      widthMm: bounds.maxX - bounds.minX,
      heightMm: bounds.maxY - bounds.minY,
      cuts: this.cutPaths.map(serialize),
      folds: this.foldPaths.map(serialize),
      glue: this.gluePaths.map(serialize),
      panels: this.panelList.map((panel) => ({ ...panel, x: panel.x + dx, y: panel.y + dy })),
      dimensions: this.dimensionList.map((dimension) => ({
        ...dimension,
        x1: dimension.x1 + dx,
        y1: dimension.y1 + dy,
        x2: dimension.x2 + dx,
        y2: dimension.y2 + dy,
      })),
    };
  }
}

function formatNumber(value: number) {
  const rounded = Math.round(value * 100) / 100;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

function pathData(path: Path, dx: number, dy: number) {
  const x = (value: number) => formatNumber(value + dx);
  const y = (value: number) => formatNumber(value + dy);
  return path
    .map((command) => {
      switch (command.op) {
        case "M":
        case "L":
          return `${command.op}${x(command.x)} ${y(command.y)}`;
        case "Q":
          return `Q${x(command.cx)} ${y(command.cy)} ${x(command.x)} ${y(command.y)}`;
        case "O": {
          const r = formatNumber(command.r);
          return `M${x(command.cx - command.r)} ${y(command.cy)}A${r} ${r} 0 1 0 ${x(command.cx + command.r)} ${y(command.cy)}A${r} ${r} 0 1 0 ${x(command.cx - command.r)} ${y(command.cy)}Z`;
        }
        case "Z":
        default:
          return "Z";
      }
    })
    .join("");
}

/* ------------------------------------------------------------------------ */
/* Layouts                                                                   */
/* ------------------------------------------------------------------------ */

/**
 * Reverse tuck end carton. One row of Glue | Back | Left | Front | Right; the
 * top closure (lid + tuck) hangs off the back panel, the bottom closure off the
 * front panel, and every side panel carries a dust flap at both ends.
 */
function tuckEndCarton(b: DielineBuilder, { l, d, h, hasWidth }: Dims) {
  const glue = clamp(0.25 * Math.min(l, d), 8, 15);
  const tuck = clamp(0.3 * d, 8, 20);
  const inset = Math.min(1.5, l * 0.02);
  const dust = Math.min(0.7 * d, 0.45 * l);
  const dustChamfer = Math.min(dust * 0.45, d * 0.3);
  const tuckRadius = Math.min(tuck * 0.7, (l - 2 * inset) / 4);
  const xBack = glue;
  const xLeft = xBack + l;
  const xFront = xLeft + d;
  const xRight = xFront + l;
  const xEnd = xRight + d;
  const yTop = d + tuck;
  const yBottom = yTop + h;
  const yEnd = yBottom + d + tuck;
  const dustOptions: FlapOptions = { c0: dustChamfer, c1: dustChamfer, r: Math.min(3, dust * 0.2) };
  const glueTaper = Math.min(glue * 0.6, h * 0.2);
  const glueFlap = makeFlap(pt(xBack, yBottom), pt(xBack, yTop), glue, { c0: glueTaper, c1: glueTaper });
  const dustTopLeft = makeFlap(pt(xLeft, yTop), pt(xFront, yTop), dust, dustOptions);
  const dustTopRight = makeFlap(pt(xRight, yTop), pt(xEnd, yTop), dust, dustOptions);
  const dustBottomRight = makeFlap(pt(xEnd, yBottom), pt(xRight, yBottom), dust, dustOptions);
  const dustBottomLeft = makeFlap(pt(xFront, yBottom), pt(xLeft, yBottom), dust, dustOptions);

  b.cut(outline([
    pt(xBack, yTop),
    pt(xBack, yTop - d),
    pt(xBack + inset, yTop - d),
    pt(xBack + inset, 0, tuckRadius),
    pt(xLeft - inset, 0, tuckRadius),
    pt(xLeft - inset, yTop - d),
    pt(xLeft, yTop - d),
    pt(xLeft, yTop),
    ...dustTopLeft.vertices,
    ...dustTopRight.vertices,
    pt(xEnd, yBottom),
    ...dustBottomRight.vertices,
    pt(xRight, yBottom + d),
    pt(xRight - inset, yBottom + d),
    pt(xRight - inset, yEnd, tuckRadius),
    pt(xFront + inset, yEnd, tuckRadius),
    pt(xFront + inset, yBottom + d),
    pt(xFront, yBottom + d),
    pt(xFront, yBottom),
    ...dustBottomLeft.vertices,
    pt(xBack, yBottom),
    ...glueFlap.vertices,
  ]));

  for (const x of [xBack, xLeft, xFront, xRight]) b.fold(segment(x, yTop, x, yBottom));
  b.fold(segment(xBack, yTop, xFront, yTop));
  b.fold(segment(xRight, yTop, xEnd, yTop));
  b.fold(segment(xBack + inset, yTop - d, xLeft - inset, yTop - d));
  b.fold(segment(xLeft, yBottom, xEnd, yBottom));
  b.fold(segment(xFront + inset, yBottom + d, xRight - inset, yBottom + d));
  b.glue(outline(glueFlap.vertices));

  b.rectPanel("back", "Back", xBack, yTop, xLeft, yBottom);
  b.rectPanel("left", "Left", xLeft, yTop, xFront, yBottom);
  b.rectPanel("front", "Front", xFront, yTop, xRight, yBottom);
  b.rectPanel("right", "Right", xRight, yTop, xEnd, yBottom);
  b.rectPanel("glue", "Glue", 0, yTop + glueTaper, xBack, yBottom - glueTaper);
  b.rectPanel("top", "Top", xBack, yTop - d, xLeft, yTop);
  b.rectPanel("top-tuck", "Tuck", xBack + inset, 0, xLeft - inset, tuck);
  b.rectPanel("bottom", "Bottom", xFront, yBottom, xRight, yBottom + d);
  b.rectPanel("bottom-tuck", "Tuck", xFront + inset, yBottom + d, xRight - inset, yEnd);
  b.panel("dust-top-left", "Dust flap", dustTopLeft.box);
  b.panel("dust-top-right", "Dust flap", dustTopRight.box);
  b.panel("dust-bottom-left", "Dust flap", dustBottomLeft.box);
  b.panel("dust-bottom-right", "Dust flap", dustBottomRight.box);

  b.dimension("L", xBack, 0, xLeft, 0);
  if (hasWidth) b.dimension("W", xLeft, 0, xFront, 0);
  b.dimension("H", xEnd, yTop, xEnd, yBottom);
}

/**
 * Roll-end tuck-front mailer. Base in the middle; back wall, lid, lid front and
 * tuck run upward; the front wall runs downward; each end rolls over as an
 * outer + inner side wall whose locking tabs drop into slots on the base folds.
 * Ears on the back and front walls and dust flaps on the lid fold into the rolled ends.
 */
function mailerBox(b: DielineBuilder, { l, d, h, hasWidth }: Dims) {
  const tuck = clamp(0.3 * h, 8, 18);
  const lock = clamp(0.08 * h, 2.5, 5);
  const inset = Math.min(1.5, l * 0.02);
  const tuckRadius = Math.min(tuck * 0.7, (l - 2 * inset) / 4);
  const ear = Math.min(0.45 * d, 2 * h);
  const lidDust = Math.min(0.9 * h, 0.45 * d);
  const corner = Math.min(3, 0.1 * h, 0.1 * d);
  const x0 = lock;
  const xInnerLeft = x0;
  const xOuterLeft = x0 + h;
  const xBase = x0 + 2 * h;
  const xBaseEnd = xBase + l;
  const xOuterRight = xBaseEnd + h;
  const xEnd = xOuterRight + h;
  const yLidFront = tuck;
  const yLid = yLidFront + h;
  const yBack = yLid + d;
  const yBase = yBack + h;
  const yFront = yBase + d;
  const yEnd = yFront + h;
  const tabLength = clamp(0.2 * d, 6, 30);
  const tabs = [0.3, 0.7].map((fraction) => yBase + fraction * d);
  const earOptions = (span: number): FlapOptions => ({ c0: Math.min(span * 0.25, ear * 0.5), c1: Math.min(span * 0.25, ear * 0.5), r: 2 });
  const lidDustRight = makeFlap(pt(xBaseEnd, yLid), pt(xBaseEnd, yBack), lidDust, earOptions(d));
  const backEarRight = makeFlap(pt(xBaseEnd, yBack), pt(xBaseEnd, yBase), ear, earOptions(h));
  const frontEarRight = makeFlap(pt(xBaseEnd, yFront), pt(xBaseEnd, yEnd), ear, earOptions(h));
  const frontEarLeft = makeFlap(pt(xBase, yEnd), pt(xBase, yFront), ear, earOptions(h));
  const backEarLeft = makeFlap(pt(xBase, yBase), pt(xBase, yBack), ear, earOptions(h));
  const lidDustLeft = makeFlap(pt(xBase, yBack), pt(xBase, yLid), lidDust, earOptions(d));
  const tabSlope = lock * 0.6;
  const rightTabs = tabs.flatMap((center) => [
    pt(xEnd, center - tabLength / 2),
    pt(xEnd + lock, center - tabLength / 2 + tabSlope),
    pt(xEnd + lock, center + tabLength / 2 - tabSlope),
    pt(xEnd, center + tabLength / 2),
  ]);
  const leftTabs = [...tabs].reverse().flatMap((center) => [
    pt(xInnerLeft, center + tabLength / 2),
    pt(xInnerLeft - lock, center + tabLength / 2 - tabSlope),
    pt(xInnerLeft - lock, center - tabLength / 2 + tabSlope),
    pt(xInnerLeft, center - tabLength / 2),
  ]);

  b.cut(outline([
    pt(xBase, yLidFront),
    pt(xBase + inset, yLidFront),
    pt(xBase + inset, 0, tuckRadius),
    pt(xBaseEnd - inset, 0, tuckRadius),
    pt(xBaseEnd - inset, yLidFront),
    pt(xBaseEnd, yLidFront),
    ...lidDustRight.vertices,
    ...backEarRight.vertices,
    pt(xEnd - corner, yBase),
    pt(xEnd, yBase + corner),
    ...rightTabs,
    pt(xEnd, yFront - corner),
    pt(xEnd - corner, yFront),
    ...frontEarRight.vertices,
    ...frontEarLeft.vertices,
    pt(xInnerLeft + corner, yFront),
    pt(xInnerLeft, yFront - corner),
    ...leftTabs,
    pt(xInnerLeft, yBase + corner),
    pt(xInnerLeft + corner, yBase),
    ...backEarLeft.vertices,
    ...lidDustLeft.vertices,
  ]));
  // Locking slots on the base folds receive the inner-wall tabs.
  const slot = Math.min(1.5, lock * 0.5);
  for (const x of [xBase, xBaseEnd]) {
    for (const center of tabs) b.cut(rectangle(x - slot / 2, center - tabLength / 2 + tabSlope, slot, tabLength - 2 * tabSlope));
  }

  b.fold(segment(xBase + inset, yLidFront, xBaseEnd - inset, yLidFront));
  for (const y of [yLid, yBack, yBase, yFront]) b.fold(segment(xBase, y, xBaseEnd, y));
  b.fold(segment(xBase, yLid, xBase, yEnd));
  b.fold(segment(xBaseEnd, yLid, xBaseEnd, yEnd));
  b.fold(segment(xOuterLeft, yBase, xOuterLeft, yFront));
  b.fold(segment(xOuterRight, yBase, xOuterRight, yFront));

  b.rectPanel("tuck", "Tuck", xBase + inset, 0, xBaseEnd - inset, yLidFront);
  b.rectPanel("lid-front", "Lid front", xBase, yLidFront, xBaseEnd, yLid);
  b.rectPanel("lid", "Lid", xBase, yLid, xBaseEnd, yBack);
  b.rectPanel("back", "Back", xBase, yBack, xBaseEnd, yBase);
  b.rectPanel("bottom", "Bottom", xBase, yBase, xBaseEnd, yFront);
  b.rectPanel("front", "Front", xBase, yFront, xBaseEnd, yEnd);
  b.rectPanel("left", "Left", xOuterLeft, yBase, xBase, yFront);
  b.rectPanel("right", "Right", xBaseEnd, yBase, xOuterRight, yFront);
  b.rectPanel("left-inner", "Inner side", xInnerLeft, yBase + corner, xOuterLeft, yFront - corner);
  b.rectPanel("right-inner", "Inner side", xOuterRight, yBase + corner, xEnd, yFront - corner);
  b.panel("lid-dust-left", "Dust flap", lidDustLeft.box);
  b.panel("lid-dust-right", "Dust flap", lidDustRight.box);
  b.panel("back-ear-left", "Dust flap", backEarLeft.box);
  b.panel("back-ear-right", "Dust flap", backEarRight.box);
  b.panel("front-ear-left", "Dust flap", frontEarLeft.box);
  b.panel("front-ear-right", "Dust flap", frontEarRight.box);

  b.dimension("L", xBase, yEnd, xBaseEnd, yEnd);
  if (hasWidth) b.dimension("W", xEnd + lock, yBase, xEnd + lock, yFront);
  b.dimension("H", xEnd + lock, yFront, xEnd + lock, yEnd);
}

/**
 * Rigid set-up box: two cross-shaped paper wraps side by side, the base wrap
 * (full-height walls) and the lid wrap (slightly larger, shallower walls). Each
 * wall carries a turn-in that folds over the board edge; corner tabs on the
 * front and back walls wrap round onto the side walls.
 */
function rigidLidBox(b: DielineBuilder, { l, d, h, hasWidth }: Dims) {
  const turnIn = clamp(0.2 * h, 8, 15);
  const clearance = Math.min(2, 0.02 * Math.min(l, d));
  const lidHeight = 0.35 * h;
  const gap = 0.05 * (d + 2 * h);
  const base = wrap(b, "base", 0, l, d, h, turnIn);
  const lid = wrap(b, "lid", base.width + gap, l + 2 * clearance, d + 2 * clearance, lidHeight, Math.min(turnIn, 0.8 * lidHeight));
  // Centre the two wraps on each other vertically.
  base.place(Math.max(0, (lid.height - base.height) / 2));
  lid.place(Math.max(0, (base.height - lid.height) / 2));

  const bottom = Math.max(base.height, lid.height);
  b.dimension("L", base.floorX, bottom, base.floorX + l, bottom);
  if (hasWidth) b.dimension("W", 0, base.floorY, 0, base.floorY + d);
  b.dimension("H", 0, base.floorY - h, 0, base.floorY);
}

/** One rigid-box wrap at horizontal offset x0; geometry is emitted once its vertical offset is known. */
function wrap(b: DielineBuilder, id: "base" | "lid", x0: number, floorWidth: number, floorDepth: number, wall: number, turnIn: number) {
  const tab = Math.min(0.6 * wall, 15, 0.3 * floorDepth);
  const width = 2 * (turnIn + wall) + floorWidth;
  const height = 2 * (turnIn + wall) + floorDepth;
  const result = {
    width,
    height,
    floorX: x0 + turnIn + wall,
    floorY: turnIn + wall,
    place(y0: number) {
      const X0 = x0 + turnIn;
      const X1 = X0 + wall;
      const X2 = X1 + floorWidth;
      const X3 = X2 + wall;
      const Y0 = y0 + turnIn;
      const Y1 = Y0 + wall;
      const Y2 = Y1 + floorDepth;
      const Y3 = Y2 + wall;
      result.floorY = Y1;
      const turnInChamfer = turnIn * 0.9;
      const turnInOptions: FlapOptions = { c0: turnInChamfer, c1: turnInChamfer };
      const tabOptions = (outer: "start" | "end"): FlapOptions => ({
        c0: outer === "start" ? tab * 0.4 : tab * 0.6,
        c1: outer === "start" ? tab * 0.6 : tab * 0.4,
      });
      const backTurnIn = makeFlap(pt(X1, Y0), pt(X2, Y0), turnIn, turnInOptions);
      const backTabRight = makeFlap(pt(X2, Y0), pt(X2, Y1), tab, tabOptions("start"));
      const rightTurnIn = makeFlap(pt(X3, Y1), pt(X3, Y2), turnIn, turnInOptions);
      const frontTabRight = makeFlap(pt(X2, Y2), pt(X2, Y3), tab, tabOptions("end"));
      const frontTurnIn = makeFlap(pt(X2, Y3), pt(X1, Y3), turnIn, turnInOptions);
      const frontTabLeft = makeFlap(pt(X1, Y3), pt(X1, Y2), tab, tabOptions("start"));
      const leftTurnIn = makeFlap(pt(X0, Y2), pt(X0, Y1), turnIn, turnInOptions);
      const backTabLeft = makeFlap(pt(X1, Y1), pt(X1, Y0), tab, tabOptions("end"));
      b.cut(outline([
        ...backTurnIn.vertices,
        ...backTabRight.vertices,
        pt(X3, Y1),
        ...rightTurnIn.vertices,
        pt(X2, Y2),
        ...frontTabRight.vertices,
        ...frontTurnIn.vertices,
        ...frontTabLeft.vertices,
        pt(X0, Y2),
        ...leftTurnIn.vertices,
        pt(X1, Y1),
        ...backTabLeft.vertices,
      ]));
      for (const tabFlap of [backTabRight, frontTabRight, frontTabLeft, backTabLeft]) b.glue(outline(tabFlap.vertices));
      b.fold(segment(X1, Y0, X1, Y3));
      b.fold(segment(X2, Y0, X2, Y3));
      b.fold(segment(X0, Y1, X3, Y1));
      b.fold(segment(X0, Y2, X3, Y2));
      b.fold(segment(X1, Y0, X2, Y0));
      b.fold(segment(X1, Y3, X2, Y3));

      const wallLabel = id === "lid" ? "Lid side" : undefined;
      b.rectPanel(id, id === "lid" ? "Lid" : "Base", X1, Y1, X2, Y2);
      b.rectPanel(id === "lid" ? "lid-front" : "front", wallLabel ?? "Front", X1, Y2, X2, Y3);
      b.rectPanel(`${id}-back`, wallLabel ?? "Back", X1, Y0, X2, Y1);
      b.rectPanel(`${id}-left`, wallLabel ?? "Left", X0, Y1, X1, Y2);
      b.rectPanel(`${id}-right`, wallLabel ?? "Right", X2, Y1, X3, Y2);
      b.panel(`${id}-turn-in-back`, "Turn-in", backTurnIn.box);
      b.panel(`${id}-turn-in-front`, "Turn-in", frontTurnIn.box);
      b.panel(`${id}-turn-in-left`, "Turn-in", leftTurnIn.box);
      b.panel(`${id}-turn-in-right`, "Turn-in", rightTurnIn.box);
    },
  };
  return result;
}

/**
 * Triangular pyramid (paan box). The box height H is the apex height, so each
 * side face (base edge L) has slant height √(H² + (L / 2√3)²). The three faces
 * fan round their shared apex: Front stands upright, Right and Left swing out
 * from its right-hand edge, and a glue flap on Left closes onto Front's free
 * edge. The triangular base hangs under Front with a tuck flap; Right and Left
 * carry dust flaps that fold in beneath the base.
 */
function pyramidBox(b: DielineBuilder, { l, h }: Dims) {
  const slant = Math.hypot(h, l / (2 * Math.sqrt(3)));
  const edge = Math.hypot(slant, l / 2);
  const half = Math.atan2(l / 2, slant);
  const baseDepth = (Math.sqrt(3) / 2) * l;
  const glue = clamp(0.15 * l, 8, 16);
  const tuck = clamp(0.2 * l, 6, 25);
  const dust = 0.22 * l;
  const shoulder = Math.min(1.5, l * 0.02);
  // Fan points by angle from straight down (turning towards +x) round the apex.
  const onFan = (angle: number, radius = edge) => pt(radius * Math.sin(angle), radius * Math.cos(angle));
  const apex = pt(0, 0);
  const A = onFan(-half);
  const B = onFan(half);
  const C = onFan(3 * half);
  const D = onFan(5 * half);
  const baseTip = pt(0, slant + baseDepth);
  const glueChamfer = Math.min(glue * 0.6, edge * 0.2);
  const glueFlap = makeFlap(apex, D, glue, { c0: glueChamfer, c1: glueChamfer });
  const dustOptions: FlapOptions = { c0: dust, c1: dust, r: Math.min(2, dust * 0.2) };
  const dustLeft = makeFlap(D, C, dust, dustOptions);
  const dustRight = makeFlap(C, B, dust, dustOptions);
  const tuckFlap = makeFlap(B, baseTip, tuck, { c0: tuck * 0.6, c1: tuck * 0.6, i0: shoulder, i1: shoulder, r: Math.min(tuck * 0.5, l * 0.08) });

  b.cut(outline([apex, ...glueFlap.vertices, ...dustLeft.vertices, ...dustRight.vertices, ...tuckFlap.vertices, A]));
  for (const point of [B, C, D]) b.fold(segment(apex.x, apex.y, point.x, point.y));
  b.fold(segment(A.x, A.y, B.x, B.y));
  b.fold(segment(B.x, B.y, C.x, C.y));
  b.fold(segment(C.x, C.y, D.x, D.y));
  b.fold(segment(B.x, B.y, baseTip.x, baseTip.y));
  b.glue(outline(glueFlap.vertices));

  // Label boxes: the largest rectangle standing on each face's base edge, made axis-aligned.
  const faceBox = (angle: number) =>
    inscribedBox(onFan(angle, 0.75 * slant), { x: Math.cos(angle), y: -Math.sin(angle) }, l / 4, slant / 4);
  b.rectPanel("front", "Front", -l / 4, slant / 2, l / 4, slant);
  b.panel("right", "Right", faceBox(2 * half));
  b.panel("left", "Left", faceBox(4 * half));
  b.rectPanel("bottom", "Bottom", -l / 4, slant, l / 4, slant + baseDepth / 2);
  b.panel("glue", "Glue", glueFlap.box);
  b.panel("tuck", "Tuck", tuckFlap.box);
  b.panel("dust-right", "Dust flap", dustRight.box);
  b.panel("dust-left", "Dust flap", dustLeft.box);

  b.dimension("L", A.x, baseTip.y, B.x, baseTip.y);
  b.dimension("H", A.x, 0, A.x, slant);
}

/**
 * Paper carry bag: Glue | Back | Gusset | Front | Gusset with a top turnover
 * (handle reinforcement, punched handle holes) and bottom flaps. Gussets carry
 * centre folds and the diagonal bellows folds of the square bottom.
 */
function paperBag(b: DielineBuilder, { l, d, h, hasWidth }: Dims) {
  const glue = clamp(0.2 * d, 10, 20);
  const turnover = clamp(0.15 * h, 15, 45);
  const bottomFlap = 0.75 * d;
  const gussetFlap = 0.5 * d;
  const xBack = glue;
  const xGussetA = xBack + l;
  const xFront = xGussetA + d;
  const xGussetB = xFront + l;
  const xEnd = xGussetB + d;
  const yBottom = turnover + h;
  const flapRadius = Math.min(3, bottomFlap * 0.1);
  const gussetOptions: FlapOptions = { c0: gussetFlap * 0.4, c1: gussetFlap * 0.4 };
  const gussetBFlap = makeFlap(pt(xEnd, yBottom), pt(xGussetB, yBottom), gussetFlap, gussetOptions);
  const gussetAFlap = makeFlap(pt(xFront, yBottom), pt(xGussetA, yBottom), gussetFlap, gussetOptions);
  const glueTaper = Math.min(glue * 0.6, (yBottom) * 0.1);
  const glueFlap = makeFlap(pt(xBack, yBottom), pt(xBack, 0), glue, { c0: glueTaper, c1: glueTaper });

  b.cut(outline([
    pt(xBack, 0),
    pt(xEnd, 0),
    pt(xEnd, yBottom),
    ...gussetBFlap.vertices,
    pt(xGussetB, yBottom + bottomFlap, flapRadius),
    pt(xFront, yBottom + bottomFlap, flapRadius),
    pt(xFront, yBottom),
    ...gussetAFlap.vertices,
    pt(xGussetA, yBottom + bottomFlap, flapRadius),
    pt(xBack, yBottom + bottomFlap, flapRadius),
    pt(xBack, yBottom),
    ...glueFlap.vertices,
  ]));
  if (turnover >= 12 && l >= 60) {
    const holeRadius = clamp(0.012 * l, 2.5, 4);
    for (const panelX of [xBack, xFront]) {
      for (const offset of [-0.18, 0.18]) {
        const cx = panelX + l / 2 + offset * l;
        b.cut(circle(cx, turnover / 2, holeRadius));
        b.cut(circle(cx, turnover * 1.5, holeRadius));
      }
    }
  }

  for (const x of [xBack, xGussetA, xFront, xGussetB]) b.fold(segment(x, 0, x, yBottom));
  for (const gusset of [xGussetA, xGussetB]) {
    const center = gusset + d / 2;
    const knee = yBottom - d / 2;
    b.fold(segment(center, 0, center, knee));
    b.fold([{ op: "M", x: gusset, y: yBottom }, { op: "L", x: center, y: knee }, { op: "L", x: gusset + d, y: yBottom }]);
  }
  b.fold(segment(xBack, turnover, xEnd, turnover));
  b.fold(segment(xBack, yBottom, xEnd, yBottom));
  b.glue(outline(glueFlap.vertices));
  const seam = Math.min(0.2 * d, 15);
  b.glue(rectangle(xFront + 0.08 * l, yBottom + bottomFlap - seam - Math.min(2, seam * 0.2), 0.84 * l, seam));

  b.rectPanel("glue", "Glue", 0, glueTaper, xBack, yBottom - glueTaper);
  b.rectPanel("back", "Back", xBack, turnover, xGussetA, yBottom);
  b.rectPanel("gusset-left", "Gusset", xGussetA, turnover, xFront, yBottom - d / 2);
  b.rectPanel("front", "Front", xFront, turnover, xGussetB, yBottom);
  b.rectPanel("gusset-right", "Gusset", xGussetB, turnover, xEnd, yBottom - d / 2);
  b.rectPanel("turnover", "Turnover", xBack, 0, xEnd, turnover);
  b.rectPanel("bottom-back", "Bottom", xBack, yBottom, xGussetA, yBottom + bottomFlap);
  b.rectPanel("bottom-front", "Bottom", xFront, yBottom, xGussetB, yBottom + bottomFlap);
  b.panel("bottom-gusset-left", "Bottom", gussetAFlap.box);
  b.panel("bottom-gusset-right", "Bottom", gussetBFlap.box);

  b.dimension("L", xFront, 0, xGussetB, 0);
  if (hasWidth) b.dimension("W", xGussetB, 0, xEnd, 0);
  b.dimension("H", xEnd, turnover, xEnd, yBottom);
}

/**
 * Stand-up pouch web: front panel, W-folded bottom gusset, back panel. Heat
 * seals (side seals full length, top and bottom seals) are the glue areas; tear
 * notches sit in the side seals near each opening edge.
 */
function standUpPouch(b: DielineBuilder, { l, d, h, hasWidth }: Dims) {
  const seal = clamp(0.06 * l, 5, 12);
  const endSeal = clamp(0.05 * h, 6, 15);
  const notch = Math.min(2.5, seal * 0.4);
  const corner = Math.min(4, 0.05 * l);
  const total = 2 * h + d;
  const notchFront = Math.min(endSeal + 8, h * 0.3);
  const notchBack = total - notchFront;
  const notchAt = (x: number, y: number, inward: number) => [pt(x, y - notch), pt(x + inward, y), pt(x, y + notch)];

  b.cut(outline([
    pt(0, 0, corner),
    pt(l, 0, corner),
    ...notchAt(l, notchFront, -notch),
    ...notchAt(l, notchBack, -notch),
    pt(l, total, corner),
    pt(0, total, corner),
    ...notchAt(0, notchBack, notch).reverse(),
    ...notchAt(0, notchFront, notch).reverse(),
  ]));
  b.fold(segment(0, h, l, h));
  b.fold(segment(0, h + d / 2, l, h + d / 2));
  b.fold(segment(0, h + d, l, h + d));
  b.glue(rectangle(0, 0, seal, total));
  b.glue(rectangle(l - seal, 0, seal, total));
  b.glue(rectangle(seal, 0, l - 2 * seal, endSeal));
  b.glue(rectangle(seal, total - endSeal, l - 2 * seal, endSeal));

  b.rectPanel("front", "Front", seal, endSeal, l - seal, h);
  b.rectPanel("gusset", "Gusset", seal, h, l - seal, h + d);
  b.rectPanel("back", "Back", seal, h + d, l - seal, total - endSeal);

  b.dimension("L", 0, 0, l, 0);
  b.dimension("H", l, 0, l, h);
  if (hasWidth) b.dimension("W", l, h, l, h + d);
}

/**
 * Paper mailer envelope: peel-and-seal flap, front panel, back panel (folded
 * up behind the front) whose side glue flaps close the sides.
 */
function mailerEnvelope(b: DielineBuilder, { l, h }: Dims) {
  const flapDepth = clamp(0.25 * h, 20, 50);
  const glue = clamp(0.08 * l, 8, 16);
  const flapChamfer = Math.min(flapDepth * 0.6, l * 0.1);
  const xFront = glue;
  const xEnd = glue + l;
  const yFront = flapDepth;
  const yBack = yFront + h;
  const yEnd = yBack + h;
  const sideTaper = Math.min(glue, h * 0.15);
  const flap = makeFlap(pt(xFront, yFront), pt(xEnd, yFront), flapDepth, { c0: flapChamfer, c1: flapChamfer, r: Math.min(6, flapDepth * 0.15) });
  const rightGlue = makeFlap(pt(xEnd, yBack), pt(xEnd, yEnd), glue, { c0: sideTaper, c1: sideTaper });
  const leftGlue = makeFlap(pt(xFront, yEnd), pt(xFront, yBack), glue, { c0: sideTaper, c1: sideTaper });

  b.cut(outline([...flap.vertices, pt(xEnd, yBack), ...rightGlue.vertices, ...leftGlue.vertices]));
  b.fold(segment(xFront, yFront, xEnd, yFront));
  b.fold(segment(xFront, yBack, xEnd, yBack));
  b.fold(segment(xFront, yBack, xFront, yEnd));
  b.fold(segment(xEnd, yBack, xEnd, yEnd));
  b.glue(outline(rightGlue.vertices));
  b.glue(outline(leftGlue.vertices));
  const strip = clamp(0.3 * flapDepth, 5, 12);
  b.glue(rectangle(xFront + flapChamfer + 2, flapDepth * 0.2, l - 2 * flapChamfer - 4, strip));

  b.panel("flap", "Flap", flap.box);
  b.rectPanel("front", "Front", xFront, yFront, xEnd, yBack);
  b.rectPanel("back", "Back", xFront, yBack, xEnd, yEnd);
  b.panel("glue-left", "Glue", leftGlue.box);
  b.panel("glue-right", "Glue", rightGlue.box);

  b.dimension("L", xFront, yEnd, xEnd, yEnd);
  b.dimension("H", xEnd + glue, yBack, xEnd + glue, yEnd);
}

/**
 * Pillow box: Glue | Front | Back tube whose panels are the arc length of the
 * lens cross-section (chord L, thickness W). Each end closes with curved flaps:
 * a convex cut lobe outside a concave curved fold.
 */
function pillowBox(b: DielineBuilder, { l, d, h }: Dims) {
  const panel = Math.sqrt(l * l + (4 / 3) * d * d);
  const lobe = d / 2;
  const curve = Math.min(0.5 * d, 0.35 * h);
  const glue = clamp(0.1 * panel, 8, 15);
  const xFront = glue;
  const xBack = glue + panel;
  const xEnd = glue + 2 * panel;
  const yTop = lobe;
  const yBottom = lobe + h;
  const glueTaper = Math.min(glue * 0.6, h * 0.15);
  const glueFlap = makeFlap(pt(xFront, yBottom), pt(xFront, yTop), glue, { c0: glueTaper, c1: glueTaper });
  const path: Path = [
    { op: "M", x: xFront, y: yTop },
    { op: "Q", cx: xFront + panel / 2, cy: yTop - 2 * lobe, x: xBack, y: yTop },
    { op: "Q", cx: xBack + panel / 2, cy: yTop - 2 * lobe, x: xEnd, y: yTop },
    { op: "L", x: xEnd, y: yBottom },
    { op: "Q", cx: xBack + panel / 2, cy: yBottom + 2 * lobe, x: xBack, y: yBottom },
    { op: "Q", cx: xFront + panel / 2, cy: yBottom + 2 * lobe, x: xFront, y: yBottom },
    ...glueFlap.vertices.slice(1).map((vertex): Command => ({ op: "L", x: vertex.x, y: vertex.y })),
    { op: "Z" },
  ];
  b.cut(path);
  b.fold(segment(xFront, yTop, xFront, yBottom));
  b.fold(segment(xBack, yTop, xBack, yBottom));
  for (const x of [xFront, xBack]) {
    b.fold(arc(x, x + panel, yTop, curve));
    b.fold(arc(x, x + panel, yBottom, -curve));
  }
  b.glue(outline(glueFlap.vertices));

  b.rectPanel("front", "Front", xFront, yTop + curve, xBack, yBottom - curve);
  b.rectPanel("back", "Back", xBack, yTop + curve, xEnd, yBottom - curve);
  b.rectPanel("glue", "Glue", 0, yTop + glueTaper, xFront, yBottom - glueTaper);
  for (const [index, x] of [xFront, xBack].entries()) {
    const name = index === 0 ? "front" : "back";
    b.rectPanel(`${name}-flap-top`, "End flap", x + panel / 4, yTop - 0.75 * lobe, x + (3 * panel) / 4, yTop + 0.75 * curve);
    b.rectPanel(`${name}-flap-bottom`, "End flap", x + panel / 4, yBottom - 0.75 * curve, x + (3 * panel) / 4, yBottom + 0.75 * lobe);
  }

  b.dimension("L", xFront, 0, xBack, 0);
  b.dimension("H", xEnd, yTop, xEnd, yBottom);
}

/** Open tray: base with four walls; corner glue tabs on the front and back walls. */
function tray(b: DielineBuilder, { l, d, h, hasWidth }: Dims) {
  const tab = Math.min(0.8 * h, 0.45 * d, 25);
  const x1 = h;
  const x2 = h + l;
  const x3 = 2 * h + l;
  const y1 = h;
  const y2 = h + d;
  const y3 = 2 * h + d;
  const tabOptions = (outer: "start" | "end"): FlapOptions => ({
    c0: outer === "start" ? tab * 0.4 : tab * 0.6,
    c1: outer === "start" ? tab * 0.6 : tab * 0.4,
  });
  const backRight = makeFlap(pt(x2, 0), pt(x2, y1), tab, tabOptions("start"));
  const frontRight = makeFlap(pt(x2, y2), pt(x2, y3), tab, tabOptions("end"));
  const frontLeft = makeFlap(pt(x1, y3), pt(x1, y2), tab, tabOptions("start"));
  const backLeft = makeFlap(pt(x1, y1), pt(x1, 0), tab, tabOptions("end"));

  b.cut(outline([
    pt(x1, 0),
    ...backRight.vertices,
    pt(x3, y1),
    pt(x3, y2),
    ...frontRight.vertices,
    ...frontLeft.vertices,
    pt(0, y2),
    pt(0, y1),
    ...backLeft.vertices,
  ]));
  b.fold(segment(x1, 0, x1, y3));
  b.fold(segment(x2, 0, x2, y3));
  b.fold(segment(x1, y1, x2, y1));
  b.fold(segment(x1, y2, x2, y2));
  for (const tabFlap of [backRight, frontRight, frontLeft, backLeft]) b.glue(outline(tabFlap.vertices));

  b.rectPanel("base", "Base", x1, y1, x2, y2);
  b.rectPanel("back", "Back", x1, 0, x2, y1);
  b.rectPanel("front", "Front", x1, y2, x2, y3);
  b.rectPanel("left", "Left", 0, y1, x1, y2);
  b.rectPanel("right", "Right", x2, y1, x3, y2);
  b.panel("glue-back-left", "Glue", backLeft.box);
  b.panel("glue-back-right", "Glue", backRight.box);
  b.panel("glue-front-left", "Glue", frontLeft.box);
  b.panel("glue-front-right", "Glue", frontRight.box);

  b.dimension("L", x1, 0, x2, 0);
  b.dimension("H", 0, 0, 0, y1);
  if (hasWidth) b.dimension("W", 0, y1, 0, y2);
}

/** Single printed sheet (labels, cards, inserts): trim line with a dashed safe-area guide. */
function flatSheet(b: DielineBuilder, { l, h, hasWidth, hasHeight }: Dims) {
  const width = l;
  const height = h;
  const safe = clamp(0.04 * Math.min(width, height), 1.5, 5);
  b.cut(rectangle(0, 0, width, height));
  b.fold(rectangle(safe, safe, width - 2 * safe, height - 2 * safe));
  b.rectPanel("front", "Front", safe, safe, width - safe, height - safe);
  b.dimension("L", 0, height, width, height);
  if (hasHeight) b.dimension("H", width, 0, width, height);
  else if (hasWidth) b.dimension("W", width, 0, width, height);
}
