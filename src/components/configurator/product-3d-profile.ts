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
  | "bulk-grid";

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
  } else if (/matte|paper|card|vinyl/u.test(material)) {
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

function materializeProfile(
  profile: Product3DProfile,
  options: Product3DProfileOptions,
): Product3DProfile {
  return {
    ...profile,
    categoryTheme: applyMaterialAndColors(profile.categoryTheme, options),
  };
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

export function resolveProduct3DProfile(
  structuralDesign = "",
  productType = "",
  options: Product3DProfileOptions = {},
): Product3DProfile {
  const structuralKey = structuralDesign.trim().toLowerCase();
  const explicitModel = Object.values(CATEGORY_3D_PROFILES).find((profile) => profile.kind === structuralKey);
  if (explicitModel) return materializeProfile(explicitModel, options);

  const normalizedCategory = productType.trim().toLowerCase();
  if (normalizedCategory in CATEGORY_3D_PROFILES) {
    return materializeProfile(
      CATEGORY_3D_PROFILES[normalizedCategory as Product3DCategorySlug],
      options,
    );
  }

  for (const fallback of STRUCTURAL_FALLBACKS) {
    if (fallback.pattern.test(structuralKey)) {
      return materializeProfile(CATEGORY_3D_PROFILES[fallback.categorySlug], options);
    }
  }
  if (/(?:^|[-_\s])(?:backpack|tags?)(?:$|[-_\s])/u.test(structuralKey)) {
    return materializeProfile(LEGACY_TAG_PROFILE, options);
  }

  return materializeProfile(CATEGORY_3D_PROFILES["customized-name-slips"], options);
}
