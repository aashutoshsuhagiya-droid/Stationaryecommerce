export const EZPAC_FEATURE_BULLETS = [
  "custom-branding", "free-3d-studio", "moq-10", "doorstep-delivery",
  "shark-tank", "food-safe", "tamper-evident", "premium-card-stock",
  "custom-size", "no-designer-needed", "food-grade-lining", "thick-wall",
] as const;

export type EzpacFeatureBullet = (typeof EZPAC_FEATURE_BULLETS)[number];

export const EZPAC_FEATURE_BULLET_LABELS: Record<EzpacFeatureBullet, string> = {
  "custom-branding": "Custom branding & design",
  "free-3d-studio": "Free 3D design studio",
  "moq-10": "MOQ from 10 pieces",
  "doorstep-delivery": "Doorstep delivery",
  "shark-tank": "As seen on Shark Tank India",
  "food-safe": "Food-safe material",
  "tamper-evident": "Tamper-evident seal",
  "premium-card-stock": "Premium card stock",
  "custom-size": "Custom size & design",
  "no-designer-needed": "No designer needed",
  "food-grade-lining": "Food-grade inner lining",
  "thick-wall": "Thick-wall construction",
};

/** Export copy to closed-vocabulary key, case-insensitive substring match. */
export const EZPAC_BULLET_MATCHERS: ReadonlyArray<[
  EzpacFeatureBullet,
  readonly string[],
]> = [
  ["custom-branding", ["custom branding", "custom design"]],
  ["free-3d-studio", ["free 3d"]],
  ["moq-10", ["moq"]],
  ["doorstep-delivery", ["doorstep"]],
  ["shark-tank", ["shark tank"]],
  ["food-safe", ["food-safe", "food safe"]],
  ["tamper-evident", ["tamper"]],
  ["premium-card-stock", ["premium paper"]],
  ["custom-size", ["custom size"]],
  ["no-designer-needed", ["no designer"]],
  ["food-grade-lining", ["food-grade", "food grade"]],
  ["thick-wall", ["thick wall", "thick-wall"]],
];

/** The shared default set pre-checked in the generator when no export match applies. */
export const DEFAULT_EZPAC_BULLETS: readonly EzpacFeatureBullet[] = [
  "custom-branding", "free-3d-studio", "moq-10", "doorstep-delivery", "shark-tank",
];
