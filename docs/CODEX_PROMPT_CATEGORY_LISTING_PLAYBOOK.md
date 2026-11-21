# Codex task — Category Listing Playbook: every category knows what a new product needs (fields, pricing, GST, artwork, 2D studio, 3D preview)

Read this document fully before touching code. Goal: when an admin lists a product,
**the chosen category drives everything** — starter fields, print surface, artwork
policy, GST, price-band sanity, "Also list in" collections, and the right 3D model —
so a correct, imported-grade listing takes the same ≤5 decisions the quick-list
wizard already enforces. Today those defaults exist only for 8 RanBazaar starters
and the packaging presets; most categories give the admin a blank, and admin-listed
products end up *worse* than the 425 imported ones (no GST, no MRP, no tags, no SEO,
no 3D). This task closes that gap with a data-backed playbook.

All counts below were verified against the live DB on 2026-11-21; the full
per-category study is in `docs/research/category-listing-study.json` — regenerate
if the catalog has changed materially (script pattern: group products by
`categoryId`, aggregate personalization labels, tax, policies, configurator).

## 0. Ground rules

1. **This is NOT the Next.js you know.** Read the relevant guide in
   `node_modules/next/dist/docs/` before touching any route/component.
2. **No new runtime dependencies.** New pure logic lives in `src/lib/*.ts` with
   `node:test` coverage (the `test:domain` glob).
3. **Do not touch** the external importer's fidelity mappings
   (`scripts/import-external-catalog/catalog-import.ts` field/tax/price logic),
   the imported rows' content, or `checkProductPublishReadiness` *semantics*
   (`src/lib/admin-quick-list.ts:127`). §6 is the only section that may change
   the importer, and only its *category resolution*.
4. **Admin API changes are allowed ONLY as §4 lists them** — additive, optional,
   back-compatible. Nothing existing breaks if the new fields are absent.
5. **3D invariant is sacred** (`assertProductPreviewAllowed`,
   `src/app/api/admin/catalog/route.ts:285`): template-backed 3D requires the
   product's own PUBLISHED `VisualizationTemplate` and `productModel` equal to
   `resolveVisualizationProductModel(template)`; built-in 3D (non-packaging
   product types) requires only a valid `productModel` from `productModelSchema`.
   Never weaken it; never enable 3D on an ambiguous shape.
6. **Gates:** `npm run typecheck`, `npm run build`, `npm run test:domain`,
   `npm run test:external-catalog` (§6 only), then the §8 walkthrough.

## 1. Verified current state (2026-11-21 — spot-check, then build on it)

- **435 products** (425 imported ACTIVE + 10 demo), **68 categories**, 44 with
  primary products, 24 empty.
- Quick-list wizard (`src/components/admin/QuickListProductWizard.tsx`, 593
  lines) + `src/lib/listing-wizard.ts` already implement: search-first sources
  (8 RanBazaar starters, ~40 packaging product types, "List similar", blank),
  `autoSku`, live preview, readiness checklist, publishNow. The advanced drawer
  is edit-only. **Build on this; do not re-architect it.**
- Category picker (wizard lines 187–192) excludes only `industry-collections`.
  It still offers: `imported-ranbazaar > *` (16 fallback buckets, 179 products),
  `imported-ezpac > *` (4 buckets incl. the malformed
  `paper-bagspaper-bags-carriers` and `paper-bags-2`, 12 products), and the
  test categories `bhautesh`, `bhautesh > bhautesh1`, `notestick` (0 products).
- `productSchema` (admin catalog POST/PATCH) has **no MRP/compare-at, no tax,
  no tags, no SEO** fields → admin-created rows get `tags:[]`,
  `taxRateBasisPoints:0`, `compareAtPricePaise:null`, `seoTitle:null`, variant
  `inventoryPolicy:"MADE_TO_ORDER"` always. Imported rows carry all of these
  (342 taxed, 103 name-slips with MRP strikethrough, 360 with SEO). This is the
  single biggest "admin product looks cheaper than imported product" gap.
- **3D today:** 34 EzPac products with template-backed 3D (folding-carton 27,
  paper-bag 4, square-box 1, mailer-box 1, stand-up-pouch 1), enabled by
  `scripts/import-external-catalog/3d-enable.ts` via the visualization studio in
  MANUAL mode. 30 EzPac products deliberately skipped as ambiguous (see
  `docs/research/3d-enable-report.json`). **0 demo / 0 Ranbazaar products use
  3D**, yet `src/components/configurator/product-3d-model.ts` ships built-in
  parametric geometry for all 18 `productModelSchema` models (label-pack,
  waterproof-sheet, school-kit, notebook, bottle-label, pencil-set, tag,
  geometry-box, gift-ribbon, keychain-duo, bulk-grid, rectangular-box,
  square-box, folding-carton, mailer-box, paper-bag, stand-up-pouch,
  product-sleeve), and the invariant allows built-in models on non-packaging
  product types without any template. Untapped.
- Packaging "admin_configured" selects (material, lamination, GSM…) are listed
  disabled until a super admin fills options (`optionSource` contract in
  `src/lib/ezpac-packaging-presets.ts:117`). No UI nudges anyone to do this.
- 168 imported Ranbazaar products are photo-personalization products whose
  photo slots could not be imported (no customer-image input type), so whole
  buckets sit with `customizable=false` (cake-topper 34, decorative-items 22,
  mouse-pad 8, t-shirts 4, customize-bottles 3). Our native **artwork-upload
  path supports photo personalization** (starter `artworkUpload` + per-surface
  image policy) — an admin relisting these the right way beats the import.

## 2. The playbook module (core deliverable)

New pure module `src/lib/category-listing-playbook.ts` + tests. One exported
table `CATEGORY_LISTING_PLAYBOOK` keyed by **category slug** (slugs are stable;
ids differ per environment — resolve ids at runtime from the categories the
admin UI already fetches). Each recipe:

```ts
interface CategoryListingRecipe {
  categorySlug: string;
  starterId?: RanBazaarCustomizationStarterId;   // 2D fields + surface + artwork
  packagingFieldPresetId?: PackagingFieldPresetId; // packaging spec fields
  gstPercent: 0 | 5 | 18;          // observed source majority (see table)
  priceBandRupees?: { min: number; max: number }; // nudge only, never blocking
  mrpExpected: boolean;            // show the MRP input prominently
  model3D?: VisualizationProductModel; // built-in model, or packaging template target
  threeDPath: "builtin" | "template" | "none";
  collectionSlugs?: string[];      // "Also list in" industry collections (ezpac tree)
  madeToOrder: boolean;            // variant inventory policy default
  notes?: string;                  // one admin-facing plain-language line
}
```

Data-backed recipes (field labels/λ, GST, bands all from the study — keep these
values; they mirror what the 435 live products actually do):

| Category slug | Starter / preset | GST | Band ₹ | MRP | 3D path → model |
|---|---|---|---|---|---|
| `customized-name-slips` | `name-slips` | 18 | 219–499 | yes | builtin → `label-pack` |
| `waterproof-stickers` | `name-slips` | 18 | 290–399 | yes | builtin → `waterproof-sheet` |
| `school-labels` | `name-slips` | 18 | 400–700 | no | builtin → `label-pack` |
| `personalized-notebooks` | `notebook` | 18 | 449–499 | yes | builtin → `notebook` |
| `personalized-pencils-pens` | `pen-pencil` | 18 | 235–869 | yes | builtin → `pencil-set` |
| `name-plates-keychains` | `name-plate` | 18 | 379–1598 | yes | builtin → `keychain-duo` |
| `bottle-tiffin-labels` | `bottle-tiffin` | 5 | 329–1025 | no | builtin → `bottle-label` |
| `school-accessories` | **new** `school-kit` starter (§2.1) | 18 | 230–899 | yes | builtin → `school-kit` |
| `personalized-gifts` | **new** `gift-slip` + `shagun-envelope` starters (§2.1) | 18 | 169–2399 | yes | builtin → `gift-ribbon` |
| `bulk-orders` | `name-slips` + tiers note | 18 | 1799+ | no | builtin → `bulk-grid` |
| `paper-bags` (custom-print bags) | `bag-luggage-tag` | 18 | 1200–1600 | yes | builtin → `paper-bag` |
| `boxes > soap-boxes` | preset `soap-box` | 0 | quote (0–10) | no | template → `folding-carton` |
| `boxes > perfume-cosmetic-boxes` | `generic-packaging` | 0 | quote | no | template → `folding-carton` |
| `boxes > specialty-boxes` | `generic-packaging` | 0 | quote | no | template → per shape (§5) |
| `boxes > gift-event-boxes` | `generic-packaging` | 0 | quote | no | template → `folding-carton` |
| `e-commerce-packaging > mailer-bags` | `courier-bag` | 0 | quote | no | template → `paper-bag` |
| `e-commerce-packaging > shipping-boxes` | `generic-packaging` | 0 | quote | no | template → `mailer-box` |
| `paper-bags > branded-carry-bags`, `> d-cut-paper-bags` | `paper-bag` | 0 | quote | no | template → `paper-bag` |
| `ziplock-pouch > branded-ziplock-pouches` | `ziplock-pouch` | 0 | quote | no | template → `stand-up-pouch` |
| `food-packaging > snack-confectionery-boxes` | `generic-packaging` | 0 | quote | no | template → `folding-carton` |
| `food-packaging > food-trays-delivery` | `generic-packaging` | 0 | quote | no | box-like only, else none |
| `food-packaging > food-pouches` | `ziplock-pouch` | 0 | quote | no | template → `stand-up-pouch` |
| `marketing-printing > stickers` | `flat-print` | 0 | quote | no | builtin → `waterproof-sheet` |
| `marketing-printing > business-cards` | `business-card` | 0 | quote | no | **none** |
| `marketing-printing > flyers-brochures` | `brochure` | 0 | quote | no | **none** |
| `marketing-printing > thank-you-hang-tags` | `flat-print` | 0 | quote | no | **none** (flat `tag` model only if it visually fits — check before enabling) |

GST note: several Ranbazaar-sourced rows in notebooks/pencils carry 0 bp
because the source omitted `tax_class`; the playbook default above follows the
curated-sibling majority (18) — record this choice in the report, and keep
`gstPercent` editable in the UI (§3).

### 2.1 New starters (exact fields from live data — do not invent)

Extend `src/lib/ranbazaar-customization-presets.ts` (same `STARTERS` shape):

- **`school-kit`** — observed on 7 school-accessories products (Roboto, 6
  fields): `Enter Name` (req, 40), `Enter Class or Phone` (req, 40),
  `Enter City or School` (opt, 60), `Enter Address` (opt, 120), `Enter Phone`
  (opt, 15, pattern digits), + `fontField()`. Surface: label sheet, aspect 1.6,
  suggested 150×90 mm. No artwork upload.
- **`gift-slip`** — observed on 30 gift-slip products: `Name` (req, 40) +
  `fontField()`. Surface aspect 1.875, 120×64 mm.
- **`shagun-envelope`** — observed on 4 shagun products (Aleo Regular):
  `Your Name` (req, 60), `Wishes` (opt, 120), `Address` (opt, 120) +
  `fontField()`. Surface portrait 0.7, 90×170 mm.
- **`photo-gift`** — for the 168-photo-slot pattern (cake toppers, mouse pads,
  decor, bottles, t-shirts): `Name` (opt, 40) + `fontField()`, surface with
  `imageMaximum: 1..2`, `artworkUpload` enabled (`IMAGE_MIME_TYPES`). This is
  the native answer to the source's `customerImg` slots.

Starter keys/labels are OURS (plain language) — do **not** copy the source's
typo'd labels ("ENETR YOUR NAME") into starters; those stay only on imported
rows, which keep their source UI text by fidelity rule.

## 3. Wizard integration — category drives the flow

In `QuickListProductWizard` + `listing-wizard.ts` (pure logic in the lib,
tested):

1. **Category-first entry.** Step 1 gains a compact category grid ("What shelf
   does it go on?") alongside search. Picking a category applies its recipe:
   starter draft, GST, MRP visibility, price band, collections, 3D suggestion.
   Picking a starter/search result keeps working and back-fills the category
   (today's `suggestedCategoryId` behavior) — both directions stay in sync.
2. **Defaults, not homework.** GST and collections are applied silently with a
   one-line summary chip ("GST 18% · Also in: Personal"); price input shows the
   band as helper text ("Similar products: ₹219–₹499") and warns — never
   blocks — outside 3× the band.
3. **Picker hygiene (UI-level, no data change).** Exclude from the wizard's
   category options: `imported-ranbazaar`, `imported-ezpac` and their children,
   plus inactive/test categories (`bhautesh*`, `notestick`). The advanced
   drawer keeps the full list for edits of existing imported rows.
4. **3D suggestion in review step.** If the recipe has `threeDPath:"builtin"`,
   show a toggle "3D preview (ready)" default ON — it just sets
   `allow3D:true, productModel:<model3D>` in the payload (valid without a
   template for non-packaging product types; add a `listing-wizard` unit test
   asserting the payload passes the invariant's rules). If
   `threeDPath:"template"`, keep the existing non-blocking hint and §5's
   one-click enablement after save. If `"none"`, show nothing.
5. **Packaging option-set nudge.** When a packaging preset with unconfigured
   `admin_configured` selects is chosen, the review step lists them as a
   non-blocking "Needs your print options once: Material, Lamination…" line
   pointing at the advanced editor — today they silently vanish.
6. Jargon rules, preview pane, ≤5 decisions, success panel: unchanged from the
   simple-listing task; this task must not regress its acceptance bar.

## 4. Admin API — minimal additive fields (parity with imported rows)

Extend `productSchema` and both create/update paths (`route.ts:595/721`),
optional with safe defaults; the playbook supplies values so the wizard never
asks the admin:

- `compareAtPrice?: number` → `compareAtPricePaise` (validate ≥ `price`;
  storefront strikethrough already works — 361 imported rows prove it).
- `gstPercent?: 0|5|18` → `taxRateBasisPoints` = ×100, `taxCode` =
  `IN-GST-<pct>` when >0 (mirror `ranbazaarTax`,
  `scripts/import-external-catalog/catalog-import.ts:483`).
- `tags?: string[]` (≤30, each ≤80 chars) → `Product.tags` (today hardcoded
  `[]`); wizard derives 3–6 tags from name + category name, editable later in
  the advanced drawer.
- `seoTitle?/seoDescription?` → sliced 160/320; wizard default: name /
  shortDescription.
- `stockOnHand?: number` → when >0: variant `inventoryPolicy:"CONTINUE"` +
  upsert `Inventory { quantityOnHand, reorderPoint: 5 }` (exactly the importer's
  G3 semantics); absent/0 → `MADE_TO_ORDER` as today.

PATCH must round-trip all five (advanced drawer shows them under an existing
section, plain labels: "MRP", "GST", "Tags", "Search snippet", "In stock").
No other schema change. Existing clients that omit them see identical behavior.

## 5. 3D preview — complete coverage (read carefully)

Two lanes, one invariant:

- **Built-in lane (non-packaging product types).** Setting
  `allow3D:true` + `productModel` from the 18-model enum is enough;
  `Product3DPreview` renders parametric geometry with the live 2D artwork
  textured on. Playbook recipes above assign: label-pack, waterproof-sheet,
  school-kit, notebook, bottle-label, pencil-set, keychain-duo, gift-ribbon,
  bulk-grid, paper-bag. **Do not** enable builtin 3D for shapes with no honest
  model (business cards, brochures, hang tags, trays) — a wrong box is worse
  than no 3D.
- **Template lane (packaging product types, `isEzpacPackagingProductType`).**
  Requires the product's own PUBLISHED template. Add a **one-click "Create 3D
  preview"** action on the wizard success panel and the product row for
  packaging products without one. It must reuse the proven pipeline, not
  reimplement it: POST `/api/admin/visualization-studio/from-product-image`
  (MANUAL mode, product's primary image) → confirm → publish → product
  metadata via the same path `3d-enable.ts` uses
  (`activateVisualizationProductMetadata`), which keeps
  allow3D/previewTemplate/productModel consistent. Model per §2 table; shape
  mapping stays conservative (box→folding-carton, square→square-box,
  mailer/shipping→mailer-box, bag→paper-bag, pouch→stand-up-pouch; anything
  else refuses with a friendly "this shape has no 3D model yet").
- Failure handling: if MANUAL analysis or publish fails, surface the message,
  leave `allow3D:false` — the §0.5 invariant would 422 a forced link anyway.
- Downscale rule from `3d-enable.ts` (≤1600px webp) applies to admin-uploaded
  heroes too — reuse its helper if extraction is needed.

## 6. Category hygiene (bounded; importer category-resolution only)

1. Deactivate (`isActive:false`) the test categories `bhautesh`,
   `bhautesh > bhautesh1`, `notestick` — 0 products each, verified.
2. Extend the **importer's** Ranbazaar category resolution so the 16
   `imported-ranbazaar > *` buckets map into curated categories (table below),
   then re-run the importer offline twice (§8.1-style convergence: run 2 = 0
   creates, 0 churn) so the 179 products move idempotently. Keep the fallback
   path for genuinely unknown future source categories.
   Map: premium-name-slips→`customized-name-slips`; exam-board, geometry-box,
   tracing-name-board, kids-utilities→`school-accessories`; gift-slip-for-gifts,
   cake-topper, decorative-items, shagun-envelopes→`personalized-gifts`;
   kids-bottle-tiffin-box, customize-bottles→`bottle-tiffin-labels`;
   wrapping-paper, vinyl-poster→keep under a renamed curated "Wrapping & posters"
   if nav wants it, else leave (decide, document); mouse-pad→`personalized-gifts`;
   t-shirts→leave pending a garments category (document); bulk-buy→`bulk-orders`.
3. Merge the malformed `imported-ezpac` buckets (`paper-bagspaper-bags-carriers`,
   `paper-bags-2`, `box`, `unclassified` — 12 products) into their obvious
   packaging subcategories via the same importer-mapping route (they correspond
   to the 12 `unmapped` handles in `EZPAC_SHOPIFY_PRODUCT_MAPPING`; map them).
4. Storefront nav/mega-menu must not render empty `imported-*` parents after
   the move (verify, don't assume it auto-hides).

## 7. Explicitly DO NOT

- No changes to imported rows' names/descriptions/prices/fields/labels (typos
  included — fidelity rule), no review/rating fields, no source SKUs.
- No auto-publishing of drafts; `publishNow` stays a per-listing choice.
- No mutation of `EZPAC_*` preset option values (admin_configured stays empty
  until a human fills them).
- No new 3D geometry builders; only the existing 18 models.
- No blocking validations from price bands or playbook hints — defaults and
  nudges only. The admin can always override category, GST, model, everything.
- Do not regress the simple-listing acceptance bar (≤5 inputs, ≤3 screens,
  zero jargon, live preview).

## 8. Verification walkthrough (after gates)

1. **Name-slip listing:** wizard → category "Customized name slips" → confirm
   starter auto-applied → name "Test Slip Z1", price 249, MRP 349, photo →
   publish. Check storefront `/products/test-slip-z1`: 2D studio fields render
   (required + maxLength), ₹349 strikethrough, builtin 3D toggle ON renders a
   label-pack canvas, GST 18% on the row (admin GET), tags non-empty,
   `/api/search?q=Test Slip Z1` finds it. Compare side-by-side with an imported
   name-slip — the admin listing must not look poorer (MRP, tax, tags, SEO, 3D).
2. **Photo-gift listing:** category "Personalized gifts" → `photo-gift`
   starter → publish → storefront studio accepts an image upload on the
   surface; gift-ribbon 3D renders.
3. **Packaging listing:** category "Soap boxes" → preset applied (dimension/GSM
   fields present but jargon-hidden), quote pricing, save as DRAFT → success
   panel "Create 3D preview" → template published → product GET does **not**
   422, detail page renders template-backed 3D. Unconfigured option-set nudge
   visible.
4. **Hygiene:** wizard picker shows no `imported-*`/test categories; after §6
   re-run, converged (second run zero churn), storefront nav clean, moved
   products' URLs still render (slugs unchanged — only categories moved).
5. **No-3D honesty:** business-card listing shows no 3D toggle anywhere.
6. Puppeteer screenshots of 1–3 + the 3D canvases into `docs/research/`
   (launch config as in `scripts/scrape-ranbazaar.cjs`). Delete test products.

## 9. Report

(a) per-category recipe table as shipped (slug → starter, GST, band, 3D path,
model); (b) before/after of one admin listing vs an equivalent imported product
(MRP/tax/tags/SEO/3D columns); (c) §6 move counts per bucket + convergence
proof; (d) 3D outcomes (builtin enabled count, template created count,
refused-ambiguous list); (e) gate outputs; (f) screenshots list; (g) open
decisions (wrapping-paper nav, t-shirts category, GST confirmations).
