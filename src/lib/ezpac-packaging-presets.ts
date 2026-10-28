import type { CustomizationField, CustomizationOption } from "./types";

/**
 * Additive, non-persistent starter data for the packaging catalogue requested
 * by the business. It deliberately does not seed categories, products, prices,
 * material choices, or manufacturing capabilities. An administrator must map
 * these presets to the live catalogue and configure supported options first.
 *
 * The live category model supports one parent level, so every entry below is a
 * root category with direct subcategories only. Cross-listing is represented by
 * collection IDs rather than duplicate product-type records.
 */

export type PackagingFieldInputType = Extract<
  CustomizationField["type"],
  "text" | "select" | "color" | "number"
>;

export type PackagingFieldPresetId =
  | "generic-packaging"
  | "soap-box"
  | "business-card"
  | "flat-print"
  | "paper-bag"
  | "ziplock-pouch"
  | "brochure"
  | "courier-bag";

export interface EzpacPackagingSubcategoryPreset {
  id: string;
  slug: string;
  name: string;
}

export interface EzpacPackagingCategoryPreset {
  id: string;
  slug: string;
  name: string;
  subcategories: readonly EzpacPackagingSubcategoryPreset[];
}

export interface EzpacIndustryCollectionPreset {
  id: string;
  slug: string;
  name: string;
}

/**
 * Discovery collections remain separate identities from sellable catalogue
 * categories. Their persisted category slugs are prefixed so collections such
 * as Food Packaging cannot collide with the primary Food Packaging category.
 */
export const EZPAC_INDUSTRY_COLLECTION_PRESETS = [
  { id: "soap-packaging", slug: "soap-packaging", name: "Soap Packaging" },
  {
    id: "perfume-cosmetics-packaging",
    slug: "perfume-cosmetics-packaging",
    name: "Perfume / Cosmetics Packaging",
  },
  { id: "display-products", slug: "display-products", name: "Display Products" },
  {
    id: "e-commerce-packaging",
    slug: "e-commerce-packaging",
    name: "E-Commerce Packaging",
  },
  {
    id: "product-packaging",
    slug: "product-packaging",
    name: "Product Packaging",
  },
  { id: "food-packaging", slug: "food-packaging", name: "Food Packaging" },
  { id: "gift-packaging", slug: "gift-packaging", name: "Gift Packaging" },
  { id: "personal", slug: "personal", name: "Personal" },
  { id: "bakery", slug: "bakery", name: "Bakery" },
] as const satisfies readonly EzpacIndustryCollectionPreset[];

export function ezpacIndustryCollectionCategorySlug(collectionSlug: string) {
  return `collection-${collectionSlug}`;
}

export const EZPAC_INDUSTRY_COLLECTION_CATEGORY_PRESET = {
  id: "industry-collections",
  slug: "industry-collections",
  name: "Industry Collections",
  subcategories: EZPAC_INDUSTRY_COLLECTION_PRESETS.map((collection) => ({
    id: collection.id,
    slug: ezpacIndustryCollectionCategorySlug(collection.slug),
    name: collection.name,
  })),
} as const satisfies EzpacPackagingCategoryPreset;

export interface EzpacPackagingProductTypePreset {
  id: string;
  slug: string;
  name: string;
  /** The one category relationship to persist when the current model permits one. */
  primaryCategoryId: string;
  primarySubcategoryId: string;
  /** Discovery collections only; do not create duplicate product records for these. */
  collectionIds: readonly string[];
  fieldPresetId: PackagingFieldPresetId;
}

export interface PackagingConfigurationFieldPreset {
  key: string;
  label: string;
  inputType: PackagingFieldInputType;
  required: boolean;
  placeholder?: string;
  helpText?: string;
  minLength?: number;
  maxLength?: number;
  minValue?: number;
  maxValue?: number;
  step?: number;
  allowedPattern?: string;
  /**
   * "admin_configured" fields intentionally carry no values. This prevents a
   * starter preset from claiming that a printer supports a material, finish or
   * process before the Super Admin confirms it.
   */
  optionSource?: "fixed" | "admin_configured";
  options?: readonly CustomizationOption[];
}

export interface EzpacPackagingFieldPreset {
  id: PackagingFieldPresetId;
  label: string;
  fields: readonly PackagingConfigurationFieldPreset[];
}

const option = (id: string, label: string, value = id): CustomizationOption => ({
  id,
  label,
  value,
});

const adminSelect = (
  key: string,
  label: string,
  required = false,
  helpText?: string,
): PackagingConfigurationFieldPreset => ({
  key,
  label,
  inputType: "select",
  required,
  optionSource: "admin_configured",
  ...(helpText ? { helpText } : {}),
});

const dimension = (
  key: string,
  label: string,
  required = true,
): PackagingConfigurationFieldPreset => ({
  key,
  label,
  inputType: "number",
  required,
  minValue: 0.1,
  step: 0.1,
  helpText: "Enter the approved finished dimension.",
});

const dimensionUnit: PackagingConfigurationFieldPreset = {
  key: "dimension-unit",
  label: "Dimension unit",
  inputType: "select",
  required: true,
  optionSource: "fixed",
  options: [
    option("mm", "Millimetres (mm)"),
    option("cm", "Centimetres (cm)"),
    option("in", "Inches (in)"),
  ],
};

const gsm = (label = "GSM / board thickness"): PackagingConfigurationFieldPreset => ({
  key: "gsm-board-thickness",
  label,
  inputType: "number",
  required: false,
  minValue: 0,
  step: 1,
  helpText: "Configure the supported range before publishing this product.",
});

const printingSides: PackagingConfigurationFieldPreset = {
  key: "printing-sides",
  label: "Printing sides",
  inputType: "select",
  required: false,
  optionSource: "fixed",
  options: [
    option("single-sided", "Single-sided"),
    option("double-sided", "Double-sided"),
  ],
};

const material = () =>
  adminSelect(
    "material",
    "Material",
    true,
    "Add only materials the assigned production workflow supports.",
  );

const printingType = () => adminSelect("printing-type", "Printing type");
const printColours = () => adminSelect("print-colours", "Print colours");
const lamination = () => adminSelect("lamination", "Lamination");
const finishing = () => adminSelect("finishing", "Finishing");

/**
 * Root categories and direct subcategories only. These are starter mappings,
 * not a request to automatically create records in a production database.
 */
export const EZPAC_PACKAGING_CATEGORY_PRESETS = [
  {
    id: "boxes",
    slug: "boxes",
    name: "Boxes",
    subcategories: [
      { id: "soap-boxes", slug: "soap-boxes", name: "Soap Boxes" },
      {
        id: "perfume-cosmetic-boxes",
        slug: "perfume-cosmetic-boxes",
        name: "Perfume & Cosmetic Boxes",
      },
      {
        id: "specialty-boxes",
        slug: "specialty-boxes",
        name: "Specialty Boxes",
      },
      {
        id: "gift-event-boxes",
        slug: "gift-event-boxes",
        name: "Gift & Event Boxes",
      },
    ],
  },
  {
    id: "e-commerce-packaging",
    slug: "e-commerce-packaging",
    name: "E-Commerce Packaging",
    subcategories: [
      { id: "mailer-bags", slug: "mailer-bags", name: "Mailer Bags" },
      {
        id: "shipping-boxes",
        slug: "shipping-boxes",
        name: "Shipping Boxes",
      },
      {
        id: "printed-inserts",
        slug: "printed-inserts",
        name: "Printed Inserts",
      },
    ],
  },
  {
    id: "paper-bags",
    slug: "paper-bags",
    name: "Paper Bags",
    subcategories: [
      {
        id: "branded-carry-bags",
        slug: "branded-carry-bags",
        name: "Branded Carry Bags",
      },
      { id: "d-cut-paper-bags", slug: "d-cut-paper-bags", name: "D-Cut Paper Bags" },
    ],
  },
  {
    id: "ziplock-pouch",
    slug: "ziplock-pouch",
    name: "Ziplock Pouch",
    subcategories: [
      {
        id: "branded-ziplock-pouches",
        slug: "branded-ziplock-pouches",
        name: "Branded Ziplock Pouches",
      },
    ],
  },
  {
    id: "marketing-printing",
    slug: "marketing-printing",
    name: "Marketing & Printing",
    subcategories: [
      { id: "business-cards", slug: "business-cards", name: "Business Cards" },
      { id: "flyers-brochures", slug: "flyers-brochures", name: "Flyers & Brochures" },
      {
        id: "thank-you-hang-tags",
        slug: "thank-you-hang-tags",
        name: "Thank You Cards & Hang Tags",
      },
      { id: "stickers", slug: "stickers", name: "Stickers" },
    ],
  },
  {
    id: "food-packaging",
    slug: "food-packaging",
    name: "Food Packaging",
    subcategories: [
      {
        id: "food-trays-delivery",
        slug: "food-trays-delivery",
        name: "Food Trays & Delivery",
      },
      {
        id: "snack-confectionery-boxes",
        slug: "snack-confectionery-boxes",
        name: "Snack & Confectionery Boxes",
      },
      {
        id: "food-pouches",
        slug: "food-pouches",
        name: "Food Pouches",
      },
    ],
  },
  EZPAC_INDUSTRY_COLLECTION_CATEGORY_PRESET,
] as const satisfies readonly EzpacPackagingCategoryPreset[];

/**
 * Reusable customer/configuration fields. Selects marked `admin_configured`
 * contain no options by design; their options and any price impact must be
 * explicitly confirmed by the Super Admin before being exposed to customers.
 */
export const EZPAC_PACKAGING_FIELD_PRESETS = [
  {
    id: "generic-packaging",
    label: "Generic packaging",
    fields: [
      dimension("length", "Length"),
      dimension("width", "Width"),
      dimension("height", "Height"),
      dimensionUnit,
      material(),
      printingType(),
      printingSides,
      printColours(),
      finishing(),
    ],
  },
  {
    id: "soap-box",
    label: "Soap Box",
    fields: [
      dimension("length", "Length"),
      dimension("width", "Width"),
      dimension("height", "Height"),
      dimensionUnit,
      material(),
      gsm(),
      adminSelect("box-construction", "Box construction"),
      printingType(),
      printingSides,
      printColours(),
      lamination(),
      finishing(),
      adminSelect("insert-holder", "Insert / holder"),
      adminSelect("window-option", "Window option"),
    ],
  },
  {
    id: "business-card",
    label: "Business Card",
    fields: [
      adminSelect("card-size", "Card size", true),
      adminSelect("paper-type", "Paper type", true),
      gsm("GSM"),
      {
        key: "orientation",
        label: "Orientation",
        inputType: "select",
        required: false,
        optionSource: "fixed",
        options: [option("portrait", "Portrait"), option("landscape", "Landscape")],
      },
      printingSides,
      printColours(),
      finishing(),
      adminSelect("rounded-corners", "Rounded corners"),
      adminSelect("foil-spot-uv", "Foil / Spot UV"),
    ],
  },
  {
    id: "flat-print",
    label: "Flat print",
    fields: [
      dimension("flat-width", "Flat width"),
      dimension("flat-height", "Flat height"),
      dimensionUnit,
      adminSelect("paper-material", "Paper / material", true),
      gsm("GSM / material thickness"),
      printingType(),
      printingSides,
      printColours(),
      finishing(),
    ],
  },
  {
    id: "paper-bag",
    label: "Paper Bag",
    fields: [
      dimension("bag-width", "Bag width"),
      dimension("bag-height", "Bag height"),
      dimension("gusset", "Gusset", false),
      dimensionUnit,
      adminSelect("paper-type", "Paper type", true),
      gsm("GSM"),
      adminSelect("handle-type", "Handle type"),
      adminSelect("handle-colour", "Handle colour"),
      printingSides,
      lamination(),
      adminSelect("reinforced-bottom", "Reinforced bottom"),
    ],
  },
  {
    id: "ziplock-pouch",
    label: "Ziplock Pouch",
    fields: [
      dimension("pouch-width", "Pouch width"),
      dimension("pouch-height", "Pouch height"),
      dimension("gusset", "Gusset", false),
      dimensionUnit,
      material(),
      {
        key: "material-thickness",
        label: "Material thickness",
        inputType: "number",
        required: false,
        minValue: 0,
        step: 0.01,
      },
      {
        key: "capacity",
        label: "Capacity",
        inputType: "text",
        required: false,
        placeholder: "Set the approved capacity unit and value",
      },
      adminSelect("ziplock-option", "Ziplock option"),
      adminSelect("tear-notch", "Tear notch"),
      adminSelect("transparent-window", "Transparent window"),
      printingType(),
      finishing(),
    ],
  },
  {
    id: "brochure",
    label: "Brochure",
    fields: [
      dimension("flat-width", "Flat width"),
      dimension("flat-height", "Flat height"),
      dimension("finished-width", "Finished width"),
      dimension("finished-height", "Finished height"),
      dimensionUnit,
      adminSelect("paper-type", "Paper type", true),
      gsm("GSM"),
      {
        key: "number-of-panels",
        label: "Number of panels",
        inputType: "number",
        required: true,
        minValue: 1,
        step: 1,
      },
      adminSelect("fold-type", "Fold type"),
      printingSides,
      printColours(),
      lamination(),
    ],
  },
  {
    id: "courier-bag",
    label: "Courier Bag",
    fields: [
      dimension("width", "Width"),
      dimension("height", "Height"),
      dimension("flap-size", "Flap size", false),
      dimensionUnit,
      material(),
      {
        key: "thickness",
        label: "Thickness",
        inputType: "number",
        required: false,
        minValue: 0,
        step: 0.01,
      },
      adminSelect("adhesive-type", "Adhesive type"),
      adminSelect("tamper-evident-seal", "Tamper-evident seal"),
      printingType(),
    ],
  },
] as const satisfies readonly EzpacPackagingFieldPreset[];

/**
 * One product type per requested item. Products that should be discoverable in
 * more than one place carry collection IDs rather than duplicate definitions.
 */
export const EZPAC_PACKAGING_PRODUCT_TYPE_PRESETS = [
  {
    id: "soap-box",
    slug: "soap-box",
    name: "Soap Box",
    primaryCategoryId: "boxes",
    primarySubcategoryId: "soap-boxes",
    collectionIds: ["soap-packaging", "product-packaging"],
    fieldPresetId: "soap-box",
  },
  {
    id: "soap-pillow-box",
    slug: "soap-pillow-box",
    name: "Soap Pillow Box",
    primaryCategoryId: "boxes",
    primarySubcategoryId: "soap-boxes",
    collectionIds: ["soap-packaging", "product-packaging"],
    fieldPresetId: "soap-box",
  },
  {
    id: "perfume-box",
    slug: "perfume-box",
    name: "Perfume Box",
    primaryCategoryId: "boxes",
    primarySubcategoryId: "perfume-cosmetic-boxes",
    collectionIds: ["perfume-cosmetics-packaging", "product-packaging"],
    fieldPresetId: "generic-packaging",
  },
  {
    id: "cosmetic-beauty-brand-box",
    slug: "cosmetic-beauty-brand-box",
    name: "Cosmetic / Beauty Brand Box",
    primaryCategoryId: "boxes",
    primarySubcategoryId: "perfume-cosmetic-boxes",
    collectionIds: ["perfume-cosmetics-packaging", "product-packaging"],
    fieldPresetId: "generic-packaging",
  },
  {
    id: "cosmetic-beauty-box-with-inside-holder",
    slug: "cosmetic-beauty-box-with-inside-holder",
    name: "Cosmetic / Beauty Box with Inside Holder",
    primaryCategoryId: "boxes",
    primarySubcategoryId: "perfume-cosmetic-boxes",
    collectionIds: ["perfume-cosmetics-packaging", "product-packaging"],
    fieldPresetId: "soap-box",
  },
  {
    id: "window-box",
    slug: "window-box",
    name: "Window Box",
    primaryCategoryId: "boxes",
    primarySubcategoryId: "specialty-boxes",
    collectionIds: ["display-products", "product-packaging"],
    fieldPresetId: "soap-box",
  },
  {
    id: "hanging-box",
    slug: "hanging-box",
    name: "Hanging Box",
    primaryCategoryId: "boxes",
    primarySubcategoryId: "specialty-boxes",
    collectionIds: ["display-products", "product-packaging"],
    fieldPresetId: "generic-packaging",
  },
  {
    id: "middle-hanging-box",
    slug: "middle-hanging-box",
    name: "Middle Hanging Box",
    primaryCategoryId: "boxes",
    primarySubcategoryId: "specialty-boxes",
    collectionIds: ["display-products", "product-packaging"],
    fieldPresetId: "generic-packaging",
  },
  {
    id: "sachet-box",
    slug: "sachet-box",
    name: "Sachet Box",
    primaryCategoryId: "boxes",
    primarySubcategoryId: "specialty-boxes",
    collectionIds: ["product-packaging"],
    fieldPresetId: "generic-packaging",
  },
  {
    id: "square-box",
    slug: "square-box",
    name: "Square Box",
    primaryCategoryId: "boxes",
    primarySubcategoryId: "specialty-boxes",
    collectionIds: ["product-packaging"],
    fieldPresetId: "generic-packaging",
  },
  {
    id: "slider-box-thick-wall",
    slug: "slider-box-thick-wall",
    name: "Slider Box — Thick Wall",
    primaryCategoryId: "boxes",
    primarySubcategoryId: "specialty-boxes",
    collectionIds: ["product-packaging", "gift-packaging"],
    fieldPresetId: "generic-packaging",
  },
  {
    id: "slider-box-thin-wall",
    slug: "slider-box-thin-wall",
    name: "Slider Box — Thin Wall",
    primaryCategoryId: "boxes",
    primarySubcategoryId: "specialty-boxes",
    collectionIds: ["product-packaging", "gift-packaging"],
    fieldPresetId: "generic-packaging",
  },
  {
    id: "pillow-box",
    slug: "pillow-box",
    name: "Pillow Box",
    primaryCategoryId: "boxes",
    primarySubcategoryId: "specialty-boxes",
    collectionIds: ["product-packaging", "gift-packaging"],
    fieldPresetId: "generic-packaging",
  },
  {
    id: "mobile-cover-box",
    slug: "mobile-cover-box",
    name: "Mobile Cover Box",
    primaryCategoryId: "boxes",
    primarySubcategoryId: "specialty-boxes",
    collectionIds: ["product-packaging"],
    fieldPresetId: "generic-packaging",
  },
  {
    id: "pen-set-box",
    slug: "pen-set-box",
    name: "Pen Set Box",
    primaryCategoryId: "boxes",
    primarySubcategoryId: "specialty-boxes",
    collectionIds: ["gift-packaging", "product-packaging"],
    fieldPresetId: "generic-packaging",
  },
  {
    id: "tissue-paper-box",
    slug: "tissue-paper-box",
    name: "Tissue Paper Box",
    primaryCategoryId: "boxes",
    primarySubcategoryId: "specialty-boxes",
    collectionIds: ["product-packaging"],
    fieldPresetId: "generic-packaging",
  },
  {
    id: "side-open-box",
    slug: "side-open-box",
    name: "Side Open Box",
    primaryCategoryId: "boxes",
    primarySubcategoryId: "specialty-boxes",
    collectionIds: ["product-packaging"],
    fieldPresetId: "generic-packaging",
  },
  {
    id: "zipper-box",
    slug: "zipper-box",
    name: "Zipper Box",
    primaryCategoryId: "boxes",
    primarySubcategoryId: "specialty-boxes",
    collectionIds: ["e-commerce-packaging", "product-packaging"],
    fieldPresetId: "generic-packaging",
  },
  {
    id: "unboxing-experience-box",
    slug: "unboxing-experience-box",
    name: "Unboxing Experience Box",
    primaryCategoryId: "boxes",
    primarySubcategoryId: "gift-event-boxes",
    collectionIds: ["e-commerce-packaging", "gift-packaging", "product-packaging"],
    fieldPresetId: "generic-packaging",
  },
  {
    id: "gift-box",
    slug: "gift-box",
    name: "Gift Box",
    primaryCategoryId: "boxes",
    primarySubcategoryId: "gift-event-boxes",
    collectionIds: ["gift-packaging"],
    fieldPresetId: "generic-packaging",
  },
  {
    id: "gift-box-with-window",
    slug: "gift-box-with-window",
    name: "Gift Box with Window",
    primaryCategoryId: "boxes",
    primarySubcategoryId: "gift-event-boxes",
    collectionIds: ["gift-packaging"],
    fieldPresetId: "soap-box",
  },
  {
    id: "pooja-box",
    slug: "pooja-box",
    name: "Pooja Box",
    primaryCategoryId: "boxes",
    primarySubcategoryId: "gift-event-boxes",
    collectionIds: ["gift-packaging", "personal"],
    fieldPresetId: "generic-packaging",
  },
  {
    id: "flower-box",
    slug: "flower-box",
    name: "Flower Box",
    primaryCategoryId: "boxes",
    primarySubcategoryId: "gift-event-boxes",
    collectionIds: ["gift-packaging", "personal"],
    fieldPresetId: "generic-packaging",
  },
  {
    id: "d2c-mailer-bag",
    slug: "d2c-mailer-bag",
    name: "D2C Mailer Bag",
    primaryCategoryId: "e-commerce-packaging",
    primarySubcategoryId: "mailer-bags",
    collectionIds: ["e-commerce-packaging"],
    fieldPresetId: "courier-bag",
  },
  {
    id: "parcel-bag",
    slug: "parcel-bag",
    name: "Parcel Bag",
    primaryCategoryId: "e-commerce-packaging",
    primarySubcategoryId: "mailer-bags",
    collectionIds: ["e-commerce-packaging"],
    fieldPresetId: "courier-bag",
  },
  {
    id: "e-commerce-mailers",
    slug: "e-commerce-mailers",
    name: "E-commerce Mailers",
    primaryCategoryId: "e-commerce-packaging",
    primarySubcategoryId: "mailer-bags",
    collectionIds: ["e-commerce-packaging"],
    fieldPresetId: "courier-bag",
  },
  {
    id: "courier-bags",
    slug: "courier-bags",
    name: "Courier Bags",
    primaryCategoryId: "e-commerce-packaging",
    primarySubcategoryId: "mailer-bags",
    collectionIds: ["e-commerce-packaging"],
    fieldPresetId: "courier-bag",
  },
  {
    id: "custom-branded-laminated-carry-bag",
    slug: "custom-branded-laminated-carry-bag",
    name: "Custom Branded Laminated Carry Bag",
    primaryCategoryId: "paper-bags",
    primarySubcategoryId: "branded-carry-bags",
    collectionIds: ["product-packaging", "personal"],
    fieldPresetId: "paper-bag",
  },
  {
    id: "d-cut-paper-bag",
    slug: "d-cut-paper-bag",
    name: "D-Cut Paper Bag",
    primaryCategoryId: "paper-bags",
    primarySubcategoryId: "d-cut-paper-bags",
    collectionIds: ["product-packaging", "personal"],
    fieldPresetId: "paper-bag",
  },
  {
    id: "brand-ziplock-pouch",
    slug: "brand-ziplock-pouch",
    name: "Brand Ziplock Pouch",
    primaryCategoryId: "ziplock-pouch",
    primarySubcategoryId: "branded-ziplock-pouches",
    collectionIds: ["food-packaging", "product-packaging"],
    fieldPresetId: "ziplock-pouch",
  },
  {
    id: "business-card",
    slug: "business-card",
    name: "Business Card",
    primaryCategoryId: "marketing-printing",
    primarySubcategoryId: "business-cards",
    collectionIds: ["e-commerce-packaging", "personal"],
    fieldPresetId: "business-card",
  },
  {
    id: "folded-business-card",
    slug: "folded-business-card",
    name: "Folded Business Card",
    primaryCategoryId: "marketing-printing",
    primarySubcategoryId: "business-cards",
    collectionIds: ["e-commerce-packaging", "personal"],
    fieldPresetId: "business-card",
  },
  {
    id: "a4-flyer",
    slug: "a4-flyer",
    name: "A4 Flyer",
    primaryCategoryId: "marketing-printing",
    primarySubcategoryId: "flyers-brochures",
    collectionIds: ["personal"],
    fieldPresetId: "flat-print",
  },
  {
    id: "z-fold-brochure",
    slug: "z-fold-brochure",
    name: "Z Fold Brochure",
    primaryCategoryId: "marketing-printing",
    primarySubcategoryId: "flyers-brochures",
    collectionIds: ["personal"],
    fieldPresetId: "brochure",
  },
  {
    id: "tri-fold-brochure",
    slug: "tri-fold-brochure",
    name: "Tri Fold Brochure",
    primaryCategoryId: "marketing-printing",
    primarySubcategoryId: "flyers-brochures",
    collectionIds: ["personal"],
    fieldPresetId: "brochure",
  },
  {
    id: "four-fold-brochure",
    slug: "four-fold-brochure",
    name: "Four Fold Brochure",
    primaryCategoryId: "marketing-printing",
    primarySubcategoryId: "flyers-brochures",
    collectionIds: ["personal"],
    fieldPresetId: "brochure",
  },
  {
    id: "thank-you-card",
    slug: "thank-you-card",
    name: "Thank You Card",
    primaryCategoryId: "marketing-printing",
    primarySubcategoryId: "thank-you-hang-tags",
    collectionIds: ["e-commerce-packaging", "personal"],
    fieldPresetId: "business-card",
  },
  {
    id: "folded-thank-you-card",
    slug: "folded-thank-you-card",
    name: "Folded Thank You Card",
    primaryCategoryId: "marketing-printing",
    primarySubcategoryId: "thank-you-hang-tags",
    collectionIds: ["e-commerce-packaging", "personal"],
    fieldPresetId: "business-card",
  },
  {
    id: "oval-thank-you-card",
    slug: "oval-thank-you-card",
    name: "Oval Thank You Card",
    primaryCategoryId: "marketing-printing",
    primarySubcategoryId: "thank-you-hang-tags",
    collectionIds: ["e-commerce-packaging", "personal"],
    fieldPresetId: "business-card",
  },
  {
    id: "hang-tags",
    slug: "hang-tags",
    name: "Hang Tags",
    primaryCategoryId: "marketing-printing",
    primarySubcategoryId: "thank-you-hang-tags",
    collectionIds: ["e-commerce-packaging", "personal"],
    fieldPresetId: "flat-print",
  },
  {
    id: "stickers",
    slug: "stickers",
    name: "Stickers",
    primaryCategoryId: "marketing-printing",
    primarySubcategoryId: "stickers",
    collectionIds: ["e-commerce-packaging", "personal"],
    fieldPresetId: "flat-print",
  },
  {
    id: "rectangle-stickers",
    slug: "rectangle-stickers",
    name: "Rectangle Stickers",
    primaryCategoryId: "marketing-printing",
    primarySubcategoryId: "stickers",
    collectionIds: ["e-commerce-packaging", "personal"],
    fieldPresetId: "flat-print",
  },
  {
    id: "square-stickers",
    slug: "square-stickers",
    name: "Square Stickers",
    primaryCategoryId: "marketing-printing",
    primarySubcategoryId: "stickers",
    collectionIds: ["e-commerce-packaging", "personal"],
    fieldPresetId: "flat-print",
  },
  {
    id: "food-tray",
    slug: "food-tray",
    name: "Food Tray",
    primaryCategoryId: "food-packaging",
    primarySubcategoryId: "food-trays-delivery",
    collectionIds: ["food-packaging"],
    fieldPresetId: "generic-packaging",
  },
  {
    id: "food-delivery-box",
    slug: "food-delivery-box",
    name: "Food Delivery Box",
    primaryCategoryId: "food-packaging",
    primarySubcategoryId: "food-trays-delivery",
    collectionIds: ["food-packaging", "product-packaging"],
    fieldPresetId: "generic-packaging",
  },
  {
    id: "food-parcel-box",
    slug: "food-parcel-box",
    name: "Food Parcel Box",
    primaryCategoryId: "food-packaging",
    primarySubcategoryId: "food-trays-delivery",
    collectionIds: ["food-packaging", "product-packaging"],
    fieldPresetId: "generic-packaging",
  },
  {
    id: "snack-box",
    slug: "snack-box",
    name: "Snack Box",
    primaryCategoryId: "food-packaging",
    primarySubcategoryId: "snack-confectionery-boxes",
    collectionIds: ["food-packaging"],
    fieldPresetId: "generic-packaging",
  },
  {
    id: "popcorn-box",
    slug: "popcorn-box",
    name: "Popcorn Box",
    primaryCategoryId: "food-packaging",
    primarySubcategoryId: "snack-confectionery-boxes",
    collectionIds: ["food-packaging"],
    fieldPresetId: "generic-packaging",
  },
  {
    id: "paan-box",
    slug: "paan-box",
    name: "Paan Box",
    primaryCategoryId: "food-packaging",
    primarySubcategoryId: "snack-confectionery-boxes",
    collectionIds: ["food-packaging"],
    fieldPresetId: "generic-packaging",
  },
  {
    id: "mithai-box-top-bottom-style",
    slug: "mithai-box-top-bottom-style",
    name: "Mithai Box — Top Bottom Style",
    primaryCategoryId: "food-packaging",
    primarySubcategoryId: "snack-confectionery-boxes",
    collectionIds: ["food-packaging"],
    fieldPresetId: "generic-packaging",
  },
  {
    id: "brownie-box",
    slug: "brownie-box",
    name: "Brownie Box",
    primaryCategoryId: "food-packaging",
    primarySubcategoryId: "snack-confectionery-boxes",
    collectionIds: ["food-packaging", "bakery"],
    fieldPresetId: "generic-packaging",
  },
  {
    id: "chocolate-box",
    slug: "chocolate-box",
    name: "Chocolate Box",
    primaryCategoryId: "food-packaging",
    primarySubcategoryId: "snack-confectionery-boxes",
    collectionIds: ["food-packaging", "bakery"],
    fieldPresetId: "generic-packaging",
  },
  {
    id: "chocolate-triangle-box",
    slug: "chocolate-triangle-box",
    name: "Chocolate Triangle Box",
    primaryCategoryId: "food-packaging",
    primarySubcategoryId: "snack-confectionery-boxes",
    collectionIds: ["food-packaging", "bakery"],
    fieldPresetId: "generic-packaging",
  },
  {
    id: "chocolate-pack-box",
    slug: "chocolate-pack-box",
    name: "Chocolate Pack Box",
    primaryCategoryId: "food-packaging",
    primarySubcategoryId: "snack-confectionery-boxes",
    collectionIds: ["food-packaging", "bakery"],
    fieldPresetId: "generic-packaging",
  },
  {
    id: "cereal-box",
    slug: "cereal-box",
    name: "Cereal Box",
    primaryCategoryId: "food-packaging",
    primarySubcategoryId: "snack-confectionery-boxes",
    collectionIds: ["food-packaging", "product-packaging"],
    fieldPresetId: "generic-packaging",
  },
] as const satisfies readonly EzpacPackagingProductTypePreset[];

export type EzpacPackagingCategoryId =
  (typeof EZPAC_PACKAGING_CATEGORY_PRESETS)[number]["id"];
export type EzpacPackagingProductTypeId =
  (typeof EZPAC_PACKAGING_PRODUCT_TYPE_PRESETS)[number]["id"];

function cloneOption(optionValue: CustomizationOption): CustomizationOption {
  return {
    id: optionValue.id,
    label: optionValue.label,
    value: optionValue.value,
    ...(optionValue.priceDelta === undefined ? {} : { priceDelta: optionValue.priceDelta }),
    ...(optionValue.swatch === undefined ? {} : { swatch: optionValue.swatch }),
  };
}

function cloneField(field: PackagingConfigurationFieldPreset): PackagingConfigurationFieldPreset {
  return {
    ...field,
    ...(field.options ? { options: field.options.map(cloneOption) } : {}),
  };
}

/** Returns a copy so UI form edits cannot mutate the preset library. */
export function listEzpacPackagingCategories(): EzpacPackagingCategoryPreset[] {
  return EZPAC_PACKAGING_CATEGORY_PRESETS.map((category) => ({
    ...category,
    subcategories: category.subcategories.map((subcategory) => ({ ...subcategory })),
  }));
}

export function listEzpacIndustryCollections(): EzpacIndustryCollectionPreset[] {
  return EZPAC_INDUSTRY_COLLECTION_PRESETS.map((collection) => ({ ...collection }));
}

export function getEzpacPackagingCategory(
  categoryId: string,
): EzpacPackagingCategoryPreset | undefined {
  return listEzpacPackagingCategories().find((category) => category.id === categoryId);
}

export function listEzpacPackagingProductTypes(): EzpacPackagingProductTypePreset[] {
  return EZPAC_PACKAGING_PRODUCT_TYPE_PRESETS.map((productType) => ({
    ...productType,
    collectionIds: [...productType.collectionIds],
  }));
}

export function getEzpacPackagingProductType(
  productTypeId: string,
): EzpacPackagingProductTypePreset | undefined {
  return listEzpacPackagingProductTypes().find(
    (productType) => productType.id === productTypeId,
  );
}

/** Identifies registered packaging starters that do not yet have validated 3D geometry. */
export function isEzpacPackagingProductType(
  productTypeId: string | undefined,
): productTypeId is EzpacPackagingProductTypeId {
  return Boolean(
    productTypeId
      && EZPAC_PACKAGING_PRODUCT_TYPE_PRESETS.some(
        (productType) => productType.id === productTypeId,
      ),
  );
}

export function getEzpacPackagingFieldPreset(
  presetId: PackagingFieldPresetId,
): EzpacPackagingFieldPreset {
  const preset = EZPAC_PACKAGING_FIELD_PRESETS.find((item) => item.id === presetId);
  if (!preset) {
    // The union makes this unreachable for internal callers, while still
    // giving consumers a safe generic fallback for deserialized values.
    return {
      id: "generic-packaging",
      label: "Generic packaging",
      fields: EZPAC_PACKAGING_FIELD_PRESETS[0].fields.map(cloneField),
    };
  }
  return { ...preset, fields: preset.fields.map(cloneField) };
}

/**
 * Gets a product type's reusable field configuration. Unknown product types
 * intentionally use the generic packaging fields rather than inventing a new
 * product-specific configuration.
 */
export function getEzpacPackagingFieldsForProductType(
  productTypeId: string | undefined,
): PackagingConfigurationFieldPreset[] {
  const productType = productTypeId
    ? getEzpacPackagingProductType(productTypeId)
    : undefined;
  return getEzpacPackagingFieldPreset(
    productType?.fieldPresetId ?? "generic-packaging",
  ).fields.map(cloneField);
}

/**
 * Converts a field preset into the application's existing customer field type.
 * It carries no price deltas; server-side pricing remains the only source of
 * truth once an administrator configures supported option prices.
 */
export function toCustomizationFields(
  fields: readonly PackagingConfigurationFieldPreset[],
): CustomizationField[] {
  return fields.map((field) => {
    const result: CustomizationField = {
      id: field.key,
      label: field.label,
      type: field.inputType,
      required: field.required,
    };
    if (field.placeholder !== undefined) result.placeholder = field.placeholder;
    if (field.helpText !== undefined) result.helpText = field.helpText;
    if (field.minLength !== undefined) result.minLength = field.minLength;
    if (field.maxLength !== undefined) result.maxLength = field.maxLength;
    if (field.minValue !== undefined) result.minValue = field.minValue;
    if (field.maxValue !== undefined) result.maxValue = field.maxValue;
    if (field.step !== undefined) result.step = field.step;
    if (field.allowedPattern !== undefined) result.allowedPattern = field.allowedPattern;
    if (field.options !== undefined) result.options = field.options.map(cloneOption);
    return result;
  });
}

export function getEzpacCustomizationFieldsForProductType(
  productTypeId: string | undefined,
): CustomizationField[] {
  return toCustomizationFields(getEzpacPackagingFieldsForProductType(productTypeId));
}
