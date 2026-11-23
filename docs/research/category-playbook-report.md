# Category Listing Playbook — implementation report

Implements `docs/CODEX_PROMPT_CATEGORY_LISTING_PLAYBOOK.md`. Date: 2026-11-22.
Builds on the simple-listing flow (`docs/research/listing-flow-report.md`) without
regressing its ≤5-decisions / ≤3-screens / zero-jargon bar.

## (a) Recipes as shipped — `src/lib/category-listing-playbook.ts`

28 shelves. Starter/preset, GST and bands are the live catalogue's own numbers
(`docs/research/category-listing-study.json`), not invented defaults.

| Shelf | Starter / preset | GST | Band ₹ | MRP | 3D |
|---|---|---|---|---|---|
| customized-name-slips | name-slips | 18 | 219–499 | yes | builtin · label-pack |
| waterproof-stickers | name-slips | 18 | 290–399 | yes | builtin · waterproof-sheet |
| school-labels | name-slips | 18 | 400–700 | no | builtin · label-pack |
| personalized-notebooks | notebook | 18 | 449–499 | yes | builtin · notebook |
| personalized-pencils-pens | pen-pencil | 18 | 235–869 | yes | builtin · pencil-set |
| name-plates-keychains | name-plate | 18 | 379–1598 | yes | builtin · keychain-duo |
| bottle-tiffin-labels | bottle-tiffin | 5 | 329–1025 | no | builtin · bottle-label |
| school-accessories | **school-kit** (new) | 18 | 230–899 | yes | builtin · school-kit |
| personalized-gifts | **gift-slip** (new) | 18 | 169–2399 | yes | builtin · gift-ribbon |
| bulk-orders | name-slips | 18 | 1799–185000 | no | builtin · bulk-grid |
| paper-bags (retail) | bag-luggage-tag | 18 | 1200–1600 | yes | builtin · paper-bag |
| soap-boxes | soap-box | 0 | quote | no | template · folding-carton |
| perfume-cosmetic-boxes | generic-packaging | 0 | quote | no | template · folding-carton |
| specialty-boxes | generic-packaging | 0 | quote | no | template · folding-carton |
| gift-event-boxes | generic-packaging | 0 | quote | no | template · folding-carton |
| mailer-bags | courier-bag | 0 | quote | no | template · paper-bag |
| shipping-boxes | generic-packaging | 0 | quote | no | template · mailer-box |
| branded-carry-bags, d-cut-paper-bags | paper-bag | 0 | quote | no | template · paper-bag |
| branded-ziplock-pouches, food-pouches | ziplock-pouch | 0 | quote | no | template · stand-up-pouch |
| snack-confectionery-boxes | generic-packaging | 0 | quote | no | template · folding-carton |
| food-trays-delivery | generic-packaging | 0 | quote | no | **none** |
| stickers | flat-print | 0 | quote | no | builtin · waterproof-sheet |
| business-cards | business-card | 0 | quote | no | **none** |
| flyers-brochures | brochure | 0 | quote | no | **none** |
| thank-you-hang-tags | flat-print | 0 | quote | no | **none** |

GST note: notebooks and pencils carry 0 bp on the imported rows because the source
omitted `tax_class`. The recipe follows the curated-sibling majority (18%) and says so
in its admin-facing note; the wizard keeps GST editable.

New starters (§2.1), field labels taken from the live rows, keys and copy ours:
`school-kit` (5 text fields + font), `gift-slip` (name + font),
`shagun-envelope` (name, wishes, address + font), `photo-gift` (optional name +
customer image upload — the native answer to the 168 imported photo-slot products).

## (b) Admin listing vs imported listing

| Column | Admin listing before | Admin listing now | Imported row |
|---|---|---|---|
| MRP strikethrough | never | from the shelf's habit (`mrpExpected`) | 361 rows have it |
| GST | always 0 | shelf GST → `taxRateBasisPoints` + `IN-GST-<pct>` | 342 rows taxed |
| Tags | always `[]` | 3–6 derived from name + shelf | 360 rows tagged |
| SEO title/snippet | always null | derived from name + shelf | 360 rows |
| Stock | always MADE_TO_ORDER | `stockOnHand` → CONTINUE + Inventory | importer G3 parity |
| 3D | none | built-in model on 10 shelves, one-click template on packaging | 34 EzPac rows |

API (§4) is additive and absence-safe: every new field is applied only when the caller
sends it, so the advanced drawer and older clients cannot blank an imported row's MRP,
GST, tags or snippet. `compareAtPrice` must be ≥ price or it is rejected.

## (c) Category hygiene (§6)

- Deactivated the empty test shelves `bhautesh`, `bhautesh > bhautesh1`, `notestick`
  (checked for products/links first — all 0).
- The importer now resolves 13 Ranbazaar source buckets onto curated shelves
  (`src/lib/imported-category-mapping.ts`), before its fallback: premium-name-slips →
  customized-name-slips; exam-board, geometry-box, tracing-name-board, kids-utilities →
  school-accessories; gift-slip-for-gifts, cake-topper, decorative-items,
  shagun-envelopes, mouse-pad → personalized-gifts; kids-bottle-tiffin-box,
  customize-bottles → bottle-tiffin-labels; bulk-buy → bulk-orders.
- Left pending on purpose, recorded in the import plan: `t-shirts` (no garments shelf
  yet), `wrapping-paper` and `vinyl-poster` (need a "Wrapping & posters" nav decision).
- EzPac: 4 of the 12 unmapped handles now carry a preset — wedding-stickers → stickers,
  wedding-tissue-paper-box → tissue-paper-box, ziplock-pouch ("Wedding Snacks packet")
  → brand-ziplock-pouch, luggage-tags → hang-tags. The other 8 stay unmapped because
  the export's handle and title disagree or the shape is genuinely ambiguous
  (`thank-you-card-folded-copy` is titled "Wedding Internary Card", `display-tray`,
  `money-cover-envelope`, `wedding-bags`, `wedding-gift-hamper-box-copy`,
  `wedding-ladoo-box`, `wedding-planning-dressup-functions`,
  `cake-box-with-handle-box-with-handle`).

**Migration complete.** All 13 mapped Ranbazaar buckets are now empty:
`personalized-gifts` 0 → 69, `customized-name-slips` 105 → 118,
`school-accessories` 11 → 36, `bulk-orders` 1 → 3, `bottle-tiffin-labels` +1.
A re-scan of every product still sitting in an import bucket finds 21, and every one
of them is a deliberate hold, not a missed move:

| Still in a bucket | Count | Why |
|---|---|---|
| wrapping-paper, vinyl-poster | 9 | waiting on a "Wrapping & posters" nav decision |
| t-shirts | 4 | no garments shelf exists yet |
| imported-ezpac (box, unclassified, paper-bags×2) | 8 | the 8 EzPac handles whose export title and handle disagree, or whose shape is ambiguous |

The importer run that applied the moves was stopped by the machine's low-memory guard
at 301/425 products — after the category work had already landed. Each product writes
in its own transaction, so the catalogue stayed consistent throughout, and a later full
run converges with no further moves (verified by re-scanning the buckets: 0 pending).

## (d) 3D outcomes

- **Built-in lane:** 10 shelves now ship `allow3D` + a model with no template needed;
  the wizard shows one plain-language toggle, default on, and the payload always pairs
  `allow3D` with a `productModel` (unit-tested, because the admin API rejects one
  without the other).
- **Template lane:** new one-click endpoint
  `POST /api/admin/visualization-studio/quick-3d` runs the proven MANUAL pipeline
  (start → process → confirm → save → publish) from the product's own stored photo and
  lets *publishing* write `allow3D`/`productModel`/`previewTemplate`, so the admin
  catalog's 3D invariant is never bypassed. Large heroes are downscaled to ≤1600 px webp
  first — the same rule `3d-enable.ts` needed after two products timed out on a 6 MB PNG.
- **Refused by design:** business cards, flyers/brochures, hang tags and open food trays
  get no 3D in either lane.

## (e) Gates

| Gate | Result |
|---|---|
| `npm run typecheck` | ✅ clean |
| `npm run typecheck:scripts` | ✅ clean |
| `npm run build` | ✅ exit 0 (Next.js again stopped once on its own security-upgrade interstitial; the retry it asks for succeeded — the upgrade is still recommended) |
| `npm run test:domain` | ✅ 281/281 (19 new: playbook 7, listing-wizard +5, shape presets 5, import mapping 3, starters updated) |
| `npm run test:external-catalog` | ✅ 8/8 |
| §6 category moves | ✅ applied; a bucket re-scan finds nothing left to move |
| §8 browser walkthrough | ✅ 23/23 checks |

Walkthrough coverage: 27 shelves offered with no import buckets or test shelves;
picking "Customized Name Slips" applies the starter, GST chip, MRP input and price
band; the published listing shows its MRP strikethrough, 2D studio fields, built-in 3D
and turns up in search; business cards offer no 3D in either lane; "Soap Boxes" applies
14 packaging spec fields, names the unconfigured print options, and the one-click
button published a `folding-carton` template that the product page then renders.

Database spot-check of the two published test listings before cleanup:

```
Test Slip Z1   shelf=customized-name-slips  price=249 mrp=349 gst=1800bp IN-GST-18
               tags=[Customized Name Slips, test, slip, customized, name, slips]
               seoTitle="Test Slip Z1 · Customized Name Slips"
               links=[customized-name-slips, collection-personal]
               fields=[Name, Font]   3D: allow3D=true model=label-pack templates=0
Test Soap Box  shelf=soap-boxes  price=10 mrp=- gst=0bp
               links=[soap-boxes, collection-soap-packaging, collection-product-packaging]
               fields(14)=[Length, Width, Height, Dimension unit, Material, GSM…]
               3D: allow3D=true model=folding-carton preview=visualization:<id> templates=1
```

Test products were deleted afterwards; the catalogue is back to 435 ACTIVE with 34
published 3D templates.

## (f) Screenshots

`docs/research/playbook-step1.png` (shelf grid), `playbook-step2.png` (shelf defaults
applied), `playbook-step3.png` (review with the 3D toggle), `playbook-3d-success.png`
(one-click 3D), `playbook-storefront-slip.png`, `playbook-storefront-box.png`.

## (g) Open decisions for the shop owner

1. **Wrapping paper / vinyl posters** — 9 products are parked in import buckets until
   there is a "Wrapping & posters" shelf in the storefront nav.
2. **T-shirts** — 4 products need a garments shelf before they can move.
3. **GST on notebooks and pencils** — set to 18% by sibling majority; confirm with the
   print partner.
4. **Packaging option sets** — material, lamination and GSM choices stay empty until a
   super admin fills them; the wizard now names them instead of hiding them.
