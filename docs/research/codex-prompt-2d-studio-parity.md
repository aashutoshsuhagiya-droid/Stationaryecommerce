# Codex task: make the 2D customisation studio look and work like the reference site for every product

## Context

Naamly (this repo, Next.js 16 + Prisma/Postgres) imported 361 products from **Ranbazaar** (ranbazaar.com) and 64 from **EzPac** (ezpac.in). On Ranbazaar every customisable product opens a 2D editor that works like this:

- It shows the **real product mockup photo** as the canvas, for example the Parker pen in its box.
- The customer's name is **already placed on the product** at the exact spot, in the exact font, colour, size, alignment and rotation.
- The customer only types the name and sees it appear live on the mockup.
- Many products have several **design samples** (Sample_1, Sample_2, …), each with its own mockup and text positions. The customer can pick one.
- Some products have **photo-upload slots** (`customerImg`).

On Naamly the 2D studio is broken for basically all products. Reference screenshot from the live site, product `parker-classic-matte-bp-ball-pen-engraved-your-name-on-pen-with-box-black`, "Design studio" tab:

- The canvas is an empty grey rectangle labelled "Primary print area" with **0 layers**. There is no product image and no name placed on it.
- The right panel says "Add an element allowed for this print area to begin" and "Physical output dimensions are not configured".
- Price says "Complete the required details for a verified price" and **Add to cart is disabled** even though "Design ready 100%" shows.
- Dimensions show "Not specified".

IMPORTANT: this Next.js version has breaking changes. Read the relevant guide in `node_modules/next/dist/docs/` before touching routes or app code (see AGENTS.md). Port 3000 locally is a different project, so run dev on another port (e.g. `PORT=3105`).

## Root cause (verified in code)

The source data has everything we need. See `docs/research/ranbazaar/products/<slug>.json` → `product.customizeDetails[]`, 361 files. Example (Parker pen, Sample_1):

```json
{
  "name": "Sample_1",
  "productImg": "https://dyuh5x5qbqu9p.cloudfront.net/productimages/1736936567429-278565514.webp",
  "customerImg": [],
  "inputFields": [{
    "value": "YOUR NAME ", "name": "YOUR NAME ", "slug": "your_name", "required": true,
    "x": 342, "y": 285, "width": "200", "height": "", "maxLength": "13",
    "style": { "color": "#fad000", "fontSize": "24", "fontFamily": "Gilroy Extrabold",
               "fontWeight": "bolder", "textAlignment": "center", "rotation": 0,
               "textType": "capitalize", "letterSpacing": "" }
  }]
}
```

Plus `product.defaultSample` (index of the default sample) and `category.autoFontSize`.

Totals across all 361 products:

| Item | Count |
|---|---|
| Samples | 1150 |
| Samples with a mockup `productImg` | 1141 |
| Text fields | 840 |
| Photo slots | 357 |

Fonts used:

| Font | Uses |
|---|---|
| Gilroy Extrabold | 639 |
| Roboto | 70 |
| Roundkey Medium | 60 |
| Allura-Regular | 24 |
| Aleo Regular | 22 |
| Elmessiri bold | 20 |
| Lato Regular | 2 |
| Indigo Outline | 2 |
| Arial | 1 |

`textType` values: capitalize 654, uppercase 117, none 69. `maxLength` ranges from 7 to 45.

What our import keeps vs. drops:

- `ranbazaarPersonalizationFields()` in [scripts/import-external-catalog/catalog-import.ts](../../scripts/import-external-catalog/catalog-import.ts) (around lines 417–470):
  - keeps only `label`, `fontId`, `color`, `fontSize`
  - **drops** x, y, width, height, textAlignment, rotation, textType, fontWeight, letterSpacing, the default `value`, and which sample each field belongs to
  - **overwrites the real maxLength** (e.g. 13) with a flat `PERSONALIZATION_MAX_LENGTH = 32`, so long names overflow the pen
- The `productImg` of each sample is only appended to the product gallery (around line 356). It is never used as the editor background.
- `defaultSample` is ignored.
- `customerImg` photo slots are skipped completely (the report lists 168 products).
- [scripts/import-external-catalog/import.ts](../../scripts/import-external-catalog/import.ts) (around line 665) writes the same generic `printAreas: [{ id: "primary", label: "Primary print area" }]` for every product. It has no size, no background and no layers. That is the empty grey box.
- The DB already has the right home for this, and it is unused for imported products:
  - `PersonalizationTemplate` (`previewConfig`, `productionConfig`, `productionWidthPx/HeightPx/Dpi`)
  - `ProductTemplate` (`productId`, `templateId`, `sortOrder`, `isDefault`) in `prisma/schema.prisma` (around lines 721–757)
  - resolution logic in `src/lib/product-template-resolution.ts`
- The artwork model in [src/components/configurator/artwork-types.ts](../../src/components/configurator/artwork-types.ts) cannot express the source yet:
  - `fontFamily` is limited to `"sans" | "serif" | "rounded"`
  - there is no `textTransform`, `letterSpacing` or `fontWeight`
  - there is no way to bind a text layer to a personalization field
  - there is no locked background layer
  - there is no photo-slot (image placeholder) layer

## Goal

For every imported product, the 2D studio must match the reference site:

- the same mockup image
- the same text position, font, colour, size, alignment, rotation and casing
- the same character limit
- the same default sample
- a sample picker when there is more than one
- photo-upload slots where the source has them

The customer types a name and sees it live on the product. Add to cart works once the required fields are filled. EzPac and manually created products must also get a sensible 2D studio instead of an empty grey box.

## Step 0: the reference coordinate model (measured live on 2026-11-22)

These values were measured with puppeteer on the live ranbazaar.com customise view. Re-check them yourself on 3–5 more products before relying on them: a name-slip, a product with rotation ≠ 0, a multi-field product, and one with `autoFontSize`.

- **Canvas:** the editor canvas is a fixed **600 × 600 px** box (`.name-slip.name-slip-bg.product-bg-container`). The sample's `productImg` is its background, contain-fitted.
- **Text field position:** `x`, `y`, `width` and `height` are **raw px in that 600×600 canvas, top-left origin**. Parker pen: source `x:342, y:285, width:200` rendered at exactly left 342, top 285, 200 × 36 inside the canvas. So the normalised position is simply `x/600`, `y/600`, `width/600`. An empty `height` means auto, about 1.5 × fontSize.
- **Text style:** rendered with CSS `font-family: <style.fontFamily>`, `font-size: <style.fontSize>px` (relative to the 600 px canvas), the `fontWeight` (bolder → 700), the `color`, `text-transform: <style.textType>`, and the `textAlignment` applied inside the box width.
- **Photo slot position:** `customerImg[]` entries use the same space. Example from `add-a-personal-touch-to-exam-boards-custom-names-and-photos-for-kids`: `{x:89, y:0, width:"424px", height:"601px"}` rendered at 89,0, 424 × 601. Strip the `"px"` suffix when parsing. The photo sits **under** the mockup frame: the clipboard clip and logo stay on top, and the photo shows through the board area. That means:
  1. draw the slot photo first
  2. draw the mockup on top, if it has transparency
  3. if the mockup has no transparency, draw the photo over the mockup but clipped to the slot rectangle

  Check which of these applies per product.

Write the final formula plus screenshots to `docs/research/ranbazaar-2d-coordinate-model.md`.

## Reference editor behaviour, measured live (must match 1:1)

Screenshots: run `node scripts/probe-ranbazaar-editor2.tmp.cjs <slug>` (puppeteer, writes to the temp folder). It opens "Customize & Add To Cart", types a name, uploads a test photo, tries dragging and clicks every control.

**Product page → editor**
- The product page has one primary button, "Customize & Add To Cart". It switches the page into the editor view:
  - left: the 600×600 canvas
  - right: the input panel, a quantity stepper (red "−", number, green "+"), "Add To Cart" and "Buy Now"
- The quantity stepper uses `[-] [1] [+]` buttons. It is not a plain number input.

**Text personalisation (every text field)**
- Label format: `<FIELD NAME> (Enter Max <remaining>)`. The "(Enter Max N)" part is red and **counts down** as the customer types, e.g. "Enter Max 13" → "Enter Max 0".
- The input has a hard `maxLength` equal to the source `maxLength`. Extra characters are blocked, not truncated afterwards.
- The text appears **live** on the mockup on every keystroke, in the field's font, colour, size and casing. Before typing, the placeholder from the source `value` is shown on the mockup (e.g. "Your Name", with capitalize applied).
- Required validation: a red "This field is Required." message under the empty input. Add To Cart and Buy Now block until every required field is filled.
- Text position is **fixed for the customer**. The text element has a `react-draggable` class, but a real drag did not move it. Our bound text layers are therefore `locked` on the storefront. Admins can move them in the admin template editor (see F).

**Photo upload (every `customerImg` slot)**
- Before upload:
  - the right panel shows a dashed upload box with a cloud icon and a "Choose files to Upload" button (file picker; also accept drag-and-drop of a file onto this box **and** onto the canvas slot)
  - the canvas slot shows a placeholder: centred text "DRAG YOUR PHOTO HERE" on the slot area
  - red "Please upload image is Required." shows until a photo is added
- After upload:
  - the right panel shows the uploaded photo thumbnail with a red **trash (delete)** button in its top-right corner; delete removes the photo and brings back the placeholder
  - the photo appears inside the slot, contain-fitted
- A control grid of 8 icon buttons sits next to the upload box (Bootstrap icons):

  | Button | Step per click |
  |---|---|
  | rotate clockwise | +10° |
  | rotate counter-clockwise | −10° |
  | zoom in | scale +0.1 |
  | zoom out | scale −0.1 |
  | move left | −3 px |
  | move right | +3 px |
  | move up | −3 px |
  | move down | +3 px |

  Steps are applied as `transform: rotate(..) scale(..)` plus `top/left` offsets on the photo. Hold-to-repeat is a nice extra, not required.
- The photo itself can also be **dragged with the mouse or touch** inside the slot (`draggable`, cursor `move`). It stays clipped to the slot.
- With several photo slots, each slot gets its own upload box, thumbnail, delete button and control grid. The controls act on the selected slot.
- There is no right-click or context menu for the customer.

**Our version: same behaviour, cleaner UI**

Match every capability and limit above exactly:

- labels, countdown, hard max, required messages
- live text
- locked text positions
- upload by picker or drag-and-drop
- delete
- rotate ±10°, zoom ±0.1, move ±3 px, drag to pan, clip to slot
- quantity stepper
- Add To Cart + Buy Now

Use our design system (icons with `aria-label`s/tooltips such as "Rotate right", "Zoom in", "Move left", "Remove photo"). Add these small improvements:

- a "Reset photo" button (rotation 0, scale 1, offset 0)
- pinch-zoom on mobile
- keyboard arrows to nudge the selected photo
- persist the photo transform (`rotation`, `scale`, `offsetX/Y` in canvas px) in the saved design so production renders it identically

Validate uploads with the existing `src/lib/artwork-upload.ts` rules (JPG/PNG/WEBP, max size, minimum resolution warning for print). Keep the customer's original file for production, not the downscaled preview.

## Required changes

### A. Richer artwork layer model (`artwork-types.ts` + renderer + editor)

Add these optional properties, keeping them backward compatible:

- `fontFamily`: widen to a font id string from a registered font list. Keep the old 3 values as aliases.
- `fontWeight`, `letterSpacing`, `textTransform: "none" | "uppercase" | "capitalize"`, and `autoFit: boolean` (shrink to fit `width` × `height`).
- `bindFieldKey`: the text comes from the customer's value for that personalization field, with `placeholder` = the source default value (e.g. "YOUR NAME").
- `locked: true`: the customer can't move, resize or delete the layer. Use this for the mockup background and the bound text positions on reference products.
- `role: "background" | "text" | "photo-slot"`: a photo-slot is a masked rectangle (or circle) where the customer's uploaded photo is placed with cover fit, and can be panned and zoomed inside the mask.

Update all three to render these identically:

- `artwork-canvas-renderer.ts`
- `design-export.ts` (the production export must use the same layout)
- the `ArtworkEditor.tsx` preview

Add unit tests.

### B. Fonts

Register a font catalog (`src/lib/studio-fonts.ts`) loaded with `next/font` or self-hosted `@font-face` in `public/fonts`. Only use fonts we are allowed to ship:

| Source font | What to use |
|---|---|
| Roboto, Lato, Allura, Aleo, El Messiri | Google Fonts (OFL) |
| Gilroy Extrabold (commercial) | Map to a close OFL substitute, e.g. "Outfit ExtraBold" or "Montserrat ExtraBold". Don't download Gilroy from the reference site |
| Roundkey Medium | Pick the closest OFL rounded display font |
| Indigo Outline | Pick the closest OFL rounded display font |

Keep a `sourceFont → ourFont` map in one place so ops can swap it in later if they buy a licence. The canvas must wait for `document.fonts.load()` before drawing, so the first frame isn't in a fallback font.

### C. Import: carry the full 2D design (`catalog-import.ts`, `import.ts`)

For each Ranbazaar product:

1. For each `customizeDetails[i]` that has a `productImg`, create (or upsert by a deterministic slug, e.g. `rb-<externalId>-s<i>`) a `PersonalizationTemplate`:
   - `previewConfig` = one surface sized to the mockup's natural aspect ratio, containing:
     - layer 1: locked background image = `productImg`, contain/cover per the measured model
     - one locked text layer per `inputField`, using the Step 0 coordinate model plus all style props, `bindFieldKey`, `placeholder = value.trim()`, and `autoFit` from `category.autoFontSize`
     - one photo-slot layer per `customerImg` entry, using its own position data (inspect the source JSON for its fields)
   - `productionConfig`: the same layers. Use `productionWidthPx/HeightPx` from the mockup's natural pixel size and DPI 300.
2. Link the templates with `ProductTemplate`: `sortOrder = i`, `isDefault = (i === product.defaultSample)`.
3. Personalization fields:
   - Fields with the same `slug` across samples become **one** field shared by all samples, so switching samples keeps the typed name.
   - Use the source `maxLength` (number) instead of the flat 32. Only cap it at the 45 that the source already uses.
   - Keep `required`.
   - Use the real label from `inputField.name` (trimmed). If that is just the placeholder (e.g. "YOUR NAME"), use a readable label such as "Your name". Keep the raw value in metadata.
4. Photo slots: import them now (they were skipped before). Create a personalization field with `inputType: "image"`, use the existing artwork-upload validation, and remove those products from the "skipped" list.
5. `configurator.printAreas`: replace the generic `primary` with the template surface ids and labels. Never write an area with no size.
6. Keep the import idempotent and re-runnable: re-import updates the templates and never duplicates them. Add a dry-run diff to the plan JSON (`fidelity.templates`: created, updated, unchanged).
7. Write a backfill script `scripts/import-external-catalog/2d-templates.ts` with `--dry-run`, `--source=ranbazaar` and `--only=<slug>`, so the existing DB rows can be fixed without a full re-import.

For EzPac (no source 2D data) and for manually listed products, create a **default template** from the product's primary photo:

- background = primary photo
- one centred, unlocked "Your text" layer inside a safe area of the central 60%
- sized from the variant dimensions when present

This removes the empty grey box everywhere. Packaging products that have a 3D template also show their front surface here.

### D. Storefront studio UX (match the reference)

In `ArtworkEditor.tsx` and the product page studio panel:

- **Canvas:** shows the mockup, fitted to the panel with no grey void. The bound text updates live as the customer types in the "Personal details" inputs. Show a typing cursor/placeholder ("YOUR NAME") until text is entered.
- **Sample picker:** show a thumbnail strip of all templates linked to the product, with the default one selected. Switching keeps the field values.
- **Character counter** next to each input (e.g. 4/13), enforced on both client and server.
- **Casing:** apply `textTransform` both in the preview and in the saved/exported design, so the order shows exactly what the customer saw.
- **Locked layers:** hide move/resize/delete handles. Keep "Add text" / "Add image" for free-form products only, i.e. templates without locked bound layers.
- **Photo slots:** an upload button inside the slot, plus pan, zoom and replace.
- **Remove noise for template products:**
  - hide "Physical output dimensions are not configured" when the template defines production px/DPI
  - hide the "Add an element allowed for this print area" hint when the template already has layers

### E. Price and cart

"Complete the required details for a verified price" plus a disabled Add to cart, while "Design ready 100%" is shown, is a contradiction.

1. Find the condition in the price-verification flow (`src/lib/pricing-service.ts`, `src/app/api/customizations/route.ts`, `src/lib/product-configuration.ts`).
2. Make "ready" mean the same thing in the completion meter (`design-completion.ts`) and in the pricing check: all required fields and photo slots are filled, and a variant is selected.
3. Products with a single default variant ("Default Title") must not ask for dimensions. Hide the "Dimensions: Not specified" block when the product has no size options.
4. Once ready, show the real price (₹869 for the Parker pen) and enable Add to cart.
5. The customization payload sent to cart and order must include the template id, the field values and the photo asset ids, so production gets the same design.

### F. Admin (template settings: the Ranbazaar admin "sample" editor equivalent)

**Product editor → "2D templates" section**

The template list:
- Each linked template (sample) shows its thumbnail, name, a default toggle and drag-to-reorder.
- Buttons: **Add sample** (upload a mockup image), **Duplicate**, **Replace image** and **Remove sample** (with a confirmation).

The visual template editor reuses the ArtworkEditor in admin mode. On the 600×600 canvas the admin can:

- **Add text field.** It creates a bound text layer and a personalization field. The admin can drag/resize it on the canvas and set it in a settings panel. Settings:
  - label and field key
  - placeholder (default value)
  - required on/off
  - maxLength
  - font (from the font catalog)
  - size, weight, colour picker
  - alignment left/centre/right
  - rotation
  - letter spacing
  - casing none/uppercase/capitalize
  - auto-fit on/off
  - exact X/Y/W/H number inputs
- **Add photo slot.** It creates a photo-slot layer and an image field. The admin can drag/resize it and set: label, required, shape (rectangle/circle), whether the slot sits under or over the mockup, and exact X/Y/W/H.
- **Remove** any text field or photo slot. This also deletes the bound personalization field if no other sample uses it, after a confirmation.
- **Layer order:** bring forward / send backward. Lock/unlock while editing. Snap to the canvas centre lines.
- **Undo/redo**, plus **Preview as customer**: switches to storefront mode with sample text and a sample photo.

Save writes `PersonalizationTemplate.previewConfig` and `productionConfig`, plus the `ProductPersonalizationField` rows, in one transaction. Validate that layers stay inside the canvas and that every bound field exists.
- The quick-list wizard (`QuickListProductWizard.tsx`): after uploading the photo, auto-create the default template (see C) so new products never ship with an empty studio.

## Tests (must pass: `npm test`, `npx tsc --noEmit`, `npm run lint`)

- Coordinate mapping: source (x, y, width, fontSize, alignment) → normalised layer, checked against the measured values from Step 0. Include the Parker pen fixture.
- Import: the Parker pen produces 2 templates (Sample_3 has no image or fields, so skip it), the default is Sample_1 (`defaultSample: 0`), there is 1 shared field `your-name` with `maxLength` 13, and the text layer has `textTransform: "capitalize"`, colour `#fad000` and the mapped font.
- Re-running the import is idempotent (no duplicate templates).
- Renderer: `capitalize` and `uppercase` are applied, `autoFit` shrinks long text inside the width, and a rotation of 90 works.
- Completion/pricing: the "ready" state matches across the meter, the price and the cart button.
- Photo-slot field validation reuses the artwork-upload rules.
- Photo controls:
  - rotate ±10°, zoom ±0.1 (clamped to 0.2–5) and move ±3 px change the stored transform
  - reset restores the defaults
  - delete clears the slot and makes the field required again
  - the saved transform renders identically in `design-export.ts`
- Text input: `maxLength` blocks extra characters, the "(Enter Max N)" counter counts down, and the required message shows when the field is empty.
- Admin template editor:
  - add text field / add photo slot creates the layer and the field
  - remove deletes both, but keeps a field still used by another sample
  - reorder and default toggle persist
- E2E (puppeteer) on the Parker pen and the exam-board photo product:
  1. type a name, upload a photo
  2. click every control, drag the photo, delete and re-upload
  3. Add To Cart succeeds
  4. the cart item's design preview matches the canvas

## Manual verification (puppeteer, side by side with ranbazaar.com)

Pick 10 products covering the main cases:

- Parker pen
- a name-slip pack
- a bottle
- a product with a rotated field
- a multi-field product
- a product with a photo slot
- an Allura (script) font product
- an uppercase product
- one EzPac box
- one manually created product

For each one:

1. Screenshot our studio with the name "Aarav" next to ranbazaar.com with the same name.
2. Save the pairs to `docs/research/2d-parity-*.png`.
3. Write a short table in `docs/research/2d-parity-report.md` listing for each product: position delta (px), font match, colour, casing, limit, and whether Add to cart works.

Target: text position within ±2% of the canvas width, everything else identical (fonts per the substitute map).

## Do not

- Do not download or ship commercial fonts (Gilroy etc.) from the reference site. Use the OFL substitutes and the swap map.
- Do not copy reviews or ratings (this is an existing project rule).
- Do not break the 3D flow. Publishing a `VisualizationTemplate` stays the only writer of `allow3D`, `productModel` and `previewTemplate`.
- Do not change existing order or customization records. New fields must be optional and backward compatible.
