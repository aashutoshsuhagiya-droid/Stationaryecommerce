export type Product3DSurfaceSlot =
  | "front"
  | "back"
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "side"
  | "gusset"
  | "gusset-left"
  | "gusset-right"
  | "label"
  | "primary";

export interface Product3DSurfaceLike {
  id: string;
  label?: string;
}

function surfaceTokens(value: string): string[] {
  return value
    .replace(/([a-z])([A-Z])/gu, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/gu)
    .filter(Boolean);
}

function includesAny(tokens: readonly string[], values: readonly string[]): boolean {
  return values.some((value) => tokens.includes(value));
}

export function canonicalProduct3DSurface(
  surface: Product3DSurfaceLike,
): Product3DSurfaceSlot | undefined {
  const tokens = [...surfaceTokens(surface.id), ...surfaceTokens(surface.label ?? "")];
  const hasLeft = includesAny(tokens, ["left", "lhs"]);
  const hasRight = includesAny(tokens, ["right", "rhs"]);
  const hasGusset = includesAny(tokens, ["gusset", "gutter"]);

  if (hasGusset && hasLeft) return "gusset-left";
  if (hasGusset && hasRight) return "gusset-right";
  if (hasGusset) return "gusset";
  if (includesAny(tokens, ["back", "rear", "reverse"])) return "back";
  if (hasLeft) return "left";
  if (hasRight) return "right";
  if (includesAny(tokens, ["top", "lid", "cap"])) return "top";
  if (includesAny(tokens, ["bottom", "base", "floor"])) return "bottom";
  if (includesAny(tokens, ["front", "obverse", "face"])) return "front";
  if (includesAny(tokens, ["label", "wrap", "band"])) return "label";
  if (includesAny(tokens, ["side", "edge"])) return "side";
  if (includesAny(tokens, ["primary", "main", "artwork", "print"])) return "primary";
  return undefined;
}

const SLOT_FALLBACKS: Record<Product3DSurfaceSlot, readonly Product3DSurfaceSlot[]> = {
  front: ["front", "primary", "label"],
  back: ["back", "front", "primary", "label"],
  left: ["left", "side", "gusset-left", "gusset", "front", "primary"],
  right: ["right", "side", "gusset-right", "gusset", "front", "primary"],
  top: ["top", "front", "primary"],
  bottom: ["bottom", "back", "front", "primary"],
  side: ["side", "right", "left", "gusset", "front", "primary"],
  gusset: ["gusset", "side", "gusset-right", "gusset-left", "front", "primary"],
  "gusset-left": ["gusset-left", "gusset", "left", "side", "front", "primary"],
  "gusset-right": ["gusset-right", "gusset", "right", "side", "front", "primary"],
  label: ["label", "front", "primary"],
  primary: ["primary", "front", "label"],
};

/** Finds the actual configured surface to use for a semantic model face. */
export function resolveProduct3DSurfaceId(
  surfaces: readonly Product3DSurfaceLike[],
  requested: Product3DSurfaceSlot,
): string | undefined {
  if (!surfaces.length) return undefined;
  const indexed = new Map<Product3DSurfaceSlot, string>();
  for (const surface of surfaces) {
    const slot = canonicalProduct3DSurface(surface);
    if (slot && !indexed.has(slot)) indexed.set(slot, surface.id);
  }
  for (const fallback of SLOT_FALLBACKS[requested]) {
    const id = indexed.get(fallback);
    if (id) return id;
  }
  return surfaces[0]?.id;
}
