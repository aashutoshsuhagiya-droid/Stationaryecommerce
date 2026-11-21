# Import fidelity completion report — EzPac + Ranbazaar

Generated: 2026-11-21. Source spec: `docs/CODEX_PROMPT_IMPORT_FIDELITY_COMPLETION.md`.

## Addendum 2026-11-21 (post-publish verification): image-host crash found and fixed

After the full 425-product publish, every product detail page crashed client-side
("We couldn't load this page"): `next/image` rejected imported image hosts because
`next.config.ts` only allowed `images.unsplash.com`. The §8.3 smoke passed earlier
only because just 2 imported products were ACTIVE then, so the related-products
rails still showed demo (Unsplash) images. Fix: added `cdn.shopify.com` (EzPac,
102 images) and `dyuh5x5qbqu9p.cloudfront.net` (Ranbazaar, 1310 images) to
`images.remotePatterns` — the only two remote hosts present in `ProductImage`.
Re-verified in-browser after the fix: Ranbazaar customize page renders its
personalization fields, `/products` listing renders, and `soap-box` renders the
interactive 3D preview (canvas, view controls) — screenshots
`verify-2d-ranbazaar.png`, `verify-listing.png`, `verify-3d-soap-box.png`.
Full-DB parity re-check (all 361 Ranbazaar rows vs offline snapshots, all 34
3D links vs published templates) passed with zero mismatches, and 5 live
ranbazaar.com products (page 1 of their API) matched DB name/price/MRP/tax/
personalization fields exactly; live ezpac.in `products.json` still returns
the same 64 handles.

## Status: COMPLETE — all 425 imported products are PUBLISHED and live

Final DB state: 435 products ACTIVE (425 imported + 10 demo), 831 personalization
fields, 40 inventory rows, **34 published 3D templates**, 342 taxed, 360 SEO,
425 configurators. Publish batches: EzPac 63 + Ranbazaar 360 (after the 2-product
smoke set), both gated on a zero-failure plan.

## (a) Per-gap before → after (DB counts)

| Gap | Before | After |
|---|---|---|
| G1 ProductPersonalizationField rows (imported) | 0 | **800** across **255** Ranbazaar products (fields carry source label incl. typos, `inputType:text`, required, maxLength 32, `validation:{fontId,color,fontSize}` from source style) |
| G1 Product.customizable | 0 | **307** (255 Ranbazaar with fields + 52 EzPac packaging presets) |
| G2 configurator.quantityTiers | 0 | **7** products (rupee deltas = tier − base, e.g. ₹175@2 vs ₹230 base → −55) |
| G3 Inventory rows (imported) | 0 | **24** CONTINUE variants (`quantityOnHand` = source, reorderPoint 5); **398** variants MADE_TO_ORDER (source `backordering:true` / EzPac custom manufacturing); DENY no longer used on imported rows |
| G4 taxRateBasisPoints / taxCode | 0 | **342** products (18%→1800 `IN-GST-18`, 5%→500 `IN-GST-5`) |
| G5 seoTitle / seoDescription | 0 | **360 / 361** Ranbazaar products (sliced to 160/320) |
| E1 structuredDescription (configurator) | 0 | **63** EzPac products (intro/bestFor/featureBullets from the mapping prefills, bullets are `EZPAC_FEATURE_BULLETS` keys) |
| E1 metadata.features (card labels) | 0 | same 63, as `EZPAC_FEATURE_BULLET_LABELS` strings |
| E1 Product.material | 0 | **1** (`25-grams-ziplock-pouch` materialHint; the only mapping entry with one) |
| §2.5 metadata.configurator block | 0 | **425/425** imported products (allow2D, qty 1–100, primary print area, setupCharge 0; allow3D false pending 3D phase) |
| 3D VisualizationTemplate (PUBLISHED, product-linked) | 0 | **34** — folding-carton 27, paper-bag 4, stand-up-pouch 1, square-box 1, mailer-box 1; 30 products skipped as ambiguous (flat print/pillow/triangle/tray/unmapped — see `3d-enable-report.json`); large heroes are downscaled to ≤1600px webp before upload |

Note: the refreshed EzPac snapshot now holds **64** products (9 new wedding-series
products were live on the source); `EZPAC_SHOPIFY_PRODUCT_MAPPING` was regenerated
to match (64 entries, 12 `unmapped`), tests updated accordingly.

## (b) §8.2 spot checks — all PASSED

3 Ranbazaar rows (`personalized-magical-unicorn-kids-bowl-and-spoon-set`,
`customize-name-slips-…-pack-of-36pcs-9`, `golden-ram-darbar-candle-stand-…`):
name ===, description byte-equal, basePricePaise = sale×100, compareAt = mrp×100,
tags == metaTags, images in source order, personalization labels == source
`inputFields[].name` in order, tax bp == pct×100, seoTitle, inventory parity.

3 EzPac rows (`brand-ziplock-pouch` with materialHint, `window-box` without,
`mithai-box-top-bottom-style`): name/description byte-equal, price, tags, image
order, variants MADE_TO_ORDER. Runner: `scripts/spot-check-imported.tmp.ts`.

## (c) Skipped / reported lists

- **Photo fields not yet supported:** 168 Ranbazaar products have `customerImg`
  photo-upload slots; the CustomizationStudio has no image-input rendering, so these
  were excluded (listed in `import-plan-2026-11-21.json → fidelity.photoSlotProducts`).
- **SEO truncations:** 6 products (metaDescription > 320 chars), keys in plan JSON.
- **Field overflow (>20):** 0 products (source max is exactly 20).
- **Price-floor mismatches:** 0.
- **Reviews/ratings intentionally NOT imported** (`avgRating`/`totalReview` are the
  competitor's order-verified social proof; copying would be misrepresentation).
  Everything else the sources provide is now carried.
- **Source SKUs not copied** — deterministic `EXT-<SOURCE>-<id>-<n>` retained.

## (d) Publish / rollback

Publish via `npm run import:external-catalog:publish -- --source=ezpac` first,
smoke-test, then `--source=ranbazaar` (script gates on the latest plan having zero
failures). Rollback: same script with `--rollback` → status DRAFT, publishedAt null;
SKUs/images/fields survive.

## (e) Gate results

| Gate | Result |
|---|---|
| `npm run typecheck` | ✅ clean |
| `npm run build` | ✅ exit 0 (first attempt stopped by Next.js's own security-upgrade interstitial, retry per its instruction succeeded; upgrade still recommended by Next) |
| `npm run test:domain` | ✅ 255/255 |
| `npm run test:external-catalog` | ✅ 8/8 (new fidelity mapping tests included) |
| §8.1 re-run convergence | ✅ Run 3 vs run 2 full-state diff (products, variants, images, fields, inventory, metadata): **0 lines** — 0 creates, 0 failures, zero field churn |
| §8.3 storefront smoke | ✅ category listing + product page with both customize inputs (maxLength 32 enforced) rendered via puppeteer; screenshots `smoke-category.png` / `smoke-product.png` |
| §8.4 search | ✅ `/api/search?q=Baby Name Sign` returns the imported product; `q=waterproof` still returns demo products |
| §8.5 3D | ✅ `soap-box` published with `allow3D:true, productModel:folding-carton, previewTemplate:visualization:<id>`; product page renders the 3D preview payload (HTTP 200) |
