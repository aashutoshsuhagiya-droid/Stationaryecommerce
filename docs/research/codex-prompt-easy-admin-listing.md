# Codex task: make admin product listing simple enough for anyone, with a live 3D preview

## Context

Naamly (this repo, Next.js 16 + Prisma/Postgres) is a custom-print store: name slips, pens, bottles, notebooks, gifts and packaging boxes, bags and pouches. Admins add products from **Admin → Products → Add product**. That opens [src/components/admin/QuickListProductWizard.tsx](../../src/components/admin/QuickListProductWizard.tsx), a 714-line drawer. Its logic lives in [src/lib/listing-wizard.ts](../../src/lib/listing-wizard.ts) and [src/lib/category-listing-playbook.ts](../../src/lib/category-listing-playbook.ts). The "advanced editor" is [ProductsPanel.tsx](../../src/components/admin/ProductsPanel.tsx) (1612 lines), and the 3D studio is [ProductVisualizationStudio.tsx](../../src/components/admin/ProductVisualizationStudio.tsx) (846 lines).

The owner, a non-technical shop operator, finds listing a product hard. The target user is someone who has never used the admin. With a phone photo and a price, they must publish a correct product with a working 2D customiser and, where it fits, a 3D preview **in under 2 minutes, without reading any help text**.

IMPORTANT: this Next.js version has breaking changes. Read the relevant guide in `node_modules/next/dist/docs/` before touching routes or app code (see AGENTS.md). Port 3000 locally is a different project, so run dev on another port (e.g. `PORT=3105`).

### Dependencies: do these first, or coordinate

This task builds on two other specs in this folder:

- [codex-prompt-3d-box-preview.md](codex-prompt-3d-box-preview.md): per-face 3D, artwork crop, product-specific sizes.
- [codex-prompt-2d-studio-parity.md](codex-prompt-2d-studio-parity.md): templates with a mockup background, bound text, photo slots, the admin template editor.

Reuse what they build. Do not create a second 3D or 2D pipeline. If they are not merged yet, implement against their described interfaces and note the gaps in your report.

## What is wrong today (verified with screenshots)

Screenshots: `docs/research/playbook-step1.png`, `playbook-step2.png`, `playbook-step3.png`, `playbook-3d-success.png`.

**Step 1, "What are you selling?"**
- It shows **two separate grids**: 9 "product type" cards, then about 20 "shelf" cards. That is about 30 choices with overlapping meaning, e.g. "Name slips" vs. "Customized Name Slips".
- Cards use internal jargon:
  - "Starter", "2 customize fields"
  - "Source rows omitted tax here; 18% follows the curated siblings — change it if the print partner differs"
- The cards have no pictures, so the user has to read everything.

**Step 2, "Name, price & photo"**
- A native `<input type=file>` ("Choose File") for **one** photo only. There is no drag-and-drop, no paste, no multiple images and no reordering.
- An extra "Different canvas background" upload confuses people.
- MRP, SKU "Edit/Auto" and GST chips all compete for attention.
- The "Customer view" preview is wrong: "No base image", and the photo is drawn as a small square in the corner next to "Aarav".

**Step 3, "Review & publish"**
- The "Show a 3D preview on the product page" checkbox does nothing useful at that point. 3D is only created **after** saving, through a separate "Create 3D preview" button in the success panel (`createQuick3D`, around line 564). The payload hard-codes `allow3D: false` (around line 381).
- Packaging shows: "Needs your print options once: Material, Box construction, Printing type, Print colours, Lamination, Finishing, Insert / holder, Window option. Add them in the advanced editor — customers won't see those choices until you do." That pushes the user into the 1612-line advanced editor.
- In the success panel there is an unlabelled black button (`playbook-3d-success.png`), and a disabled grey button "3D preview ready (folding-carton)" that shows an internal model id.
- The progress chips "1) saving draft ✓ 2) uploading images ✓ 3) attaching and publishing ✓" expose internals.
- The admin never actually **sees** the 3D model before customers do.

## Goal: the new flow

Three steps, one screen each, with a big live preview always visible on the right (bottom sheet on mobile):

### Step 1: Photo first
- One large drop zone: "Drop product photos here, or click / paste / take a photo". On mobile, use `capture` to open the camera.
- Accept up to 8 images: JPG/PNG/WEBP/HEIC (HEIC converted server-side with `sharp`). Show thumbnails with drag-to-reorder, ★ "main photo" and ✕ remove.
- Do client-side downscale and EXIF-rotation fix. Show an upload progress bar per image. Retry on failure without losing the other images.
- Light quality checks, shown as friendly warnings and never blocking:
  - "Photo is small (600 px) — prints may look blurry"
  - "Very dark photo"
  - "Busy background — a plain background gives a better 3D preview"

### Step 2: What is it? (auto-detected)
- Suggest the product type from the photo file name and the text typed so far. Use the existing `searchListingSources` and recipe data, with no external AI call required. Show the **top 3 suggestions as picture cards**, plus a search box: "Something else? Type it…".
- **Merge "product type" and "shelf" into ONE list.** Each entry is a category with a recipe from `category-listing-playbook.ts`. Show:
  - a representative image (the first product image in that category, or a bundled icon)
  - the plain-language name ("Soap box", "Name slips", "Pen")
  - one benefit line ("Customer types their name — you print it")
  - a badge **"3D preview"** if the recipe has 3D (`threeDPath` of `builtin` or `template`), or **"2D only"**
- Remove all internal wording from the UI:
  - Starter
  - customize fields count
  - source rows
  - curated siblings
  - model ids like `folding-carton`
  - print partner notes

  Move tax notes into an info tooltip on the GST field in "More options".
- The category picks the recipe: GST, personalization fields, default 2D template and 3D model. Changing the category later must re-apply the recipe, but ask first ("Replace the 2 personalisation fields with the Soap box defaults?").

### Step 3: Name & price, then publish
- Fields shown by default:
  - **Name**: auto-suggested from category + file name, editable.
  - **Price (₹)**: show the "Similar products: ₹219–₹499" hint and an inline warning if the price is outside 0.5×–2× of that range.
  - **Description**: optional. Offer a "Write for me" button that fills a template sentence from the category recipe. No external AI needed.
- **"More options"** (collapsed): MRP, SKU, GST, stock/made-to-order, production days, quantity limits, extra categories.
- **Packaging print options** (material, construction, printing, colours, lamination, finishing, insert, window):
  - Show them as **pre-filled chips from the recipe**, with the common defaults pre-selected, e.g. Material = "White board 350 GSM", Printing = "Offset CMYK", Lamination = "Matte".
  - The user can tap to change, add or remove values right here. Never send the user to the advanced editor for these.
  - Customers see these choices immediately after publishing.
  - Extend the recipes in `category-listing-playbook.ts` with these default option values and price deltas of 0.
- Primary button: **"Publish"**. Secondary: **"Save as draft"**. No radio buttons.

### Live preview panel (always visible, every step)
Tabs: **Product card | 2D customiser | 3D**.

- **Product card**: exactly how it appears in the storefront grid (image, name, price, MRP strike, category chip). Reuse the real storefront card component, don't re-draw it.
- **2D customiser**: the real storefront studio component in read-only preview mode, using the 2D template from the 2D spec. The main photo is the background with the recipe's text fields at their positions. A "Try a name" input (default "Aarav") updates it live. Show a mini template editor button: "Adjust text position", which opens the admin template editor from the 2D spec in a modal.
- **3D**:
  - Show a **live 3D preview before saving**, rendered client-side with the existing `Product3DPreview` component, the recipe's model and the per-face/artwork rules from the 3D spec.
  - Use the uploaded main photo (cropped per the 3D spec) as the front texture, and the category's default dimensions.
  - Controls: rotate, auto-spin, and simple **size inputs (W × H × D in mm, with presets like "Small / Medium / Large" from the recipe)** that update the model live.
  - If the recipe has no 3D: show "This product type uses the 2D customiser only" with the 2D preview instead. No dead buttons.

### Publishing: one click does everything
"Publish" runs a single server flow with a clear, friendly progress state ("Publishing… uploading photos… creating 3D preview…"):

1. Create the product.
2. Upload and attach the images.
3. Create the default 2D template (2D spec C).
4. **If the recipe supports 3D**, create and publish the 3D template automatically (call the quick-3d logic from the server, reusing the `src/app/api/admin/visualization-studio/quick-3d/route.ts` internals via a shared service function, not an HTTP self-call).
5. Publish.

Rules for this flow:
- Make it **resumable and idempotent**: a retry continues from the failed step and never creates a duplicate product, template or 3D template. Use a client-generated `listingId` idempotency key.
- If 3D creation fails, the product still publishes with 2D, and the success screen shows a friendly "3D preview couldn't be made from this photo — Try another photo" action.
- Remove the "Show a 3D preview" checkbox and the separate post-save "Create 3D preview" button. 3D is part of Publish. Keep `allow3D`, `productModel` and `previewTemplate` written **only** by template publishing (existing invariant).

### Success screen
- Big confirmation: "🎉 Soap Box is live". Show a thumbnail and the 3D spin (if any).
- Buttons, all clearly labelled:
  - **View on store** (new tab)
  - **Add another product** (restarts with the same category pre-selected)
  - **Edit details**
  - **Copy link**
- Remove the unlabelled black button, the internal model id text and the "1) saving draft ✓…" chips.

## Other UX requirements

- **Duplicate product:** in the products list, a "Duplicate" row action opens the wizard pre-filled (category, fields, options, price), with no photos. Reuse `draftFromExistingProduct`.
- **Autosave draft locally:** the wizard state persists in `localStorage` (excluding file blobs; keep uploaded asset ids instead) so a refresh or an accidental close doesn't lose work. Offer "Continue where you left off?" on reopen.
- **Validation:**
  - inline, next to the field, in plain words ("Add a price")
  - the Publish button lists what is missing in one line instead of being silently disabled
- **Keyboard and accessibility:**
  - Enter = Continue
  - Esc closes, with a confirmation if anything was entered
  - every icon button has an `aria-label`
  - focus moves to the step heading on step change
  - WCAG AA contrast
- **Mobile (≥360 px):** full-screen wizard, preview as a collapsible bottom sheet, touch-friendly 44 px targets, camera upload.
- **Speed:** the step changes feel instant. The 3D preview lazy-loads Three.js only when the 3D tab is opened or the recipe has 3D.
- **Copy:** short, friendly sentences, no internal jargon. Run a grep in the wizard files for "Starter", "recipe", "source", "sibling", "template" (user-facing strings) and model ids, and fix every hit.
- **Advanced editor stays** for power users ("Edit details"). Make it reachable but never required for a normal listing.

## Implementation notes

- Split `QuickListProductWizard.tsx` into small components: `PhotoDropzone`, `CategoryPicker`, `EssentialsForm`, `PrintOptionChips`, `ListingPreviewPanel` (tabs), `PublishProgress`, `ListingSuccess`. Put pure logic in `src/lib/listing-wizard.ts` (unit-testable).
- Add one server endpoint, `POST /api/admin/listings`, that runs the publish flow in the order above, with `assertSameOrigin` + `requireCatalogAdmin` like the other admin routes, plus `zod` validation and the idempotency key. Reuse the existing catalog and visualization services. Keep each DB transaction short; image bytes are already downscaled.
- Keep using `admin.module.css` and the existing design tokens. No new UI library.

## Tests (must pass: `npm test`, `npx tsc --noEmit`, `npm run lint`)

- `listing-wizard` unit tests:
  - category suggestions from a file name / text
  - recipe apply / replace confirmation
  - price-range warning
  - "missing items" list for Publish
  - draft persistence serialisation
- Publish service:
  - happy path with 3D
  - recipe without 3D
  - 3D failure still publishes 2D
  - retry with the same `listingId` creates no duplicates
  - the `allow3D` invariant holds
- Copy test: no user-facing string in the wizard components contains the banned jargon words or a raw model id.

## Manual verification (puppeteer + screenshots)

List these 4 products end to end as a first-time user, using only the default path (no "More options"):

| Product | Expected result |
|---|---|
| Name slips | 2D only |
| Pen | 2D, plus built-in 3D if the recipe has it |
| Soap box | 3D template |
| Paper bag | 3D |

For each one:
- Record the time from "Add product" to the live page (target < 2 minutes, < 12 clicks).
- Screenshot every step and the live product page: the 2D customiser working, and the 3D preview showing the uploaded artwork on the front with correct proportions.
- Repeat at a 390 px mobile viewport.

Save the screenshots to `docs/research/easy-listing-*.png`, and the click/time table to `docs/research/easy-listing-report.md`.

## Do not

- Do not remove or break the advanced editor or the visualization studio. They stay as power tools.
- Do not call external AI or vision APIs. Detection is rule-based from existing recipe data.
- Do not write `allow3D`, `productModel` or `previewTemplate` outside template publishing.
- Do not add new runtime dependencies beyond what is installed (`three`, `sharp`, `zod`, `puppeteer-core` for dev).
