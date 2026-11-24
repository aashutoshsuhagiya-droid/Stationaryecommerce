# Easy listing: end-to-end report (2026-11-23)

Spec: [codex-prompt-easy-admin-listing.md](codex-prompt-easy-admin-listing.md).
Run against a production build (`next build` + `next start -p 3010`), headless Chrome, as a first-time admin on the default path (no "More options").
Script: [scripts/e2e-easy-listing.cjs](../../scripts/e2e-easy-listing.cjs). The test products were deleted afterwards.

## Results

| Product | Viewport | Category picked | Clicks | To "is live" | To live page | 2D customiser on the live page | 3D on the live page |
|---|---|---|---|---|---|---|---|
| Name slips | desktop 1366 px | auto (busiest shelf) | 8 | 67.5 s | 95.6 s | yes, name on photo | built-in label model with the name |
| Pen | desktop | auto, from file name | 8 | 60.7 s | 92.1 s | yes | built-in pencil model with the name |
| Soap box | desktop | auto, from file name | 8 | 81.6 s | 109.1 s | yes (artwork editor) | photo-made carton, 90 × 60 × 30 mm, photo on the front |
| Paper bag | desktop | typed "paper bag" | 10 | 79.6 s | 106.5 s | yes, name on photo | photo-made bag, 180 × 240 × 80 mm, photo on the front |
| Name slips | mobile 390 px | auto | 8 | 35.1 s | 109.1 s | yes | yes |
| Pen | mobile | auto | 8 | 30.8 s | 47.5 s | yes | yes |
| Soap box | mobile | auto | 8 | 47.0 s | 62.1 s | yes | yes |
| Paper bag | mobile | typed "paper bag" | 10 | 46.1 s | 118.8 s | yes | yes |

All 8 meet both targets: under 2 minutes from "Add product" to the live page, and under 12 clicks. No page errors were logged.

How clicks were counted: Add product (1) + Choose photos and pick the file (2) + Continue (1) + [search box (1) + pick a card (1)] + Continue (1) + price field (1) + Publish (1) + View on store (1). Typing is not counted. The desktop runs also open the 3D and 2D preview tabs for screenshots; those clicks are not counted, but their ~8 s is included in the times.

### Where the time goes

The database is in AWS us-east-2 and this machine is in India, so each query costs about 250 ms. The Publish request reports `Server-Timing`:

| Step | Time |
|---|---|
| Find the listing | ~2.0 s |
| Save details and photos | ~4.8 s |
| Default 2D design | ~3.2 s |
| 3D from the photo (soap box, paper bag only) | 12–22 s |
| Publish | ~0.2 s |

The published → live-page gap (15–75 s) is the storefront product page rendering. It is `force-dynamic` against the same remote database; this change did not touch it. Hosted next to the database, both numbers should drop a lot.

Desktop runs spend about 20 s more between steps 2 and 3 than mobile. Headless Chrome renders the open 3D preview in software (SwiftShader); on mobile the preview sheet starts collapsed.

## Screenshots

`easy-listing-<viewport>-<product>-<n>-<step>.png`:

- `0-empty`, `1-photo`, `2-what`, `3-price`: the three wizard steps.
- `3b-preview-3d`, `3c-preview-2d`: the live 3D and 2D previews before saving (desktop only).
- `4-success`: the success screen.
- `5-live`, `6-live-2d`, `7-live-3d`: the live product page, with "Aarav" typed into the 2D customiser and the 3D view.

`easy-listing-advanced-editor-save.png`: the advanced editor saving a wizard-made product (PATCH 200). The 3D link was still intact afterwards.

## Deviations from the spec, and open items

1. **Name slips are not "2D only".** The playbook gives them built-in 3D (`label-pack`) and the live page shows it. Switch the recipe to `threeDPath: "none"` if 2D only is wanted.
2. **The retail "Paper bags" shelf moved from built-in 3D to photo-made 3D.** The built-in bag model never showed the personalisation, so the live 3D was a blank bag. The bag still gets its 2D name design.
3. **Built-in 3D (name slips, pen) shows the customer's name on a generic model, not the photo.** That is how the storefront renders built-in models. The wizard preview now shows the same thing, so the admin sees what customers see.
4. **Photo upload timing.** Photos upload in step 1, with a progress bar and Retry per photo. To have somewhere to store them, a hidden draft product is created on the first photo, under the best category guess. Publish then applies the category actually chosen, and a first publish rewrites the URL from the real name. "Start over" deletes such a draft only if it was never published. A listing abandoned without "Start over" stays in the products list as a draft.
5. **HEIC photos.** Safari/iPhone convert them in the browser. The server tries `sharp`, but this sharp build has no HEVC decoder, so a HEIC that the browser can't open gets a plain-words error ("share it as a JPG").
6. **"Adjust text position".** Before saving: Top / Middle / Bottom buttons in the 2D tab. After publishing: the full design editor opens from the success screen (it needs a saved product).
7. **Linting.** There is no ESLint in the repo and no `npm run lint` script. `npm test` (now an alias of `test:domain`, 370 tests) and `npx tsc --noEmit` pass.
8. **Not covered end to end:** Duplicate, "Continue where you left off?", Save as draft, and "Try another photo". They have unit tests (draft serialisation, publish retry and discard) but were not clicked through in a browser.
