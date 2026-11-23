# Packaging 3D previews — realistic and product-fitted

Implements `docs/research/codex-prompt-3d-box-preview.md`. Date: 2026-11-22.

## Before → after (the reference "Soap Box")

| | Before (`verify-3d-soap-box.png`) | After (`3d-fix-reference-soap-box-*.png`) |
|---|---|---|
| Faces | the bathroom photo on all six faces and the flap | photo on the front only; sides, top and back plain board |
| Photo fit | stretched 4:3 onto the front and the narrow sides | cover-fit to the face's own proportions, no squash |
| Source | the whole lifestyle scene | the most salient region (the soap box) — flagged "lifestyle shot, upload flat artwork" |
| Size | 150 × 100 × 50 placeholder | 90 × 60 × 30 (soap-box shelf default) |
| Front | dark crease band across it | none; only faint, low-contrast tuck lines on the top edges |
| Framing | bottom cut off | whole box centred, soft contact shadow under it |

## What changed

**A. Per-face artwork** — `product-3d-surfaces.ts` gets a packaging fallback table: back, sides, top, bottom and gussets never borrow the front photo; they resolve to nothing and the model paints them in the board material. Built-in label and school models keep the old table (tested). The back mirrors the front only with an explicit `mirrorBack` opt-in (resolver + renderer prop; read from the template's `previewCapabilities.mirrorBack`).

Why the template still stores only the front mapping: the studio's confirmation schema requires source bounds for every extra surface, and a surface with bounds is textured with a crop of the photo — the opposite of plain board. So the full face list is described by `packagingFaces(plan)` (tested: boxes 6 faces, bags 5, pouches 3, only the front textured), and unprinted faces are left to the renderer's packaging fallback.

**B. Front artwork, not the scene** — `src/lib/visualization-artwork.ts` (server-only, sharp):
- an image uploaded as `kind: "artwork"` (flat artwork / dieline) is preferred over the hero;
- `cropFrontArtwork()` trims a plain or transparent backdrop and reports `confidence: "high"` with the subject's own edge colour;
- a busy backdrop (lifestyle scene) is attention-cropped to the front panel's proportions and reported as `"low"` — published anyway, with the note *"Photo is a lifestyle shot — upload flat front artwork for a sharper 3D preview"*, shown on the quick-list success panel and in the advanced editor's 3D binding tab.

**C. Fit and materials** — the visualization base layer uses `imageFit: "cover"` with `aspectLocked: true`; the cover maths was extracted into the tested `fitImageRect()`. Each face's texture canvas is now reshaped to that face's aspect (`fitDefinitionToFace`), and customer layers are re-placed, not stretched — this was a second, hidden distortion: the 2D editor's generic 600×360 canvas was being stretched over a 90×60 face. Unprinted board colour: named stock (kraft / white SBS / black) → the artwork's sampled edge colour (high confidence only — a scene's edge is the room) → the theme. Carton board is satin (roughness 0.55, no clearcoat); only gloss lamination earns a clearcoat; kraft stays matte.

**D. Product-specific size** — new client-safe `src/lib/packaging-dimensions.ts` with the 11 shelf defaults. Order everywhere: the product's own measured size → the shelf default → the model default. The hard-coded `BOX_DIMENSIONS` is gone (from the shape presets and from `3d-enable.ts`). On the storefront an *unvalidated* template's stored size is treated as the placeholder it is, so existing previews pick up shelf sizes and a later product size wins without regenerating; an admin-validated template size is kept.

**E. Right model per shelf** — two new models end to end (profile, dimensions, geometry, studio policy, admin `productModelSchema`, playbook, shape presets, admin model picker):
- `mailer-bags` → `mailer-envelope`: a thin rounded poly slab with the peel-and-seal flap over the top edge (published with geometry `custom`, because a `bag` geometry always resolves to `paper-bag`);
- `gift-event-boxes` → `rigid-lid-box`: base plus a slightly larger, shallower lid with a visible lip;
- `shipping-boxes` → `rectangular-box` with a corrugated-kraft look and a tape seam; `mailer-box` only when the product's name or slug matches `mailer|e-commerce|tuck`.

A test asserts every shape plan resolves back to its own model through `resolveVisualizationProductModel`, so publishing and `assertProductPreviewAllowed` can never disagree.

**F. Geometry** — rounded board edges (`RoundedBoxGeometry`, radius ≈ 0.6% of the longest side, per-face groups intact); the folding carton gets a flush tuck-end lid, hinge and tuck lines and a faint glue-flap seam; the mailer and rigid lids have plain lip bands and top artwork only when a top panel exists; pouch seals are the film a shade darker instead of a dark band; a gradient contact shadow grounds the product on every device, including low-power ones where shadow maps are off. Camera fit (bounding sphere, FOV-based distance, 3/4 iso default) was already in place and is unchanged.

## Verification

| Gate | Result |
|---|---|
| `npm run typecheck` | ✅ clean |
| `npm run build` | ✅ exit 0 (after Next.js's own security-upgrade interstitial) |
| `npm run test:domain` | ✅ 298/298 (+17 new across shape presets, artwork crop, surfaces, profiles, preview fit, configuration dims, playbook) |
| `npm run test:external-catalog` | ✅ 8/8 |
| `npm test`, `npm run lint` | not defined in this repo's `package.json`; the two suites above are its test gates |

Manual (headless Chrome, quick list → Create 3D preview → storefront Front / 3D / Left / Top):

| Shelf | Model | Size shown | Screenshots |
|---|---|---|---|
| soap-boxes | folding-carton | 90 × 60 × 30 mm | `3d-fix-soap-boxes-*.png` |
| perfume-cosmetic-boxes | folding-carton | 60 × 150 × 60 mm | `3d-fix-perfume-cosmetic-boxes-*.png` |
| gift-event-boxes | rigid-lid-box | 200 × 200 × 100 mm | `3d-fix-gift-event-boxes-*.png` |
| shipping-boxes | rectangular-box (tape seam) | 300 × 200 × 150 mm | `3d-fix-shipping-boxes-*.png` |
| d-cut-paper-bags | paper-bag | 250 × 350 × 80 mm | `3d-fix-d-cut-paper-bags-*.png` |
| food-pouches | stand-up-pouch | 160 × 240 × 90 mm | `3d-fix-food-pouches-*.png` |

In every case the front shows the artwork undistorted, sides and top are plain matching board, there is no line across the front, and the whole product is in frame. The six test products were deleted afterwards (catalogue back to 435).

## Existing live previews regenerated

The renderer-side fixes (plain panels, cover fit, face-shaped canvases, shelf sizes, geometry) reach every existing preview with no data change. To also give them the front-artwork crop, sampled board colour and the corrected models, `3d-enable.ts --regenerate` rebuilt every EzPac preview with the shared pipeline: **36 published, 0 failed** (up from 34 — two products whose export handles were mapped in the category work now qualify). Publishing archives each product's previous template; nothing was deleted.

| Model | Count | Artwork confidence |
|---|---|---|
| folding-carton | 24 | all low |
| rigid-lid-box (was folding-carton) | 4 | low |
| mailer-envelope (was paper-bag) | 2 | 1 high, 1 low |
| paper-bag | 2 | 1 high, 1 low |
| stand-up-pouch | 2 | low |
| mailer-box | 1 | low |
| square-box | 1 | low |

Most EzPac heroes are rendered mockups in a scene, so most are honestly flagged low confidence and their admins now see the flat-artwork note. Live evidence: `3d-fix-reference-soap-box-*.png` (the original bathroom-photo product), `3d-fix-live-mailer-envelope-*.png` (a courier mailer that used to render as a handled paper bag), `3d-fix-live-rigid-lid-box-*.png`.

## Not done, and why

- **Per-face texture replacement in the studio** (B, last bullet). A template has one source asset today, with per-face bounds into it; a different image per face needs multiple assets per template — a data-model change, left as a follow-up.
- **"Same design on back" checkbox in the studio UI.** The opt-in is honoured end to end (`previewCapabilities.mirrorBack` → storefront → renderer), but no studio control writes it yet.
