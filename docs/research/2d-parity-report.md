# 2D studio parity report: Naamly vs ranbazaar.com

Date: 2026-11-22 · Spec: [codex-prompt-2d-studio-parity.md](codex-prompt-2d-studio-parity.md) ·
Coordinate model: [ranbazaar-2d-coordinate-model.md](ranbazaar-2d-coordinate-model.md)

## How it was measured

Both sites were driven with a headless browser (production build, `next start -p 3010`).

- **Reference:** open the product, press **Customize**, clear each input and type one word (Aarav, Riya, Kabir…).
- **Ours:** open the same product and type the same words into "Personal details".
- **Text position:** compares each word's rendered text box at its alignment anchor (left edge, centre or right edge) and its vertical centre, in canvas pixels. For substitute fonts the letters themselves (ink pixels) were also measured in the side-by-side images.
- **Separate cart check:** fills every field and photo slot (with a synthetic test photo), records the character limits and price, and clicks **Add to cart**.

Side-by-side images (reference left, ours right): `2d-parity-<key>.png`.

## Results: 10 products

Target: text within ±2% of the canvas width (±12 px), with everything else identical. Fonts follow the substitute map.

| Product (key) | Canvas ref / ours | Position Δ (x, y px) | Font source → ours | Colour | Casing | Limit | Photo | Add to cart |
|---|---|---|---|---|---|---|---|---|
| Parker pen (`parker`) | 600×600 / 600×600 | −0.2, +0.5 | Gilroy Extrabold → Montserrat | #fad000 ✓ | capitalize ✓ | 13 ✓ | — | ✓ ₹869 |
| Avenger name slip (`nameslip`) | 600×386 / 600×386 | 0, +0.5 · 0, +0.8 | Gilroy Extrabold → Montserrat | #000000 ✓ | capitalize ✓ | 32 / 39 ✓ | 1 slot ✓ | ✓ ₹219 |
| Baby name sign (`allura`) | 600×600 / 600×600 | −2.0, 0 | Allura → Allura (same OFL font) | #064589 ✓ | capitalize ✓ | 8 ✓ | — | ✓ ₹1,598 |
| Shagun envelopes, 3 fields (`multifield`) | 600×289 / 600×289 | −0.4, +1.5 · +0.3, +0.5 · +1.2, +0.5 | Aleo → Aleo (same OFL font) | #2e1f14, #352317 ✓ | capitalize ✓ | 36 / 32 / 38 ✓ | — | ✓ ₹625 |
| Gift slips, uppercase (`uppercase`) | 600×386 / 600×386 | −0.3, 0 | Gilroy Extrabold → Montserrat | #ffffff ✓ | uppercase ✓ | 28 ✓ | — | ✓ ₹249 |
| Exam board, source rotation −48° (`rotated`) | 422×600 / 422×600 | 0, +0.5 | Gilroy Extrabold → Montserrat | #04471d ✓ | capitalize ✓ | 19 ✓ | — | ✓ ₹389 |
| Name labels (`roundkey`) | 600×240 / 600×240 | letters: +0.5, −2.5 | Roundkey Medium → Bebas Neue | #ffffff ✓ | uppercase ✓ | 14 ✓ | — | ✓ ₹290 |
| Bottle stickers (`bottle`) | 600×240 / 600×240 | letters: +0.5, −1.0 | Roundkey Medium → Bebas Neue | #ffffff ✓ | uppercase ✓ | 14 ✓ | — | ✓ ₹290 |
| EzPac window box | — (no source 2D) | — | — | — | — | — | — | ✓ ₹0 (source price) |
| Manual: everyday name slips | — (no source 2D) | — | — | — | — | 24 / 24 | — | ✓ ₹349 |

Every position is within ±2 px (0.3% of the canvas width). Text and photos sit on the same canvas size as the reference.

Other notes:

- **Rotation:** the reference ignores stored rotations, so ours draws the exam board straight too.
- **Roundkey rows:** they compare letter pixels. Bebas Neue is drawn 1.55× and nudged 0.053 em down (`glyphScale`/`glyphShift` in `src/lib/studio-fonts.ts`) so its capitals match Roundkey's height and centre line. Its letters are about 8–10% narrower: AARAV is 253 px wide vs 280 on the bottle.
- **Montserrat:** for Gilroy, glyph widths differ slightly, but the alignment anchor matches.

### Photo products

| Product | Slots | Checks |
|---|---|---|
| Avenger name slip | 1 | All pass, in this order:<br>1. The slot shows the reference's demo photo until upload.<br>2. "Required" is shown.<br>3. With the text filled, Add to cart waits: "Upload your photo to see the price."<br>4. The upload draws under the mockup, through its window.<br>5. Rotate 10°, zoom ×1.1 and move −3 px apply.<br>6. The price unlocks and Add to cart succeeds.<br>7. Removing the photo locks it again. |
| Kids notebooks, pack of 5 | 5 | All five slots filled; each photo shows through its window (`2d-photo-notebook-5.png`); ₹499, added to cart. |
| Kids notebooks, 100 pack | 2 | Both fields and both photos filled; ₹7,000, added to cart. |

Uploads go through the existing private artwork-upload pipeline: signature, size and type checks, then the asset is claimed by the order. Each photo's transform (`photo: {offsetX, offsetY, rotation, scale}`) is stored on its layer, so production can redraw the design exactly.

### Other screens

- **Parker pen:** before and after typing, and the design switch, are in `2d-studio-before/after/design-2.png`. Switching designs keeps the name. There is no empty-canvas hint, no "Physical output dimensions" warning and no "Dimensions: Not specified" block.
- **EzPac window box:** the 2D Studio tab shows the box's front image with free-form "Add text" (`2d-ezpac-window-box.png`).

## Bugs found and fixed in this verification round

1. **Photo slots never appeared on the storefront.** The importer saved the upload settings as a nested object (`artworkUpload: {enabled, acceptedMimeTypes, maximumBytes}`). The runtime catalog and the admin form use flat keys (`artworkUpload: true`, `acceptedMimeTypes`, `maximumArtworkBytes`). So uploads read back as "on, but no file types allowed", and every slot was hidden. The importer and backfill now write the flat keys, and a test pins the format.
2. **Photo-only products had no studio.** 32 products (e.g. the 5-photo notebooks) have photo slots but no text inputs, and were marked non-customizable. They are customizable now (importer and backfill), with a test.
3. **Saving in admin would have broken photo slots.** The admin form always saves an explicit artwork policy, and that policy replaced the studio's photo-slot rules. The slot rules (600×600 space, one image per slot) now apply on top of a saved policy. The admin's upload switch, file types and byte limit still win. Test added.
4. **EzPac packaging showed the empty grey print area.** The product-photo fallback skipped products whose 3D template had face textures, because those are keyed `front` rather than `primary`. The first print area now falls back to the 3D front face, else the product photo.
5. **Empty photo slots were grey.** The reference shows its demo photo in the slot until upload, and ours now does too (`photos[].sampleUrl`). It is preview only: never exported, never ordered, and the price stays locked until the customer's own photo is in.
6. **Aleo looked too light.** The source's `fontWeight: "lighter"` cannot thin a single-face font on the reference, but did on our variable Aleo. It now maps to 400 (with a test).
7. **Roundkey looked unlike the reference.** Fredoka was round and light. Roundkey is now drawn with Bebas Neue (OFL), size-matched as described above.
8. **The comparison script itself:** fast typing made the reference's input repeat the value ("AARAVAARAVAARA"), which overflowed and shifted the measurement (the bottle showed −10.8 px). The script now clears the input and types slowly. Measured once with clean input, the reference centres "AARAV" at x 363.0, exactly the box centre.

Backfill `2d-templates.ts` re-run: 361 products, 291 with designs, 150 templates updated, 991 unchanged, 0 failed.

## Admin 2D design editor (added after the first report)

The product form has **Open design editor** under "Customer design templates". It opens a full-screen editor (`src/components/admin/StudioDesignEditor.tsx`, API `/api/admin/studio-designs`):

- **Design list:**
  - thumbnail, name and "Shown first"
  - ↑/↓ order, Duplicate, Remove (with confirmation)
  - **Add design** from an uploaded mockup, the product photo, or an https link
  - **Replace mockup image**: layers keep their relative place
- **Canvas:**
  - the mockup fitted into 600 × 600, drawn with the storefront's own text layout and fonts
  - drag to move, with snapping to the centre lines
  - drag the handle to resize (Shift keeps a photo's shape)
  - arrow keys nudge 1 px (Shift: 10 px); Delete removes
  - photo slots under an opaque mockup stay clickable
- **Toolbar:**
  - **Add text field**, **Add photo slot**
  - bring forward / send backward, lock while editing, remove
  - undo/redo (also Ctrl+Z / Ctrl+Shift+Z)
  - **Preview as customer**: drawn by the same renderer as the customer's download, with a sample name and a sample photo
- **Settings:**
  - **Text:** the customer field it shows (one field can appear on several designs), label, key, required, max characters, sample text, font, size, weight, colour, alignment, casing, letter spacing, rotation, "shrink long text to fit", and exact X/Y/W/H
  - **Photo slot:** label, required/optional, rectangle/circle, over the mockup or under it (through a transparent window), sample photo, and X/Y/W/H
- **Saving:** one transaction writes the templates (admin-made designs are `st-…`; imported `rb-…` ones are updated in place), their links and order, the text fields the designs show, the design surface size, and uploads for photo slots.
  - The validation names each problem, for example "Text … is outside the design" or "… is not shown on any design".
  - A field no design shows any more is removed only if a design used to show it. Dropdown and other fields are never touched.
- **Re-import safety:** saving marks the product `studioEditedAt`. `import.ts` and `2d-templates.ts` then keep its designs, fields, print area and uploads, unless run with `--force-studio`.
- **The product form can't undo the editor:** saving the product never removes its 2D design links or the fields they show. This holds even from a form opened before the designs changed. The form also reloads these settings after the editor saves.
- **Quick-list wizard:** a newly listed personalised product (not packaging) gets a first design automatically: its photo with the first text field centred. It never replaces existing designs.

Browser check on a throwaway product (deleted afterwards), all **PASS**:

- Empty state, then "Use product photo" creates a 600 × 600 design with a centred "Your name" box.
- Drag moves the box; it snaps back to the centre line; arrow keys nudge.
- Font Allura and size 48 apply; undo and redo work.
- A round, labelled photo slot was added.
- Preview as customer renders.
- Save returned 200.
- Remove warns "No other design shows "Your name", so that field is removed…".
- The product form lists the design, and saving the product form afterwards keeps the design, its field and the photo slot.
- On the storefront:
  - the design is the canvas
  - the 15-character limit applies
  - the round "Child photo" slot shows
  - the typed name shows; uploading a photo unlocks Add to cart, and adding to cart succeeds

Screenshots:

- `2d-admin-editor.png` and `2d-admin-preview.png`: the editor and its customer preview
- `2d-admin-made-storefront.png`: the admin-made design on the storefront
- `2d-admin-editor-imported.png`: the imported Parker pen opened in the editor, nothing saved

All 291 imported products with designs pass the editor's save validation as loaded. Picture-only designs (Ranbazaar has samples with nothing to fill in) are allowed.

Bug found on the way: the product form's design list never appeared, because the product-detail API returned links without their template. Fixed.

## Spec coverage

| Spec section | Status |
|---|---|
| Step 0 coordinate model | Done. Measured live and documented in the coordinate-model doc. |
| A. Layer model | Done:<br>- studio text layers: font, size, weight, colour, alignment, casing, letter spacing, auto-fit; rotation kept for admin-made templates<br>- photo slots with a per-photo transform |
| B. Fonts | Done. OFL substitutes only, no commercial font files:<br>- Montserrat, Roboto, Fredoka, Bebas Neue, Allura, Aleo, El Messiri, Lato |
| C. Import | Done:<br>- one template per sample, deterministic slugs, Sample_N default<br>- one shared field per input slug, with the tightest source limit<br>- photo slots imported<br>- print area sized from the canvas<br>- idempotent backfill with `--dry-run`, `--only` |
| C. EzPac / manual default template | At runtime instead of DB rows: the print area shows the 3D front face or the product photo, with free-form Add text. No pre-filled "Your text" layer is created, so nothing unintended gets printed. |
| D. Storefront UX | Done:<br>- the mockup is the canvas<br>- live text and placeholder<br>- design picker that keeps values<br>- "Enter Max N" limits<br>- casing in preview and export<br>- photo slots with upload, drag, pinch, rotate, zoom, move, reset, replace, remove<br>- noise hints hidden |
| E. Price and cart | Done:<br>- "ready" means the same in the meter, the price check (client and server: `STUDIO_PHOTO_REQUIRED`) and the cart button<br>- the payload carries the template id, field values and photo asset references |
| F. Admin: list, default, order | Done. The product form lists a product's 2D designs (thumbnail, name, ↑/↓ order, "Show this design first"), and so does the editor. The theme-template picker no longer lists the per-product designs. |
| F. Admin visual template editor | Done (see "Admin 2D design editor" above). Layer lock is an editing aid and is not saved. |
| F. Quick-list wizard auto-template | Done for personalised, non-packaging listings: photo plus the first text field, centred. Others still get the runtime fallback. |
| E2E: cart preview equals canvas | Done (2026-11-23). See "Cart preview" below. |

## Cart preview (2026-11-23)

Before this, the cart and checkout showed a generic product illustration, not the customer's design. Now, at Add to cart, the studio design is drawn by `drawStudioDesign`, the same renderer as the proof download (`renderStudioPreview` in `src/components/configurator/design-export.ts`). It is stored as a JPEG data URL of 13–34 KB in `customization.designPreview` and shown in the cart and checkout. On cart load, a preview is kept only if it is an inline jpeg/png/webp data URL. If the preview fails to render, the cart falls back to the illustration.

E2E check: a production build on port 3010, driven by puppeteer. The test fills the fields, uploads a synthetic photo, and rotates, zooms and moves it. It screenshots the storefront canvas, adds the item to the cart, and compares the canvas with the cart image at 480 px. **Region** means the pixels that change when the name or photo changes; that is where a wrong preview would show.

| Product | Whole-image mean diff (0–255) | Region: canvas vs cart | Region: control vs cart |
|---|---|---|---|
| Parker pen (text only) | 0.78 | 32.8 | 90.9 (different name) |
| Name slip (text + rotated, zoomed, moved photo) | 5.6 | 24.0 | 103.3 (different name, no photo) |
| Exam board (photo only, rotated, zoomed, moved) | 2.81 | 3.7 | 85.0 (no photo) |

The remaining canvas-vs-cart difference comes from JPEG compression, anti-aliasing at a different scale, and the editor's dashed selection outline in the canvas screenshot. Screenshots: `2d-cart-preview-nameslip.png` (with `-canvas.png`) and `2d-cart-preview-examboard.png`.

## Tests

- `npm run test:domain`: 329/329, including 11 for the design model (`src/lib/studio-design.test.ts`)
- `npm run test:external-catalog`: 24/24
- The refactored importer writes byte-identical templates: the backfill reports "unchanged" on real products.
- `npx tsc --noEmit` (app) and `-p tsconfig.prisma.json` (scripts): clean
- `npm run build`: passes

The project has no lint script.
