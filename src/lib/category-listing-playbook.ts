import type { PackagingFieldPresetId } from "./ezpac-packaging-presets";
import type { RanBazaarCustomizationStarterId } from "./ranbazaar-customization-presets";

/**
 * What a new product needs, per category shelf.
 *
 * Every value mirrors what the 435 live products on that shelf actually do
 * (see `docs/research/category-listing-study.json`): the starter whose fields
 * match the shelf, the GST the source charges, the price band siblings sit in,
 * whether an MRP strikethrough is the norm, and which 3D lane is honest for the
 * shape. Recipes are defaults and nudges only — the admin can override all of it.
 */

/** The models `productModelSchema` accepts; built-in geometry exists for each. */
export type ListingProductModel =
  | "label-pack" | "waterproof-sheet" | "school-kit" | "notebook" | "bottle-label"
  | "pencil-set" | "tag" | "geometry-box" | "gift-ribbon" | "keychain-duo" | "bulk-grid"
  | "rectangular-box" | "square-box" | "folding-carton" | "mailer-box" | "paper-bag"
  | "stand-up-pouch" | "product-sleeve" | "rigid-lid-box" | "mailer-envelope" | "pyramid-box";

/**
 * "builtin" — `allow3D` + `productModel` is enough (non-packaging product types).
 * "template" — needs the product's own PUBLISHED visualization template first.
 * "none" — no honest model for this shape; never offer 3D.
 */
export type ThreeDPath = "builtin" | "template" | "none";

export interface CategoryListingRecipe {
  categorySlug: string;
  starterId?: RanBazaarCustomizationStarterId;
  packagingFieldPresetId?: PackagingFieldPresetId;
  gstPercent: 0 | 5 | 18;
  priceBandRupees?: { min: number; max: number };
  mrpExpected: boolean;
  model3D?: ListingProductModel;
  threeDPath: ThreeDPath;
  /** Industry collection slugs to also list in (ezpac tree, `collection-*`). */
  collectionSlugs?: string[];
  madeToOrder: boolean;
  /** Internal background for maintainers; never shown in the listing wizard. */
  notes?: string;
  /** Plain-language name for the listing wizard ("Soap box", "Name slips"). */
  displayName: string;
  /** One benefit line for the picker card, written for a shop owner. */
  benefit: string;
  /** Words that point at this shelf in a photo file name or typed text. */
  keywords: readonly string[];
  /** "Write for me" sentence; `{name}` is replaced with the product name. */
  descriptionTemplate: string;
  /** Packaging print options pre-filled as chips (field key → choices). Price deltas are 0. */
  printOptionDefaults?: Readonly<Record<string, PrintOptionDefault>>;
  /** Plain-language GST explanation for the info tooltip next to the GST field. */
  gstNote?: string;
}

/** Choices a packaging print option starts with; `selected` are switched on for customers. */
export interface PrintOptionDefault {
  choices: readonly string[];
  selected: readonly string[];
}

type RecipeCore = Omit<CategoryListingRecipe, "displayName" | "benefit" | "keywords" | "descriptionTemplate" | "printOptionDefaults" | "gstNote">;

const PERSONAL = ["collection-personal"];
const PRODUCT_PACKAGING = ["collection-product-packaging"];

const RECIPE_CORE: readonly RecipeCore[] = [
  // ---- Personalised retail shelves (GST-charged, MRP strikethrough is the norm)
  {
    categorySlug: "customized-name-slips",
    starterId: "name-slips",
    gstPercent: 18,
    priceBandRupees: { min: 219, max: 499 },
    mrpExpected: true,
    model3D: "label-pack",
    threeDPath: "builtin",
    collectionSlugs: PERSONAL,
    madeToOrder: true,
    notes: "Name and school lines on a slip sheet — the shelf's bestseller shape.",
  },
  {
    categorySlug: "waterproof-stickers",
    starterId: "name-slips",
    gstPercent: 18,
    priceBandRupees: { min: 290, max: 399 },
    mrpExpected: true,
    model3D: "waterproof-sheet",
    threeDPath: "builtin",
    collectionSlugs: PERSONAL,
    madeToOrder: true,
  },
  {
    categorySlug: "school-labels",
    starterId: "name-slips",
    gstPercent: 18,
    priceBandRupees: { min: 400, max: 700 },
    mrpExpected: false,
    model3D: "label-pack",
    threeDPath: "builtin",
    collectionSlugs: PERSONAL,
    madeToOrder: true,
    notes: "Multi-pack label sets; usually sold at one price with no strikethrough.",
  },
  {
    categorySlug: "personalized-notebooks",
    starterId: "notebook",
    gstPercent: 18,
    priceBandRupees: { min: 449, max: 499 },
    mrpExpected: true,
    model3D: "notebook",
    threeDPath: "builtin",
    collectionSlugs: PERSONAL,
    madeToOrder: true,
    notes: "Source rows omitted tax here; 18% follows the curated siblings — change it if the print partner differs.",
  },
  {
    categorySlug: "personalized-pencils-pens",
    starterId: "pen-pencil",
    gstPercent: 18,
    priceBandRupees: { min: 235, max: 869 },
    mrpExpected: true,
    model3D: "pencil-set",
    threeDPath: "builtin",
    collectionSlugs: PERSONAL,
    madeToOrder: true,
    notes: "Source rows omitted tax here; 18% follows the curated siblings.",
  },
  {
    categorySlug: "name-plates-keychains",
    starterId: "name-plate",
    gstPercent: 18,
    priceBandRupees: { min: 379, max: 1598 },
    mrpExpected: true,
    model3D: "keychain-duo",
    threeDPath: "builtin",
    collectionSlugs: PERSONAL,
    madeToOrder: true,
  },
  {
    categorySlug: "bottle-tiffin-labels",
    starterId: "bottle-tiffin",
    gstPercent: 5,
    priceBandRupees: { min: 329, max: 1025 },
    mrpExpected: false,
    model3D: "bottle-label",
    threeDPath: "builtin",
    collectionSlugs: PERSONAL,
    madeToOrder: true,
    notes: "Bottle and tiffin items sit at 5% GST on the source site.",
  },
  {
    categorySlug: "school-accessories",
    starterId: "school-kit",
    gstPercent: 18,
    priceBandRupees: { min: 230, max: 899 },
    mrpExpected: true,
    model3D: "school-kit",
    threeDPath: "builtin",
    collectionSlugs: PERSONAL,
    madeToOrder: true,
  },
  {
    categorySlug: "personalized-gifts",
    starterId: "gift-slip",
    gstPercent: 18,
    priceBandRupees: { min: 169, max: 2399 },
    mrpExpected: true,
    model3D: "gift-ribbon",
    threeDPath: "builtin",
    collectionSlugs: ["collection-gift-packaging", "collection-personal"],
    madeToOrder: true,
    notes: "Photo gifts (toppers, mouse pads, decor) list better with the Photo gift starter.",
  },
  {
    categorySlug: "bulk-orders",
    starterId: "name-slips",
    gstPercent: 18,
    priceBandRupees: { min: 1799, max: 185000 },
    mrpExpected: false,
    model3D: "bulk-grid",
    threeDPath: "builtin",
    madeToOrder: true,
    notes: "Add quantity price breaks in the advanced editor after saving.",
  },
  {
    categorySlug: "paper-bags",
    starterId: "bag-luggage-tag",
    gstPercent: 18,
    priceBandRupees: { min: 1200, max: 1600 },
    mrpExpected: true,
    model3D: "paper-bag",
    // Built-in bag geometry does not map the personalisation surface onto its
    // front (verified 2026-11-23: a blank bag), so the bag's own photo is wrapped
    // on a published template instead; the 2D studio still carries the name.
    threeDPath: "template",
    collectionSlugs: PERSONAL,
    madeToOrder: true,
    notes: "The retail custom-print bags shelf; the packaging bag subcategories quote per order instead.",
  },

  // ---- Packaging shelves (quote-priced, no GST on the listing, template-backed 3D)
  {
    categorySlug: "soap-boxes",
    packagingFieldPresetId: "soap-box",
    gstPercent: 0,
    mrpExpected: false,
    model3D: "folding-carton",
    threeDPath: "template",
    collectionSlugs: ["collection-soap-packaging", "collection-product-packaging"],
    madeToOrder: true,
  },
  {
    categorySlug: "perfume-cosmetic-boxes",
    packagingFieldPresetId: "generic-packaging",
    gstPercent: 0,
    mrpExpected: false,
    model3D: "folding-carton",
    threeDPath: "template",
    collectionSlugs: ["collection-perfume-cosmetics-packaging", "collection-product-packaging"],
    madeToOrder: true,
  },
  {
    categorySlug: "specialty-boxes",
    packagingFieldPresetId: "generic-packaging",
    gstPercent: 0,
    mrpExpected: false,
    model3D: "folding-carton",
    threeDPath: "template",
    collectionSlugs: PRODUCT_PACKAGING,
    madeToOrder: true,
    notes: "Pick the shape that matches when the 3D preview is created — square boxes get their own model.",
  },
  {
    // Gift and event boxes are rigid lid-and-base boxes, not tuck-end cartons.
    categorySlug: "gift-event-boxes",
    packagingFieldPresetId: "generic-packaging",
    gstPercent: 0,
    mrpExpected: false,
    model3D: "rigid-lid-box",
    threeDPath: "template",
    collectionSlugs: ["collection-gift-packaging", "collection-product-packaging"],
    madeToOrder: true,
  },
  {
    // A courier mailer is a flat poly envelope, not a gusseted bag with handles.
    categorySlug: "mailer-bags",
    packagingFieldPresetId: "courier-bag",
    gstPercent: 0,
    mrpExpected: false,
    model3D: "mailer-envelope",
    threeDPath: "template",
    collectionSlugs: ["collection-e-commerce-packaging"],
    madeToOrder: true,
  },
  {
    // Most shipping boxes are corrugated RSC cartons; tuck-top mailers are
    // recognised by name when the 3D preview is created.
    categorySlug: "shipping-boxes",
    packagingFieldPresetId: "generic-packaging",
    gstPercent: 0,
    mrpExpected: false,
    model3D: "rectangular-box",
    threeDPath: "template",
    collectionSlugs: ["collection-e-commerce-packaging"],
    madeToOrder: true,
  },
  {
    categorySlug: "branded-carry-bags",
    packagingFieldPresetId: "paper-bag",
    gstPercent: 0,
    mrpExpected: false,
    model3D: "paper-bag",
    threeDPath: "template",
    collectionSlugs: PRODUCT_PACKAGING,
    madeToOrder: true,
  },
  {
    categorySlug: "d-cut-paper-bags",
    packagingFieldPresetId: "paper-bag",
    gstPercent: 0,
    mrpExpected: false,
    model3D: "paper-bag",
    threeDPath: "template",
    collectionSlugs: PRODUCT_PACKAGING,
    madeToOrder: true,
  },
  {
    categorySlug: "branded-ziplock-pouches",
    packagingFieldPresetId: "ziplock-pouch",
    gstPercent: 0,
    mrpExpected: false,
    model3D: "stand-up-pouch",
    threeDPath: "template",
    collectionSlugs: PRODUCT_PACKAGING,
    madeToOrder: true,
  },
  {
    categorySlug: "snack-confectionery-boxes",
    packagingFieldPresetId: "generic-packaging",
    gstPercent: 0,
    mrpExpected: false,
    model3D: "folding-carton",
    threeDPath: "template",
    collectionSlugs: ["collection-food-packaging"],
    madeToOrder: true,
  },
  {
    categorySlug: "food-trays-delivery",
    packagingFieldPresetId: "generic-packaging",
    gstPercent: 0,
    mrpExpected: false,
    threeDPath: "none",
    collectionSlugs: ["collection-food-packaging"],
    madeToOrder: true,
    notes: "Open trays have no honest 3D model; box-shaped delivery cartons can get one from the advanced editor.",
  },
  {
    categorySlug: "food-pouches",
    packagingFieldPresetId: "ziplock-pouch",
    gstPercent: 0,
    mrpExpected: false,
    model3D: "stand-up-pouch",
    threeDPath: "template",
    collectionSlugs: ["collection-food-packaging"],
    madeToOrder: true,
  },

  // ---- Flat print (no solid shape to model)
  {
    categorySlug: "stickers",
    packagingFieldPresetId: "flat-print",
    gstPercent: 0,
    mrpExpected: false,
    model3D: "waterproof-sheet",
    threeDPath: "builtin",
    madeToOrder: true,
  },
  {
    categorySlug: "business-cards",
    packagingFieldPresetId: "business-card",
    gstPercent: 0,
    mrpExpected: false,
    threeDPath: "none",
    madeToOrder: true,
    notes: "A card is flat — a 3D box preview would misrepresent it.",
  },
  {
    categorySlug: "flyers-brochures",
    packagingFieldPresetId: "brochure",
    gstPercent: 0,
    mrpExpected: false,
    threeDPath: "none",
    madeToOrder: true,
  },
  {
    categorySlug: "thank-you-hang-tags",
    packagingFieldPresetId: "flat-print",
    gstPercent: 0,
    mrpExpected: false,
    threeDPath: "none",
    madeToOrder: true,
    notes: "Hang tags stay 2D until a tag model is verified against a real product photo.",
  },
];

/** Default print-option chips per packaging field key; every price delta is 0. */
export const PRINT_OPTION_LIBRARY: Readonly<Record<string, PrintOptionDefault>> = {
  material: { choices: ["White board 350 GSM", "Kraft board 300 GSM", "Art card 300 GSM"], selected: ["White board 350 GSM"] },
  "box-construction": { choices: ["Reverse tuck end", "Straight tuck end", "Crash lock bottom"], selected: ["Reverse tuck end"] },
  "printing-type": { choices: ["Offset CMYK", "Digital print"], selected: ["Offset CMYK"] },
  "print-colours": { choices: ["4 colour (CMYK)", "1 colour", "2 colour"], selected: ["4 colour (CMYK)"] },
  lamination: { choices: ["Matte", "Gloss", "No lamination"], selected: ["Matte", "Gloss"] },
  finishing: { choices: ["None", "Spot UV", "Foil stamping", "Embossing"], selected: ["None", "Spot UV"] },
  "insert-holder": { choices: ["No insert", "Paper insert"], selected: ["No insert"] },
  "window-option": { choices: ["No window", "Window with clear film"], selected: ["No window"] },
  "card-size": { choices: ["Standard 89 × 51 mm", "Square 64 × 64 mm"], selected: ["Standard 89 × 51 mm"] },
  "paper-type": { choices: ["Art card 350 GSM", "Matte card 300 GSM", "Textured card"], selected: ["Art card 350 GSM", "Matte card 300 GSM"] },
  "rounded-corners": { choices: ["Square corners", "Rounded corners"], selected: ["Square corners"] },
  "foil-spot-uv": { choices: ["None", "Gold foil", "Spot UV"], selected: ["None"] },
  "paper-material": { choices: ["Art paper 130 GSM", "Vinyl sticker", "Art card 300 GSM"], selected: ["Art paper 130 GSM"] },
  "handle-type": { choices: ["Twisted paper handle", "Flat paper handle", "Ribbon handle"], selected: ["Twisted paper handle"] },
  "handle-colour": { choices: ["Match the bag", "White", "Black"], selected: ["Match the bag"] },
  "reinforced-bottom": { choices: ["Standard bottom", "Reinforced bottom"], selected: ["Standard bottom"] },
  "ziplock-option": { choices: ["Press zip", "No zip"], selected: ["Press zip"] },
  "tear-notch": { choices: ["With tear notch", "No tear notch"], selected: ["With tear notch"] },
  "transparent-window": { choices: ["No window", "Clear window"], selected: ["No window"] },
  "fold-type": { choices: ["Bi-fold", "Tri-fold", "Z-fold"], selected: ["Bi-fold", "Tri-fold"] },
  "adhesive-type": { choices: ["Permanent seal", "Resealable strip"], selected: ["Permanent seal"] },
  "tamper-evident-seal": { choices: ["Standard seal", "Tamper-evident seal"], selected: ["Standard seal"] },
};

const POUCH_MATERIAL: PrintOptionDefault = { choices: ["Metallised PET", "Clear PET", "Kraft paper laminate"], selected: ["Metallised PET"] };
const BAG_PAPER: PrintOptionDefault = { choices: ["Kraft paper 120 GSM", "White kraft 120 GSM", "Art paper 170 GSM"], selected: ["Kraft paper 120 GSM", "White kraft 120 GSM"] };

type Presentation = Pick<CategoryListingRecipe, "displayName" | "benefit" | "keywords" | "descriptionTemplate" | "printOptionDefaults" | "gstNote">;

const NAME_TEMPLATE = "{name}, printed with your child's name. Waterproof, school-ready and made to order.";
const BOX_TEMPLATE = "{name}, custom printed with your brand. Pick the material and finish; we print and deliver it ready to pack.";
const BAG_TEMPLATE = "{name}, printed with your logo. Strong, eco-friendly and made to order for your shop.";
const POUCH_TEMPLATE = "{name}, printed with your brand artwork. Food-safe, resealable and made to order.";
const FLAT_TEMPLATE = "{name}, printed sharp and bright with your design. Made to order on quality stock.";

/** The listing wizard's plain-language face of each shelf. */
const PRESENTATION: Readonly<Record<string, Presentation>> = {
  "customized-name-slips": { displayName: "Name slips", benefit: "Customer types their name — you print it", keywords: ["name slip", "slip", "slips", "name label", "label"], descriptionTemplate: NAME_TEMPLATE },
  "waterproof-stickers": { displayName: "Waterproof name stickers", benefit: "Name stickers that survive the wash", keywords: ["waterproof", "sticker", "stickers", "vinyl"], descriptionTemplate: NAME_TEMPLATE },
  "school-labels": { displayName: "School label sets", benefit: "One pack labels every book and bottle", keywords: ["school label", "label set", "labels", "kit"], descriptionTemplate: NAME_TEMPLATE },
  "personalized-notebooks": { displayName: "Notebooks", benefit: "Their name printed on the cover", keywords: ["notebook", "note book", "diary", "journal", "copy"], descriptionTemplate: "{name} with the customer's name printed on the cover. Made to order.", gstNote: "Notebooks here are listed with 18% GST. Change it if your printer charges a different rate." },
  "personalized-pencils-pens": { displayName: "Pens & pencils", benefit: "Their name printed on every pen", keywords: ["pen", "pens", "pencil", "pencils", "stationery"], descriptionTemplate: "{name} with the customer's name printed on each piece. A gift kids love.", gstNote: "Pens and pencils here are listed with 18% GST. Change it if your printer charges a different rate." },
  "name-plates-keychains": { displayName: "Name plates & keychains", benefit: "A name plate or keychain with their name", keywords: ["name plate", "nameplate", "keychain", "key chain", "door plate"], descriptionTemplate: "{name}, made with the customer's name. Sturdy, bright and made to order." },
  "bottle-tiffin-labels": { displayName: "Bottle & tiffin labels", benefit: "Labels that stay on bottles and lunch boxes", keywords: ["bottle", "tiffin", "lunch box", "sipper", "flask"], descriptionTemplate: "{name} printed with the customer's name. Dishwasher-safe and waterproof.", gstNote: "Bottle and tiffin labels are usually sold with 5% GST." },
  "school-accessories": { displayName: "School bags & accessories", benefit: "Bags and kits with the child's name", keywords: ["school bag", "bag tag", "geometry", "accessories", "backpack"], descriptionTemplate: "{name}, personalised with the child's name. Made to order." },
  "personalized-gifts": { displayName: "Personalised gifts", benefit: "Photo and name gifts for any occasion", keywords: ["gift", "mug", "frame", "cushion", "mouse pad", "topper", "photo"], descriptionTemplate: "{name}, personalised with a name or photo. A thoughtful made-to-order gift." },
  "bulk-orders": { displayName: "Bulk orders", benefit: "Large orders for schools and companies", keywords: ["bulk", "institution", "corporate", "wholesale"], descriptionTemplate: "{name} for schools and companies. Personalised in bulk and made to order." },
  "paper-bags": { displayName: "Paper bag", benefit: "A printed paper bag with their name or logo", keywords: ["paper bag", "bag", "carry bag", "shopping bag"], descriptionTemplate: BAG_TEMPLATE },
  "soap-boxes": { displayName: "Soap box", benefit: "Their brand printed on a soap carton", keywords: ["soap", "soap box", "carton"], descriptionTemplate: BOX_TEMPLATE },
  "perfume-cosmetic-boxes": { displayName: "Perfume & cosmetic box", benefit: "A tall printed box for bottles and jars", keywords: ["perfume", "cosmetic", "attar", "cream", "serum", "lipstick"], descriptionTemplate: BOX_TEMPLATE },
  "specialty-boxes": { displayName: "Speciality box", benefit: "Custom printed boxes in any shape", keywords: ["box", "boxes", "speciality", "specialty", "custom box"], descriptionTemplate: BOX_TEMPLATE },
  "gift-event-boxes": { displayName: "Gift box", benefit: "A rigid lid-and-base box for gifts and events", keywords: ["gift box", "hamper", "wedding", "event", "rigid box", "lid"], descriptionTemplate: BOX_TEMPLATE },
  "mailer-bags": { displayName: "Courier mailer bag", benefit: "Printed courier bags for online orders", keywords: ["courier", "mailer", "poly bag", "envelope", "shipping bag"], descriptionTemplate: "{name}, printed with your brand. Tamper-evident seal and made to order.", printOptionDefaults: { material: { choices: ["LDPE 60 micron", "Co-extruded 51 micron"], selected: ["LDPE 60 micron"] } } },
  "shipping-boxes": { displayName: "Shipping box", benefit: "Strong printed cartons for shipping", keywords: ["shipping", "corrugated", "mailer box", "e-commerce", "ecommerce", "courier box"], descriptionTemplate: BOX_TEMPLATE, printOptionDefaults: { material: { choices: ["3-ply corrugated", "5-ply corrugated", "Kraft corrugated"], selected: ["3-ply corrugated"] } } },
  "branded-carry-bags": { displayName: "Branded carry bag", benefit: "Your logo on a premium carry bag", keywords: ["carry bag", "branded bag", "shopping bag", "boutique bag"], descriptionTemplate: BAG_TEMPLATE, printOptionDefaults: { "paper-type": BAG_PAPER } },
  "d-cut-paper-bags": { displayName: "D-cut paper bag", benefit: "Budget bags with a punched handle", keywords: ["d cut", "d-cut", "dcut", "punch handle"], descriptionTemplate: BAG_TEMPLATE, printOptionDefaults: { "paper-type": BAG_PAPER } },
  "branded-ziplock-pouches": { displayName: "Ziplock pouch", benefit: "Resealable printed pouches", keywords: ["ziplock", "zip lock", "pouch", "stand up pouch", "standup"], descriptionTemplate: POUCH_TEMPLATE, printOptionDefaults: { material: POUCH_MATERIAL } },
  "food-pouches": { displayName: "Food pouch", benefit: "Food-safe printed pouches", keywords: ["food pouch", "snack pouch", "tea", "coffee", "spice", "masala"], descriptionTemplate: POUCH_TEMPLATE, printOptionDefaults: { material: POUCH_MATERIAL } },
  "snack-confectionery-boxes": { displayName: "Sweet & snack box", benefit: "Printed boxes for sweets and snacks", keywords: ["sweet", "mithai", "snack", "confectionery", "chocolate", "cake", "bakery"], descriptionTemplate: BOX_TEMPLATE },
  "food-trays-delivery": { displayName: "Food tray / delivery box", benefit: "Printed trays and delivery boxes", keywords: ["tray", "pizza", "delivery", "takeaway", "burger"], descriptionTemplate: BOX_TEMPLATE },
  stickers: { displayName: "Custom stickers", benefit: "Your logo or art as stickers", keywords: ["sticker", "stickers", "decal", "logo sticker"], descriptionTemplate: FLAT_TEMPLATE },
  "business-cards": { displayName: "Business cards", benefit: "Crisp printed visiting cards", keywords: ["business card", "visiting card", "card"], descriptionTemplate: FLAT_TEMPLATE },
  "flyers-brochures": { displayName: "Flyers & brochures", benefit: "Printed flyers and folded brochures", keywords: ["flyer", "brochure", "leaflet", "pamphlet", "menu"], descriptionTemplate: FLAT_TEMPLATE, printOptionDefaults: { "paper-type": { choices: ["Art paper 130 GSM", "Art paper 170 GSM", "Matte paper 130 GSM"], selected: ["Art paper 130 GSM", "Art paper 170 GSM"] } } },
  "thank-you-hang-tags": { displayName: "Thank-you cards & hang tags", benefit: "Cards and tags that go in every order", keywords: ["thank you", "hang tag", "tag", "insert card"], descriptionTemplate: FLAT_TEMPLATE },
};

export const CATEGORY_LISTING_PLAYBOOK: readonly CategoryListingRecipe[] = RECIPE_CORE.map((core) => {
  const presentation = PRESENTATION[core.categorySlug];
  if (!presentation) throw new Error(`Recipe ${core.categorySlug} needs a listing presentation.`);
  return { ...core, ...presentation };
});

/** The GST tooltip: the shelf's own note, else a plain default for its rate. */
export function gstNoteFor(recipe: CategoryListingRecipe | undefined): string {
  if (recipe?.gstNote) return recipe.gstNote;
  if (!recipe) return "Most personalised products carry 18% GST.";
  return recipe.gstPercent === 0
    ? "Packaging and print jobs are priced per order, so no GST is added on the listing."
    : `Products like this are usually sold with ${recipe.gstPercent}% GST.`;
}

/** The chips a print option starts with: the recipe's override, else the shared library. */
export function printOptionDefaultFor(recipe: CategoryListingRecipe | undefined, fieldKey: string): PrintOptionDefault | undefined {
  return recipe?.printOptionDefaults?.[fieldKey] ?? PRINT_OPTION_LIBRARY[fieldKey];
}

const BY_SLUG = new Map(CATEGORY_LISTING_PLAYBOOK.map((recipe) => [recipe.categorySlug, recipe]));

export function getCategoryListingRecipe(categorySlug: string | undefined | null): CategoryListingRecipe | undefined {
  return categorySlug ? BY_SLUG.get(categorySlug) : undefined;
}

/** Category slugs the listing wizard must never offer: import buckets and test shelves. */
const HIDDEN_CATEGORY_SLUGS = new Set([
  "imported-ezpac", "imported-ranbazaar", "industry-collections", "bhautesh", "bhautesh1", "notestick",
]);

export interface ListableCategory {
  id: string;
  slug: string;
  name: string;
  parentId: string | null;
  isActive?: boolean;
}

/**
 * Categories an admin may list a *new* product into. Import buckets exist only so
 * re-runs of the importer stay idempotent; test shelves and the collection tree are
 * not sellable shelves. The advanced editor keeps the full list for existing rows.
 */
export function listableCategories<T extends ListableCategory>(categories: readonly T[]): T[] {
  const hiddenIds = new Set(
    categories.filter((category) => HIDDEN_CATEGORY_SLUGS.has(category.slug)).map((category) => category.id),
  );
  return categories.filter((category) => {
    if (category.isActive === false) return false;
    if (HIDDEN_CATEGORY_SLUGS.has(category.slug)) return false;
    return !(category.parentId && hiddenIds.has(category.parentId));
  });
}

export function isHiddenListingCategorySlug(slug: string) {
  return HIDDEN_CATEGORY_SLUGS.has(slug);
}

export function gstBasisPoints(gstPercent: 0 | 5 | 18) {
  return gstPercent * 100;
}

export function gstTaxCode(gstPercent: 0 | 5 | 18) {
  return gstPercent > 0 ? `IN-GST-${gstPercent}` : null;
}

/** A price outside 0.5×–2× of the shelf's band is probably a typo — warn, never block. */
const BAND_TOLERANCE = 2;

export function priceBandWarning(
  recipe: CategoryListingRecipe | undefined,
  priceRupees: number,
): string | null {
  const band = recipe?.priceBandRupees;
  if (!band || !Number.isFinite(priceRupees) || priceRupees <= 0) return null;
  if (priceRupees < band.min / BAND_TOLERANCE) {
    return `That looks low — similar products sell for ₹${band.min}–₹${band.max}.`;
  }
  if (priceRupees > band.max * BAND_TOLERANCE) {
    return `That looks high — similar products sell for ₹${band.min}–₹${band.max}.`;
  }
  return null;
}

export function priceBandHint(recipe: CategoryListingRecipe | undefined): string | null {
  const band = recipe?.priceBandRupees;
  if (!band) return null;
  return band.min === band.max
    ? `Similar products: ₹${band.min}`
    : `Similar products: ₹${band.min}–₹${band.max}`;
}

/** Short, plain-language summary of what the shelf applied for the admin. */
export function recipeSummaryChips(recipe: CategoryListingRecipe | undefined, collectionNames: readonly string[] = []): string[] {
  if (!recipe) return [];
  return [
    recipe.gstPercent > 0 ? `GST ${recipe.gstPercent}%` : "No GST on this shelf",
    ...(collectionNames.length ? [`Also in: ${collectionNames.join(", ")}`] : []),
    ...(recipe.threeDPath === "builtin" ? ["3D preview ready"] : []),
  ];
}

const STOP_WORDS = new Set(["the", "and", "for", "with", "your", "a", "an", "of", "in", "to", "pack", "set"]);

/**
 * Derives 3-6 search tags from the product name and its shelf. Imported rows carry
 * source tags; admin rows had none, which made them rank worse in our own search.
 */
export function deriveListingTags(name: string, categoryName: string, extra: readonly string[] = []): string[] {
  const words = `${name} ${categoryName}`
    .toLocaleLowerCase("en-IN")
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
  const tags: string[] = [];
  for (const candidate of [categoryName.trim(), ...words, ...extra]) {
    const tag = candidate.trim().slice(0, 80);
    if (!tag) continue;
    if (tags.some((existing) => existing.toLocaleLowerCase("en-IN") === tag.toLocaleLowerCase("en-IN"))) continue;
    tags.push(tag);
    if (tags.length >= 6) break;
  }
  return tags;
}

export function deriveSeo(name: string, categoryName: string, description: string) {
  const title = `${name.trim()}${categoryName ? ` · ${categoryName.trim()}` : ""}`.slice(0, 160);
  const plain = description.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const fallback = `${name.trim()} — custom made and personalised${categoryName ? ` in ${categoryName.trim()}` : ""}.`;
  return { seoTitle: title, seoDescription: (plain || fallback).slice(0, 320) };
}
