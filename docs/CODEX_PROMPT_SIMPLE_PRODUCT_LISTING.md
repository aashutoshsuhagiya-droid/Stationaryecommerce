# Codex task — One simple, guided product-listing flow (admin)

> **Status: already implemented in this repo (2026-11-21).** See
> `docs/research/listing-flow-report.md` for what shipped, the gate results and
> screenshots. Keep this spec as the reference for the intended behaviour; do not
> hand it to another agent as new work without reading the report first.

Read this document fully before touching code. Goal: an admin should be able to
list a sellable product in **under 2 minutes with only 5 decisions** (what it is,
name, category, price, photo). Everything else must come from presets and smart
defaults, with advanced settings available *after* saving — never blocking the
first save.

## 0. Ground rules

1. **This is NOT the Next.js you know.** Read the relevant guide in
   `node_modules/next/dist/docs/` before touching any route/component.
2. **No schema or API-contract changes.** `productSchema` in
   `src/app/api/admin/catalog/route.ts` (POST/PATCH payload) stays exactly as it
   is; the simplification is a client-side reorganization plus default-building
   logic. No Prisma migration. No new runtime dependencies.
3. **Do not touch** the external importer (`scripts/import-external-catalog/`),
   the 425 imported products, the storefront (`src/app/(storefront)`,
   `src/lib/runtime-catalog.ts`, `src/lib/catalog.ts`), or the publish-gate
   *semantics* in `checkProductPublishReadiness` (`src/lib/admin-quick-list.ts:127`)
   — you may only reword its user-facing messages.
4. **Gates:** `npm run typecheck`, `npm run build`, `npm run test:domain`, plus
   the §5 walkthrough. New pure logic needs `node:test` coverage in
   `src/lib/*.test.ts` (that glob is what `test:domain` runs).

## 1. Verified current state (spot-check, then build on it)

- Two parallel listing experiences confuse admins:
  - **Quick add wizard** `src/components/admin/QuickListProductWizard.tsx`
    (4 steps: starter → essentials → photo/save → full-details readiness).
    Already has: starter modes (`ranbazaar` | `blank` | `packaging`), `autoSku`,
    live sample-text preview, `publishNow`, readiness checklist.
  - **"Add product (advanced)" drawer** in
    `src/components/admin/ProductsPanel.tsx` (~1,580 lines): raw category ids,
    multi-category, product type, template links, configuration fields (key /
    allowedPattern / options), print areas in mm, quantity tiers, artwork mime
    types + per-surface artwork policy, 3D model. ~30 inputs visible at once.
- Preset infrastructure already exists and must stay the single source of truth:
  - `createRanBazaarStarterDraft` (`src/lib/admin-quick-list.ts:46`) — fields,
    print areas, artwork policy per RanBazaar starter.
  - `EZPAC_PACKAGING_PRODUCT_TYPE_PRESETS` (`src/lib/ezpac-packaging-presets.ts`)
    — packaging types with category placement via `ezpacMappingCategory`
    (`src/lib/ezpac-product-mapping.ts`).
- Publish readiness is centralized in `checkProductPublishReadiness`; the
  wizard renders it at step 4.

## 2. Target UX — one flow, three steps

**Simplicity bar — hard acceptance criteria (the walkthrough fails if any is
broken):**
1. From "Add product" click to a published product: **≤ 5 required inputs**
   (what it is, name, category confirm, price, photo) and **≤ 3 screens**.
2. **Zero technical jargon** visible in the default flow: no "SKU", "slug",
   "mm", "mime type", "field key", "pattern", "basis points" on screen unless
   the admin expands an "edit" toggle. Labels are plain shop language
   ("Photo", "Price (₹)", "What customers can personalize").
3. **Every non-required value has a working default** — an admin who only
   fills the 5 inputs gets a complete, publishable product with no warnings.
4. Each step fits one laptop screen without scrolling walls; one primary
   button per screen; the current step is always obvious.
5. Live preview is always visible (or one tap away on mobile) and never lags
   behind what was typed.

**UI quality bar (visual polish is part of the acceptance, not optional):**
1. Everything must look native to the existing admin design system — reuse its
   tokens/classes (`styles.quickList*`, buttons, drawers); no new ad-hoc
   colors, fonts, or shadows that don't already exist in the stylesheet.
2. Clear visual hierarchy per step: one heading, one short helper line, inputs
   grouped with consistent spacing; step indicator shows done/current/next
   states distinctly.
3. Every interactive element has visible hover, focus-ring, disabled, and
   loading states. Primary button shows inline progress while saving
   ("Publishing…") — never a frozen or double-clickable button.
4. Friendly states for the edges: starter search with no results ("Kuch aur
   try karein ya blank se shuru karein" → plain-English equivalent), photo
   drop-zone empty/hover/invalid-file states, inline field errors next to the
   input (never only a top-level error blob).
5. No layout shift: preview pane has a fixed-ratio placeholder before a photo
   exists; text updates must not make the pane jump.
6. Success moment: after publish, a calm confirmation panel (product photo +
   name + "Live on site" link) — no raw JSON, no toast-only feedback.
7. Evidence: the §5 screenshots must show each state looking finished —
   aligned, consistently spaced, nothing clipped or overflowing at 1366px and
   at a narrow 390px viewport.

Make the wizard the **only** "Add product" entry point. Rename the drawer's
trigger to **"Advanced editor"** and open it exclusively for *editing an
existing product* (its create path is removed from the UI; keep the component
and its edit behavior intact).

Wizard becomes exactly three steps:

**Step 1 — "What are you selling?"**
- Search-first picker over all starters: RanBazaar customization starters +
  packaging presets + "Something else (blank)". One list, one search box
  (merge today's separate `packagingSearch`), with 6–8 most-used suggestions
  shown before typing.
- **"List similar" (the easiest path):** the same search also matches the
  shop's existing products by name; picking one prefills *everything*
  (category, fields, print areas, artwork policy, description, product type)
  from that product — the admin only supplies a new name, price, and photo.
  Copy configuration only; never link or mutate the source product, and
  always generate a fresh SKU/slug.
- Picking a starter prefills: configuration fields, print areas, artwork
  policy, product type, and **category** (via `ezpacMappingCategory` /
  starter metadata; keep today's `suggestedCategoryId` behavior). The category
  select is shown pre-selected, changeable, never empty-blocking (fall back to
  the first active category).

**Step 2 — "Name, price, photo"**
- Inputs: name (drives live `autoSku` + slug preview, both editable via a
  small "edit" toggle, hidden by default), price (₹), optional MRP
  (compare-at), one photo (drag/drop or file), optional 1-line description.
- Nothing else. No keys, no mm, no mime types here.

**Live preview (all steps, required)**
- A persistent right-hand preview pane shows the product *as the customer will
  see it*, updating live on every keystroke/choice:
  - After step 1: the starter's personalization fields rendered with the
    sample text (keep today's `sampleText` default "Aarav", editable inline in
    the pane) so the admin sees what customers will customize.
  - Step 2 onward: a storefront-style product card (photo as uploaded, name,
    price ₹, strikethrough MRP when set, category chip) above the
    personalization sample. Photo preview must appear immediately from the
    local file (object URL) — before any upload completes.
  - Step 3: the same pane becomes the review card ("Aisa hi dikhega" state —
    what you see is what goes live).
- Build it as a lightweight presentational component; do NOT mount the full
  `CustomizationStudio` in the wizard. Reuse the wizard's existing sample
  preview markup/styles as the base. On narrow screens the pane collapses to a
  "Preview" toggle above the step content.
- Compact summary card (photo, name, category, price, starter name, field
  count) + the readiness checklist from `checkProductPublishReadiness`
  reworded to plain language (e.g. "Photo surface sizes OK").
- Buttons: **"Publish now"** (default, disabled only while a *blocking* item
  is unready) and "Save as draft". After save: success panel with links
  "View on site" (`/products/<slug>`) and "Open advanced editor".
- All advanced concepts (quantity tiers, extra images, template links, 3D,
  per-surface artwork controls) are reachable only via "Open advanced editor"
  after the product exists.

## 3. Implementation notes

- Extract the step/default logic you add into a pure module
  `src/lib/listing-wizard.ts` (suggested): starter search/ranking, the
  "5 decisions → full `productSchema` payload" builder (apply defaults:
  `printAreas` default primary area, `allow2D:true`, `quantityMin/Max` 1/100,
  `acceptedArtworkTypes` from starter, etc.), and step-completeness checks.
  Unit-test that module (`src/lib/listing-wizard.test.ts`): payload passes a
  copy of the zod schema's expectations for a RanBazaar starter, a packaging
  preset, and blank mode; SKU/slug fallbacks; search ranking.
- Reuse the wizard's existing save path (admin catalog POST + image upload +
  attach). Do not duplicate fetch logic from the drawer.
- Keep keyboard/AT usability: steps are buttons already; preserve labels,
  `aria-*`, and focus handling when steps change.
- Respect the existing visual language (`styles.quickList*` classes); minor new
  styles go in the same stylesheet the wizard already uses.
- The ProductsPanel toolbar ends with two buttons: primary **"Add product"**
  (wizard) and secondary **"Advanced editor"** (opens drawer in edit mode via
  product row action only — if a toolbar fallback is needed, it opens a short
  explainer pointing to row-level "Configure").

## 4. Explicitly DO NOT

- No changes to `productSchema`, admin API routes, Prisma schema, storefront,
  importer, or imported rows.
- Do not delete the advanced drawer or any capability — only its *create*
  entry point moves behind the post-save "Open advanced editor" link and row
  edit.
- No new dependencies, no form libraries.
- Do not auto-publish anything existing; `publishNow` applies only to the new
  product being created.

## 5. Verification walkthrough (after gates pass)

1. `npm run dev`, sign in as admin, open Products.
2. List a product via a RanBazaar starter: step 1 search "name slip" → pick →
   category pre-selected; step 2 name "Test Name Slip A1" + price 199 + photo;
   step 3 publish. Confirm `/products/test-name-slip-a1` renders with the
   starter's customize fields working (required + maxLength enforced).
   **Live preview checks:** typing the name/price updates the preview pane on
   each keystroke; the photo shows in the pane immediately after file pick
   (before save); editing the sample text re-renders the personalization
   preview; the published product page visually matches the step-3 preview
   card (same photo, name, price, fields).
3. List via a packaging preset (e.g. "Soap Box") as draft; confirm readiness
   shows the non-blocking packaging-3D hint and the product saves as DRAFT.
4. List blank mode with only the 5 decisions; confirm defaults (primary print
   area, SKU auto) and that the advanced editor opens the saved product with
   every value round-tripping unchanged.
4b. "List similar": search an existing imported product (e.g. a name-slip),
   pick it, supply only name "Test Similar B2" + price + photo, publish.
   Confirm the new product carries the source's customize fields/category,
   has its own SKU/slug, and the source product is byte-for-byte unchanged.
   Also verify the §2 simplicity bar: count the required inputs (≤5), and
   confirm no technical jargon is visible without expanding an edit toggle.
5. Puppeteer-core screenshots of each step into `docs/research/` (same pattern
   as `scripts/scrape-ranbazaar.cjs` launch config).
6. Delete the three test products afterwards.

## 6. Report

Tables: (a) decisions required before/after per mode; (b) files touched with
line counts; (c) unit tests added + gate outputs; (d) screenshots list; (e) any
readiness message rewordings (old → new).
