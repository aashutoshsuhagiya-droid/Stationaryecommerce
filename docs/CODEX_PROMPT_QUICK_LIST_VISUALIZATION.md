# Codex task — Add a "Quick list product" wizard and make visualization a first-class part of product listing

Read this whole document before touching code. It is scoped to this repository only.
Companion document: `docs/CODEx_PROMPT_CUSTOMIZATION_E2E.md` (the image-upload E2E task that already landed).
The goal of THIS task: an admin lists a personalizable product in ~5 minutes with near-zero
hand-typing, can see exactly what the customer will see (2D customer view) before publishing,
and has the 3D/AI visualization studio one click away — including for brand-new products.

## 0. Ground rules (highest priority)

1. **This is NOT the Next.js you know.** Before writing any route, page, or client
   component, read the relevant guide in `node_modules/next/dist/docs/` and heed
   deprecation notices. Do not assume training-data App Router conventions.
2. **Do not restructure the existing project.** No renaming or moving of existing routes,
   components, or lib modules. The full "Add product" drawer in
   `src/components/admin/ProductsPanel.tsx` stays available as the advanced path; the new
   wizard is an additive entry point. No edits to existing Prisma models — in fact
   **this task requires NO Prisma schema changes at all** (every step reuses existing
   models; if you believe a schema change is unavoidable, stop and report it as a deviation).
3. **Pricing and order-snapshot invariants are frozen.** Do not modify
   `src/lib/pricing-service.ts`, `src/lib/runtime-pricing-service.ts`,
   `src/lib/order-service.ts`, `src/lib/runtime-order-service.ts`, or the checkout demo
   boundary. Do not invent a parallel artwork-asset claim pipeline.
4. **Do not modify the visualization studio job engine.** The job state machine
   (`src/lib/visualization-studio-service.ts`), the upload validator
   (`src/lib/visualization-studio-upload.ts`), and the existing `POST` multipart handler in
   `src/app/api/admin/visualization-studio/route.ts` stay byte-identical in behavior. You
   may add NEW additive endpoints and NEW components that call existing service functions.
5. **Admin endpoint gates.** Any new admin API route must use
   `assertSameOrigin(request)` + `requireRequestActor(request, "catalog.manage")` + the
   Super Admin check — reuse the shared helper `requireCatalogAdmin` from
   `src/lib/catalog-admin.ts` (the pattern in `src/app/api/admin/catalog/route.ts`,
   `export const runtime = "nodejs"` + `export const dynamic = "force-dynamic"`).
6. **Verification gate, run before you finish:** `npm run typecheck`,
   `npm run test:domain`, `npm run build`. All three must pass. New pure logic gets a
   colocated `*.test.ts` in the same directory using `node:test` + `node:assert/strict`
   (style: `src/lib/artwork-upload.test.ts`). NOTE: `test:domain` collects ONLY
   `src/lib/*.test.ts` and `src/components/configurator/*.test.ts` — a test placed
   elsewhere will silently not run; put pure-logic tests inside `src/lib/`.
7. Customer-visible copy must stay neutral and truthful: the app is a demo storefront;
   never claim a payment succeeded or that a printer/CRM was notified.
8. CSS discipline (`DESIGN_PROMPT.md`): any new admin styles go into
   `src/components/admin/admin.module.css` as new classes consuming `var(--*)` tokens from
   `src/app/globals.css` `:root` (add a token in `:root` first if a new value is needed);
   monochrome chrome, one graphite accent. Do not hardcode hexes.

## 1. What already exists (reuse, do not rebuild)

- **Product listing today** — `src/components/admin/ProductsPanel.tsx` (~1178 lines, one
  giant single-scroll drawer with ~30 fields + 5 config sections). Save button hard-disabled
  while `categoryRecords.length === 0` (~line 1155). Product creation is a 3-request dance
  when images are queued: POST draft (published forced false, `createProduct` ~lines
  428–520) → image upload → second PATCH. The list table's "thumbnails" are CSS art
  (`<span data-art={product.art}>` ~line 812); the catalog GET list endpoint hardcodes
  `art: "labels"` and omits `imageUrl` (`src/app/api/admin/catalog/route.ts` ~line 445) even
  though `mapProduct` already returns `imageUrl: product.images[0]?.url` (~line 97).
- **Catalog API** — `src/app/api/admin/catalog/route.ts`: zod `productSchema` (~line 56)
  with server-side defaults (allow2D true, quantity 1–100, setupCharge 0, one "primary"
  print area, artworkUpload false, acceptedMimeTypes png/jpeg). `catalogImageUrlSchema`
  (~line 34) accepts first-party `/api/` URLs or absolute http(s). Publishing with artwork
  upload on requires positive `widthMm`/`heightMm` on every enabled image surface
  (`assertArtworkUploadPublishable`, ~line 249) — this 422 is the #1 hidden blocker today.
  The true minimum viable product is ONE POST: `{ type:'product', name, sku, categoryId,
  price, imageUrl, published: true }` — the route auto-creates the slug, the sortOrder-0
  `ProductImage`, and a MADE_TO_ORDER `ProductVariant` (orderable end-to-end).
- **RanBazaar customization starters** — `src/lib/ranbazaar-customization-presets.ts`:
  `listRanBazaarCustomizationStarters()` (line 296) returns 8 starters
  (name-slips, pen-pencil, notebook, bottle-tiffin, bag-luggage-tag, t-shirt, name-plate,
  wrapping-paper). Form-only: they pre-fill configuration fields, print areas
  (dimensions deliberately blank, comment at line 40), artwork-upload MIME lists, and the
  placement policy. Applied in-UI via `applyRanBazaarCustomizationStarter`
  (`ProductsPanel.tsx` ~lines 575–614).
- **Category presets** — `importRanBazaarCategoryStarters` /
  `importPackagingCategoryStarters` (`ProductsPanel.tsx` ~lines 644–700,
  POST `type:'category-preset-import'` → `route.ts` ~lines 339–428) import RanBazaar
  Category rows. The `window.prompt` category-creation flow (~lines 687–700) is brittle.
- **Product image pipeline** — `ProductImageAsset` (kinds primary / gallery /
  surface-base), `POST /api/admin/catalog/images` (multipart, `src/app/api/admin/catalog/images/route.ts`
  ~lines 150–200; kind=primary upserts the ProductImage; kind=surface-base writes
  `metadata.configurator.<surfaceId>.baseImage` + bumps `configurationVersion`), served
  publicly at `GET /api/product-images/[id]` with product-status gating — an asset is
  served ONLY while the product is ACTIVE + published and still referenced
  (`src/lib/product-image-assets.ts` ~lines 170–240; a draft's images therefore preview
  blank, which is correct and must stay that way).
- **Visualization studio** — `src/components/admin/ProductVisualizationStudio.tsx`
  (5 steps: upload source JPG/PNG/WEBP ≤12 MB via multipart `POST
  /api/admin/visualization-studio` → poll the persisted job → confirm manual analysis →
  save + publish a versioned `VisualizationTemplate`). Publishing atomically flips
  `product.metadata.configurator` to `{ allow3D: true, productModel, previewTemplate:
  "visualization:<id>", ... }` (`src/lib/visualization-studio-service.ts`,
  `changeVisualizationTemplateStatus` ~lines 473–582). The studio mounts **only when
  editing a saved product** (drawer slot ~lines 1158–1172 of ProductsPanel) — a brand-new
  draft gets no studio, no preview of any kind.
- **2D customer view (the thing customers actually see)** — `src/components/configurator/ArtworkEditor.tsx`
  (SVG: base `<image>` under text/photo layers, `baseImages?: Record<surfaceId,url>` prop)
  driven by `src/components/commerce/CustomizationStudio.tsx` with precedence
  admin-base-image > visualization texture > personalization-template image (~lines 550–571).
  The admin has NO view of this composition today; the studio's only preview is a lazy 3D
  `Product3DPreview` labelled "visual draft". Admin-side live-preview CSS already exists:
  `.designPreview` / `.mockLabel` / `.templateSafeArea` (used by
  `src/components/admin/TemplateManager.tsx` ~lines 339–344).
- **Storefront product visual** — `src/components/commerce/ProductVisual.tsx` (the CSS-drawn
  product card the customer sees in listings) — reusable for the 2D customer preview card.
- **Admin UI primitives** — `src/components/admin/AdminUI.tsx` exports `PageHeader`,
  `MetricCard`, `StatusBadge`/`statusTone`, `Card`, `CardHeader`. Everything else (drawers,
  tables, pickers) is ad-hoc composition over `admin.module.css` classes (`.drawer*`,
  `.table*`, `.input/.select/.fieldGroup`, `.buttonPrimary/.buttonSecondary/.buttonGhost`,
  `.assetPicker/.assetPreview/.assetFileInput/.assetUrlFallback`, `.configCard/.configSection`,
  `.segmentControl`). Reuse them; do not build a design system.

## 2. The feature to build

An admin clicks **"Quick add"** in `/admin/products`, picks a starter, types name + price,
picks two image files (photo + base image) and toggles publish — done — while a live 2D
customer-view panel proves "this is what your customer sees". The 3D studio is one click
away for every product, new or old.

### A. Quick-list wizard (`src/components/admin/QuickListProductWizard.tsx`, NEW)

Entry point: in `ProductsPanel.tsx`, next to the existing "Add product" button
(~line 771), add a **"Quick add"** button that opens the wizard in the existing
`styles.drawer` chrome (a new wizard instance, NOT the full form). "Add product" keeps
working exactly as it does today.

The wizard has 3 steps with a step rail (reuse `styles.segmentControl` /
`styles.settingsTab`-style classes; new CSS classes in `admin.module.css`):

**Step 1 — "Pick a starter" (default for most admins):**
- Card grid from `listRanBazaarCustomizationStarters()` — one card per starter showing
  name + capability chips (N text fields, N print surfaces, "photo upload allowed" when
  the starter enables artwork upload, max chars). Cards rendered from the pure data — no
  new fetching. Reuse `styles.configCard`/`styles.configList` + `StatusBadge`.
- Plus two extra cards: "Blank product (no personalization)" and "Packaging starter"
  (switches to the existing `listEzpacPackagingProductTypes()` select, reuse
  `applyProductTypeStarter` ~lines 522–573 of ProductsPanel).
- Selecting a RanBazaar card pre-applies the starter exactly like
  `applyRanBazaarCustomizationStarter` does today (configurationFields, printAreas,
  artwork MIME types, policy) — share that logic; do not fork it (lift the handler into a
  new pure helper in `src/lib/` or reuse the existing one, keep behavior identical, and add
  a colocated test in `src/lib/*.test.ts`).
- If `categoryRecords.length === 0`, show an inline card: "No categories yet — import the
  RanBazaar category groups first" with two buttons calling the existing
  `importRanBazaarCategoryStarters` / `importPackagingCategoryStarters` handlers
  (~lines 644–700). This removes the silent Save-button block.

**Step 2 — "Essentials" (the ONLY fields ever typed):**
- Name (required), Price ₹ (required), Category select (required — pre-selected to the
  starter's suggested primary category when available; otherwise the first suitable
  category), Description (optional, one line).
- SKU: auto-filled from `slugify(name).toUpperCase()` + 3-char random suffix via a new
  pure helper `autoSku(name)` in a new `src/lib/admin-slug.ts` (+ colocated test), shown as
  a chip with a small "edit" ghost button; the admin can override. No server change.
- **Dimension pre-fill (new additive preset field):** extend the starter type in
  `src/lib/ranbazaar-customization-presets.ts` with optional
  `suggestedMm?: { widthMm: number; heightMm: number }` per surface and fill sensible
  defaults per starter (notebook 210×297, name-slips 150×80, pen/pencil 140×30, bottle-tiffin
  80×60, t-shirt front 300×400, name-plate 60×25, bag tag 100×60, wrapping paper 300×300 —
  adjust to each starter's actual surface labels). `applyRanBazaarCustomizationStarter`
  (or the lifted helper) writes these into `widthMm`/`heightMm` instead of today's blank
  strings; admin can still edit in step 3 / advanced form. **This removes the
  `ARTWORK_UPLOAD_PUBLISH_INVALID` 422 (assertArtworkUploadPublishable) that blocks
  publishing photo-upload products today.** Keep both-blank-or-both-filled valid.
- **Publish readiness checklist (new card):** client-side replica of the route's gates,
  computed from current draft state: (a) acceptedMimeTypes non-empty when artworkUpload
  on; (b) every enabled image surface has positive mm; (c) linked templates (if any) are
  ACTIVE; (d) packaging 3D requires a published visualization template (show the hint,
  don't block). Each item shows ✓/✗ with one-line fix instruction; the Publish button in
  step 3 stays disabled with the checklist visible until all green. New pure helper
  `checkProductPublishReadiness(draft)` in `src/lib/admin-slug.ts` (rename the file to
  `src/lib/admin-quick-list.ts` if you prefer; keep one module, + colocated test).

**Step 3 — "Images & publish":**
- Product photo: existing `.assetPicker` + `.assetFileInput` pattern; on pick, POST the
  file to `POST /api/admin/catalog/images` after the initial save (the wizard's save
  sequence IS today's `createProduct` 3-request dance — keep that sequence, but make it
  visible: a compact status line "1) saving draft ✓ → 2) uploading photo ✓ → 3) attaching
  ✓" with per-step state; on a failed step show which step failed and a "Retry" button
  that re-runs only the failed step (the `pendingProductImage` state already exists).
- Base image (surface): a single picker (label: "Base image for the customer's 2D canvas")
  uploading with `kind: "surface-base"` + the starter's first/primary surfaceId — one
  click, no per-surface section needed here (the advanced form keeps full per-surface
  control). Optional: leave empty, the studio still works without it.
- **2D customer preview (panel, right side of the wizard on ≥lg screens; below the form
  on smaller):** `src/components/admin/SurfaceCustomerPreview.tsx` (NEW, presentational)
  rendering, for the selected surface: the base image (or "no base image" placeholder tile)
  with the starter's first required text field's sample value ("Aarav", configurable)
  and the uploaded product photo as a small image layer, all at the surface's mm aspect
  ratio, with the safe-area dashed overlay — reuse `.designPreview`/`.mockLabel`/
  `.templateSafeArea` visual language and mirror `ArtworkEditor`'s render order
  (base image → text → photo; see `src/components/configurator/ArtworkEditor.tsx`, base
  `<image>` ~line 781). Live: re-renders as name/fields/photo/base change. Caption:
  "This is what your customer sees in the 2D studio — presentation only, not part of
  pricing." (neutrality rule: it's a preview, never a "proof".)
- Publish choice, explicit radio: "Publish now" vs "Save as draft" — replaces the
  today-implicit forced-draft-when-queued-images rule for the wizard path. On
  "Publish now" with a photo queued, run the full save→upload→PATCH→publish sequence
  (step 2 of the sequence sets published:true). On "Save as draft", stop after the
  attach step and show "Draft saved — open it with Quick add → Manage to publish".
- Success card: product slug, storefront link `/products/<slug>`, and one primary button
  **"Open 3D visualization studio"** that closes the wizard and opens the edit drawer for
  the just-created product (this requires step C-1's auto-reopen behavior).

### B. One-click image cross-reuse (NEW additive endpoints + UI buttons)

The two image stores never talk to each other today; fix that with two small JSON
endpoints (both gated exactly like `requireCatalogAdmin`, `runtime = "nodejs"`,
`dynamic = "force-dynamic"`, `assertSameOrigin`):

1. **`src/app/api/admin/catalog/images/from-source/route.ts` (NEW, POST JSON
   `{ productId, surfaceId, source: "primary" | "visualization" }`):** copies bytes from
   the product's primary `ProductImageAsset` (or the published visualization template's
   public texture URL from `src/lib/visualization-studio-service-policy.ts`) into a NEW
   surface-base `ProductImageAsset`, then performs the SAME metadata write +
   `configurationVersion` bump the multipart route does (`images/route.ts` ~lines
   174–191 — extract that into a shared helper in `src/lib/product-image-assets.ts` and
   call it from both routes; behavior of the existing route unchanged). UI: in the
   "Base images" section of the advanced form (ProductsPanel ~lines 1110–1137) AND in the
   wizard step 3, add a **"Use this product's photo"** button per surface that calls this
   endpoint — zero file picking.
2. **`src/app/api/admin/visualization-studio/from-product-image/route.ts` (NEW, POST JSON
   `{ productId }`):** starts a visualization job from the product's primary image asset
   bytes by calling the existing `startVisualizationAnalysis`
   (`src/lib/visualization-studio-service.ts`, ~line 178) with the asset's bytes/
   mimeType/sha — bypassing the duplicate 12 MB multipart upload. The multipart POST
   schema in `src/lib/visualization-studio-upload.ts` stays untouched. UI: inside the
   studio dropzone (`ProductVisualizationStudio.tsx` ~lines 632–658) a secondary button
   **"Reuse this product's uploaded photo"** (disabled + tooltip when the product has no
   primary image).

### C. Make the visualization studio first-class in listing

1. **Studio reachable for new products:** after a successful wizard save, auto-reopen the
   edit drawer for the created product (existing `editProduct(id)` ~line 702) — the studio
   slot (~lines 1158–1172) then appears immediately; the "save first, then edit" foot-gun
   disappears. Same auto-reopen after a plain "Add product" save where the admin checks a
   new **"Open visualization studio after save"** checkbox (add next to the publish
   toggle; off by default so existing behavior is unchanged).
2. **Collapsible studio:** wrap the `visualizationDrawerSlot` contents in a `<details>`
   -style collapsible section (reuse `styles.detailSection` header affordance; new CSS
   class) with a header chip summarizing state: "No 3D template yet", "Job: processing",
   "3D published ✓" — default open when a template is published or a job is active,
   collapsed otherwise. `ProductVisualizationStudio` component internals stay unchanged
   apart from accepting the existing props.
3. **List thumbnails + 3D status:** change the catalog GET list projection
   (`route.ts` ~line 445) to include `imageUrl` (already computed in `mapProduct`) and
   `has3DTemplate: product.metadata.configurator?.previewTemplate?.startsWith("visualization:")`
   in the products array; in `ProductsPanel` replace/augment the `data-art` CSS-art span
   (~line 812) with a real 47×47 `<img>` (fallback: keep the CSS-art tile when
   `imageUrl` is empty) — new presentational component `src/components/admin/ProductListThumb.tsx`,
   plus a `StatusBadge` "3D ✓" when `has3DTemplate`. No other table changes.
4. **Visualization status on products without the studio open:** the list row's existing
   "Configure" button stays; no new per-row 3D controls in this task.

### D. Small dead-control cleanups (additive, in `ProductsPanel.tsx` only)

- Wire the dead status `<select>` (~line 796) and "Filters" button (~line 797) to the
  existing `filtered` list state (status now filters Draft/Active/Archived correctly —
  note the route already emits "Archived"; `route.ts` ~line 445), and wire "Export"
  (~line 767) to download the filtered list as JSON.
- When a surface-base upload is disabled by the surface-id regex check
  (`canUpload`, ~line 1117), render the exact reason under the input:
  "Surface ID must be a-z, digits, '-' (≤80 chars) to upload a base image" + an
  **"Auto ID"** ghost button that fills the id from the surface label
  (`slugify(label)` pattern).
- Explain the draft-blank preview: under the primary image picker, when `editingProduct`
  is a draft (status !== "Active"), one line of helper copy: "Draft products' images
  preview blank — they go live at /api/product-images once published."

### E. What the customer-side already handles (verify only — no changes)

- `ArtworkEditor` base image rendering, `CustomizationStudio` base-image precedence
  (admin base > visualization texture > template image), quote/order server-side pricing,
  order snapshot `configurationVersion`, public image serving gate — all stay as-is.
  The surface-base image is presentation-only: it must NOT enter pricing, the artwork
  document, or order snapshots (existing behavior; a regression test already covers
  order-snapshot keys — `src/lib/order-visualization-snapshot.test.ts` — run it, don't
  add duplicates).

## 3. End-to-end acceptance test (you must be able to walk this)

Assuming a local dev database (`npm run db:setup`, `npm run db:bootstrap-admin`):

1. Super Admin → `/admin/products` → **Quick add** → starter card "Notebook" → step 2:
   type name "My Notebook", price 249, category auto-selected (import RanBazaar
   categories first via the wizard's import card if none exist), SKU auto-filled chip →
   step 3: pick a 600×800 product photo file, pick a base image file, 2D preview shows
   base image + sample name + the photo → "Publish now" → success card shows
   /products/<slug> link.
2. Open `/products/<slug>`: storefront card shows the uploaded photo; the 2D studio canvas
   shows the uploaded base image under the guides; typing a name + uploading a customer
   photo previews live. Add to cart → `POST /api/quotes` prices server-side → demo
   checkout completes. The base image did not enter the order snapshot or pricing
   (verify in the order item snapshot — existing behavior).
3. Back in the wizard success card: "Open 3D visualization studio" → the edit drawer opens
   with the collapsible studio section visible for the NEW product (improvement C-1).
   Click "Reuse this product's uploaded photo" in the dropzone (B-2) → a job is created
   without a second file upload → walk the job to confirmation (manual-mode analysis when
   no external analyzer is configured).
4. In the "Base images" section, click **"Use this product's photo"** for the primary
   surface (B-1) → the base image is now set from the primary asset without a new file
   pick; DELETE it and re-set; `configurationVersion` bumped both times.
5. Product list: real photo thumbnails render (B-3), a "3D ✓" badge appears for any
   product with a published visualization template, status filter + Filters button work.
6. Unpublish the product → its images stop serving at `/api/product-images/<id>` (existing
   gate) while the admin list still shows the thumbnail from `imageUrl` (list data is
   first-party admin-scoped, not the public route).
7. Re-run the full gate: `npm run typecheck`, `npm run test:domain`, `npm run build`.

## 4. Explicit non-goals

- No Prisma schema changes; no new models.
- No 3D geometry changes, no dieline/production export, no object-storage migration, no
  malware scanning, no custom-dimension pricing, no bulk-order changes, no vendor-flow
  changes, no checkout/payment changes, no seed-catalog edits.
- No changes to `ProductVisualizationStudio.tsx` internals beyond the dropzone button
  (B-2) and props it already receives; no changes to the studio job engine, analyzer, or
  template publish pipeline.
- No changes to the customer storefront components (`CustomizationStudio`, `ArtworkEditor`,
  `ProductVisual`, `ProductCard`); the 2D preview is admin-side only.
- Do not seed demo products to prove the flow; create products through the admin UI in
  the acceptance test.

## 5. Reporting

When done, report: files added/changed (grouped by steps A–E, plus the "cleanups" in D),
the exact commands you ran and their results (typecheck / test:domain / build), the
acceptance-test walkthrough outcome for each numbered step, and any place where you had
to deviate from this document (with the reason).
