import assert from "node:assert/strict";
import test from "node:test";

import {
  EZPAC_PACKAGING_FIELD_PRESETS,
  ezpacIndustryCollectionCategorySlug,
  getEzpacPackagingFieldPreset,
  getEzpacPackagingFieldsForProductType,
  isEzpacPackagingProductType,
  listEzpacIndustryCollections,
  listEzpacPackagingCategories,
  listEzpacPackagingProductTypes,
  type PackagingFieldPresetId,
} from "./ezpac-packaging-presets";

const EXPECTED_CATEGORY_MANIFEST = [
  {
    root: ["boxes", "boxes", "Boxes"],
    children: [
      ["soap-boxes", "soap-boxes", "Soap Boxes"],
      ["perfume-cosmetic-boxes", "perfume-cosmetic-boxes", "Perfume & Cosmetic Boxes"],
      ["specialty-boxes", "specialty-boxes", "Specialty Boxes"],
      ["gift-event-boxes", "gift-event-boxes", "Gift & Event Boxes"],
    ],
  },
  {
    root: ["e-commerce-packaging", "e-commerce-packaging", "E-Commerce Packaging"],
    children: [
      ["mailer-bags", "mailer-bags", "Mailer Bags"],
      ["shipping-boxes", "shipping-boxes", "Shipping Boxes"],
      ["printed-inserts", "printed-inserts", "Printed Inserts"],
    ],
  },
  {
    root: ["paper-bags", "paper-bags", "Paper Bags"],
    children: [
      ["branded-carry-bags", "branded-carry-bags", "Branded Carry Bags"],
      ["d-cut-paper-bags", "d-cut-paper-bags", "D-Cut Paper Bags"],
    ],
  },
  {
    root: ["ziplock-pouch", "ziplock-pouch", "Ziplock Pouch"],
    children: [["branded-ziplock-pouches", "branded-ziplock-pouches", "Branded Ziplock Pouches"]],
  },
  {
    root: ["marketing-printing", "marketing-printing", "Marketing & Printing"],
    children: [
      ["business-cards", "business-cards", "Business Cards"],
      ["flyers-brochures", "flyers-brochures", "Flyers & Brochures"],
      ["thank-you-hang-tags", "thank-you-hang-tags", "Thank You Cards & Hang Tags"],
      ["stickers", "stickers", "Stickers"],
    ],
  },
  {
    root: ["food-packaging", "food-packaging", "Food Packaging"],
    children: [
      ["food-trays-delivery", "food-trays-delivery", "Food Trays & Delivery"],
      ["snack-confectionery-boxes", "snack-confectionery-boxes", "Snack & Confectionery Boxes"],
      ["food-pouches", "food-pouches", "Food Pouches"],
    ],
  },
  {
    root: ["industry-collections", "industry-collections", "Industry Collections"],
    children: [
      ["soap-packaging", "collection-soap-packaging", "Soap Packaging"],
      ["perfume-cosmetics-packaging", "collection-perfume-cosmetics-packaging", "Perfume / Cosmetics Packaging"],
      ["display-products", "collection-display-products", "Display Products"],
      ["e-commerce-packaging", "collection-e-commerce-packaging", "E-Commerce Packaging"],
      ["product-packaging", "collection-product-packaging", "Product Packaging"],
      ["food-packaging", "collection-food-packaging", "Food Packaging"],
      ["gift-packaging", "collection-gift-packaging", "Gift Packaging"],
      ["personal", "collection-personal", "Personal"],
      ["bakery", "collection-bakery", "Bakery"],
    ],
  },
] as const;

const EXPECTED_PRODUCT_IDS = [
  "soap-box", "soap-pillow-box", "perfume-box", "cosmetic-beauty-brand-box",
  "cosmetic-beauty-box-with-inside-holder", "window-box", "hanging-box",
  "middle-hanging-box", "sachet-box", "square-box", "slider-box-thick-wall",
  "slider-box-thin-wall", "pillow-box", "mobile-cover-box", "pen-set-box",
  "tissue-paper-box", "side-open-box", "zipper-box", "unboxing-experience-box",
  "gift-box", "gift-box-with-window", "pooja-box", "flower-box", "d2c-mailer-bag",
  "parcel-bag", "e-commerce-mailers", "courier-bags",
  "custom-branded-laminated-carry-bag", "d-cut-paper-bag", "brand-ziplock-pouch",
  "business-card", "folded-business-card", "a4-flyer", "z-fold-brochure",
  "tri-fold-brochure", "four-fold-brochure", "thank-you-card",
  "folded-thank-you-card", "oval-thank-you-card", "hang-tags", "stickers",
  "rectangle-stickers", "square-stickers", "food-tray", "food-delivery-box",
  "food-parcel-box", "snack-box", "popcorn-box", "paan-box",
  "mithai-box-top-bottom-style", "brownie-box", "chocolate-box",
  "chocolate-triangle-box", "chocolate-pack-box", "cereal-box",
] as const;

const EXPECTED_PRIMARY_ROUTES = {
  "boxes/soap-boxes": ["soap-box", "soap-pillow-box"],
  "boxes/perfume-cosmetic-boxes": ["perfume-box", "cosmetic-beauty-brand-box", "cosmetic-beauty-box-with-inside-holder"],
  "boxes/specialty-boxes": ["window-box", "hanging-box", "middle-hanging-box", "sachet-box", "square-box", "slider-box-thick-wall", "slider-box-thin-wall", "pillow-box", "mobile-cover-box", "pen-set-box", "tissue-paper-box", "side-open-box", "zipper-box"],
  "boxes/gift-event-boxes": ["unboxing-experience-box", "gift-box", "gift-box-with-window", "pooja-box", "flower-box"],
  "e-commerce-packaging/mailer-bags": ["d2c-mailer-bag", "parcel-bag", "e-commerce-mailers", "courier-bags"],
  "paper-bags/branded-carry-bags": ["custom-branded-laminated-carry-bag"],
  "paper-bags/d-cut-paper-bags": ["d-cut-paper-bag"],
  "ziplock-pouch/branded-ziplock-pouches": ["brand-ziplock-pouch"],
  "marketing-printing/business-cards": ["business-card", "folded-business-card"],
  "marketing-printing/flyers-brochures": ["a4-flyer", "z-fold-brochure", "tri-fold-brochure", "four-fold-brochure"],
  "marketing-printing/thank-you-hang-tags": ["thank-you-card", "folded-thank-you-card", "oval-thank-you-card", "hang-tags"],
  "marketing-printing/stickers": ["stickers", "rectangle-stickers", "square-stickers"],
  "food-packaging/food-trays-delivery": ["food-tray", "food-delivery-box", "food-parcel-box"],
  "food-packaging/snack-confectionery-boxes": ["snack-box", "popcorn-box", "paan-box", "mithai-box-top-bottom-style", "brownie-box", "chocolate-box", "chocolate-triangle-box", "chocolate-pack-box", "cereal-box"],
} as const;

const EXPECTED_COLLECTION_ROUTES = {
  "soap-packaging": ["soap-box", "soap-pillow-box"],
  "perfume-cosmetics-packaging": ["perfume-box", "cosmetic-beauty-brand-box", "cosmetic-beauty-box-with-inside-holder"],
  "display-products": ["window-box", "hanging-box", "middle-hanging-box"],
  "e-commerce-packaging": ["zipper-box", "unboxing-experience-box", "d2c-mailer-bag", "parcel-bag", "e-commerce-mailers", "courier-bags", "business-card", "folded-business-card", "thank-you-card", "folded-thank-you-card", "oval-thank-you-card", "hang-tags", "stickers", "rectangle-stickers", "square-stickers"],
  "product-packaging": ["soap-box", "soap-pillow-box", "perfume-box", "cosmetic-beauty-brand-box", "cosmetic-beauty-box-with-inside-holder", "window-box", "hanging-box", "middle-hanging-box", "sachet-box", "square-box", "slider-box-thick-wall", "slider-box-thin-wall", "pillow-box", "mobile-cover-box", "pen-set-box", "tissue-paper-box", "side-open-box", "zipper-box", "unboxing-experience-box", "custom-branded-laminated-carry-bag", "d-cut-paper-bag", "brand-ziplock-pouch", "food-delivery-box", "food-parcel-box", "cereal-box"],
  "food-packaging": ["brand-ziplock-pouch", "food-tray", "food-delivery-box", "food-parcel-box", "snack-box", "popcorn-box", "paan-box", "mithai-box-top-bottom-style", "brownie-box", "chocolate-box", "chocolate-triangle-box", "chocolate-pack-box", "cereal-box"],
  "gift-packaging": ["slider-box-thick-wall", "slider-box-thin-wall", "pillow-box", "pen-set-box", "unboxing-experience-box", "gift-box", "gift-box-with-window", "pooja-box", "flower-box"],
  personal: ["pooja-box", "flower-box", "custom-branded-laminated-carry-bag", "d-cut-paper-bag", "business-card", "folded-business-card", "a4-flyer", "z-fold-brochure", "tri-fold-brochure", "four-fold-brochure", "thank-you-card", "folded-thank-you-card", "oval-thank-you-card", "hang-tags", "stickers", "rectangle-stickers", "square-stickers"],
  bakery: ["brownie-box", "chocolate-box", "chocolate-triangle-box", "chocolate-pack-box"],
} as const;

const EXPECTED_FIELD_KEYS: Record<PackagingFieldPresetId, readonly string[]> = {
  "generic-packaging": ["length", "width", "height", "dimension-unit", "material", "printing-type", "printing-sides", "print-colours", "finishing"],
  "soap-box": ["length", "width", "height", "dimension-unit", "material", "gsm-board-thickness", "box-construction", "printing-type", "printing-sides", "print-colours", "lamination", "finishing", "insert-holder", "window-option"],
  "business-card": ["card-size", "paper-type", "gsm-board-thickness", "orientation", "printing-sides", "print-colours", "finishing", "rounded-corners", "foil-spot-uv"],
  "flat-print": ["flat-width", "flat-height", "dimension-unit", "paper-material", "gsm-board-thickness", "printing-type", "printing-sides", "print-colours", "finishing"],
  "paper-bag": ["bag-width", "bag-height", "gusset", "dimension-unit", "paper-type", "gsm-board-thickness", "handle-type", "handle-colour", "printing-sides", "lamination", "reinforced-bottom"],
  "ziplock-pouch": ["pouch-width", "pouch-height", "gusset", "dimension-unit", "material", "material-thickness", "capacity", "ziplock-option", "tear-notch", "transparent-window", "printing-type", "finishing"],
  brochure: ["flat-width", "flat-height", "finished-width", "finished-height", "dimension-unit", "paper-type", "gsm-board-thickness", "number-of-panels", "fold-type", "printing-sides", "print-colours", "lamination"],
  "courier-bag": ["width", "height", "flap-size", "dimension-unit", "material", "thickness", "adhesive-type", "tamper-evident-seal", "printing-type"],
};

const SPECIALIZED_FIELD_ROUTES: Partial<Record<string, PackagingFieldPresetId>> = {
  "soap-box": "soap-box",
  "soap-pillow-box": "soap-box",
  "cosmetic-beauty-box-with-inside-holder": "soap-box",
  "window-box": "soap-box",
  "gift-box-with-window": "soap-box",
  "d2c-mailer-bag": "courier-bag",
  "parcel-bag": "courier-bag",
  "e-commerce-mailers": "courier-bag",
  "courier-bags": "courier-bag",
  "custom-branded-laminated-carry-bag": "paper-bag",
  "d-cut-paper-bag": "paper-bag",
  "brand-ziplock-pouch": "ziplock-pouch",
  "business-card": "business-card",
  "folded-business-card": "business-card",
  "thank-you-card": "business-card",
  "folded-thank-you-card": "business-card",
  "oval-thank-you-card": "business-card",
  "a4-flyer": "flat-print",
  "z-fold-brochure": "brochure",
  "tri-fold-brochure": "brochure",
  "four-fold-brochure": "brochure",
  "hang-tags": "flat-print",
  stickers: "flat-print",
  "rectangle-stickers": "flat-print",
  "square-stickers": "flat-print",
};

test("EZPAC category registry matches the exact seven-group manifest", () => {
  const categories = listEzpacPackagingCategories();
  assert.deepEqual(
    categories.map((category) => ({
      root: [category.id, category.slug, category.name],
      children: category.subcategories.map((subcategory) => [subcategory.id, subcategory.slug, subcategory.name]),
    })),
    EXPECTED_CATEGORY_MANIFEST,
  );
  assert.equal(categories.length, 7);
  assert.equal(categories.reduce((count, category) => count + category.subcategories.length, 0), 26);

  const allSlugs = categories.flatMap((category) => [category.slug, ...category.subcategories.map((subcategory) => subcategory.slug)]);
  assert.equal(new Set(allSlugs).size, allSlugs.length);

  const collections = listEzpacIndustryCollections();
  assert.equal(collections.length, 9);
  assert.deepEqual(
    categories.at(-1)?.subcategories,
    collections.map((collection) => ({
      id: collection.id,
      slug: ezpacIndustryCollectionCategorySlug(collection.slug),
      name: collection.name,
    })),
  );
});

test("all 55 product starters retain their exact primary and field-preset mappings", () => {
  const categories = listEzpacPackagingCategories();
  const productTypes = listEzpacPackagingProductTypes();
  assert.equal(productTypes.length, 55);
  assert.deepEqual(productTypes.map((productType) => productType.id), EXPECTED_PRODUCT_IDS);
  assert.equal(new Set(productTypes.map((productType) => productType.id)).size, 55);
  assert.equal(new Set(productTypes.map((productType) => productType.slug)).size, 55);
  assert.ok(productTypes.every((productType) => productType.id === productType.slug));

  const sellableSubcategoryOwners = new Map(
    categories
      .filter((category) => category.id !== "industry-collections")
      .flatMap((category) => category.subcategories.map((subcategory) => [subcategory.id, category.id] as const)),
  );
  const primaryRoutes: Record<string, string[]> = {};
  for (const productType of productTypes) {
    assert.equal(sellableSubcategoryOwners.get(productType.primarySubcategoryId), productType.primaryCategoryId);
    const route = `${productType.primaryCategoryId}/${productType.primarySubcategoryId}`;
    (primaryRoutes[route] ??= []).push(productType.id);
    assert.equal(
      productType.fieldPresetId,
      SPECIALIZED_FIELD_ROUTES[productType.id] ?? "generic-packaging",
    );
    assert.equal(new Set(productType.collectionIds).size, productType.collectionIds.length);
    assert.ok(productType.collectionIds.length > 0);
  }
  assert.deepEqual(primaryRoutes, EXPECTED_PRIMARY_ROUTES);

  const collectionIds = new Set(listEzpacIndustryCollections().map((collection) => collection.id));
  assert.ok(productTypes.every((productType) => productType.collectionIds.every((id) => collectionIds.has(id))));
  assert.deepEqual(
    Object.fromEntries([...collectionIds].map((collectionId) => [
      collectionId,
      productTypes
        .filter((productType) => productType.collectionIds.includes(collectionId))
        .map((productType) => productType.id),
    ])),
    EXPECTED_COLLECTION_ROUTES,
  );
  assert.ok(productTypes.every((productType) => isEzpacPackagingProductType(productType.id)));
  assert.equal(isEzpacPackagingProductType("unknown-packaging-type"), false);
  assert.equal(isEzpacPackagingProductType(undefined), false);
});

test("all eight field presets retain exact, price-free, admin-safe fields", () => {
  assert.deepEqual(
    EZPAC_PACKAGING_FIELD_PRESETS.map((preset) => preset.id),
    Object.keys(EXPECTED_FIELD_KEYS),
  );
  for (const presetId of Object.keys(EXPECTED_FIELD_KEYS) as PackagingFieldPresetId[]) {
    const preset = getEzpacPackagingFieldPreset(presetId);
    assert.deepEqual(preset.fields.map((field) => field.key), EXPECTED_FIELD_KEYS[presetId]);
    assert.equal(new Set(preset.fields.map((field) => field.key)).size, preset.fields.length);

    for (const field of preset.fields) {
      assert.equal("priceDelta" in field, false);
      if (field.optionSource === "admin_configured") {
        assert.equal(field.inputType, "select");
        assert.equal(field.options, undefined);
      }
      if (field.optionSource === "fixed") {
        assert.equal(field.inputType, "select");
        assert.ok(field.options?.length);
        assert.equal(new Set(field.options?.map((option) => option.value)).size, field.options?.length);
      }
      if (field.required && field.inputType === "number") {
        assert.ok((field.minValue ?? 0) > 0);
      }
      assert.ok(field.options?.every((option) => option.priceDelta === undefined) ?? true);
    }
  }

  assert.deepEqual(
    getEzpacPackagingFieldsForProductType("unknown-product").map((field) => field.key),
    EXPECTED_FIELD_KEYS["generic-packaging"],
  );
});
