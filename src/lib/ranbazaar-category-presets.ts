/**
 * RanBazaar navigation taxonomy mapped onto the existing catalog.
 *
 * This registry contains categories and one browsing entrypoint only. It never
 * defines, seeds or automatically assigns products. Administrators cross-list
 * verified products through ProductCategory links after import.
 */

export type RanBazaarCategoryGroupId =
  | "name-slips-labels"
  | "school-supplies-stationery"
  | "personalised-accessories"
  | "personalised-gifts-decorations"
  | "bulk-orders";

export interface RanBazaarReuseTarget {
  name: string;
  slug: string;
}

export type RanBazaarCategoryMapping =
  | {
      strategy: "reuse";
      /** Existing catalog identities to preserve, in priority order. */
      targets: readonly RanBazaarReuseTarget[];
      /** If none of the targets exist, create the exact RanBazaar category. */
      otherwise: "create";
    }
  | {
      strategy: "create";
      /** An exact name/slug match is still reused to keep imports idempotent. */
      reuseExactMatch: true;
    };

export interface RanBazaarCategoryPreset {
  kind: "category";
  id: string;
  name: string;
  slug: string;
  mapping: RanBazaarCategoryMapping;
  productHandling: "admin-cross-listed-products";
}

export interface RanBazaarEntrypointPreset {
  kind: "entrypoint";
  id: string;
  name: string;
  slug: string;
  href: "/bulk-orders";
  categoryPresetId: "bulk-orders";
  productHandling: "browse-existing-products";
}

export interface RanBazaarCategoryGroupPreset extends RanBazaarCategoryPreset {
  id: RanBazaarCategoryGroupId;
  children: readonly (RanBazaarCategoryPreset | RanBazaarEntrypointPreset)[];
}

const createCategory = (
  id: string,
  name: string,
  slug: string,
): RanBazaarCategoryPreset => ({
  kind: "category",
  id,
  name,
  slug,
  mapping: { strategy: "create", reuseExactMatch: true },
  productHandling: "admin-cross-listed-products",
});

const reuseCategory = (
  id: string,
  name: string,
  slug: string,
  ...targets: RanBazaarReuseTarget[]
): RanBazaarCategoryPreset => ({
  kind: "category",
  id,
  name,
  slug,
  mapping: { strategy: "reuse", targets, otherwise: "create" },
  productHandling: "admin-cross-listed-products",
});

const existing = (name: string, slug: string): RanBazaarReuseTarget => ({ name, slug });

export const RANBAZAAR_CATEGORY_PRESETS = [
  {
    ...createCategory("name-slips-labels", "Name Slips & Labels", "name-slips-labels"),
    id: "name-slips-labels",
    children: [
      createCategory("premium-name-slips", "Premium Name Slips", "premium-name-slips"),
      reuseCategory(
        "name-slips-customize",
        "Name Slips Customize",
        "name-slips-customize",
        existing("Customized Name Slips", "customized-name-slips"),
      ),
      reuseCategory(
        "waterproof-stickers",
        "Waterproof Stickers",
        "waterproof-stickers",
        existing("Waterproof Stickers", "waterproof-stickers"),
      ),
    ],
  },
  {
    ...createCategory(
      "school-supplies-stationery",
      "School Supplies & Stationery",
      "school-supplies-stationery",
    ),
    id: "school-supplies-stationery",
    children: [
      reuseCategory(
        "pen-pencil-custom",
        "Pen/Pencil Custom",
        "pen-pencil-custom",
        existing("Personalized Pencils & Pens", "personalized-pencils-pens"),
      ),
      createCategory("exam-board", "Exam Board", "exam-board"),
      reuseCategory(
        "note-books",
        "Note Books",
        "note-books",
        existing("Personalized Notebooks", "personalized-notebooks"),
      ),
      createCategory("geometry-box", "Geometry Box", "geometry-box"),
      reuseCategory(
        "kids-school-bag-kit",
        "Kids School Bag & Kit",
        "kids-school-bag-kit",
        existing("School Bags & Accessories", "school-accessories"),
      ),
      createCategory("kids-utilities", "Kids Utilities", "kids-utilities"),
      createCategory("tracing-name-board", "Tracing Name Board", "tracing-name-board"),
    ],
  },
  {
    ...createCategory(
      "personalised-accessories",
      "Personalised Accessories",
      "personalised-accessories",
    ),
    id: "personalised-accessories",
    children: [
      reuseCategory(
        "bag-luggage-tag",
        "Bag/Luggage Tag",
        "bag-luggage-tag",
        existing("School Bags & Accessories", "school-accessories"),
      ),
      createCategory("mouse-pad", "Mouse Pad", "mouse-pad"),
      createCategory(
        "kids-bottle-tiffin-box",
        "Kids Bottle & Tiffin Box",
        "kids-bottle-tiffin-box",
      ),
      createCategory("customize-bottles", "Customize Bottles", "customize-bottles"),
      createCategory(
        "customize-handkerchief",
        "Customize Handkerchief",
        "customize-handkerchief",
      ),
      reuseCategory(
        "key-chain",
        "Key Chain",
        "key-chain",
        existing("Name Plates & Keychains", "name-plates-keychains"),
      ),
    ],
  },
  {
    ...reuseCategory(
      "personalised-gifts-decorations",
      "Personalised Gifts & Decorations",
      "personalised-gifts-decorations",
      existing("Personalized Gifts", "personalized-gifts"),
    ),
    id: "personalised-gifts-decorations",
    children: [
      createCategory("decorative-items", "Decorative Items", "decorative-items"),
      createCategory("shagun-envelopes", "Shagun Envelopes", "shagun-envelopes"),
      createCategory("gift-slip-for-gifts", "Gift Slip for Gifts", "gift-slip-for-gifts"),
      reuseCategory(
        "name-plate",
        "Name Plate",
        "name-plate",
        existing("Name Plates & Keychains", "name-plates-keychains"),
      ),
      createCategory("vinyl-poster", "Vinyl Poster", "vinyl-poster"),
      createCategory("wrapping-paper", "Wrapping Paper", "wrapping-paper"),
      createCategory("t-shirts", "T-shirts", "t-shirts"),
      reuseCategory(
        "paper-bag",
        "Paper Bag",
        "paper-bag",
        existing("Paper Bags", "paper-bags"),
      ),
    ],
  },
  {
    ...reuseCategory(
      "bulk-orders",
      "Bulk Orders",
      "bulk-orders",
      existing("Bulk & Institutional Orders", "bulk-orders"),
    ),
    id: "bulk-orders",
    children: [
      {
        kind: "entrypoint",
        id: "bulk-buy",
        name: "Bulk Buy",
        slug: "bulk-buy",
        href: "/bulk-orders",
        categoryPresetId: "bulk-orders",
        productHandling: "browse-existing-products",
      },
    ],
  },
] as const satisfies readonly RanBazaarCategoryGroupPreset[];

export interface CatalogCategoryIdentity {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
}

const normalizedName = (value: string) => value.trim().toLocaleLowerCase("en-IN");

export function findRanBazaarCategoryMatch(
  preset: RanBazaarCategoryPreset,
  categories: readonly CatalogCategoryIdentity[],
): CatalogCategoryIdentity | undefined {
  const exactSlug = categories.find((category) => category.slug === preset.slug);
  if (exactSlug) return exactSlug;

  const exactName = categories.find(
    (category) => normalizedName(category.name) === normalizedName(preset.name),
  );
  if (exactName) return exactName;

  if (preset.mapping.strategy === "create") return undefined;
  for (const target of preset.mapping.targets) {
    const slugMatch = categories.find((category) => category.slug === target.slug);
    if (slugMatch) return slugMatch;
    const nameMatch = categories.find(
      (category) => normalizedName(category.name) === normalizedName(target.name),
    );
    if (nameMatch) return nameMatch;
  }
  return undefined;
}

export function getRanBazaarCategoryGroup(id: string) {
  return RANBAZAAR_CATEGORY_PRESETS.find((group) => group.id === id);
}

export function listRanBazaarCategoryGroups() {
  return RANBAZAAR_CATEGORY_PRESETS.map(({ id, name, slug }) => ({ id, name, slug }));
}

export function flattenRanBazaarTaxonomy() {
  return RANBAZAAR_CATEGORY_PRESETS.flatMap((group) => [group, ...group.children]);
}
