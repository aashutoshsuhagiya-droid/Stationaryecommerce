# Ranbazaar 2D studio — coordinate model

Measured on ranbazaar.com on 2026-11-22 with a headless browser: open the product, press **Customize**,
type a marker into each input, then read the DOM geometry of the design container and of every text
element (`getBoundingClientRect`, computed style, inline style). The same model is implemented in
`scripts/import-external-catalog/ranbazaar-studio.ts` (import), `src/lib/studio-template.ts` (layout)
and `src/components/configurator/studio-canvas.ts` (raster export).

## 1. The canvas

The design container is a 600 × 600 box whose background is the sample's mockup, drawn
`background-size: contain; background-position: 0% 0%`. Its `max-width` / `max-height` are set to the
mockup's fitted size, so **the visible canvas is the mockup fitted into 600 × 600, anchored top-left**:

```
scale        = min(600 / mockupWidth, 600 / mockupHeight)
canvasWidth  = round(mockupWidth  × scale)
canvasHeight = round(mockupHeight × scale)
```

| Product (default sample) | Mockup (natural) | Reference container | Ours |
|---|---|---|---|
| Avenger name slip | 700 × 450 | 600 × 386 (`max-height: 385.714px`) | 600 × 386 |
| Exam board (kid name) | 700 × 995 | 422 × 600 (`max-width: 422.111px`) | 422 × 600 |
| Baby name sign | 600 × 600 | 600 × 600 | 600 × 600 |

Of 1132 distinct mockups in the catalogue, 897 are square, 206 wide and 29 tall. Sizes are measured
once (image header via sharp) and cached in `docs/research/ranbazaar/mockup-sizes.json`; the test
`every catalogue mockup has a cached size` fails if a new mockup is not measured.

> Earlier versions of our studio used a fixed 600 × 600 canvas and letterboxed wide mockups. That put
> text ~107 px too high on the name slip (37 % of the canvas). Fixed by the formula above.

## 2. Text position

Every source input is an absolutely positioned element inside the container:

```
left = x                    (px, may be negative — the exam board uses x = −68)
top  = y                    (px)
width = width               (px; "530px" and 530 are the same)
height = auto               (the stored `height` is NOT applied)
font-size = style.fontSize  (px)
line-height = 1.5 × font-size
display: flex; flex-direction: column; justify-content: center;
text-align = style.textAlignment (left | center | right)
overflow: hidden
```

So line *i* (0-based) of a wrapped value has its vertical centre at `y + 1.5·fontSize·(i + 0.5)`, and
the text is aligned inside `[x, x + width]`. Text outside the canvas is clipped by the container.

Measured: Avenger slip default sample, name input `x 69, y 20, width 530, fontSize 28` → element at
`68, 20, 530 × 42`; school input `x −2, y 331.36, width 598` → `−2, 331, 598 × 42`. Exam board
`x −68, y 221, width 545, fontSize 48` → `−68, 221, 545 × 72`.

## 3. Rotation

Fourteen inputs in the catalogue store a `style.rotation` (−2° … −48°). **The reference storefront
ignores it**: every field renders `transform: rotate(0deg) scale(1)` (checked on the exam board, −48°,
and the hexagon mirror frame, −30°). We store `rotation: 0` and keep the source value as
`sourceRotation` (parser output only) for audit. The renderer still supports rotation about the box
centre for admin-made templates.

## 4. Casing, colour, weight

- `style.textType` → CSS `text-transform` (`capitalize` upper-cases the first letter of each word and
  leaves the rest as typed — "aarav" → "Aarav", "aARAV" → "AARAV").
- `style.color` → fill colour as is.
- `style.fontWeight` `bold`/`bolder` → 700, `normal` → 400, `lighter` → 400. The reference fonts are
  single faces ("Aleo Regular"), so `lighter` cannot render thinner there; our variable fonts would.
- `style.letterSpacing` blank → 0.

## 5. Fonts

The reference ships commercial fonts (Gilroy, Roundkey, Indigo Outline …). We do not copy them; each
source family maps to an OFL substitute (`src/lib/studio-fonts.ts`):

| Source | Ours |
|---|---|
| Gilroy Extrabold / Gilroy | Montserrat (at the source weight) |
| Roundkey Medium (60 inputs, always capitals) | Bebas Neue (tall condensed capitals) |
| Indigo Outline | Fredoka |
| Allura-Regular | Allura |
| Aleo Regular | Aleo |
| El Messiri | El Messiri |
| Lato, Roboto | Lato, Roboto |
| Arial | system sans |
| anything else | Montserrat |

Glyph widths differ slightly, so centre- and right-aligned text can be a few pixels off at its far edge;
the alignment anchor (left edge, centre or right edge) is what matches.

## 6. Values, limits, samples

- The input's `value` is the sample text shown on the mockup until the customer types.
- `maxLength` is enforced on the input (the reference label reads "Enter Max N"). Where the same input
  appears on several samples we keep the tightest limit so a name fits every design (capped at 45).
- One value is shared by every sample: the reference keeps a single state per input slug, so switching
  samples keeps the name. We model this as one personalization field per input slug.
- `product.defaultSample` is the index (in `customizeDetails`) of the design shown first. Samples
  without a `productImg` are gallery photos, not designs.
- `categories.autoFontSize` marks products whose text shrinks to fit its box; we shrink the font until
  the widest line fits `width` (minimum 6 px) instead of wrapping.

## 7. Photo slots

`customerImg[]` slots use the same coordinate space (`x, y, width, height` in canvas px). Measured on the
exam board (slot `89, 0, 424 × 601`) with a synthetic 800 × 500 test photo; every non-GET request was
blocked so nothing was uploaded to the reference site (the reference reads the file locally):

- The photo lives in a sibling layer **under** the mockup container (`z-index: 1` vs `2`), so it shows
  through the mockup's transparent window. Text (`z-index: 3`) stays on top.
- Slot element: `position: absolute; transform: translate(x, y); width × height; overflow: hidden`.
- Photo: `<img style="width: 100%; height: 100%; object-fit: contain; position: relative; left: L; top: T;
  transform: rotate(Rdeg) scale(S)">` — contain-fitted and centred in the slot (the 800 × 500 photo showed at
  424 × 265, y ≈ 168), then offset by `L, T` px and rotated/scaled about its own centre.
- Controls: rotate +10° / −10°, zoom ×(S ± 0.1), move ±3 px left/right/up/down, delete. The panel shows
  "Please upload image is Required." until a photo is chosen.
- Before an upload the slot shows the source's demo photo (`customerImg[].imageUrl`, e.g. a child in
  school uniform behind the name-slip window). 348 of the 357 catalogue slots have one.

Ours: each slot is `studio.photos[]` on the template (`stacking: "under"`). The customer's photo is an
uploaded artwork image layer `studio-photo-<key>` (private upload, signature/size checks, claimed by the
order like any artwork image) with `photo: { offsetX, offsetY, rotation, scale }`; rotation steps 10°,
zoom 0.1 (clamped 0.2–5), moves 3 px; drag and pinch work on the canvas; arrows/+/−/R/0/Delete on the
keyboard. The layer's own x/y/width/height are only the slot clamped into the 600 × 600 policy space —
drawing always uses the template's slot. A design's slots are required by the price check (client and
server, `STUDIO_PHOTO_REQUIRED`) whenever the product accepts uploads; products whose designs have slots
get uploads enabled by the importer/backfill.

Details that matter:

- The empty slot shows the demo photo (`photos[].sampleUrl`), drawn contain-fitted like the reference. It
  is preview only: exports and orders draw just the customer's own photo, and the price stays locked
  until every slot has one.
- Uploads are switched on with the **stored** configurator keys the admin form also writes:
  `artworkUpload: true`, `acceptedMimeTypes: [...]`, `maximumArtworkBytes: n`. A nested
  `{ enabled, acceptedMimeTypes }` object is read back by the runtime catalog as "uploads on, no types
  allowed", which hides every slot (covered by a test).
- A product whose designs have only photo slots (32 in the catalogue, e.g. the 5-photo notebook pack)
  is still customizable.
- Saving a product in admin stores an explicit artwork policy. On products with photo slots the slot
  rules (600 × 600 space, one image per slot) are applied on top of it; the admin's upload switch, file
  types and byte limit still win.

## 8. Where it is stored

`PersonalizationTemplate` per sample, slug `rb-<externalId>-s<sampleIndex>`:

```jsonc
previewConfig.studio = {
  "version": 1,
  "canvas": { "width": 600, "height": 386 },
  "background": { "url": "<mockup>", "color": "<productbgColor|null>" },
  "texts": [{ "fieldKey": "enter-your-name", "x": 69, "y": 20, "width": 530, "height": null,
              "placeholder": "ENTER YOUR NAME", "fontId": "montserrat", "sourceFont": "Gilroy Extrabold",
              "fontSize": 28, "fontWeight": 700, "color": "#000000", "textAlign": "left",
              "rotation": 0, "textTransform": "capitalize", "letterSpacing": 0, "autoFit": false }],
  "photos": []
}
productionWidthPx × productionHeightPx = canvas size, productionDpi = 300
```

The order stores the template id, the field values and the template snapshot, which is enough to
re-render the exact design for production.

Designs made or edited in the admin design editor use the same shape (`src/lib/studio-design.ts`,
`studioTemplateData`, shared with the importer). New ones get the slug `st-<productId>-<random>`. Saving marks
the product `metadata.studioEditedAt`, and the importer and backfill keep that product's designs unless run with
`--force-studio`.
