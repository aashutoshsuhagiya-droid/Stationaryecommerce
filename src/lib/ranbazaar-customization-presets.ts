import type {
  ArtworkEditPermissions,
  ArtworkGeometryPolicy,
  ArtworkImageMimeType,
  CustomizationOption,
  ProductArtworkPolicy,
} from "./types";

/** Form-only starters: no products, categories, prices, or automatic assignment. */
export type RanBazaarCustomizationStarterId =
  | "name-slips"
  | "pen-pencil"
  | "notebook"
  | "bottle-tiffin"
  | "bag-luggage-tag"
  | "t-shirt"
  | "name-plate"
  | "wrapping-paper-vinyl-poster";

export interface RanBazaarConfigurationFieldPreset {
  key: string;
  label: string;
  inputType: "text" | "select" | "color" | "number";
  required: boolean;
  placeholder?: string;
  helpText?: string;
  defaultValue?: string;
  minLength?: number;
  maxLength?: number;
  allowedPattern?: string;
  optionSource?: "fixed" | "admin_configured";
  options?: readonly CustomizationOption[];
}

interface PlacementPreset { x: number; y: number; width: number; height: number }

export interface RanBazaarCustomizationSurfacePreset {
  id: string;
  label: string;
  /** Editor-only ratio. Physical dimensions deliberately remain unset. */
  aspectRatio: number;
  printableInset: number;
  text: { maximumElements: number; permissions: ArtworkEditPermissions; placement: PlacementPreset; rotation: readonly [number, number] };
  image: { enabled: boolean; required: boolean; maximumElements: number; permissions: ArtworkEditPermissions; placement: PlacementPreset; allowCrop: boolean };
}

export interface RanBazaarCustomizationStarter {
  id: RanBazaarCustomizationStarterId;
  name: string;
  description: string;
  fields: readonly RanBazaarConfigurationFieldPreset[];
  surfaces: readonly RanBazaarCustomizationSurfacePreset[];
  maximumElements: number;
  artworkUpload: { enabled: boolean; acceptedMimeTypes: readonly ArtworkImageMimeType[] };
}

const TEXT_EDITABLE: ArtworkEditPermissions = {
  move: true, resize: true, rotate: true, color: true, font: true,
};
const IMAGE_EDITABLE: ArtworkEditPermissions = {
  move: true, resize: true, rotate: true, color: false, font: false,
};
const FIXED_TEXT: ArtworkEditPermissions = {
  move: false, resize: false, rotate: false, color: true, font: true,
};
const IMAGE_MIME_TYPES: readonly ArtworkImageMimeType[] = [
  "image/jpeg", "image/png", "image/webp",
];

function textField(
  key: string,
  label: string,
  maxLength: number,
  required = true,
): RanBazaarConfigurationFieldPreset {
  return { key, label, inputType: "text", required, maxLength };
}

function fontField(): RanBazaarConfigurationFieldPreset {
  return {
    key: "font", label: "Font", inputType: "select", required: true,
    optionSource: "fixed",
    options: [
      { id: "rounded", label: "Rounded", value: "rounded" },
      { id: "sans", label: "Sans", value: "sans" },
      { id: "serif", label: "Serif", value: "serif" },
    ],
  };
}

function adminSelect(key: string, label: string): RanBazaarConfigurationFieldPreset {
  return { key, label, inputType: "select", required: true, optionSource: "admin_configured" };
}

function surface(input: {
  id?: string;
  label?: string;
  aspectRatio: number;
  textMaximum: number;
  imageMaximum?: number;
  fixedText?: boolean;
  textPlacement?: PlacementPreset;
  imagePlacement?: PlacementPreset;
  printableInset?: number;
}): RanBazaarCustomizationSurfacePreset {
  const imageMaximum = input.imageMaximum ?? 0;
  return {
    id: input.id ?? "primary",
    label: input.label ?? "Primary print area",
    aspectRatio: input.aspectRatio,
    printableInset: input.printableInset ?? 0.08,
    text: {
      maximumElements: input.textMaximum,
      permissions: { ...(input.fixedText ? FIXED_TEXT : TEXT_EDITABLE) },
      placement: input.textPlacement ?? { x: 0.15, y: 0.38, width: 0.7, height: 0.2 },
      rotation: input.fixedText ? [0, 0] : [-180, 180],
    },
    image: {
      enabled: imageMaximum > 0,
      required: false,
      maximumElements: imageMaximum,
      permissions: { ...IMAGE_EDITABLE },
      placement: input.imagePlacement ?? { x: 0.25, y: 0.18, width: 0.5, height: 0.5 },
      allowCrop: true,
    },
  };
}

const STARTERS = [
  {
    id: "name-slips",
    name: "Name slips",
    description: "A compact name label with a font choice.",
    fields: [
      { ...textField("name", "Name", 40), placeholder: "Enter the name" },
      fontField(),
    ],
    surfaces: [surface({
      aspectRatio: 1.875,
      textMaximum: 3,
      textPlacement: { x: 0.08, y: 0.3, width: 0.84, height: 0.4 },
    })],
    maximumElements: 3,
    artworkUpload: { enabled: false, acceptedMimeTypes: [] },
  },
  {
    id: "pen-pencil",
    name: "Pen or pencil",
    description: "A short name locked to a narrow print area.",
    fields: [
      { ...textField("name", "Name", 18), placeholder: "Enter a short name" },
      fontField(),
    ],
    surfaces: [surface({
      aspectRatio: 5,
      textMaximum: 1,
      fixedText: true,
      printableInset: 0.06,
      textPlacement: { x: 0.06, y: 0.22, width: 0.88, height: 0.56 },
    })],
    maximumElements: 1,
    artworkUpload: { enabled: false, acceptedMimeTypes: [] },
  },
  {
    id: "notebook",
    name: "Notebook",
    description: "Name, optional subtitle, and optional artwork on a portrait cover.",
    fields: [
      { ...textField("name", "Name", 40), placeholder: "Enter the name" },
      { ...textField("subtitle", "Subtitle", 60, false), placeholder: "Optional subtitle" },
      fontField(),
    ],
    surfaces: [surface({
      aspectRatio: 0.7,
      textMaximum: 3,
      imageMaximum: 1,
      textPlacement: { x: 0.12, y: 0.62, width: 0.76, height: 0.2 },
      imagePlacement: { x: 0.2, y: 0.12, width: 0.6, height: 0.42 },
    })],
    maximumElements: 4,
    artworkUpload: { enabled: true, acceptedMimeTypes: IMAGE_MIME_TYPES },
  },
  {
    id: "bottle-tiffin",
    name: "Bottle or tiffin",
    description: "Name and optional artwork, with an admin-configured print surface.",
    fields: [
      { ...textField("name", "Name", 30), placeholder: "Enter the name" },
      fontField(),
      adminSelect("print-surface", "Print surface"),
    ],
    surfaces: [surface({ aspectRatio: 1.667, textMaximum: 2, imageMaximum: 1 })],
    maximumElements: 3,
    artworkUpload: { enabled: true, acceptedMimeTypes: IMAGE_MIME_TYPES },
  },
  {
    id: "bag-luggage-tag",
    name: "Bag or luggage tag",
    description: "Name, optional contact line, and optional artwork for a tag.",
    fields: [
      { ...textField("name", "Name", 30), placeholder: "Enter the name" },
      { ...textField("contact", "Contact detail", 80, false), placeholder: "Optional contact detail" },
      fontField(),
    ],
    surfaces: [surface({
      aspectRatio: 1.667,
      textMaximum: 3,
      imageMaximum: 1,
      textPlacement: { x: 0.1, y: 0.52, width: 0.8, height: 0.28 },
      imagePlacement: { x: 0.34, y: 0.12, width: 0.32, height: 0.32 },
    })],
    maximumElements: 4,
    artworkUpload: { enabled: true, acceptedMimeTypes: IMAGE_MIME_TYPES },
  },
  {
    id: "t-shirt",
    name: "T-shirt",
    description: "Optional text and artwork with admin-configured garment variants.",
    fields: [
      { ...textField("name", "Personalized text", 80, false), placeholder: "Optional text" },
      fontField(),
      adminSelect("garment-size", "Garment size"),
      adminSelect("garment-color", "Garment colour"),
    ],
    surfaces: [surface({
      aspectRatio: 0.833,
      textMaximum: 4,
      imageMaximum: 2,
      textPlacement: { x: 0.12, y: 0.68, width: 0.76, height: 0.16 },
      imagePlacement: { x: 0.18, y: 0.12, width: 0.64, height: 0.48 },
    })],
    maximumElements: 6,
    artworkUpload: { enabled: true, acceptedMimeTypes: IMAGE_MIME_TYPES },
  },
  {
    id: "name-plate",
    name: "Name plate",
    description: "One or two text lines with an admin-configured background style.",
    fields: [
      { ...textField("name", "Primary text", 60), placeholder: "Enter primary text" },
      { ...textField("line-2", "Second line", 80, false), placeholder: "Optional second line" },
      fontField(),
      adminSelect("background-style", "Background style"),
    ],
    surfaces: [surface({
      aspectRatio: 2.5,
      textMaximum: 3,
      textPlacement: { x: 0.08, y: 0.22, width: 0.84, height: 0.56 },
    })],
    maximumElements: 3,
    artworkUpload: { enabled: false, acceptedMimeTypes: [] },
  },
  {
    id: "wrapping-paper-vinyl-poster",
    name: "Wrapping paper or vinyl poster",
    description: "Flexible text and artwork for a square production surface.",
    fields: [
      { ...textField("name", "Artwork text", 120, false), placeholder: "Optional text" },
      fontField(),
      adminSelect("finished-size", "Finished size"),
    ],
    surfaces: [surface({ aspectRatio: 1, textMaximum: 4, imageMaximum: 2 })],
    maximumElements: 6,
    artworkUpload: { enabled: true, acceptedMimeTypes: IMAGE_MIME_TYPES },
  },
] as const satisfies readonly RanBazaarCustomizationStarter[];

function cloneStarter(starter: RanBazaarCustomizationStarter): RanBazaarCustomizationStarter {
  return {
    ...starter,
    fields: starter.fields.map((field) => ({
      ...field,
      options: field.options?.map((option) => ({ ...option })),
    })),
    surfaces: starter.surfaces.map((item) => ({
      ...item,
      text: {
        ...item.text,
        permissions: { ...item.text.permissions },
        placement: { ...item.text.placement },
        rotation: [...item.text.rotation] as [number, number],
      },
      image: {
        ...item.image,
        permissions: { ...item.image.permissions },
        placement: { ...item.image.placement },
      },
    })),
    artworkUpload: {
      ...starter.artworkUpload,
      acceptedMimeTypes: [...starter.artworkUpload.acceptedMimeTypes],
    },
  };
}

export function listRanBazaarCustomizationStarters(): RanBazaarCustomizationStarter[] {
  return STARTERS.map(cloneStarter);
}

export function getRanBazaarCustomizationStarter(
  id: string,
): RanBazaarCustomizationStarter | undefined {
  const starter = STARTERS.find((candidate) => candidate.id === id);
  return starter ? cloneStarter(starter) : undefined;
}

function clonePolicy(policy: ProductArtworkPolicy): ProductArtworkPolicy {
  return {
    ...policy,
    surfaces: policy.surfaces.map((item) => ({
      ...item,
      coordinateSpace: { ...item.coordinateSpace },
      printableBounds: { ...item.printableBounds },
      text: {
        ...item.text,
        permissions: { ...item.text.permissions },
        geometry: {
          ...item.text.geometry,
          default: { ...item.text.geometry.default },
        },
        allowedColors: [...item.text.allowedColors],
        allowedFontFamilies: [...item.text.allowedFontFamilies],
        allowedTextAlignments: item.text.allowedTextAlignments
          ? [...item.text.allowedTextAlignments]
          : undefined,
      },
      image: {
        ...item.image,
        permissions: { ...item.image.permissions },
        geometry: {
          ...item.image.geometry,
          default: { ...item.image.geometry.default },
        },
        allowedMimeTypes: [...item.image.allowedMimeTypes],
        allowedAspectRatios: [...item.image.allowedAspectRatios],
      },
    })),
  };
}

function dimensions(aspectRatio: number) {
  return aspectRatio >= 1
    ? { width: 600, height: Math.round(600 / aspectRatio) }
    : { width: Math.round(600 * aspectRatio), height: 600 };
}

function geometryPolicy(
  bounds: { x: number; y: number; width: number; height: number },
  placement: PlacementPreset,
  rotation: readonly [number, number],
): ArtworkGeometryPolicy {
  return {
    default: {
      x: bounds.x + bounds.width * placement.x,
      y: bounds.y + bounds.height * placement.y,
      width: bounds.width * placement.width,
      height: bounds.height * placement.height,
      rotation: 0,
    },
    minimumWidth: Math.min(20, bounds.width),
    maximumWidth: bounds.width,
    minimumHeight: Math.min(20, bounds.height),
    maximumHeight: bounds.height,
    minimumRotation: rotation[0],
    maximumRotation: rotation[1],
  };
}

function applySurfacePreset(
  current: ProductArtworkPolicy["surfaces"][number],
  preset: RanBazaarCustomizationSurfacePreset,
  acceptedMimeTypes: readonly ArtworkImageMimeType[],
): ProductArtworkPolicy["surfaces"][number] {
  const coordinateSpace = dimensions(preset.aspectRatio);
  const inset = Math.round(
    Math.min(coordinateSpace.width, coordinateSpace.height) * preset.printableInset,
  );
  const printableBounds = {
    x: inset,
    y: inset,
    width: coordinateSpace.width - inset * 2,
    height: coordinateSpace.height - inset * 2,
  };
  return {
    ...current,
    id: preset.id,
    label: preset.label,
    coordinateSpace,
    printableBounds,
    text: {
      ...current.text,
      enabled: preset.text.maximumElements > 0,
      maximumElements: preset.text.maximumElements,
      permissions: { ...preset.text.permissions },
      geometry: geometryPolicy(printableBounds, preset.text.placement, preset.text.rotation),
      defaultColor: "#17324d",
      allowedColors: ["#17324d", "#111418", "#c24a3a", "#ffffff"],
      defaultFontFamily: "rounded",
      allowedFontFamilies: ["rounded", "sans", "serif"],
    },
    image: {
      ...current.image,
      enabled: preset.image.enabled,
      required: preset.image.enabled && preset.image.required,
      maximumElements: preset.image.enabled ? preset.image.maximumElements : 0,
      permissions: { ...preset.image.permissions },
      geometry: geometryPolicy(printableBounds, preset.image.placement, [-180, 180]),
      allowedMimeTypes: preset.image.enabled ? [...acceptedMimeTypes] : [],
      maximumBytes: preset.image.enabled ? current.image.maximumBytes || 2_000_000 : 0,
      allowCrop: preset.image.allowCrop,
    },
  };
}

/**
 * Applies only personalization-policy defaults. Product identity, category, and
 * pricing are intentionally outside this pure helper.
 */
export function applyRanBazaarCustomizationStarterPolicy(
  basePolicy: ProductArtworkPolicy,
  starterId: string,
): ProductArtworkPolicy {
  const policy = clonePolicy(basePolicy);
  const starter = STARTERS.find((candidate) => candidate.id === starterId);
  if (!starter) return policy;

  const surfaces = starter.surfaces.flatMap((preset, index) => {
    const current = policy.surfaces.find((item) => item.id === preset.id)
      ?? policy.surfaces[index];
    return current
      ? [applySurfacePreset(current, preset, starter.artworkUpload.acceptedMimeTypes)]
      : [];
  });
  return {
    ...policy,
    maximumElements: starter.maximumElements,
    surfaces,
  };
}
