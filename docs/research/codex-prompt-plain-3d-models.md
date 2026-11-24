# Task: make every 3D preview a plain model, with no product photo on it

## What the shop owner wants

Kado (a Next.js storefront for personalised products and custom packaging) shows an interactive 3D model on product pages. On packaging products the product's own photo is currently painted onto the model. The owner wants that gone everywhere:

**Every 3D view shows a plain, blank model: the right shape, at the right size, in its material colour. The only things ever drawn on it are what the customer adds themselves (their name, text, logo or uploaded artwork).**

The reason: the photo is a picture of a whole product, usually shot at an angle with a background, a pattern or a watermark. Cropped onto one face of a 3D shape it looks like a badly placed sticker, and it hides the one thing the 3D view is for, which is letting the customer see their own design on the product. A clean blank mockup, like packaging sites use, is what is wanted.

The owner's reference screenshot is a paper bag whose faces all carry a diamond-pattern photo. That is the look to remove.

## What "plain" means, precisely

Judge your work against these, on every model:

1. No pixel of a product photo, template source image or sampled-from-photo colour appears on any face: front, back, sides, gussets, top, bottom, lid, or the inside.
2. A face the customer has put nothing on looks identical to every other blank face of that model: same material, same colour, no filled rectangle, no border, no outline.
3. A face the customer has put something on shows only that content, sitting directly on the material colour. Text must not be squashed or stretched, and it must land on the same face it lands on today.
4. Shape, proportions, size presets, rotate, zoom, auto-spin, the view buttons and the "back repeats the front" option all behave as before.
5. The 2D studio is unchanged. It still shows the product photo behind the customer's design.

## How the photo gets onto the model today

I traced this before writing the task. Treat it as a starting map and confirm it yourself; it may not be the complete list.

**Storefront product page**

- `src/lib/runtime-catalog.ts` (around line 241) gives each surface of a published visualization template a `textureUrl`.
- `src/components/configurator/visualization-preview.ts`, `buildVisualization3DPreview` (lines 214 to 255), builds the document the 3D view renders. For every textured surface it puts an image layer with id `visualization-base-<templateId>-<surfaceId>` at the bottom of that face, fitted with `cover`. This layer is the photo.
- `src/components/commerce/CustomizationStudio.tsx` (lines 656 to 664, and 1368 to 1381) passes that document to `Product3DPreview`, together with `packagingBaseColor={configuration.preview.visualization?.baseColor}`. That colour was sampled from the edge of the photo.
- `src/components/configurator/Product3DPreview.tsx` renders each surface to a canvas with `renderSurfaceToCanvas`, and `src/components/configurator/product-3d-model.ts` (`printedMaterial`, `boardMaterial`) uses the canvas as the face's texture, or plain board when a face has no surface.

**Admin "Add product" wizard, 3D tab**

- `src/components/admin/listing/listing-3d.ts` builds an unsaved template whose front surface has `textureUrl: photo.url`, then calls the same `buildVisualization3DPreview`.
- `src/components/admin/listing/Listing3DPreview.tsx` line 58 tells the admin "Add a photo to see it on the front."

**Admin Visualization Studio, "Visual preview only" panel**

- `src/components/admin/ProductVisualizationStudio.tsx` (lines 363 to 403) builds a document with one `studio-source-…` image layer per mapped face.

**Built-in models** (name slips, stickers, pens, bottle labels, notebooks, keychains, school kits)

- As far as I could tell these never paint the product photo; they show the customer's name on a generic model. Confirm this and leave them alone if so.

**One thing my trace does not explain.** In the owner's screenshot the pattern is on the bag's side gusset and inside as well as the front. Every published template in the database maps only a `front` surface, and `src/components/configurator/product-3d-surfaces.ts` says packaging side faces never borrow the front. So either there is a second route by which an image reaches a face (for example image layers already inside the customer artwork document, or one material being applied to all six sides of a thin panel in `buildPaperBag`), or the screenshot predates that rule. Start with `/products/d-cut-paper-bag` and `/products/custom-branded-laminated-carry-bag`, look at every face, and find out.

## The trap in the obvious fix

Deleting the `visualization-base-…` layer is necessary but not enough, and returning early from `buildVisualization3DPreview` would break things.

- `renderSurfaceToCanvas` (`src/components/configurator/artwork-canvas-renderer.ts`, line 199) always fills the canvas with the `background` colour and strokes a 4 px `accent` border before drawing layers. On the storefront those are the design template's preview colours (defaults `#F1F1F3` and `#3A3D42`). With the photo layer gone, the front of a kraft bag would become a pale grey rectangle with a dark outline, which fails points 2 and 3 above. Packaging faces need to end up as plain board when empty, and as customer content on the board colour when not. Built-in label and school models are a different case: their printed face is a label or sheet, and their current look should not change.
- The rest of `buildVisualization3DPreview` is still needed. It decides which customer surface goes on which face, reshapes the canvas to that face's proportions (`fitDefinitionToFace`) and moves the layers with it (`relayout`). That is what keeps a customer's name un-squashed on a tall carton front. Keep that behaviour; remove only the photo.

How you get there is your call. A lit board material and a canvas filled with the same hex can come out as visibly different shades, so compare the front face against a side face in a screenshot instead of assuming they match.

## Decisions already made

- **Render-time change only.** Do not edit or delete templates, assets, `surfaceMappings` or product metadata in the database. One code change then covers all existing products and every future one, and it stays reversible.
- **`textureUrl` stays in the catalog output.** The 2D studio uses it as the picture behind the design (`templateBaseImages`, `CustomizationStudio.tsx` lines 608 to 639).
- **The 3D-creation pipeline stays as it is.** `src/lib/quick-3d-service.ts`, the listing publish flow and the Visualization Studio still need a photo, because a template without a source asset is not treated as a visualization at all (`runtime-catalog.ts` line 182). Creating a template is still what turns 3D on for a packaging product, and publishing a template is still the only thing that writes `allow3D`, `productModel` and `previewTemplate`.
- **Board colour no longer comes from the photo.** Use the named stock in the product's material when there is one (`packagingBoardColor` in `product-3d-profile.ts`: kraft, black, white board), otherwise the model's own default colour. Stop feeding the photo-sampled `baseColor` into the 3D view. The sampling picks up photo backgrounds; `d-cut-paper-bag` currently renders pale green-grey (`#dde5c8`) because of it.
- **All three 3D views go plain**, including the two admin ones, so the admin sees what customers see. In the wizard, the 3D tab should show the plain shape at the chosen size, with the "Try a name" sample on the front only for product types that have a text field. In the Visualization Studio the source photo is already shown in the upload box above the preview; update the panel's caption so it no longer promises "source panels".
- **Out of scope:** the 2D studio, product cards, gallery photos, order snapshots (`src/lib/order-visualization-snapshot.ts`), and the import scripts.

## Words on screen

Fix any text that still promises the photo on the model, and keep the same plain shop-owner wording as the rest of the wizard (`src/lib/listing-copy.test.ts` rejects jargon and internal ids). The ones I found:

- `Listing3DPreview.tsx` line 58: "Add a photo to see it on the front."
- `src/lib/listing-wizard.ts` line 935: "Busy background — a plain background gives a better 3D preview". The photo still matters for the product card and the 2D studio, so keep the advice and drop the 3D claim.
- The doc comments at the top of `listing-3d.ts` and `visualization-preview.ts`, which describe the photo on the front.

"3D preview couldn't be made from this photo" and "Try another photo" are still true, since the pipeline still needs the photo. Leave them.

## Tests

- `src/components/configurator/visualization-preview.test.ts` has tests that pin the photo layer (lines 9, 29 and 160). Rewrite them to pin the new behaviour: no photo layer on any face, while face assignment and canvas reshaping still hold.
- `src/components/configurator/product-3d-packaging.test.ts` line 110 pins "named stock colour first, then the artwork's edge colour". Update it for the colour decision above.
- Add a test that, for each packaging model, a template with textured surfaces plus an empty customer document produces zero image layers, and that with one customer text layer on the first surface that layer is the only thing on the front.
- `npm test` (370 tests today), `npx tsc --noEmit` and `npm run build` must all pass.

## Check the real products, one by one

Unit tests cannot see a 3D model, so finish in a browser. These are all 36 live products that show a photo on their 3D model today, grouped by shelf and model. Check at least the named product in every row, on desktop and at 390 px wide.

| Shelf | 3D model | Products | Open `/products/…` |
|---|---|---|---|
| specialty-boxes | folding-carton | 11 | `zipper-box`, `hanging-box` |
| snack-confectionery-boxes | folding-carton | 7 | `brownie-box`, `cereal-box` |
| gift-event-boxes | rigid-lid-box | 4 | `gift-box`, `flower-box` |
| perfume-cosmetic-boxes | folding-carton | 3 | `perfume-box` |
| branded-ziplock-pouches | stand-up-pouch | 2 | `brand-ziplock-pouch` |
| mailer-bags | mailer-envelope | 2 | `d2c-mailer-bag` (has a sampled colour) |
| food-trays-delivery | folding-carton | 2 | `food-delivery-box` |
| branded-carry-bags | paper-bag | 1 | `custom-branded-laminated-carry-bag` |
| d-cut-paper-bags | paper-bag | 1 | `d-cut-paper-bag` (has a sampled colour) |
| soap-boxes | folding-carton | 1 | `soap-box` |
| specialty-boxes | square-box | 1 | `square-box` |
| specialty-boxes | mailer-box | 1 | `window-box` |

For each one:

1. Open the product, switch to "3D View", and look at the front, back, left, right and top views (the viewer has buttons for these). Every face is plain. Take a screenshot of the angled view and one that shows a side and the inside.
2. Switch to "2D Studio". The photo is still there. Add a name or some text, switch back to 3D, and confirm the text is on the front, the right way up, not stretched, with no box or border around it.
3. Change the size preset where there is one. The model reshapes and stays plain.

Then confirm nothing else moved:

- Built-in models look the same as before. One product from each shelf is enough: `unique-customized-premium-shapes-butterfly-name-slips-for-kids-school-notebooks-pack-of-24pcs`, `ranbazaar-laser-personalized-name-pencils-box-set-of-20-pcs-2-eraser-sharpener-free`, `ranbazaar-stainless-steel-kid-bottle-keep-hot-cool-350ml`, `personalized-birthday-special-waterproof-name-stickers-pack-of-88pcs`, `bring-ideas-to-life-custom-notebooks-perfect-for-kids-pack-of-5`, `safari-jungle-theme-name-sign-acrylic-name-plate`, `school-starter-label-set-90-pack`.
- Admin, Products, "Add product": add a photo, pick a soap box, then a paper bag. The 3D tab is plain in both, and the size buttons still reshape it.
- Admin Visualization Studio for one packaging product: the preview is plain and the caption is right.

## Working in this repo

- Read `AGENTS.md` first. This Next.js version (16.4.6) differs from what you may expect; read the guide in `node_modules/next/dist/docs/` before touching any route. This task should not need route changes.
- Port 3000 belongs to a different project. Verify against a production build: `npm run build`, then `npx next start -p 3010`.
- The database is remote and slow from here (about 250 ms per query). A product page can take 15 to 75 s on first load, so use generous timeouts.
- The admin login password is `SEED_ADMIN_PASSWORD` in `.env.local`. Read it from the environment; never print or log it.
- `scripts/e2e-easy-listing.cjs` is a working Puppeteer script against this app. Reuse its login and helper code. Headless Chrome draws WebGL in software, so give the 3D view a few seconds before a screenshot.
- If the build fails with EPERM on `.next`, OneDrive is holding a lock: delete `.next` and build again.
- The working tree has a large amount of uncommitted work (the new "Add product" wizard, including everything under `src/components/admin/listing/`), and another agent may be editing at the same time. Do not revert or tidy changes you did not make.
- No new dependencies. Do not run a Next.js upgrade. Do not commit; the owner commits when asked.
- If you create test products or designs while verifying, delete them afterwards.

## What to hand back

Write `docs/research/plain-3d-report.md` and save screenshots beside it as `docs/research/plain-3d-<viewport>-<product>-<view>.png`. The report should say:

- Every place a photo was reaching a 3D model, including the answer to the side-and-inside question above, and what you changed for each.
- A table with one row per product checked: plain on all faces (yes or no), customer text on the front (yes or no), 2D studio still shows the photo (yes or no).
- Test, type-check and build results.
- Anything you could not verify in a browser, stated as such, and anything you decided differently from this brief and why.
