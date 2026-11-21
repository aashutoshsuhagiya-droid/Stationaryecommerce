# Codex task — Make imported EzPac + Ranbazaar products same-to-same with their source sites (fields, customization, 3D), then list them live

Read this document before touching code. The import v1 already ran: **55 EzPac + 361 Ranbazaar
products exist in the DB (all DRAFT)** with name, description HTML, price, images, tags,
category. What is NOT there yet is the rest of the detail parity. This task closes the gap
field-by-field, wires the customization/3D features our site supports, fixes two broken
functions (storefront search still demo-only; nothing is published so nothing is "listed"),
and finishes by publishing + verifying. **Fidelity rule stands: anything the source does not
provide stays NULL — no invented content.**

## 0. Ground rules

1. **This is NOT the Next.js you know.** Read the relevant guide in
   `node_modules/next/dist/docs/` before touching any route/component.
2. **Idempotency is sacred.** Everything must go through the existing importer
   (`scripts/import-external-catalog/`) keyed on `metadata.importSource` +
   `metadata.externalId` (416 existing rows are keyed). No ad-hoc `psql` updates.
   Re-running the script after your changes must converge: same rows, same fields,
   no duplicates in `ProductPersonalizationField`, `ProductImage`, `ProductVariant`,
   `ProductCategory`, `Inventory`.
3. **Source snapshots are the input.** Ranbazaar: `docs/research/ranbazaar/products/*.json`
   (361 files, each `{ url, product }`) + `docs/research/ranbazaar/_api_p*.json`.
   EzPac: `docs/research/ezpac/products.json` (55 products, full Shopify shape).
   The importer's live-fetch path may re-download, but your code paths must work
   offline from these files (`--offline`).
4. **Gate:** `npm run typecheck`, `npm run build`, `npm run test:domain`,
   `npm run test:external-catalog`. Then the §8 walkthrough.
5. **No new runtime dependencies.**
6. **Destructive changes (publishing 416 products) happen ONLY in the final step
   (§7), after every check in §6/§8 passes.** Until then everything stays DRAFT.

## 1. Verified current state (do not re-derive; spot-check to confirm)

- 426 products in DB: 55 ezpac + 361 ranbazaar + 10 demo (ACTIVE).
- All imported rows: `customizable=false`, 0 `ProductPersonalizationField` rows belong to
  them (31 in DB are the demo products'), `metadata` has only
  `{importSource, externalId, externalKey, externalSlug}` — **no `configurator`**.
- All imported variants: `inventoryPolicy=DENY`, no `Inventory` rows for them
  (the 16 Inventory rows are demo's).
- `taxRateBasisPoints=0` for all imported; `seoTitle`/`seoDescription` NULL; `weightGrams`
  at product level N/A (variant-level weight is set).
- EzPac: 54/55 have `description` (source `body_html`), 51/55 have tags.
  The `EZPAC_SHOPIFY_PRODUCT_MAPPING` prefills (all 55 handles) were used for
  **category resolution only** — their `intro`/`bestFor`/`featureBullets`/`materialHint`
  were never written to the DB. Mapping image URLs already match live 55/55 (verified)
  — do not re-fetch or re-order images.
- Storefront `/api/products` uses `getStorefrontCatalog()` → only
  `status=ACTIVE AND publishedAt<=now` → **the 416 DRAFTs are invisible on the site
  right now.** That is the "listing" gap.
- `/api/search` calls `searchCatalog()` from `src/lib/catalog.ts` which is built on the
  **static demo arrays in `src/lib/data.ts`** — the imported catalog is not searchable.
- `VisualizationTemplate` table: 0 rows → no 3D anywhere.

## 2. Ranbazaar fidelity gaps (fix these in `catalog-import.ts` + `import.ts`)

For each gap: exact source field → exact target column. All 361 source records are in
`docs/research/ranbazaar/products/*.json` (`.product` key) — use them offline.

### G1 · Customization fields (the big one)
Source: 290/361 have `productType:"customize"`; 256 have
`customizeDetails[].inputFields[]` — entries shaped
`{ id, name, slug, type: "text"|"customize", style:{color,fontFamily,fontSize,textAlignment,rotation,textType}, ... }`
plus `customerImg[]` (photo-upload slots on the source site).
Our target: `ProductPersonalizationField` (one row per source field, `sortOrder` =
appearance order) + `Product.customizable=true` + a minimal
`metadata.configurator` block (see §2.5).

Mapping (write into `mapRanbazaarProductRecord` so it works for both API and page paths):
- **Field selection:** across all `customizeDetails`, collect fields with a non-empty
  `name` or `slug`. Skip pure `customerImg`-only slots UNLESS the
  `CustomizationStudio` already renders `inputType:"image"` fields — check
  `src/components/commerce/CustomizationStudio.tsx` field rendering (it currently
  handles text/number/select; if no image-field rendering exists, EXCLUDE photo
  slots and list them in the final report under "photo fields not yet supported",
  do not invent a new UI).
- **key:** source `slug` slugified (`[a-z0-9-]`, lower, hyphens); if blank →
  slugify the `name`; still blank → `field-{n}`. Dedupe within a product with
  `-2`, `-3` suffixes (source has typos like "enetr_your_name" that must not be
  mutated — key is ours, label is the source's).
- **label:** source `name` trimmed (the source's own typo'd label stays — it is
  their UI text; keep as-is). Max 120 chars → slice.
- **inputType:** source `type:"text"` → `"text"`. Source `type:"customize"` →
  `"text"` (their "customize" type is a plain styled text input on the live
  site — verified in the bundle; it takes name/school/wishes text).
- **required:** `true` for both (these are personalization inputs; the source
  page requires them before production).
- **maxLength:** 32 (our text fields' practical ceiling; covers "Aarav
  Mehta"-style names and short words the source accepts).
- **style → field:** carry `style` into `validation` JSON as
  `{ fontId: style.fontFamily, color: style.color, fontSize: Number(style.fontSize) }`
  when present (non-breaking for the storefront; the admin reader already
  tolerates extra validation keys). Record in the report.
- **Limit:** first 20 fields per product (admin schema cap); more → report the
  overflow list, still import the 20.

### G2 · Bulk quantity pricing
Source: 7 products carry `price: {"2":"175"}` (₹175/pc from qty 2; `sale`=base).
Target: `metadata.configurator` (`allow2D:true, quantityMin:1, quantityMax:100,
printAreas:[{id:"primary",label:"Primary print area"}]`) plus
`configurator.quantityTiers: [{ minimum: 2, priceDelta: 17500 - 23000 }]`
(priceDelta = tier price − base variant price, in rupees; our admin reader
expects rupee deltas — see `productSchema.quantityTiers` in
`src/app/api/admin/catalog/route.ts`). For products without tiers write the same
base configurator block with `quantityTiers: []`.

### G3 · Stock parity
Source `quantity`: 24 products `>0`, 311 `-1` (made-to-order), 26 `0`, and
**`backordering:true` on all** — i.e. on the source site every product is
orderable. Map to our variant:
- `quantity > 0` → `inventoryPolicy: "CONTINUE"` + upsert `Inventory`
  `{ quantityOnHand: quantity, reorderPoint: 5 }` for that variant.
- `quantity === 0 || -1` → `inventoryPolicy: "MADE_TO_ORDER"` (orderable, no
  stock claim — matches source backordering behavior; do NOT use `DENY`, which
  makes our availability filter hide them).
- Update re-runs: policy switches must be applied (a product gaining stock must
  flip to CONTINUE).

### G4 · Tax
Source `tax_class.percentage` ("18" | "5" | "0", 358/361) →
`taxRateBasisPoints`: 18→1800, 5→500, 0/missing→0, `taxCode`: "IN-GST-{pct}"
when pct>0 else null.

### G5 · SEO
Source `metaTitle` → `seoTitle` (slice to 160), `metaDescription` →
`seoDescription` (slice to 320 — source runs up to 1064 chars; record
truncation counts in the report). 1 product missing metaTags → tags already
fine (360/361 populated).

### §2.5 · Minimal configurator block (applies to ALL 361 Ranbazaar rows)
Set `metadata` (merge, keep `importSource/externalId/externalKey/externalSlug`):
```
{ ..., configurable/customizable: <G1> , configurator: {
    allow2D: true, allow3D: false, quantityMin: 1, quantityMax: 100,
    quantityTiers: <G2 or []>, setupCharge: 0,
    printAreas: [{ id: "primary", label: "Primary print area" }]
} }
```
AND `Product.customizable = (G1 fields > 0)`. `allow3D` stays false for all
Ranbazaar (no 3D on the source site — do not add it).

## 3. EzPac fidelity gaps (same importer, mapping-driven)

E1 · Apply the mapping prefill that v1 skipped. For every EzPac product whose
`handle` exists in `EZPAC_SHOPIFY_PRODUCT_MAPPING` (55/55):
- `prefills.intro` / `bestFor` / `featureBullets` →
  `metadata.configurator.structuredDescription = { intro, bestFor,
  featureBullets }` (bullets must be the exact `EZPAC_FEATURE_BULLETS` enum
  strings the mapping already uses — verified: they are).
- `featureBullets` → also `metadata.features` (storefront card list) via the
  same bullet keys.
- `materialHint` → `Product.material` (≤160 chars).
- `prefills.priceRupees > 0` → sanity check only: if the live variant price is
  0 but the mapping says a floor, DO NOT override price (live wins — 0 means
  quote-only); log mismatches to the report.
- `priceRupees === 0` → keep variants `MADE_TO_ORDER` (already correct).
- All 55 products also get the §2.5 configurator block (`allow3D:false`,
  `customizable: true` for packaging types since the source's whole value prop
  is custom branding + free 3D studio; `quantityMin`/`max` stay 1/100; `MOQ`
  bullets are marketing copy, not order constraints — say so in the report).

## 4. 3D models (EzPac packaging only — source advertises "free 3D studio")

Our pipeline (all in-repo, admin-gated):
`src/app/api/admin/visualization-studio/from-product-image/route.ts` starts a job from
the product's primary image → `VisualizationTemplate` (status PUBLISHED required) →
product needs `metadata.configurator.{ allow3D:true, previewTemplate:"visualization:<id>",
productModel }` where `productModel` **must equal the template's resolved model**
(`assertProductPreviewAllowed`, `src/app/api/admin/catalog/route.ts` — it 422s otherwise).

Rules:
1. **Conservative, per-preset mapping only.** Map a `productModel` from
   `EZPAC_PACKAGING_PRODUCT_TYPE_PRESETS` to the packaging enum
   (`folding-carton`/`mailer-box`/`paper-bag`/`stand-up-pouch`/`product-sleeve`/…)
   ONLY where the preset slug unambiguously names the shape (e.g. "slider"
   → `folding-carton` with a comment; window/mailer → `mailer-box`; pouch →
   `stand-up-pouch`; bag → `paper-bag`; box → `folding-carton`). Anything
   ambiguous → leave `allow3D:false`, list it under "3D skipped (ambiguous
   model)" in the report. Do not guess.
2. Run the studio in **MANUAL analysis mode** (no external AI calls —
   `analysisMode: MANUAL` needs no provider). One template per mapped product,
   `requestedBy` = the bootstrap admin user.
3. Set `allow3D:true` + `previewTemplate` + `productModel` **via a script in
   `scripts/import-external-catalog/3d-enable.ts`** (same idempotency: skip
   products that already have a PUBLISHED linked template), never by hand-editing
   metadata in the DB.
4. If manual analysis fails on a product's hero image, skip it (report), never
   force `allow3D` without a valid PUBLISHED template — the admin invariant will
   reject it later anyway.
5. This phase is **best-effort**: a partial result (e.g. 20 of 55) is acceptable,
   but the report must tabulate per-model counts.

## 5. Feature wiring (add) — the two broken functions

F1 · **Search must see the real catalog.** `src/app/api/search/route.ts` →
`searchCatalog()` in `src/lib/catalog.ts` operates on static demo data.
Rewrite the route to run the same scoring (`searchCatalog`'s algorithm — keep
its pure logic + its `node:test` coverage) over the runtime catalog:
`getStorefrontCatalog()` products + categories, same `normalize`/
`productSearchScore` functions (move or import them — do not duplicate the
fuzzy logic), same response shape (`{query, data:{products,
categories, suggestions, total}, meta}`). Demo products are already in the DB
(ACTIVE), so nothing is lost. Keep `Cache-Control` header.
F2 · **Product detail page static-param drift is acceptable** —
`/products/[slug]` already `force-dynamic`s; do not change it.

## 6. Explicitly DO NOT import / DO NOT add (removal list)

- **Reviews/ratings:** source `avgRating`/`totalReview` are THEIR reviews. Our
  `Review` model is order-verified; copying competitor review counts into our
  catalog is a misrepresentation → skip, leave NULL. State this decision in
  the report (user asked "same to same"; the honest answer: every field except
  social proof is now carried).
- **Source `sku` (their "225"-style codes)** → we keep our deterministic
  `EXT-RANBAZAAR-<id>-<n>` SKUs (already in `baseSku`/variants; reusing theirs
  would collide across sources).
- **No `productType` copy-paste:** our `metadata.productType` expects OUR enum
  values, not theirs; set `productType` only where a mapping preset defines one.
- No coupon/review/wishlist imports. No cron. No changes to demo catalog
  (`src/lib/data.ts`), templates, or admin UI components.

## 7. Publish step (only after §8 verification)

1. New script arg `--publish-verified` on the importer (or a separate
   `publish-imported.ts` in the same folder, your choice — document it): sets
   `status: ACTIVE` + `publishedAt: now` (or per-source batch) on rows whose
   `metadata.importSource ∈ {ezpac, ranbazaar}` AND that passed §8 spot checks
   (concretely: no open FAILED rows in the latest plan). Re-run-safe.
2. Publish EzPac first, smoke-test, then Ranbazaar (two separate runs so a
   bad batch doesn't mix both sources on the storefront).
3. Rollback note in the report: de-publishing is just
   `status→DRAFT, publishedAt→null`; SKUs/images/fields survive.

## 8. Verification (each must pass before §7)

1. **Re-run importer offline for both sources, twice.** Second run: 0 creates,
   416 updates with zero field churn after the first; row counts in
   `ProductPersonalizationField` (expected ≈ 256 products × their field
   counts, capped at 20), `Inventory` (24 new CONTINUE rows), no duplicate
   images/variants/links (PSQL counts identical between runs).
2. **DB spot check vs source (paste into report):** 3 random Ranbazaar rows —
   for each: `name` === source `name`, `description` === source `description`
   (byte-compare), `basePricePaise` = `sale*100`, `compareAtPricePaise` =
   `mrp*100`, tags == metaTags list, images in source order,
   personalizationFields labels == source `inputFields[].name` in order,
   tax basis points == source % ×100. Same 3-check for 3 random EzPac rows
   (including one where `materialHint` was empty and one where it wasn't).
3. **Storefront renders:** publish a 2-product smoke set (1 ezpac, 1 ranbazaar
   customize with fields) with `status ACTIVE` manually, hit
   `/products?category=<slug>`, `/products/<slug>`, and the customize studio
   on that product page: fields render, validation enforces required/maxLength.
   Screenshot evidence via the existing puppeteer-core setup. Then re-run the
   §7 batch publish for the rest.
4. **Search:** `/api/search?q=<term from an imported product's name>` returns
   that product; `q` of a demo product still returns the demo one.
5. **3D:** one PUBLISHED template linked on one ezpac packaging product with
   matching `productModel`; admin catalog GET for that product does NOT 422;
   `Product3DPreview` renders in the detail page (manual or puppeteer).
6. All test suites in §0.4 green.

## 9. Reporting

Tables: (a) per-gap before/after counts (fields, tiers, inventory, tax, seo,
material, structuredDescription, 3D linked/skipped); (b) the §8.2 paste of 6
spot-checks; (c) skipped lists (photo slots, ambiguous 3D, tag overflow, seo
truncations, price-floor mismatches); (d) publish batch sizes + rollback
one-liner; (e) commands + results for the gate suites.
