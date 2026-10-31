# Codex task — Make product listing feel effortless: one smooth path, no jargon, no confusing save dance

Read this whole document before touching code. It is scoped to this repository only.
Companion docs: `docs/CODEX_PROMPT_QUICK_LIST_VISUALIZATION.md` (what the quick-list wizard
and layout drawer already are) and `docs/CODEX_PROMPT_DISTINCT_PRODUCT_LISTING.md`
(structured descriptions / 3D & layout drawer). **This task only improves UX and flow —
no new data model, no new Prisma schema, no new API routes, and the classic advanced
form keeps working byte-identical.**

## 0. Ground rules (highest priority)

1. **This is NOT the Next.js you know.** Before touching any route/page/component, read
   the relevant guide in `node_modules/next/dist/docs/` and heed deprecation notices.
2. **Do not restructure the project.** No renaming/moving of routes, components, or lib
   modules. The classic product drawer in `src/components/admin/ProductsPanel.tsx` keeps
   working end-to-end (its fields, payload, and save paths are unchanged); this task may
   change which buttons are prominent and may add UI, but the classic form's behavior is
   a hard acceptance criterion.
3. **Frozen invariants:** `src/lib/pricing-service.ts`, `src/lib/runtime-pricing-service.ts`,
   `src/lib/order-service.ts`, `src/lib/runtime-order-service.ts`, and the checkout demo
   boundary. No new Prisma models or migrations; no new API routes. The image-upload
   endpoint `POST /api/admin/catalog/images` keeps its current contract.
4. **Verification gate before you finish:** `npm run typecheck`, `npm run test:domain`,
   `npm run build`. Any new pure logic gets a colocated `*.test.ts` (node:test +
   node:assert/strict style, see `src/lib/admin-quick-list.ts`'s existing tests).
5. **CSS discipline:** new classes go in `src/components/admin/admin.module.css`,
   token-only (`var(--…)`, no hardcoded hex), reusing existing class families
   (`.quickList*`, `.configCard`, `.buttonPrimary/.buttonSecondary/.buttonGhost`,
   `.drawer*`).

## 1. What the admin experience looks like today (verified state)

- **Two product paths compete for attention.** Toolbar (`ProductsPanel.tsx` ~line
  1031–1033): "Manage / Add Categories", **"Quick add"** (`buttonSecondary`, Sparkles
  icon, opens `QuickListProductWizard`), and "Add product" (`buttonPrimary` — the huge
  1500+-line classic drawer). The *easy* path is visually demoted to a secondary button;
  the *complex* path is the primary one.
- **Wizard entry is jargony** (`QuickListProductWizard.tsx` step 1, ~line 375–382):
  cards say "Pick a starter", "RanBazaar starter", "Packaging starter" (a raw
  `<select>` of 55 types), "Blank product — No personalization. Add configuration later
  in the advanced form." An owner with no dev context cannot tell which card matches
  their real product.
- **Step 2 asks for SKU** (a required-ish field, ~line 388) and "Preview sample text"
  with no context (~line 389). The category select is a flat list of every category
  (~line 386) — no hierarchy, and the starter's suggested category is pre-selected but
  not shown as such.
- **The save sequence is a visible 3-step machine** (~line 400): "1) saving draft
  2) uploading images 3) attaching and publishing". Failure at any step leaves a draft
  half-attached; the error copy is "Could not save the product." The admin has no way
  to save *without* a photo, even as a draft — a missing primary file bounces them back
  to step 2 (`save()`, ~line 305).
- **Post-save jump is wrong for most users.** `ProductsPanel.tsx` ~line 1553: after a
  successful quick-add, `onSaved` auto-opens the **3D visualization studio** drawer
  (`setVisualizationOpen(true)` + `editProduct`) — the packaging admin now stares at an
  unfamiliar 5-step 3D tool even when they just wanted the listing done.
- **Publish readiness shows at step 2** (~line 390) before the admin has chosen
  "Save as draft" vs "Publish now", and its item ids are machine ids
  ("mime types", "physical dimensions", "linked templates") rendered via
  `item.id.replaceAll("-", " ")` (`checkProductPublishReadiness`,
  `src/lib/admin-quick-list.ts` ~line 127–164) — hard to act on.
- **Base image is an afterthought.** Step 3's "Use this product's photo" button
  (~line 398) only appears *after* save (`savedProduct` set), so the "reuse the photo as
  the customer's canvas background" one-click happens in step 3-with-photos, not as a
  checkbox in the wizard.

## 2. The feature to build

### A. Wizard step 1 — human card copy, smarter starter picking
In `QuickListProductWizard.tsx` step 1:
1. Rename the rail title from "Pick a starter" to **"Choose a product type"** and the
   section heading copy to "Pick the closest match — everything can be changed later."
2. Card copy (UI strings only; `createRanBazaarStarterDraft` / `packagingDraft` logic
   unchanged):
   - "Blank product" card → **"Simple product"** with subtitle "No customer
     customization — list it, price it, publish."
   - "Packaging starter" select card → **"Packaging & print (boxes, pouches, bags)"**
     subtitle "Boxes, pouches, paper bags, marketing print. Pick one of 55 types."
   - Each RanBazaar card: subtitle becomes a plain-language one-liner derived from
     `starter.description`, plus keep the existing chips (fields/surfaces/max chars).
     Add one line under the grid: "Not sure? Pick the closest one — the admin can fine-tune
     everything in Full details later."
3. Packaging `<select>`: add a compact search filter (native `<input list>` +
   `<datalist>`, no dependency) filtering `listEzpacPackagingProductTypes()` names.

### B. Wizard step 2 — fewer fields, honest labels
1. **Hide SKU behind an "Advanced details" collapse** (reuse a `<details>` block styled
   like `.configSection`): the SKU chip + Edit toggle (~line 388) moves inside it,
   default collapsed. `autoSku` stays the source; the server still receives the same
   payload key — zero API change.
2. "Preview sample text" → relabel **"Sample customer name (shown in the live preview)"**
   with helper "This is what the 2D preview on the right shows — change it to check
   fonts and sizes." No logic change (`sampleText` state as-is).
3. Category select: pre-select the starter's suggested category (already the case for
   mapped types) and, when it is, show a small chip under the select:
   "Auto-picked from the starter" with a plain "Change" affordance (the select itself).
   For packaging: show parent › child grouping in option labels
   (build from `categories` `parentId`; pure presentation) so the 55-type flow feels
   hierarchical without a new endpoint.
4. Readiness checklist (~line 390): give each item **human labels** via a local map
   (`mime-types` → "Photo uploads: allowed formats", `physical-dimensions` →
   "Print size set (mm)", `linked-templates` → "Design template ready",
   `packaging-visualization` → "3D preview ready (packaging only)") — do NOT change
   `checkProductPublishReadiness`'s ids/semantics; map at render time. Show the
   checklist only when "Publish now" is selected: move the save-choice radio
   (`quickListPublishChoice`, ~line 399) to the top of step 3 AND mirror it as a small
   toggle at the top of step 2 ("Save as draft" / "Publish now"), and when draft is
   chosen render the checklist items as muted "skipped for drafts" hints instead of red
   × marks.

### C. One-click base image + optional photo
Step 3:
1. **Base-image reuse as a checkbox** at the top of step 3 (and step 2):
   "Use the product photo as the 2D canvas background" (default **on** when a
   photo is picked, off when not). On publish/save, if on and a primary photo exists,
   call the existing `from-source` endpoint flow — for a *not-yet-saved* product,
   perform it right after the image upload succeeds inside `save()` (one extra call,
   same endpoint, `source: "primary"`), then the final PATCH. Keep the manual
   "Use this product's photo" button for the saved case (existing `reusePhotoForBase`).
   No new endpoints.
2. **Photo becomes optional for drafts:** in `save()`, when `publishNow === false` and
   no primary photo, skip the upload phase entirely (upload status "skipped") and save
   the draft image-less. Keep the current block (line ~305) only for "Publish now".
   This lets admins list 5 products' metadata first, then add photos in the layout
   drawer later.

### D. Post-save success card, correct default jump
In `QuickListProductWizard.tsx` success card (~line 402) and
`ProductsPanel.tsx` `onSaved` wiring (~line 1553):
1. Success card primary button → **"See it live"** (the `/products/<slug>` link,
   currently a bare `<a>`), secondary buttons → "Add description, material & extra
   images" (→ Full details, existing `continueFullDetails`) and "3D preview (optional)"
   (→ existing studio jump, `onSaved`).
2. `ProductsPanel.onSaved` **no longer auto-opens the 3D studio drawer** by default:
   it closes the wizard, refreshes the row, and toasts/notes "Product saved". The 3D
   studio is reached via the "3D & Layout" row button (existing) or the explicit
   success-card button. This is the single biggest "why am I in a 3D tool?" fix.
3. New products' primary photo: the product row already shows a real thumbnail once
   published (existing `ProductListThumb` behavior); when draft, show the existing CSS
   fallback tile — no new work, just verify it doesn't render a broken `<img>`.

### E. Toolbar & table de-cluttering (presentation only)
In `ProductsPanel.tsx`:
1. Toolbar order/weight: **"Quick add" becomes `buttonPrimary`** (the recommended
   path), "Add product" becomes `buttonSecondary` with label "Add product (advanced)",
   "Manage / Add Categories" unchanged. No handler changes.
2. Row actions: keep the existing buttons but **move "3D & Layout" into the
   `MoreHorizontal` overflow menu** (the icon row at ~line 886) and keep only the
   primary "Configure" action visible on the row — reduces the 4-icon clutter while
   keeping one-click access. Verify the menu item calls the same
   `setLayoutProductId` handler.
3. Add one helper line under the table header (existing `.hint`-style class):
   "New product? Use **Quick add** — it lists your product in under a minute. The
   advanced form still works for everything."

## 3. End-to-end acceptance test (walk this)

Assume local dev DB (`npm run db:setup`, `npm run db:bootstrap-admin`, `npm run dev`),
RanBazaar + packaging categories already imported.

1. `/admin/products` → toolbar: "Quick add" is the primary (filled) button.
2. Quick add → **"Choose a product type"**: cards read "Simple product",
   "Packaging & print (boxes, pouches, bags)", and human-labeled RanBazaar cards;
   picking "Notebook" auto-picks its category (chip "Auto-picked from the starter").
3. Step 2: no visible SKU field (inside the collapsed "Advanced details"); "Publish
   now" default → readiness items shown with human labels; switch to "Save as draft" →
   red × items become muted "skipped for drafts".
4. Step 3: tick "Use the product photo as the 2D canvas background", pick a photo,
   Save as **draft with no photo first** (untick the reuse box, leave photo empty) →
   saves clean (upload step shows "skipped") → success card primary button "See it
   live" opens `/products/<slug>`; row in the table shows the CSS fallback thumb
   (no broken image).
5. "Add description, material & extra images" → Full details opens for that product;
   save; row refreshes.
6. Packaging path: "Packaging & print" card → search-filter the 55-type select → pick
   a type → publish now → after success, the admin is **NOT** dropped into the 3D
   studio drawer; "3D preview (optional)" button exists to reach it deliberately.
7. Regression: "Add product (advanced)" classic drawer still creates/saves a product
   exactly as before (same payload fields, same errors) — walk one full classic create
   and one edit-save; storefront unchanged; `npm run test:domain` green.
8. Re-run the gate: `npm run typecheck`, `npm run test:domain`, `npm run build`.

## 4. Explicit non-goals

- No new API routes, no schema/migration changes, no changes to `POST /api/admin/catalog`
  payload shape or `POST /api/admin/catalog/images` contract (the base-image reuse is
  client-sequenced, one extra call).
- No changes to `checkProductPublishReadiness` semantics or ids (render-time label map
  only), no changes to `createRanBazaarStarterDraft` / `packagingDraft` /
  `applyEzpacExport` prefill logic.
- No restructuring of the classic ProductsPanel form internals; no changes to
  `ProductFullDetailsSections` / `ProductLayoutControls` field sets (entry points and
  button wiring only, if at all).
- No i18n, no new dependencies, no changes to vendor/checkout/order/pricing files.

## 5. Reporting

When done, report: files changed (grouped by A–E), exact commands run + results
(typecheck / test:domain / build), the acceptance walkthrough outcome for steps 1–8,
and any place you deviated from this document (with the reason).
