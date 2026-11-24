export type Product3DKind =
  | "label-pack"
  | "waterproof-sheet"
  | "school-kit"
  | "notebook"
  | "bottle-label"
  | "pencil-set"
  | "tag"
  | "geometry-box"
  | "gift-ribbon"
  | "keychain-duo"
  | "bulk-grid"
  | "rectangular-box"
  | "square-box"
  | "folding-carton"
  | "mailer-box"
  | "paper-bag"
  | "stand-up-pouch"
  | "product-sleeve"
  | "rigid-lid-box"
  | "mailer-envelope"
  | "pyramid-box";

export type PackagingProduct3DKind =
  | "rectangular-box"
  | "square-box"
  | "folding-carton"
  | "mailer-box"
  | "paper-bag"
  | "stand-up-pouch"
  | "product-sleeve"
  | "rigid-lid-box"
  | "mailer-envelope"
  | "pyramid-box";

const PACKAGING_KINDS = new Set<Product3DKind>([
  "rectangular-box", "square-box", "folding-carton", "mailer-box", "paper-bag",
  "stand-up-pouch", "product-sleeve", "rigid-lid-box", "mailer-envelope", "pyramid-box",
]);

/** Packaging is printed per panel; label and school models print every face. */
export function isPackagingProduct3DKind(kind: Product3DKind): kind is PackagingProduct3DKind {
  return PACKAGING_KINDS.has(kind);
}

export type Product3DFinish =
  | "matte"
  | "glossy"
  | "metallic"
  | "acrylic"
  | "wood"
  | "mixed";

export type Product3DThemeFlag =
  | "acrylic"
  | "batch-grid"
  | "bound"
  | "corrugated"
  | "gift-box"
  | "hinged"
  | "iridescent"
  | "mixed-pack"
  | "paper"
  | "ribbon"
  | "stacked"
  | "translucent"
  | "waterproof"
  | "wood"
  | "wrapped";

export interface Product3DTheme {
  baseColor: string;
  tintColor: string;
  accentColor: string;
  roughness: number;
  metalness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  iridescence: number;
  finish: Product3DFinish;
  flags: readonly Product3DThemeFlag[];
}

export interface Product3DProfile {
  kind: Product3DKind;
  label: string;
  cameraDistance: number;
  categoryTheme: Product3DTheme;
}

export interface Product3DProfileOptions {
  /** Packaging board colour comes from a named stock here, else the model's default. */
  materialName?: string;
  colors?: readonly string[];
}

/**
 * The catalog category is the stable source of truth for 3D presentation.
 * Adding a category-specific preview is intentionally a single table entry;
 * structural artwork matching below exists only for legacy/unknown categories.
 */
export const CATEGORY_3D_PROFILES = {
  "customized-name-slips": {
    kind: "label-pack",
    label: "Printed name-slip pack",
    cameraDistance: 3.4,
    categoryTheme: {
      baseColor: "#f8fafc",
      tintColor: "#e2e8f0",
      accentColor: "#0f766e",
      roughness: 0.78,
      metalness: 0.01,
      clearcoat: 0.08,
      clearcoatRoughness: 0.65,
      iridescence: 0,
      finish: "matte",
      flags: ["stacked"],
    },
  },
  "waterproof-stickers": {
    kind: "waterproof-sheet",
    label: "Waterproof sticker sheet",
    cameraDistance: 3.6,
    categoryTheme: {
      baseColor: "#dff6ff",
      tintColor: "#bae6fd",
      accentColor: "#0891b2",
      roughness: 0.18,
      metalness: 0.05,
      clearcoat: 0.95,
      clearcoatRoughness: 0.08,
      iridescence: 0.28,
      finish: "glossy",
      flags: ["waterproof", "iridescent"],
    },
  },
  "personalized-pencils-pens": {
    kind: "pencil-set",
    label: "Personalized pencil set",
    cameraDistance: 4,
    categoryTheme: {
      baseColor: "#f59e0b",
      tintColor: "#fef3c7",
      accentColor: "#0f172a",
      roughness: 0.48,
      metalness: 0,
      clearcoat: 0.15,
      clearcoatRoughness: 0.42,
      iridescence: 0,
      finish: "wood",
      flags: ["wood"],
    },
  },
  "school-labels": {
    kind: "school-kit",
    label: "Mixed school label kit",
    cameraDistance: 3.8,
    categoryTheme: {
      baseColor: "#ede9fe",
      tintColor: "#f5f3ff",
      accentColor: "#7c3aed",
      roughness: 0.58,
      metalness: 0.01,
      clearcoat: 0.3,
      clearcoatRoughness: 0.38,
      iridescence: 0,
      finish: "mixed",
      flags: ["mixed-pack"],
    },
  },
  "personalized-notebooks": {
    kind: "notebook",
    label: "Personalized notebook",
    cameraDistance: 3.8,
    categoryTheme: {
      baseColor: "#fecaca",
      tintColor: "#fff1f2",
      accentColor: "#be123c",
      roughness: 0.72,
      metalness: 0,
      clearcoat: 0.18,
      clearcoatRoughness: 0.55,
      iridescence: 0,
      finish: "matte",
      flags: ["paper", "bound"],
    },
  },
  "bottle-tiffin-labels": {
    kind: "bottle-label",
    label: "Bottle label preview",
    cameraDistance: 4,
    categoryTheme: {
      baseColor: "#dbeafe",
      tintColor: "#e2e8f0",
      accentColor: "#0284c7",
      roughness: 0.2,
      metalness: 0.62,
      clearcoat: 0.85,
      clearcoatRoughness: 0.12,
      iridescence: 0.08,
      finish: "glossy",
      flags: ["waterproof", "wrapped"],
    },
  },
  "school-accessories": {
    kind: "geometry-box",
    label: "Metal geometry box",
    cameraDistance: 3.7,
    categoryTheme: {
      baseColor: "#64748b",
      tintColor: "#cbd5e1",
      accentColor: "#0f766e",
      roughness: 0.3,
      metalness: 0.75,
      clearcoat: 0.35,
      clearcoatRoughness: 0.28,
      iridescence: 0,
      finish: "metallic",
      flags: ["hinged"],
    },
  },
  "personalized-gifts": {
    kind: "gift-ribbon",
    label: "Personalized gift box",
    cameraDistance: 3.9,
    categoryTheme: {
      baseColor: "#fce7f3",
      tintColor: "#fff1f2",
      accentColor: "#db2777",
      roughness: 0.38,
      metalness: 0.08,
      clearcoat: 0.45,
      clearcoatRoughness: 0.25,
      iridescence: 0.05,
      finish: "mixed",
      flags: ["gift-box", "ribbon"],
    },
  },
  "name-plates-keychains": {
    kind: "keychain-duo",
    label: "Acrylic keychain pair",
    cameraDistance: 3.5,
    categoryTheme: {
      baseColor: "#e0f2fe",
      tintColor: "#f8fafc",
      accentColor: "#d97706",
      roughness: 0.18,
      metalness: 0.04,
      clearcoat: 0.9,
      clearcoatRoughness: 0.1,
      iridescence: 0.12,
      finish: "acrylic",
      flags: ["acrylic", "translucent"],
    },
  },
  "bulk-orders": {
    kind: "bulk-grid",
    label: "Institutional label grid",
    cameraDistance: 4.2,
    categoryTheme: {
      baseColor: "#e2e8f0",
      tintColor: "#f8fafc",
      accentColor: "#334155",
      roughness: 0.72,
      metalness: 0.01,
      clearcoat: 0.1,
      clearcoatRoughness: 0.58,
      iridescence: 0,
      finish: "matte",
      flags: ["batch-grid", "stacked"],
    },
  },
} as const satisfies Record<string, Product3DProfile>;

export const PACKAGING_3D_PROFILES = {
  // Carton board has a soft satin sheen (roughness ~0.55) and no clearcoat
  // until the material says gloss lamination; kraft stays fully matte.
  "rectangular-box": {
    kind: "rectangular-box",
    label: "Rectangular packaging box",
    cameraDistance: 4,
    categoryTheme: {
      baseColor: "#f4f1ea",
      tintColor: "#fbf9f4",
      accentColor: "#7c5a35",
      roughness: 0.58,
      metalness: 0,
      clearcoat: 0,
      clearcoatRoughness: 0.68,
      iridescence: 0,
      finish: "matte",
      flags: ["paper"],
    },
  },
  "square-box": {
    kind: "square-box",
    label: "Square packaging box",
    cameraDistance: 4,
    categoryTheme: {
      baseColor: "#f4f1ea",
      tintColor: "#fffaf0",
      accentColor: "#8b5e34",
      roughness: 0.55,
      metalness: 0,
      clearcoat: 0,
      clearcoatRoughness: 0.58,
      iridescence: 0,
      finish: "matte",
      flags: ["paper", "gift-box"],
    },
  },
  "folding-carton": {
    kind: "folding-carton",
    label: "Folding carton",
    cameraDistance: 4,
    categoryTheme: {
      baseColor: "#f5f3ee",
      tintColor: "#fffdf8",
      accentColor: "#6b7280",
      roughness: 0.55,
      metalness: 0,
      clearcoat: 0,
      clearcoatRoughness: 0.5,
      iridescence: 0,
      finish: "matte",
      flags: ["paper", "hinged"],
    },
  },
  "rigid-lid-box": {
    kind: "rigid-lid-box",
    label: "Rigid lid-and-base box",
    cameraDistance: 4.2,
    categoryTheme: {
      baseColor: "#f1ede6",
      tintColor: "#fffaf0",
      accentColor: "#8b5e34",
      roughness: 0.55,
      metalness: 0,
      clearcoat: 0,
      clearcoatRoughness: 0.55,
      iridescence: 0,
      finish: "matte",
      flags: ["paper", "gift-box"],
    },
  },
  "mailer-envelope": {
    kind: "mailer-envelope",
    label: "Courier mailer envelope",
    cameraDistance: 4,
    categoryTheme: {
      baseColor: "#f3f4f6",
      tintColor: "#ffffff",
      accentColor: "#9ca3af",
      roughness: 0.38,
      metalness: 0,
      clearcoat: 0.25,
      clearcoatRoughness: 0.35,
      iridescence: 0,
      finish: "glossy",
      flags: ["wrapped"],
    },
  },
  // Paan boxes: a tall three-sided pyramid on a triangular base, in white carton board.
  "pyramid-box": {
    kind: "pyramid-box",
    label: "Pyramid box",
    cameraDistance: 4.2,
    categoryTheme: {
      baseColor: "#f5f3ee",
      tintColor: "#fffdf8",
      accentColor: "#6b7280",
      roughness: 0.55,
      metalness: 0,
      clearcoat: 0,
      clearcoatRoughness: 0.5,
      iridescence: 0,
      finish: "matte",
      flags: ["paper", "hinged"],
    },
  },
  "mailer-box": {
    kind: "mailer-box",
    label: "Mailer box",
    cameraDistance: 4.2,
    categoryTheme: {
      baseColor: "#cda875",
      tintColor: "#ead7b8",
      accentColor: "#765337",
      roughness: 0.82,
      metalness: 0,
      clearcoat: 0,
      clearcoatRoughness: 0.74,
      iridescence: 0,
      finish: "matte",
      flags: ["paper", "hinged"],
    },
  },
  "paper-bag": {
    kind: "paper-bag",
    label: "Paper shopping bag",
    cameraDistance: 4.2,
    categoryTheme: {
      baseColor: "#d7b784",
      tintColor: "#f2e2c5",
      accentColor: "#725237",
      roughness: 0.84,
      metalness: 0,
      clearcoat: 0.03,
      clearcoatRoughness: 0.78,
      iridescence: 0,
      finish: "matte",
      flags: ["paper"],
    },
  },
  "stand-up-pouch": {
    kind: "stand-up-pouch",
    label: "Stand-up pouch",
    cameraDistance: 4,
    categoryTheme: {
      baseColor: "#ece8df",
      tintColor: "#fffdf8",
      accentColor: "#475569",
      roughness: 0.32,
      metalness: 0.04,
      clearcoat: 0.62,
      clearcoatRoughness: 0.22,
      iridescence: 0.03,
      finish: "glossy",
      flags: ["wrapped"],
    },
  },
  "product-sleeve": {
    kind: "product-sleeve",
    label: "Printed product sleeve",
    cameraDistance: 4,
    categoryTheme: {
      baseColor: "#f3efe7",
      tintColor: "#fffdf8",
      accentColor: "#475569",
      roughness: 0.68,
      metalness: 0,
      clearcoat: 0.16,
      clearcoatRoughness: 0.5,
      iridescence: 0,
      finish: "matte",
      flags: ["paper", "wrapped"],
    },
  },
} as const satisfies Record<PackagingProduct3DKind, Product3DProfile>;

export type Product3DCategorySlug = keyof typeof CATEGORY_3D_PROFILES;

const NAMED_COLORS: Readonly<Record<string, string>> = {
  amber: "#d97706",
  aqua: "#06b6d4",
  berry: "#be185d",
  champagne: "#d6b98c",
  coral: "#fb7185",
  forest: "#166534",
  lilac: "#c4b5fd",
  mango: "#f59e0b",
  midnight: "#172554",
  mint: "#6ee7b7",
  mixed: "#64748b",
  navy: "#17324d",
  ocean: "#0284c7",
  peach: "#fdba9a",
  rose: "#e11d48",
  sage: "#84a98c",
  silver: "#cbd5e1",
  sunshine: "#facc15",
  teal: "#0f766e",
};

function resolveColor(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  if (/^#[\da-f]{3,8}$/iu.test(normalized)) return normalized;
  return NAMED_COLORS[normalized];
}

function addFlags(
  current: readonly Product3DThemeFlag[],
  ...extra: Product3DThemeFlag[]
): Product3DThemeFlag[] {
  return [...new Set([...current, ...extra])];
}

function applyMaterialAndColors(
  categoryTheme: Product3DTheme,
  { materialName = "", colors = [] }: Product3DProfileOptions,
): Product3DTheme {
  const material = materialName.trim().toLowerCase();
  const resolvedColors = colors.map(resolveColor).filter((color): color is string => Boolean(color));
  let theme: Product3DTheme = {
    ...categoryTheme,
    flags: [...categoryTheme.flags],
    tintColor: resolvedColors[0] ?? categoryTheme.tintColor,
    accentColor: resolvedColors[1] ?? resolvedColors[0] ?? categoryTheme.accentColor,
  };

  if (/acrylic|resin/u.test(material)) {
    theme = {
      ...theme,
      roughness: Math.min(theme.roughness, 0.18),
      metalness: Math.min(theme.metalness, 0.05),
      clearcoat: Math.max(theme.clearcoat, 0.9),
      clearcoatRoughness: Math.min(theme.clearcoatRoughness, 0.12),
      finish: "acrylic",
      flags: addFlags(theme.flags, "acrylic", "translucent"),
    };
  } else if (/metallic|metal|steel|alumini?um|powder[- ]coat/u.test(material)) {
    theme = {
      ...theme,
      roughness: Math.min(theme.roughness, 0.34),
      metalness: Math.max(theme.metalness, 0.7),
      clearcoat: Math.max(theme.clearcoat, 0.35),
      finish: "metallic",
    };
  } else if (/gloss|waterproof|laminat/u.test(material)) {
    // Preserve the existing glossy/waterproof/laminated sheen heuristic.
    theme = {
      ...theme,
      roughness: Math.min(theme.roughness, 0.22),
      metalness: Math.max(theme.metalness, 0.08),
      clearcoat: Math.max(theme.clearcoat, 0.82),
      clearcoatRoughness: Math.min(theme.clearcoatRoughness, 0.16),
      finish: "glossy",
    };
  } else if (/wood|graphite/u.test(material)) {
    theme = {
      ...theme,
      roughness: Math.max(theme.roughness, 0.55),
      metalness: 0,
      finish: "wood",
      flags: addFlags(theme.flags, "wood"),
    };
  } else if (/matte|paper|card|carton|corrugated|kraft|vinyl|pouch/u.test(material)) {
    theme = {
      ...theme,
      roughness: Math.max(theme.roughness, 0.68),
      metalness: Math.min(theme.metalness, 0.02),
      clearcoat: Math.min(theme.clearcoat, 0.18),
      finish: "matte",
    };
  }

  return theme;
}

/** Named board stocks decide the colour of unprinted panels: the material is what ships. */
const BOARD_COLORS: ReadonlyArray<readonly [RegExp, string]> = [
  [/kraft|brown/u, "#c9a777"],
  [/black/u, "#23272e"],
  [/white|sbs|ivory|duplex|fbb|art[- ]?(?:card|paper|board)/u, "#f6f4ee"],
];

export function packagingBoardColor(materialName = ""): string | undefined {
  const material = materialName.trim().toLowerCase();
  return BOARD_COLORS.find(([pattern]) => pattern.test(material))?.[1];
}

/**
 * Shelf-level looks for packaging that shares a model with other shelves:
 * shipping cartons are rectangular boxes, but corrugated kraft with a tape seam.
 */
const PACKAGING_CATEGORY_OVERRIDES: Readonly<Record<string, {
  baseColor: string;
  roughness: number;
  flags: Product3DThemeFlag[];
}>> = {
  "shipping-boxes": { baseColor: "#c49a6c", roughness: 0.86, flags: ["corrugated"] },
};

function applyPackagingMaterial(
  categoryTheme: Product3DTheme,
  { materialName = "", colors = [] }: Product3DProfileOptions,
): Product3DTheme {
  const material = materialName.trim().toLowerCase();
  const resolvedColors = colors.map(resolveColor).filter((color): color is string => Boolean(color));
  // Never a colour sampled from the product photo: that picks up its background.
  const board = packagingBoardColor(material);
  let theme: Product3DTheme = {
    ...categoryTheme,
    flags: [...categoryTheme.flags],
    tintColor: resolvedColors[0] ?? categoryTheme.tintColor,
    accentColor: resolvedColors[1] ?? resolvedColors[0] ?? categoryTheme.accentColor,
    ...(board ? { baseColor: board } : {}),
  };
  // Only gloss lamination earns a clearcoat; matte lamination stays satin board.
  if (/gloss/u.test(material)) {
    theme = { ...theme, roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.14, finish: "glossy" };
  } else if (/kraft|brown|corrugat/u.test(material)) {
    theme = { ...theme, roughness: Math.max(theme.roughness, 0.82), clearcoat: 0, finish: "matte" };
  }
  return theme;
}

function materializeProfile(
  profile: Product3DProfile,
  options: Product3DProfileOptions,
  categorySlug = "",
): Product3DProfile {
  if (!isPackagingProduct3DKind(profile.kind)) {
    return { ...profile, categoryTheme: applyMaterialAndColors(profile.categoryTheme, options) };
  }
  const override = PACKAGING_CATEGORY_OVERRIDES[categorySlug];
  const base = override
    ? {
        ...profile.categoryTheme,
        baseColor: override.baseColor,
        roughness: override.roughness,
        clearcoat: 0,
        flags: addFlags(profile.categoryTheme.flags, ...override.flags),
      }
    : profile.categoryTheme;
  return { ...profile, categoryTheme: applyPackagingMaterial(base, options) };
}

const STRUCTURAL_FALLBACKS: ReadonlyArray<{
  pattern: RegExp;
  categorySlug: Product3DCategorySlug;
}> = [
  { pattern: /(?:^|[-_\s])geometry[-_\s]+box(?:$|[-_\s])/u, categorySlug: "school-accessories" },
  { pattern: /(?:^|[-_\s])(?:keychains?|name[-_\s]+plates?)(?:$|[-_\s])/u, categorySlug: "name-plates-keychains" },
  { pattern: /(?:^|[-_\s])notebooks?(?:$|[-_\s])/u, categorySlug: "personalized-notebooks" },
  { pattern: /(?:^|[-_\s])(?:bottles?|tiffins?)(?:$|[-_\s])/u, categorySlug: "bottle-tiffin-labels" },
  { pattern: /(?:^|[-_\s])(?:pencils?|pens?)(?:$|[-_\s])/u, categorySlug: "personalized-pencils-pens" },
  { pattern: /(?:^|[-_\s])(?:school[-_\s]+kit|starter[-_\s]+school[-_\s]+kit)(?:$|[-_\s])/u, categorySlug: "school-labels" },
  { pattern: /(?:^|[-_\s])(?:waterproof|water[-_\s]+drop)(?:$|[-_\s])/u, categorySlug: "waterproof-stickers" },
  { pattern: /(?:^|[-_\s])gift[-_\s]+ribbon(?:$|[-_\s])/u, categorySlug: "personalized-gifts" },
  { pattern: /(?:^|[-_\s])(?:bulk|classroom)[-_\s]+(?:grid|label[-_\s]+grid)(?:$|[-_\s])/u, categorySlug: "bulk-orders" },
];

const LEGACY_TAG_PROFILE: Product3DProfile = {
  kind: "tag",
  label: "Bag tag",
  cameraDistance: 3.5,
  categoryTheme: {
    baseColor: "#dbeafe",
    tintColor: "#eff6ff",
    accentColor: "#1d4ed8",
    roughness: 0.42,
    metalness: 0.04,
    clearcoat: 0.45,
    clearcoatRoughness: 0.24,
    iridescence: 0,
    finish: "mixed",
    flags: [],
  },
};

export const PRODUCT_3D_MODEL_PROFILES = {
  "label-pack": CATEGORY_3D_PROFILES["customized-name-slips"],
  "waterproof-sheet": CATEGORY_3D_PROFILES["waterproof-stickers"],
  "school-kit": CATEGORY_3D_PROFILES["school-labels"],
  notebook: CATEGORY_3D_PROFILES["personalized-notebooks"],
  "bottle-label": CATEGORY_3D_PROFILES["bottle-tiffin-labels"],
  "pencil-set": CATEGORY_3D_PROFILES["personalized-pencils-pens"],
  tag: LEGACY_TAG_PROFILE,
  "geometry-box": CATEGORY_3D_PROFILES["school-accessories"],
  "gift-ribbon": CATEGORY_3D_PROFILES["personalized-gifts"],
  "keychain-duo": CATEGORY_3D_PROFILES["name-plates-keychains"],
  "bulk-grid": CATEGORY_3D_PROFILES["bulk-orders"],
  ...PACKAGING_3D_PROFILES,
} as const satisfies Record<Product3DKind, Product3DProfile>;

const PACKAGING_FALLBACKS: ReadonlyArray<{
  pattern: RegExp;
  kind: PackagingProduct3DKind;
}> = [
  { pattern: /(?:^|[-_\s])(?:courier|mailer|poly)[-_\s]+(?:bag|envelope)s?(?:$|[-_\s])/u, kind: "mailer-envelope" },
  { pattern: /(?:^|[-_\s])(?:pyramid|paan)[-_\s]+box(?:es)?(?:$|[-_\s])/u, kind: "pyramid-box" },
  { pattern: /(?:^|[-_\s])(?:rigid|hamper|lid[-_\s]+and[-_\s]+base)[-_\s]+box(?:$|[-_\s])/u, kind: "rigid-lid-box" },
  { pattern: /(?:^|[-_\s])square[-_\s]+(?:gift[-_\s]+)?box(?:$|[-_\s])/u, kind: "square-box" },
  { pattern: /(?:^|[-_\s])(?:mailer|mailing|shipping)[-_\s]+box(?:$|[-_\s])/u, kind: "mailer-box" },
  { pattern: /(?:^|[-_\s])(?:paper|shopping|carry)[-_\s]+bag(?:$|[-_\s])/u, kind: "paper-bag" },
  { pattern: /(?:^|[-_\s])(?:stand[-_\s]*up[-_\s]+)?(?:ziplock[-_\s]+)?pouch(?:$|[-_\s])/u, kind: "stand-up-pouch" },
  { pattern: /(?:^|[-_\s])(?:product[-_\s]+)?sleeve(?:$|[-_\s])/u, kind: "product-sleeve" },
  { pattern: /(?:^|[-_\s])(?:folding[-_\s]+carton|carton|soap[-_\s]+box|perfume[-_\s]+box|cosmetic[-_\s]+box)(?:$|[-_\s])/u, kind: "folding-carton" },
  { pattern: /(?:^|[-_\s])(?:rectangular[-_\s]+)?(?:cake[-_\s]+|gift[-_\s]+)?box(?:$|[-_\s])/u, kind: "rectangular-box" },
];

export function resolveProduct3DProfile(
  structuralDesign = "",
  productType = "",
  options: Product3DProfileOptions = {},
): Product3DProfile {
  const structuralKey = structuralDesign.trim().toLowerCase();
  const normalizedCategory = productType.trim().toLowerCase();
  const finish = (profile: Product3DProfile) => materializeProfile(profile, options, normalizedCategory);

  const explicitModel = PRODUCT_3D_MODEL_PROFILES[structuralKey as Product3DKind];
  if (explicitModel) return finish(explicitModel);

  if (normalizedCategory in CATEGORY_3D_PROFILES) {
    return finish(CATEGORY_3D_PROFILES[normalizedCategory as Product3DCategorySlug]);
  }

  const categoryModel = PRODUCT_3D_MODEL_PROFILES[normalizedCategory as Product3DKind];
  if (categoryModel) return finish(categoryModel);

  for (const fallback of STRUCTURAL_FALLBACKS) {
    if (fallback.pattern.test(structuralKey)) {
      return finish(CATEGORY_3D_PROFILES[fallback.categorySlug]);
    }
  }
  if (/(?:^|[-_\s])(?:backpack|tags?)(?:$|[-_\s])/u.test(structuralKey)) {
    return finish(LEGACY_TAG_PROFILE);
  }

  const packagingKey = `${structuralKey} ${normalizedCategory}`;
  for (const fallback of PACKAGING_FALLBACKS) {
    if (fallback.pattern.test(packagingKey)) {
      return finish(PRODUCT_3D_MODEL_PROFILES[fallback.kind]);
    }
  }

  return finish(CATEGORY_3D_PROFILES["customized-name-slips"]);
}
