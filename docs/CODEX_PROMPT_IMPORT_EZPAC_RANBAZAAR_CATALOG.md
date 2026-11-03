# Codex task — Import the complete product catalog from EzPac + Ranbazaar into our catalog

Read this document before touching code. Goal: **every currently published
product on both source websites must exist in our database catalog, with its
details (name, price, description, variants, images, tags, availability)
verbatim from the source — no rewording, no summary, no guessing.**

## 0. Ground rules

1. **This is NOT the Next.js you know.** Read the relevant guide in
   `node_modules/next/dist/docs/` before touching anything.
2. **No new runtime dependencies.** Use what the repo already has
   (Node 18+ built-in `fetch`, Prisma client, node:test for tests).
3. **Write a one-off Node script under `scripts/`** (new directory, e.g.
   `scripts/import-external-catalog/`). Do NOT build this into an API route,
   an admin screen, or anything the browser can reach. The script is a
   maintenance tool: run it once, verify, commit the script + snapshots,
   leave it for re-runs.
4. **Fidelity rule (most important):**
   - `name` = source title, character for character. Do not slugify, don't
     lowercase, don't add suffixes like "(imported)".
   - `description` = source body/description HTML **as-is**. Do not strip
     lists/headings, do not summarize, do not "clean up" copy. Strip only
     scripts/trackers, and only after confirming they're absent or
     trivial. Store the full HTML.
   - `shortDescription` = the source's own short description if it exists,
     else the first paragraph of the description. Never invent one.
   - Prices: convert source paise/cents to our paise fields exactly
     (`basePricePaise`, `compareAtPricePaise`). No rounding, no "pricing
     policy" — 0 stays 0 (EzPac quote-only products are price 0; that is
     intentional, keep it 0).
   - Images: use the **source URLs directly** (Shopify CDN / Next.js image
     optimizer URLs). Do not re-host. Keep source image order (position 1 =
     hero). Alt text = product title when the source gives none.
   - Variants: one `ProductVariant` row per source variant, same display
     name, price, compare-at, availability, weight.
   - Anything the source doesn't provide → leave the column NULL/default.
     Never fill with invented content.
5. **Idempotency:** the script must be safely re-runnable. For every source
   product, derive a stable external key (see §3) and store it in the
   product's `metadata` JSON (e.g. `{"importSource":"ezpac","externalId":"15419663876325"}`
   / `{"importSource":"ranbazaar","externalId":"<source product id or URL-derived slug>"}`).
   On re-run: key found → update fields (name, description, prices, images,
   variants, tags, status/availability), never delete then recreate (order
   history / FK references would break). Key absent → create.
6. **Status:** create imported products as **DRAFT**. Do not publish.
   Publishing happens by hand later in admin. (If the script adds a
   `--publish` flag, it must be opt-in and default off.)
7. **Gate:** `npm run typecheck`, `npm run build`. The importer is a plain
   node script — add unit tests (node:test) for the *mapping/parsing*
   functions only (URL→category resolution, HTML→description handling,
   price conversion, key derivation). No tests for live network.

## 1. How our catalog stores products (target shape)

Prisma/Postgres. Key models in `src/generated/prisma/schema.prisma`:

- `Product`: `name` (≤180), `slug` (unique), `baseSku` (unique, ≤80),
  `categoryId` (required FK), `shortDescription` (≤400, nullable),
  `description` (text, nullable), `basePricePaise` (Int, required),
  `compareAtPricePaise` (Int, nullable), `material` (≤160, nullable),
  `dimensions` (JSON, nullable), `packSize` (default 1), `tags` (String[]),
  `metadata` (JSON, nullable — this is where the import key goes),
  `status` (DRAFT/ACTIVE/ARCHIVED), `publishedAt` (nullable).
- `ProductVariant`: `sku` (unique), `name`, `optionValues` (JSON,
  **required**), `pricePaise`, `compareAtPricePaise` (nullable),
  `weightGrams` (nullable), `inventoryPolicy` (default DENY — use
  `MADE_TO_ORDER` for imported quote-only/0-price products; `CONTINUE` with
  `Inventory.quantityOnHand` if the source exposes stock), `isActive`.
- `ProductImage`: `url`, `altText`, `sortOrder` (1-based, hero = 1),
  `width`/`height` (nullable — Shopify JSON gives them; set them).
- `Category`: `name`, `slug` (unique), `parentId` (nullable), `description`,
  `sortOrder`, `isActive`.
- `ProductCategory`: cross-listing (a product may belong to several
  categories; primary = the `Product.categoryId` FK).

Existing importer helpers to **reuse, don't duplicate**:
`src/lib/ezpac-product-mapping.ts` (per-handle prefill mapping for EzPac),
`src/lib/ezpac-packaging-presets.ts` + `EZPAC_PACKAGING_CATEGORY_PRESETS`,
`src/lib/ranbazaar-category-presets.ts` (`RANBAZAAR_CATEGORY_PRESETS`,
`findRanBazaarCategoryMatch`, `getRanBazaarCategoryGroup`),
`src/lib/product-category-links.ts`. The admin catalog API
(`src/app/api/admin/catalog/route.ts`) is the schema of record for what a
valid product payload looks like — mirror its validation rules for slugs
(lowercase, hyphens), image URLs, and SKU shape.

**SKU rule:** source products have no SKUs we can trust as unique. Generate
deterministic ones: `EXT-{SOURCE}-{externalId}-{variantOrdinal}` for
variants (variant 1 is also the base SKU's suffix, i.e. base =
`EXT-{SOURCE}-{externalId}-1`). Document this in the script header.

**Slug rule:** slugify the source title (same algorithm as the admin
route), append `-2`, `-3` … until unique on collision. Record the final
slug in `metadata.externalSlug` so re-runs don't shift slugs around.

## 2. Source A — EzPac (Shopify, https://ezpac.in)

Public, no auth, no CORS issues. Verified working today:

```
GET https://ezpac.in/products.json?limit=250&page=N
```

- Returns `{ "products": [ … ] }`. Each product: `id`, `title`, `handle`,
  `body_html` (full description HTML, often empty — empty is fine, keep
  NULL, do not invent copy), `published_at`, `vendor`, `product_type`,
  `tags` (String[], store as-is into `tags`), `variants[]` (`id`, `title`,
  `option1..3`, `sku`, `price` "0.00"-style **string, parse as
  Number → paise ×100**, `compare_at_price` (nullable), `available`
  (boolean), `grams`, `taxable`, `position`), `images[]` (`src`,
  `alt`?, `width`, `height`, `position`), `options[]`.
- Pagination: `limit=250` is allowed by Shopify. Loop pages until a page
  returns 0 products. Today: **55 products on page 1**. The total will grow
  — the script must count and report, not hardcode.
- Snapshot the raw JSON per page into
  `docs/research/ezpac/products.json` **only if** the existing snapshot in
  that folder is stale or missing (it was used to build
  `ezpac-product-mapping.ts` earlier — check its mtime/shape first; prefer
  re-downloading when the importer first runs so the mapping file's
  "deliberately plain typed data" snapshot remains authoritative).
  **Do not** modify the existing `docs/research/ezpac/products.json` unless
  `EZPAC_SHOPIFY_PRODUCT_MAPPING` in `ezpac-product-mapping.ts` stops
  covering handles it has today. If new handles appear that the mapping
  doesn't know, log them in the dry-run report as "unmapped" and still
  import them with defaults (the mapping only enriches, never blocks).
- Category resolution order:
  1. `findRanBazaarCategoryMatch`/EzPac presets match on `handle`+`title`
     (use `EZPAC_SHOPIFY_PRODUCT_MAPPING`'s `presetId` →
     `EZPAC_PACKAGING_CATEGORY_PRESETS` → category row).
  2. else map `product_type` (comma-separated) to a category name; create
     missing categories under a parent category
     "Imported · EzPac" (create that parent once, `isActive: true`),
     slug from the type, `sortOrder` stable by name.
  3. else parent "Imported · EzPac / Unclassified".
- Prices are mostly `0.00` (quote-only) — that is EzPac's business model,
  keep 0, and set variant `inventoryPolicy: MADE_TO_ORDER`.

## 3. Source B — Ranbazaar (custom React app, https://ranbazaar.com)

**Do not** plan around the list API being open. Today's state:
- Frontend calls `POST https://api.ckbox.io/api/allproducts`
  (category-wise product list) and `POST /api/backend/products`,
  `GET/POST /api/getproduct/...`. All return **401 Unauthorized** without a
  session/auth header (the app signs requests; the bundle's `CKBox-*`
  headers are for CKEditor, not the site API). Assume they stay 401.
- Product **pages are server-rendered** with Next.js: each page
  (e.g. `https://ranbazaar.com/product/<slug>`) contains a
  `__NEXT_DATA__` (or equivalent embedded) JSON blob with the full product:
  images array, price, MRP/compare-at, description, specs, variants/
  attributes, availability. **This is the primary route.**

Discovery + fetch plan (verify each against the live site before coding;
report what you found in your final summary):

1. **Enumeration:** there is no public sitemap.xml. The homepage
   (`/home.html` snapshot in `docs/research/ranbazaar/`) and the JS bundle
   (`docs/research/ranbazaar/main.js`, already in the repo — it's the same
   `main.da117eea.js` shipped today; re-download if the bundle hash in
   the live page's `<script defer src>` differs) contain the category list
   and product links. Extract every `/product/<slug>` link from:
   - the homepage HTML,
   - each category listing page (the bundle's route patterns show the
     listing URLs — e.g. `/category/<slug>` or `?category=` params; confirm
     by fetching one),
   - any in-page "load more"/pagination the listing route exposes
     (the listing calls `api/backend/products` — if 401, the listing is
     client-side; then the category page's `__NEXT_DATA__` seed may already
     include the first N products plus the full product id list — inspect
     and report).
   - **Safety net:** also fetch Google's cache / Bing of site: links is NOT
     acceptable. Instead: after step 2, cross-check the count against the
     listing page's own "showing X of Y" / total text if present, and log
     every discrepancy in the dry-run report.
2. **Per-product fetch:** `GET https://ranbazaar.com/product/<slug>`,
   parse the embedded JSON (Next.js `__NEXT_DATA__` script tag), extract:
   `name`, `description` (full, verbatim — strip only `<script>`),
   `images[]` (the site's image optimizer URLs — keep them as-is; include
   width/height only if present in the payload), `price`, `mrp`/`compareAt`,
   `attributes`/`specs` (store the pairs in `dimensions` JSON, e.g.
   `{"specs": [..]}` — the schema has no better home, don't create one),
   `variants`/size-color options (one ProductVariant each; single-option
   products get exactly one variant named "Default Title" like the
   Shopify side for symmetry… actually name it the source's own option
   label when present, else "Default Title"), `availability`.
3. **Category resolution:** use `findRanBazaarCategoryMatch` /
   `getRanBazaarCategoryGroup` (the bundle + research snapshot tell you the
   source's category names; `RANBAZAAR_CATEGORY_PRESETS` maps them to ours).
   Unmatched → parent "Imported · Ranbazaar" (create once), child = source
   category name.
4. **Rate + robustness:** 1 request/sec between product pages, 3 retries
   with 5s backoff on non-200, save every raw HTML+parsed JSON to
   `docs/research/ranbazaar/products/<slug>.json` as the snapshot trail.
   A product that 404s at import time = skipped + reported, never crash.
5. If during discovery you find a working JSON list endpoint (maybe the
   listing page proxies its own API server-side), **use it for
   enumeration, keep per-product page fetches for fidelity** — and say so
   in the report.

## 4. The script itself

Single entry `scripts/import-external-catalog/import.ts` (run via the
repo's existing tsx/ts-node setup — check `package.json` scripts; add one
script entry `import:external-catalog`). CLI:

```
npm run import:external-catalog -- --source=ezpac|ranbazaar|both \
  [--dry-run] [--publish]
```

- `--dry-run` (default when run with no flag? No — **explicit**: run
  bare, it writes. The first documented step is always dry-run): fetch
  everything, build the full change plan, print a table:
  `source · externalId · title · N categories · M images · K variants ·
  price · NEW|UPDATE · slug` plus a totals block (counts, "X source
  products, Y already in DB, Z to create, W to update, V failed
  (list of slugs+reasons)"). Write the plan JSON to
  `docs/research/import-plan-<date>.json`.
- Real run: upsert in Prisma **per product in its own transaction**
  (product + variants upsert-by-sku + images upsert-by-sortOrder +
  category links + `metadata` key), commit, continue on individual
  failures, final summary + exit code 1 if any failures.
- Log every DB write to stdout with the external key, so a partial run is
  auditable.

## 5. Non-goals

- No changes to API routes, admin UI, or storefront components.
- No SEO titles/descriptions (NULL is fine; source doesn't publish them
  to us).
- No reviews, no reviews-averages, no stock counts beyond availability.
- Do not touch `src/lib/data.ts`'s demo catalog or `templates`.
- No cron, no CI job — this is a one-off import + re-run tool.

## 6. Acceptance (run these, report each result)

1. **Completeness (the "sab products as-is" check):**
   - EzPac: count of `products[]` items across pages (expect 55 today,
     may be more) === count of products in DB where
     `metadata->>'importSource' = 'ezpac'` (after run) with no failures in
     the plan. Spot-open 5 random DB rows, open the live source page
     side by side: title identical, description HTML identical, all source
     images present in order, variant count + prices identical, price 0
     stays 0.
   - Ranbazaar: every discovered `/product/<slug>` link has a DB row or a
     reported failure with a URL. Spot-open 5 random ones the same way.
   - Print "discovered N, imported M, failed K, failed list".
2. `npm run typecheck` and `npm run build` green.
3. Unit tests for: price "0.00"→0 paise, "109.99"→10999 paise, slug
   collision suffixing, external-key derivation, and one
   Ranbazaar-`__NEXT_DATA__` fixture (snapshot a real page into
   `docs/research/ranbazaar/fixtures/<slug>.html` and assert the parser
   extracts title/images/price from it — fixture in repo, test offline).
4. **Idempotency proof:** run the importer twice on `ezpac`; the second
   run must report 0 creates, N updates with no field changes beyond
   `metadata` untouched, and must not duplicate variants or images
   (verify by counts in psql).
5. Homepage/products page still renders the demo catalog unchanged
   (`/products`, mega menu) — the import only adds DRAFT rows; confirm the
   storefront's active-product query still returns the same demo set.
6. Report: total products created per source, category breakdown, the 5
   side-by-side checks (paste the DB title vs source title), any skipped
   slugs + why, and whether Ranbazaar's list API stayed 401.

## 7. Order of work

1. Re-probe live: EzPac products.json shape/count; Ranbazaar bundle hash,
   `__NEXT_DATA__` location on 2 sample product pages, listing-page route
   patterns, allproducts API status. Write findings into a new
   `docs/research/import-probe.md` (short, factual).
2. Write the parsing/mapping modules + their unit tests (offline,
   fixtures only).
3. Wire the fetchers + Prisma upsert logic.
4. `--dry-run` for both sources; fix report issues; commit the plan JSON.
5. Real run for EzPac, verify §6.1/§6.4, commit.
6. Real run for Ranbazaar, verify §6.1, commit.
7. Final: leave the script + snapshots + tests in the repo. No cleanup
   commit needed.

## 8. Reporting format

Short sections: Probe findings / Plan summary (counts) / Per-source
results table (created/updated/failed) / Verification evidence (5 spot
checks, idempotency counts) / Open questions (e.g. which DRAFT products to
publish, any unclassifiable categories).
