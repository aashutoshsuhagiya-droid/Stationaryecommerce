import type { Product3DKind } from "./product-3d-profile";

export interface Product3DNormalizedDimensions {
  width: number;
  height: number;
  depth: number;
  diameter: number;
  labelWidth: number;
  labelHeight: number;
}

type DimensionDefaults = {
  width: number;
  height: number;
  depth: number;
  diameter?: number;
  labelWidth?: number;
  labelHeight?: number;
};

const DEFAULT_DIMENSIONS_MM: Record<Product3DKind, DimensionDefaults> = {
  "label-pack": { width: 90, height: 35, depth: 3 },
  "waterproof-sheet": { width: 210, height: 148, depth: 3 },
  "school-kit": { width: 220, height: 160, depth: 12 },
  notebook: { width: 148, height: 210, depth: 16 },
  "bottle-label": { width: 75, height: 240, depth: 75, diameter: 75, labelWidth: 180, labelHeight: 90 },
  "pencil-set": { width: 42, height: 190, depth: 18 },
  tag: { width: 55, height: 85, depth: 4 },
  "geometry-box": { width: 200, height: 80, depth: 25 },
  "gift-ribbon": { width: 160, height: 120, depth: 100 },
  "keychain-duo": { width: 120, height: 70, depth: 5 },
  "bulk-grid": { width: 240, height: 170, depth: 12 },
  "rectangular-box": { width: 180, height: 120, depth: 80 },
  "square-box": { width: 120, height: 120, depth: 120 },
  "folding-carton": { width: 85, height: 170, depth: 48 },
  "mailer-box": { width: 240, height: 82, depth: 175 },
  "paper-bag": { width: 180, height: 240, depth: 80 },
  "stand-up-pouch": { width: 160, height: 220, depth: 58 },
  "product-sleeve": { width: 180, height: 105, depth: 58 },
};

const WIDTH_KEYS = ["width", "productwidth", "boxwidth", "bagwidth", "pouchwidth", "sleevewidth", "frontwidth"] as const;
const HEIGHT_KEYS = ["height", "productheight", "boxheight", "bagheight", "pouchheight", "sleeveheight", "frontheight"] as const;
const DEPTH_KEYS = ["depth", "productdepth", "boxdepth", "bagdepth", "pouchdepth", "sleevedepth", "sidedepth", "gusset", "gussetdepth", "thickness"] as const;
const DIAMETER_KEYS = ["diameter", "bottlediameter", "containerdiameter"] as const;
const LABEL_WIDTH_KEYS = ["labelwidth", "printwidth", "artworkwidth"] as const;
const LABEL_HEIGHT_KEYS = ["labelheight", "printheight", "artworkheight"] as const;

function normalizedKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, "");
}

function finitePositive(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function dimensionValue(values: Readonly<Record<string, number>>, aliases: readonly string[]): number | undefined {
  const normalized = new Map(Object.entries(values).map(([key, value]) => [normalizedKey(key), value]));
  for (const alias of aliases) {
    const value = finitePositive(normalized.get(alias));
    if (value !== undefined) return value;
  }
  return undefined;
}

function clampPhysical(value: number): number {
  return Math.min(5_000, Math.max(1, value));
}

/** Converts manufacturing dimensions to stable scene units while preserving proportions. */
export function normalizeProduct3DDimensions(
  kind: Product3DKind,
  values: Readonly<Record<string, number>> | null | undefined,
  primaryAspectRatio = 1,
): Product3DNormalizedDimensions {
  const defaults = DEFAULT_DIMENSIONS_MM[kind];
  const source = values ?? {};
  const safeAspect = Number.isFinite(primaryAspectRatio)
    ? Math.min(12, Math.max(1 / 12, primaryAspectRatio))
    : 1;
  let physicalWidth = dimensionValue(source, WIDTH_KEYS) ?? defaults.width;
  let physicalHeight = dimensionValue(source, HEIGHT_KEYS) ?? defaults.height;
  let physicalDepth = dimensionValue(source, DEPTH_KEYS) ?? defaults.depth;

  if (!values && (kind === "label-pack" || kind === "waterproof-sheet")) {
    const longEdge = Math.max(defaults.width, defaults.height);
    physicalWidth = safeAspect >= 1 ? longEdge : longEdge * safeAspect;
    physicalHeight = safeAspect >= 1 ? longEdge / safeAspect : longEdge;
  }

  physicalWidth = clampPhysical(physicalWidth);
  physicalHeight = clampPhysical(physicalHeight);
  physicalDepth = clampPhysical(physicalDepth);
  if (kind === "square-box") physicalDepth = physicalWidth;

  const physicalDiameter = clampPhysical(
    dimensionValue(source, DIAMETER_KEYS)
      ?? (kind === "bottle-label" ? physicalWidth : defaults.diameter ?? physicalWidth),
  );
  const physicalLabelWidth = clampPhysical(dimensionValue(source, LABEL_WIDTH_KEYS) ?? defaults.labelWidth ?? physicalWidth);
  const physicalLabelHeight = clampPhysical(dimensionValue(source, LABEL_HEIGHT_KEYS) ?? defaults.labelHeight ?? physicalHeight * 0.45);
  const longest = Math.max(physicalWidth, physicalHeight, physicalDepth, physicalDiameter, 1);
  const minimumPhysical = longest / 60;
  const scale = 2.7 / longest;
  const sceneValue = (value: number) => Math.max(0.045, Math.max(value, minimumPhysical) * scale);

  return {
    width: sceneValue(physicalWidth),
    height: sceneValue(physicalHeight),
    depth: sceneValue(physicalDepth),
    diameter: sceneValue(physicalDiameter),
    labelWidth: sceneValue(Math.min(physicalLabelWidth, Math.PI * physicalDiameter)),
    labelHeight: sceneValue(Math.min(physicalLabelHeight, physicalHeight * 0.92)),
  };
}
