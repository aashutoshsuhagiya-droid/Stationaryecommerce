import assert from "node:assert/strict";
import test from "node:test";

import { getCategoryListingRecipe } from "./category-listing-playbook";
import {
  discardListing,
  ListingPublishError,
  listingRequestSchema,
  prepareListing,
  publishListing,
  threeDFieldsFor,
  type ListingProductState,
  type ListingPublishDeps,
  type ListingRequest,
} from "./listing-publish";

/**
 * An in-memory catalog that behaves like the real services where it matters:
 * template-backed 3D is only ever written by "publishing" the 3D template.
 */
function fakeCatalog(options: { categorySlug: string; fail3D?: boolean; failDesignOnce?: boolean; slugById?: Record<string, string> }) {
  const slugFor = (categoryId: unknown) => (typeof categoryId === "string" && options.slugById?.[categoryId]) || options.categorySlug;
  type Row = {
    id: string; slug: string; listingId: string; categorySlug: string; status: "DRAFT" | "ACTIVE";
    configurator: { allow3D: boolean; productModel?: string; previewTemplate?: string; printAreas?: unknown[] };
    designs: number; templates3D: number; assets: Array<{ id: string; kind: string; width: number; height: number }>;
    imageUrl: string; extraImages: unknown[];
  };
  const rows: Row[] = [];
  const calls = { create: 0, update: 0, design: 0, create3D: 0, publish: 0, writes: [] as Array<Record<string, unknown>> };
  let failDesign = options.failDesignOnce === true;
  const state = (row: Row): ListingProductState => ({
    id: row.id,
    slug: row.slug,
    categorySlug: row.categorySlug,
    published: row.status === "ACTIVE",
    threeDLink: row.configurator.allow3D && row.configurator.previewTemplate?.startsWith("visualization:") && row.configurator.productModel
      ? { allow3D: true, productModel: row.configurator.productModel, previewTemplate: row.configurator.previewTemplate }
      : null,
    studioPrintAreas: row.designs ? row.configurator.printAreas ?? null : null,
    hasStudioDesigns: row.designs > 0,
    hasPublished3D: row.templates3D > 0,
    assets: row.assets,
  });
  const find = (id: string) => {
    const row = rows.find((item) => item.id === id);
    if (!row) throw new ListingPublishError(404, "GONE", "gone");
    return row;
  };
  const deps: ListingPublishDeps = {
    async findByListingId(listingId, productIdHint) {
      const hinted = productIdHint ? rows.find((item) => item.id === productIdHint && item.listingId === listingId) : undefined;
      const row = hinted ?? rows.find((item) => item.listingId === listingId);
      return row ? state(row) : null;
    },
    async createProduct(listingId, product) {
      calls.create += 1;
      calls.writes.push(product);
      const row: Row = {
        id: `prod_${rows.length + 1}`, slug: `custom-name-slips-mws${rows.length + 1}abc`, listingId, categorySlug: options.categorySlug,
        status: "DRAFT", configurator: { allow3D: product.allow3D === true }, designs: 0, templates3D: 0, assets: [],
        imageUrl: String(product.imageUrl), extraImages: [],
      };
      rows.push(row);
      return { id: row.id };
    },
    async load(productId) { return state(find(productId)); },
    async categorySlugFor(categoryId) { return slugFor(categoryId); },
    recipeFor: (slug) => getCategoryListingRecipe(slug),
    async updateProduct(productId, product) {
      calls.update += 1;
      calls.writes.push(product);
      const row = find(productId);
      // Like the catalog: a full update writes whatever 3D fields it is given.
      row.configurator = {
        allow3D: product.allow3D === true,
        ...(typeof product.productModel === "string" ? { productModel: product.productModel } : {}),
        ...(typeof product.previewTemplate === "string" ? { previewTemplate: product.previewTemplate } : {}),
        ...(Array.isArray(product.printAreas) ? { printAreas: product.printAreas } : {}),
      };
      row.categorySlug = slugFor(product.categoryId);
      row.imageUrl = String(product.imageUrl);
      row.extraImages = Array.isArray(product.extraImages) ? product.extraImages : [];
      row.status = product.published === true ? "ACTIVE" : "DRAFT";
    },
    async createDefaultDesign(productId) {
      calls.design += 1;
      if (failDesign) { failDesign = false; throw new Error("database hiccup"); }
      const row = find(productId);
      if (row.designs) return false;
      row.designs = 1;
      row.configurator.printAreas = [{ id: "primary", label: "Design", widthMm: 50.8, heightMm: 50.8 }];
      return true;
    },
    async create3D(productId) {
      calls.create3D += 1;
      if (options.fail3D) throw new Error("Upload a product photo before creating a 3D preview.");
      const row = find(productId);
      if (row.templates3D) return {};
      row.templates3D = 1;
      // Publishing the template is the ONLY writer of the 3D link.
      row.configurator = { ...row.configurator, allow3D: true, productModel: "folding-carton", previewTemplate: "visualization:tmpl_1" };
      return {};
    },
    async setPublished(productId, published, slug) {
      calls.publish += 1;
      const row = find(productId);
      row.status = published ? "ACTIVE" : "DRAFT";
      if (slug) row.slug = slug;
      return row.slug;
    },
    async deleteDraft(productId) {
      const index = rows.findIndex((row) => row.id === productId && row.status === "DRAFT");
      if (index < 0) return false;
      rows.splice(index, 1);
      return true;
    },
  };
  const upload = (productId: string, id: string) => find(productId).assets.push({ id, kind: "primary", width: 1600, height: 1200 });
  return { deps, rows, calls, upload };
}

const request = (overrides: Partial<ListingRequest> = {}): ListingRequest => listingRequestSchema.parse({
  phase: "publish",
  listingId: "lst_test12345678",
  product: { name: "Rose Soap Box", sku: "ROSE-1", categoryId: "c-soap", price: 249, allow3D: true, productModel: "folding-carton", previewTemplate: "visualization:forged" },
  imageAssetIds: ["asset_main", "asset_side"],
  ...overrides,
});

async function preparedCatalog(options: Parameters<typeof fakeCatalog>[0]) {
  const catalog = fakeCatalog(options);
  const prepared = await prepareListing(catalog.deps, request({ phase: "prepare" }));
  catalog.upload(prepared.productId, "asset_main");
  catalog.upload(prepared.productId, "asset_side");
  return { ...catalog, productId: prepared.productId };
}

test("happy path with 3D: photos attached in order, 3D made from the photo, then published", async () => {
  const catalog = await preparedCatalog({ categorySlug: "soap-boxes" });
  const result = await publishListing(catalog.deps, request());
  assert.deepEqual(result.threeD, { status: "ready" });
  assert.equal(result.published, true);
  assert.equal(result.photoCount, 2);
  assert.equal(result.design2D, "none", "packaging keeps the free-form artwork editor");
  const row = catalog.rows[0];
  assert.equal(row.status, "ACTIVE");
  assert.equal(row.imageUrl, "/api/product-images/asset_main", "the main photo is first");
  assert.deepEqual(row.extraImages, [{ url: "/api/product-images/asset_side", width: 1600, height: 1200 }]);
  assert.equal(row.configurator.previewTemplate, "visualization:tmpl_1");
  assert.equal(catalog.calls.create3D, 1);
});

test("a personalised product gets its default 2D design and built-in 3D from the recipe", async () => {
  const catalog = await preparedCatalog({ categorySlug: "personalized-pencils-pens" });
  const result = await publishListing(catalog.deps, request());
  assert.equal(result.design2D, "created");
  assert.deepEqual(result.threeD, { status: "builtin" });
  assert.equal(catalog.calls.create3D, 0, "built-in shapes never create a 3D template");
  assert.equal(catalog.rows[0].configurator.productModel, "pencil-set");
});

test("a recipe without 3D publishes 2D only", async () => {
  const catalog = await preparedCatalog({ categorySlug: "business-cards" });
  const result = await publishListing(catalog.deps, request());
  assert.deepEqual(result.threeD, { status: "none" });
  assert.equal(result.published, true);
  assert.equal(catalog.rows[0].configurator.allow3D, false);
  assert.equal(catalog.calls.create3D, 0);
});

test("when 3D fails the product still publishes with 2D and says so in friendly words", async () => {
  const catalog = await preparedCatalog({ categorySlug: "soap-boxes", fail3D: true });
  const result = await publishListing(catalog.deps, request());
  assert.equal(result.threeD.status, "failed");
  assert.equal("message" in result.threeD && result.threeD.message, "3D preview couldn't be made from this photo.");
  assert.equal(result.published, true);
  assert.equal(catalog.rows[0].status, "ACTIVE");
  assert.equal(catalog.rows[0].configurator.allow3D, false);
});

test("retrying with the same listingId resumes and never duplicates the product, design or 3D template", async () => {
  const catalog = await preparedCatalog({ categorySlug: "customized-name-slips", failDesignOnce: true });
  await assert.rejects(publishListing(catalog.deps, request()), /hiccup/);
  assert.equal(catalog.rows[0].status, "DRAFT", "a failed run never goes live half-done");

  const first = await publishListing(catalog.deps, request());
  const second = await publishListing(catalog.deps, request());
  await prepareListing(catalog.deps, request({ phase: "prepare" }));
  assert.equal(catalog.rows.length, 1, "one product");
  assert.equal(catalog.calls.create, 1);
  assert.equal(first.design2D, "created");
  assert.equal(second.design2D, "existing", "the design is not made twice");
  assert.equal(catalog.rows[0].designs, 1);
  assert.deepEqual(catalog.rows[0].configurator.printAreas, [{ id: "primary", label: "Design", widthMm: 50.8, heightMm: 50.8 }], "a retry keeps the design's surface size");

  const box = await preparedCatalog({ categorySlug: "soap-boxes" });
  await publishListing(box.deps, request());
  const again = await publishListing(box.deps, request());
  assert.deepEqual(again.threeD, { status: "ready" });
  assert.equal(box.calls.create3D, 1, "the 3D template is made once");
  assert.equal(box.rows[0].configurator.previewTemplate, "visualization:tmpl_1", "the published 3D link survives the retry's detail update");
});

test("parallel double-clicks on the same listing create one product", async () => {
  const catalog = fakeCatalog({ categorySlug: "soap-boxes" });
  await Promise.all([
    prepareListing(catalog.deps, request({ phase: "prepare" })),
    prepareListing(catalog.deps, request({ phase: "prepare" })),
  ]);
  assert.equal(catalog.rows.length, 1);
});

test("allow3D invariant: the listing flow never writes template 3D fields, whatever the client sends", async () => {
  const catalog = await preparedCatalog({ categorySlug: "soap-boxes", fail3D: true });
  await publishListing(catalog.deps, request());
  for (const write of catalog.calls.writes) {
    assert.notEqual(write.allow3D, true, "no allow3D from the listing flow");
    assert.equal(write.productModel, undefined, "no productModel from the listing flow");
    assert.equal(write.previewTemplate, undefined, "no previewTemplate from the listing flow");
  }
  assert.deepEqual(threeDFieldsFor(getCategoryListingRecipe("soap-boxes"), null), { allow3D: false });
  assert.deepEqual(threeDFieldsFor(getCategoryListingRecipe("customized-name-slips"), null), { allow3D: true, productModel: "label-pack" });
  assert.deepEqual(threeDFieldsFor(getCategoryListingRecipe("business-cards"), null), { allow3D: false });
  const link = { allow3D: true as const, productModel: "folding-carton", previewTemplate: "visualization:t" };
  assert.deepEqual(threeDFieldsFor(getCategoryListingRecipe("soap-boxes"), { threeDLink: link }), link, "only an already-published link is carried over");
});

test("only this listing's own uploads can be attached, and Publish needs a photo", async () => {
  const catalog = await preparedCatalog({ categorySlug: "soap-boxes" });
  await assert.rejects(publishListing(catalog.deps, request({ imageAssetIds: ["someone_elses_asset"] })), /didn't finish uploading|did not finish uploading/);
  await assert.rejects(publishListing(catalog.deps, request({ imageAssetIds: [] })), /Add a photo to publish/);
  const draft = await publishListing(catalog.deps, request({ imageAssetIds: [], publish: false }));
  assert.equal(draft.published, false, "drafts may wait for photos");
  assert.deepEqual(draft.threeD, { status: "skipped", message: "Add a photo to get a 3D preview." });
});

test("Start over discards a never-published draft but never a live product", async () => {
  const catalog = await preparedCatalog({ categorySlug: "soap-boxes" });
  assert.deepEqual(await discardListing(catalog.deps, { listingId: "lst_test12345678" }), { discarded: true });
  assert.equal(catalog.rows.length, 0);

  const live = await preparedCatalog({ categorySlug: "soap-boxes" });
  await publishListing(live.deps, request());
  assert.deepEqual(await discardListing(live.deps, { listingId: "lst_test12345678" }), { discarded: false, kept: "published" });
  assert.equal(live.rows.length, 1);
});

test("the request schema refuses malformed listing ids and too many photos", () => {
  assert.equal(listingRequestSchema.safeParse({ phase: "publish", listingId: "../etc", product: {} }).success, false);
  assert.equal(listingRequestSchema.safeParse({ phase: "publish", listingId: "lst_test12345678", imageAssetIds: Array.from({ length: 9 }, (_, index) => `a${index}`) }).success, false);
  assert.equal(listingRequestSchema.safeParse({ phase: "discard", listingId: "lst_test12345678" }).success, true);
});

test("the shelf picked at publish decides 3D, not the first guess the draft was created under", async () => {
  // Drafted under name slips (built-in 3D) from the first photo; the admin then picked Soap box.
  const catalog = fakeCatalog({ categorySlug: "customized-name-slips", slugById: { "c-soap": "soap-boxes" } });
  const prepared = await prepareListing(catalog.deps, request({ phase: "prepare", product: { name: "Draft", categoryId: "c-slips" } }));
  catalog.upload(prepared.productId, "asset_main");
  const result = await publishListing(catalog.deps, request({ imageAssetIds: ["asset_main"], product: { name: "Rose Soap Box", categoryId: "c-soap", price: 45 } }));
  assert.deepEqual(result.threeD, { status: "ready" }, "the soap box gets its photo-made 3D");
  assert.equal(result.design2D, "none");
  for (const write of catalog.calls.writes) {
    assert.notEqual(write.productModel, "label-pack", "the name-slip model never reaches a soap box");
    assert.notEqual(write.allow3D, true);
  }
  assert.equal(catalog.rows[0].configurator.productModel, "folding-carton");
});

test("Server-Timing names each step and how long it took", async () => {
  const { timedListingDeps } = await import("./listing-publish");
  const catalog = await preparedCatalog({ categorySlug: "business-cards" });
  const { deps, serverTiming } = timedListingDeps(catalog.deps);
  await publishListing(deps, request());
  assert.match(serverTiming(), /updateProduct;dur=\d+;desc="1x"/);
  assert.match(serverTiming(), /setPublished;dur=\d+/);
  assert.equal(deps.recipeFor("soap-boxes")?.displayName, "Soap box", "plain functions pass through");
});

test("a first publish takes the URL from the real name; a live URL never changes", async () => {
  const { finalListingSlug } = await import("./listing-publish");
  assert.equal(finalListingSlug("custom-name-slips-mwswpqt8", "Custom Paper Bag"), "custom-paper-bag-mwswpqt8");
  assert.equal(finalListingSlug("custom-name-slips-mwswpqt8", ""), "custom-name-slips-mwswpqt8");
  assert.equal(finalListingSlug("oddslug", "Paper Bag"), "oddslug", "no unique suffix, no rename");

  const catalog = await preparedCatalog({ categorySlug: "paper-bags" });
  const first = await publishListing(catalog.deps, request({ product: { name: "Custom Paper Bag", categoryId: "c-bags", price: 1299 } }));
  assert.equal(first.slug, "custom-paper-bag-mws1abc");
  const renamed = await publishListing(catalog.deps, request({ product: { name: "Wedding Paper Bag", categoryId: "c-bags", price: 1299 } }));
  assert.equal(renamed.slug, "custom-paper-bag-mws1abc", "already live: the shared link keeps working");
});

test("a product id hint from another listing is ignored", async () => {
  const mine = await preparedCatalog({ categorySlug: "soap-boxes" });
  const otherId = "someone-elses-product";
  const result = await publishListing(mine.deps, request({ productId: otherId }));
  assert.equal(result.productId, mine.productId);
});

test("a personalised paper bag gets both its 2D name design and a 3D bag made from its photo", async () => {
  const catalog = await preparedCatalog({ categorySlug: "paper-bags" });
  const result = await publishListing(catalog.deps, request({ product: { name: "Custom Paper Bag", categoryId: "c-bags", price: 1299 } }));
  assert.equal(result.design2D, "created", "the name is personalised in 2D");
  assert.deepEqual(result.threeD, { status: "ready" }, "the bag's own photo is wrapped in 3D");
  assert.equal(catalog.calls.create3D, 1);
});
