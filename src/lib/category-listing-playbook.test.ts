import assert from "node:assert/strict";
import test from "node:test";

import {
  CATEGORY_LISTING_PLAYBOOK,
  deriveListingTags,
  deriveSeo,
  getCategoryListingRecipe,
  gstBasisPoints,
  gstTaxCode,
  listableCategories,
  priceBandHint,
  priceBandWarning,
  recipeSummaryChips,
} from "./category-listing-playbook";
import { getRanBazaarCustomizationStarter } from "./ranbazaar-customization-presets";
import { EZPAC_PACKAGING_FIELD_PRESETS } from "./ezpac-packaging-presets";

test("every recipe points at a real starter or packaging preset, never both-empty", () => {
  assert.ok(CATEGORY_LISTING_PLAYBOOK.length >= 25);
  const slugs = CATEGORY_LISTING_PLAYBOOK.map((recipe) => recipe.categorySlug);
  assert.equal(new Set(slugs).size, slugs.length, "category slugs must be unique");

  for (const recipe of CATEGORY_LISTING_PLAYBOOK) {
    assert.ok(
      recipe.starterId || recipe.packagingFieldPresetId,
      `${recipe.categorySlug} needs a starter or a packaging preset`,
    );
    if (recipe.starterId) {
      assert.ok(getRanBazaarCustomizationStarter(recipe.starterId), `${recipe.starterId} is not a registered starter`);
    }
    if (recipe.packagingFieldPresetId) {
      assert.ok(
        EZPAC_PACKAGING_FIELD_PRESETS.some((preset) => preset.id === recipe.packagingFieldPresetId),
        `${recipe.packagingFieldPresetId} is not a registered packaging preset`,
      );
    }
  }
});

test("3D paths stay honest: a model is required for 3D and forbidden without it", () => {
  for (const recipe of CATEGORY_LISTING_PLAYBOOK) {
    if (recipe.threeDPath === "none") {
      assert.equal(recipe.model3D, undefined, `${recipe.categorySlug} must not carry a model when 3D is off`);
    } else {
      assert.ok(recipe.model3D, `${recipe.categorySlug} promises 3D but names no model`);
    }
  }
  // Flat print shapes we deliberately refuse.
  for (const slug of ["business-cards", "flyers-brochures", "thank-you-hang-tags", "food-trays-delivery"]) {
    assert.equal(getCategoryListingRecipe(slug)?.threeDPath, "none", `${slug} must not offer 3D`);
  }
  // Packaging shelves must go through a published template, never built-in geometry.
  for (const slug of ["soap-boxes", "branded-ziplock-pouches", "shipping-boxes"]) {
    assert.equal(getCategoryListingRecipe(slug)?.threeDPath, "template");
  }
  assert.equal(getCategoryListingRecipe("customized-name-slips")?.threeDPath, "builtin");
});

test("each packaging shelf names the model that matches its real shape", () => {
  // A courier mailer is a flat poly envelope, not a gusseted paper bag.
  assert.equal(getCategoryListingRecipe("mailer-bags")?.model3D, "mailer-envelope");
  // Gift and event boxes are rigid lid-and-base boxes, not tuck-end cartons.
  assert.equal(getCategoryListingRecipe("gift-event-boxes")?.model3D, "rigid-lid-box");
  // Shipping boxes are corrugated cartons by default (mailers are picked by name).
  assert.equal(getCategoryListingRecipe("shipping-boxes")?.model3D, "rectangular-box");
  assert.equal(getCategoryListingRecipe("soap-boxes")?.model3D, "folding-carton");
  for (const slug of ["mailer-bags", "gift-event-boxes", "shipping-boxes"]) {
    assert.equal(getCategoryListingRecipe(slug)?.threeDPath, "template");
  }
});

test("GST maps to basis points and an Indian tax code", () => {
  assert.equal(gstBasisPoints(18), 1800);
  assert.equal(gstBasisPoints(5), 500);
  assert.equal(gstBasisPoints(0), 0);
  assert.equal(gstTaxCode(18), "IN-GST-18");
  assert.equal(gstTaxCode(0), null);
  assert.equal(getCategoryListingRecipe("bottle-tiffin-labels")?.gstPercent, 5);
  assert.equal(getCategoryListingRecipe("soap-boxes")?.gstPercent, 0);
});

test("price band nudges warn far outside the shelf and stay quiet inside it", () => {
  const recipe = getCategoryListingRecipe("customized-name-slips");
  assert.equal(priceBandHint(recipe), "Similar products: ₹219–₹499");
  assert.equal(priceBandWarning(recipe, 249), null);
  assert.equal(priceBandWarning(recipe, 900), null, "3x tolerance keeps ordinary prices quiet");
  assert.ok(priceBandWarning(recipe, 50)?.includes("low"));
  assert.ok(priceBandWarning(recipe, 5000)?.includes("high"));
  assert.equal(priceBandWarning(getCategoryListingRecipe("soap-boxes"), 10), null, "quote shelves have no band");
  assert.equal(priceBandWarning(undefined, 100), null);
});

test("listable categories hide import buckets, collections and test shelves", () => {
  const categories = [
    { id: "c1", slug: "customized-name-slips", name: "Customized Name Slips", parentId: null },
    { id: "c2", slug: "imported-ranbazaar", name: "Imported · Ranbazaar", parentId: null },
    { id: "c3", slug: "cake-topper", name: "Cake Topper", parentId: "c2" },
    { id: "c4", slug: "industry-collections", name: "Industry Collections", parentId: null },
    { id: "c5", slug: "collection-personal", name: "Personal", parentId: "c4" },
    { id: "c6", slug: "bhautesh", name: "bhautesh", parentId: null },
    { id: "c7", slug: "boxes", name: "Boxes", parentId: null },
    { id: "c8", slug: "soap-boxes", name: "Soap Boxes", parentId: "c7" },
    { id: "c9", slug: "archived-shelf", name: "Archived", parentId: null, isActive: false },
  ];
  assert.deepEqual(listableCategories(categories).map((category) => category.slug), [
    "customized-name-slips", "boxes", "soap-boxes",
  ]);
});

test("tags and SEO are derived so admin rows match imported rows", () => {
  const tags = deriveListingTags("Avenger Name Slip Pack of 36", "Customized Name Slips");
  assert.ok(tags.length >= 3 && tags.length <= 6);
  assert.equal(tags[0], "Customized Name Slips");
  assert.ok(tags.includes("avenger"));
  assert.ok(!tags.includes("of"), "stop words are dropped");
  assert.equal(new Set(tags.map((tag) => tag.toLowerCase())).size, tags.length, "tags are unique");

  const seo = deriveSeo("Avenger Name Slip", "Customized Name Slips", "<p>Waterproof slips</p>");
  assert.equal(seo.seoTitle, "Avenger Name Slip · Customized Name Slips");
  assert.equal(seo.seoDescription, "Waterproof slips");
  assert.ok(deriveSeo("X".repeat(300), "Y".repeat(100), "").seoTitle.length <= 160);
  assert.ok(deriveSeo("Plain", "Shelf", "").seoDescription.includes("Plain"));
});

test("summary chips read as plain language", () => {
  assert.deepEqual(
    recipeSummaryChips(getCategoryListingRecipe("customized-name-slips"), ["Personal"]),
    ["GST 18%", "Also in: Personal", "3D preview ready"],
  );
  assert.deepEqual(recipeSummaryChips(getCategoryListingRecipe("business-cards")), ["No GST on this shelf"]);
  assert.deepEqual(recipeSummaryChips(undefined), []);
});
