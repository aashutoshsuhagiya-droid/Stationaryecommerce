# Simple guided product listing — implementation report

Implements `docs/CODEX_PROMPT_SIMPLE_PRODUCT_LISTING.md`. Date: 2026-11-21.

## (a) Decisions required, before → after

| Mode | Before | After |
|---|---|---|
| Starter (RanBazaar) | 4 wizard steps; step 2 mixed essentials with publish choice, canvas-reuse checkbox, sample text, SKU, readiness | **5**: what it is → name, price, category (pre-picked), photo |
| Packaging | separate search box + dropdown inside a card, then the same 4 steps | **5**, same flow; packaging types are in the one search list |
| Blank | starter card → 4 steps | **5** (category pre-filled with the first active category) |
| Like an existing product | not possible (advanced form, ~30 inputs) | **3**: search the product by name → new name, price, photo |
| Entry points | "Quick add" + "Add product (advanced)" (two create paths) | **one** "Add product"; advanced settings open after saving, or per row via **Configure** |

Measured in the walkthrough: step 2 exposes **4 inputs** (name, price, category, photo); no `SKU`/`slug`/`mime`/`basis points` text is visible without expanding "Advanced details".

## (b) Files touched

| File | Change | Lines |
|---|---|---|
| `src/lib/listing-wizard.ts` (new) | pure logic: unified source search + ranking, copy-existing draft builder, essentials gate, payload builder with all defaults, ₹ preview formatting | 232 |
| `src/lib/listing-wizard.test.ts` (new) | 6 node:test cases | 108 |
| `src/components/admin/QuickListProductWizard.tsx` | 3-step flow, one search over starters + packaging + existing products, persistent live preview, calm readiness, advanced details collapsed | ~90 changed |
| `src/components/admin/ProductsPanel.tsx` | single "Add product" button, passes catalog products to the wizard, updated hint | 3 |
| `src/components/admin/admin.module.css` | search, no-results, preview pane/card, summary card, mobile preview toggle; **fixed a pre-existing bug** where `.quickListReady span` sized the label span to 14×14 px and made readiness rows overlap | ~25 |

No changes to `productSchema`, admin API routes, Prisma schema, the storefront, the importer, or imported products.

## (c) Tests and gates

| Gate | Result |
|---|---|
| `npm run typecheck` | ✅ clean |
| `npm run build` | ✅ exit 0 |
| `npm run test:domain` | ✅ 261/261 (6 new) |
| `npm run test:external-catalog` | ✅ 8/8 (untouched) |
| Walkthrough (puppeteer, 1366px + 390px) | ✅ 22/22 checks |

Walkthrough coverage: starter search → publish; copy-existing → publish; blank → draft;
live preview tracks name/price per keystroke and shows the photo before upload; published
page renders the customize inputs with maxLength enforced; readiness rows do not overlap;
mobile collapses the preview to a toggle.

## (d) Screenshots

`docs/research/listing-step1.png`, `listing-step2.png`, `listing-step3.png`,
`listing-success.png`, `listing-mobile.png`.

## (e) Readiness message rewordings

| Item | Old | New |
|---|---|---|
| physical-dimensions | "Print size set (mm)" | "Photo surface sizes set" |
| all items, ready | four green rows restating every check | one line: "Everything's ready — this goes live as soon as you publish." |
| all items, draft | "skipped for drafts" per row | one line: "Publish checks run later, when you publish it." |
| packaging-visualization | always listed | hidden unless the product is a packaging type |
| missing photo | generic error after pressing publish | "Photo — go back and add a product photo to publish." shown up front |

## Notes

- **Copy existing** copies configuration only (fields, print areas, artwork policy,
  category, product type, price and description as starting points). Identity is always
  new: fresh id, slug and SKU; the source product is never read-modified. Verified:
  fields/printAreas/artworkPolicy identical, id/slug/SKU distinct.
  One intentional difference — if the source has an empty accepted-image-type list
  (dormant when uploads are off), the copy gets the safe default `png, jpeg` so a later
  upload toggle cannot create a publish blocker.
- Three walkthrough products were created and deleted; the catalog is back to 435 ACTIVE.
