# Codex task: make packaging 3D previews realistic and fit each product

## Context

This is a Next.js storefront (Naamly) that sells custom packaging. Packaging products (soap boxes, perfume/cosmetic boxes, gift boxes, shipping boxes, snack boxes, carry bags, pouches) get a 3D preview through the admin's one-click **Create 3D preview** button:

`POST /api/admin/visualization-studio/quick-3d` → [src/app/api/admin/visualization-studio/quick-3d/route.ts](../../src/app/api/admin/visualization-studio/quick-3d/route.ts)

This route turns the product's primary photo into a published `VisualizationTemplate`. The storefront then renders it with Three.js in [src/components/configurator/Product3DPreview.tsx](../../src/components/configurator/Product3DPreview.tsx), using geometry from [product-3d-model.ts](../../src/components/configurator/product-3d-model.ts).

IMPORTANT: this repo uses a newer Next.js with breaking changes. Read the relevant guide in `node_modules/next/dist/docs/` before you touch any route or app code (see AGENTS.md).

## What is broken (verified)

Reference screenshot: `docs/research/verify-3d-soap-box.png` (product "Soap Box", category `soap-boxes`).

1. **The same photo is printed on all six faces.**
   `visualizationConfirmationFor()` in [src/lib/visualization-shape-presets.ts](../../src/lib/visualization-shape-presets.ts) only creates one surface mapping (`front`). `SLOT_FALLBACKS` in [product-3d-surfaces.ts](../../src/components/configurator/product-3d-surfaces.ts) then falls back to `front` for back, left, right, top and bottom. As a result, the front photo gets stretched across every face and across the folding-carton top flap too.

2. **The texture is a lifestyle photo, not box artwork.**
   The product hero is often a scene: a bathroom counter, a bottle, a towel, with the box somewhere inside it. The whole scene gets wrapped onto the box, so the "box" looks like a cube made of a photo.

3. **The photo is distorted.**
   [visualization-preview.ts](../../src/components/configurator/visualization-preview.ts) (around line 186) uses `imageFit: "stretch"` with `aspectLocked: false`. A 4:3 photo gets squashed onto a 150×100 front face and onto the narrow side panels.

4. **Every box gets the same placeholder size.**
   `SHAPE_PLANS` uses `BOX_DIMENSIONS = 150×100×50` for folding-carton, mailer-box and rectangular-box. This overrides the better per-kind defaults in [product-3d-dimensions.ts](../../src/components/configurator/product-3d-dimensions.ts). For example, a folding carton defaults there to 85×170×48 (tall), but the preset makes it wide. A soap box should look like roughly 90×60×30. The product's own size (variant dimensions or attributes) is never used.

5. **Some categories use the wrong 3D model** ([category-listing-playbook.ts](../../src/lib/category-listing-playbook.ts), recipes with `threeDPath: "template"`):
   - `mailer-bags` uses `paper-bag`. A courier/mailer bag is a flat poly envelope, not a gusseted paper bag with handles.
   - `gift-event-boxes` uses `folding-carton`. These are usually rigid lid-and-base boxes, which is closer to `square-box` or a lid box.
   - `shipping-boxes` uses `mailer-box`. Many shipping boxes are corrugated RSC cartons, which is closer to `rectangular-box` with a corrugated look and tape seam.

6. **Geometry artifacts:**
   - In `addCartonDetails()` ([product-3d-model.ts](../../src/components/configurator/product-3d-model.ts) around line 394), the "crease" is a dark accent-coloured slab at `height * 0.43`. It shows as a black line across the front face (visible in the screenshot).
   - The folding-carton "flap" is a flat slab floating on top and carries the same photo texture.
   - The mailer box lid reuses `boxFaceMaterials`, so the photo is printed again on the lid band.
   - The camera framing cuts off the bottom of the box in the screenshot (the box is not centred or fitted to the view).

## Goal

Every packaging product should show a believable 3D mockup of **that** product: the right shape and proportions, artwork on the front (and other faces only when they really have artwork), and clean board/kraft/white material on faces without artwork.

## Required changes

### A. Per-face mapping instead of copying one face everywhere
- In `visualization-shape-presets.ts`, generate surface mappings for every face of each model:
  - boxes: front, back, left, right, top, bottom
  - bag: front, back, gusset-left, gusset-right, bottom
  - pouch: front, back, gusset
- Only `front` gets the uploaded photo by default. The other faces must render as a plain material colour (from the theme: white board, kraft, or a sampled dominant colour; see C). They must not reuse the photo.
- Change the fallback behaviour so a missing side/top/back face renders the plain material instead of the front texture. Keep `front ↔ primary ↔ label` as aliases. Remove `front` from the fallback lists of `back`, `left`, `right`, `top`, `bottom`, `side` and `gusset*` **for template-backed packaging**. Built-in school/label models keep their current behaviour, so put this behind a flag or a separate fallback table.
- `back` may mirror `front` only if the admin explicitly opts in (for example a "same design on back" checkbox in the studio).

### B. Use the box's own artwork, not the whole scene
- Add a front-artwork extraction step to the quick-3d route, before `startVisualizationAnalysis`:
  1. Prefer a product image tagged as flat artwork or dieline (if one exists, e.g. `imageAssets.kind === "artwork"`), or an image with a plain or transparent background.
  2. Otherwise crop the hero to the main subject with `sharp`: trim the uniform background, then take the most box-like central region. Make this a pure, unit-tested helper in `visualization-shape-presets.ts`, e.g. `cropFrontArtwork(bytes)`.
  3. Return a `confidence` value. When confidence is low, still publish, but set the template note or flag "Photo is a lifestyle shot — upload flat front artwork for a sharper 3D preview". Show that hint in the admin quick-list success panel (`QuickListProductWizard.tsx`) and in the advanced editor.
- In the studio, let the admin replace the texture for each face (front, back, sides, top) later.

### C. Correct texture fit and materials
- Replace `imageFit: "stretch"` with an aspect-preserving **cover** fit centred on the face (crop the overflow, no distortion). Add a `contain` option for artwork that must not be cropped. Use the existing `imageFit` field and add `"cover"` to its type if it is missing.
- Faces without artwork: use the theme base colour. Derive it from the product's material option (white SBS board, kraft, black) when that exists. Otherwise sample the dominant edge colour of the front artwork with `sharp().stats()`, so the sides match the front.
- Give carton board slight roughness (≈0.55) and no clearcoat unless lamination = gloss. Keep kraft matte.

### D. Product-specific dimensions
- Resolution order: the product's own dimensions (selected or first variant `dimensions`, or product attributes width/height/depth in mm) → a category default → a model default.
- Add category defaults (mm, W×H×D):
  - soap-boxes 90×60×30
  - perfume-cosmetic-boxes 60×150×60
  - snack-confectionery-boxes 160×60×100
  - specialty-boxes 120×120×60
  - gift-event-boxes 200×200×100
  - shipping-boxes 300×200×150
  - d-cut-paper-bags 250×350×80
  - branded-carry-bags 300×400×100
  - branded-ziplock-pouches 150×220×60
  - food-pouches 160×240×90
  - mailer-bags 250×330×2
- Remove the hard-coded `BOX_DIMENSIONS` so `product-3d-dimensions.ts` defaults are not overridden by a single 150×100×50.
- When the product's dimensions change later (admin edits a variant), the 3D preview must use the new size without regenerating the template.

### E. Right model per category
- `mailer-bags` → a new flat `mailer-envelope` model: a thin rounded slab with a peel-and-seal flap strip at the top. Or, if you can't add a model, mark it `threeDPath: "none"` rather than showing a paper bag.
- `gift-event-boxes` → a lid-and-base model (a base plus a slightly larger, shallower lid with a visible lid lip). Add it as `rigid-lid-box` or extend `square-box`.
- `shipping-boxes` → `rectangular-box` with a corrugated-kraft theme and a top tape seam. Keep `mailer-box` only for products whose name or slug matches `mailer|e-commerce|tuck`.
- Keep `resolveVisualizationProductModel` and `assertProductPreviewAllowed` consistent for any new model (see the comment at the top of `visualization-shape-presets.ts`).

### F. Geometry polish
- Folding carton: replace the floating slab with a proper tuck-end top. It should be a thin lid panel hinged at the back edge, flush with the body, plus a small tuck flap. Use the plain material colour, not the photo. Add a subtle glue-flap seam on one side edge.
- Remove the dark crease band across the front face. If you want creases, use a very thin, low-contrast line only on the top edges.
- Slightly bevel the box edges (e.g. `RoundedBoxGeometry` from `three/examples/jsm/geometries/RoundedBoxGeometry.js`, radius ≈ 0.6% of the longest side) so edges catch light like real board. Keep the per-face material groups working.
- Mailer box lid: the front lip band gets the plain material. The top of the lid may carry `top` artwork only if it was provided.
- Camera: fit the bounding box to the viewport for every model (compute the bounding sphere, set the distance from the FOV, centre the target). The default view should be a 3/4 iso angle (front + right side + a bit of top), with a soft contact shadow under the box.

## Tests (must pass: `npm test`, `npx tsc --noEmit`, `npm run lint`)
- `visualization-shape-presets.test.ts`:
  - every model produces the full face list
  - only `front` has a texture by default
  - the category dimension defaults are used
  - product dimensions override the defaults
- `product-3d-surfaces` tests: for packaging, `top`, `left`, `right`, `back` and `bottom` resolve to "no texture" when only `front` exists. Built-in models keep the old behaviour.
- Texture fit test: a 4:3 image on a 1:2 face with `cover` keeps the aspect ratio (no stretch).
- `cropFrontArtwork`: a fixture with a plain background is trimmed to the subject, and a lifestyle fixture returns low confidence.
- Update `category-listing-playbook.test.ts` for the model changes in E.

## Manual verification (headless or real browser)
Run the dev server on a free port (port 3000 is another project). For one product each in soap-boxes, perfume-cosmetic-boxes, gift-event-boxes, shipping-boxes, d-cut-paper-bags and food-pouches:

1. In the admin → Quick list, create the product with a photo.
2. Click **Create 3D preview**.
3. Open the storefront product page and capture Front, 3D View, Left and Top screenshots.

Expected results:
- The front shows the artwork without distortion.
- The sides and top are a plain matching material (no repeated photo).
- The proportions match the category or product size.
- There is no black line on the front, and the whole box is in frame.

Save the screenshots to `docs/research/3d-fix-*.png`.

## Do not
- Do not write `allow3D`, `productModel` or `previewTemplate` from the quick-3d route directly. Publishing the template must stay the only writer.
- Do not change built-in (non-template) 3D models for labels and school items, apart from the shared camera-fit improvement.
- Do not add new runtime dependencies beyond what is already installed (`three`, `sharp`).
