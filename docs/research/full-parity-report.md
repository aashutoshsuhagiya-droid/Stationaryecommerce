# Full catalog parity: EzPac packaging + Ranbazaar personalised (2026-11-23)

Brief: "CODEX MASTER TASK: Full Catalog Same-to-Same Source Parity". Nothing committed.

## Source truth first

The brief's EzPac option lists were examples. ezpac.in renders its selectors from Pacdora CPQ
(`cpq.pacdora.com/api/open/product` + `/quotation`), so the real options and prices were captured
from the live site for all 64 EzPac products (`scripts/import-external-catalog/ezpac-quotation.ts`,
raw capture `docs/research/ezpac/pacdora-quotations.json`, per-product report
`docs/research/ezpac/pacdora-quotation-report.json`).

What ezpac.in actually offers (differs from the brief):

| Group | Source options |
|---|---|
| Material | "White card board 220- 300 gsm" on every product (flyer/planner: "100 GSM Paper"). No kraft, duplex or rigid board anywhere. |
| Finishing | Matte / Gloss / Velvett Lamination (+ "No Lamination" on cards, tags, stickers, window and tissue boxes) |
| Printing sides | Outside / Outside & Inside (cards and brochures: "Print Side"; carry bags and flyer: One Side / Both Side) |
| Special Effects | No Effect / Gold Foil Stamping / UV Effect (brochures have no UV). No Silver Foil, no Embossing. |
| Quantity | 10, 25, 50, 75, 100, 200, 300, 500, 750 (+ custom 10–1000). Above 1000 the source quotes in bulk. |
| Size | inches, 4 decimals ("3.9606 x 7.8583 in"); custom size in mm / inch / cm, max 2000 mm per side |

## Pricing model (reproduced exactly)

`unit = round((base + Σ option deltas) × tier multiplier × size factor)`. Tier multipliers are exact
fractions (1, 5/6, 2/3, 7/12, 1/2, 7/15, 13/30, 5/12, 11/30, 1/3); a custom quantity uses the highest
tier at or below it. Base and deltas are fractional paise taken from the source's unrounded
`real_total_price` at the highest quantity (rounded 10-pc prices are not precise enough).

- Verification: 6,039 source prices (every option at every tier, 61 products): 6,037 exact, 2 off by
  1 paisa (the source's own double rounding).
- Unit tests pin all 45 paan-box prices to the paisa (`src/lib/packaging-quote.test.ts`).
- Browser, production build: paan-box Gold Foil × 25 = server-verified ₹430.32 (source ₹430.32);
  brownie-box ₹259.17, d-cut-paper-bag ₹440.66 at 10 pcs.
- **Custom sizes are an estimate**: the source derives sheet area from its own dieline plus press
  imposition, which is not public. We scale by our dieline's sheet area (`src/lib/packaging-dieline.ts`).
  Exact at the listed size; pyramid within about 7% RMS of the source's measured size ratios (1.5%
  when both sides double).

## What was built

- `packaging-quote.ts`: spec type, pricing, size validation (10 mm safety floor, source max), defensive reader.
- Server: `priceProductItem` prices `item.packaging` from the spec (catalog tiers never stack on it);
  order items store the priced spec (size, tier, every selection incl. hidden production groups).
- Product page (`PackagingSpecPanel.tsx`): the source's red instruction word for word, a Size select with
  "Custom Size" → dialog (mm / inch / cm pills, L/W/H, Discard / Apply, errors inline, bottom sheet on
  phones), every visible source group as a select, quantity ladder with live per-piece prices, bulk
  table, "Click for Design in 3D & Buy Now", "Bulk Order (1000+ Qty)".
- Preview: hollow hinged cartons / mailer / rigid lid / envelope with the Open–Close slider; new
  pyramid model (paan-box template republished as `pyramid-box`); "As seen on Shark Tank India" badge
  (EzPac-imported products only); magnifier → full-screen inspect; `3D | Dieline` pill; dieline view
  with cut / fold / glue lines and L/W/H in the chosen unit. 3D scales to the applied custom size.
- Cart / checkout: spec lines shown; quantity locked on priced lines (it changes the tier); packaging
  lines never merge.
- Ranbazaar: "Buy 2+ for ₹175 each" offers from the source price map (luggage tag: ₹230 → ₹175 each at 2,
  server-verified). The 2D studio (fonts, colours, surfaces, photo slots) was already at parity (2026-11-22).
- **Bug fix**: the 24 Ranbazaar variants with tracked stock (`CONTINUE`) could not be ordered at all
  (checkout demanded a reservation flow). They now order normally and record a stock reservation; when
  stock runs out they show "Made to order", never "out of stock". Verified with a real API order (then deleted).
- Single "Default Title" variants (Shopify placeholder) no longer render as a choice card.
- 2D studio shows the whole product photo, uncropped (2026-11-24). It used to show the 3D template's
  front-face crop, a cut-off strip of the photo. The 3D model stays plain: no photo on any face.

## Gaps and decisions for the owner

1. 3 EzPac products are sold only in fixed size lists and were not given a spec (`brand-ziplock-pouch`,
   `wedding-snacks-packet`: 6 sizes; `d2c-mailer-bag`: 2 sizes). They still use the imported catalog
   price (₹0 / ₹10). Supporting them needs preset sizes, each with its own price ladder.
2. Product cards and listings still show the imported Shopify list price (₹10 or ₹0) for EzPac items, as
   ezpac.in's Shopify data does; the real price appears on the product page. Consider "from ₹x/pc".
3. 28 EzPac products have no 3D model (pillow, tray, popcorn, flat print…). They get the spec panel,
   live pricing and the dieline view, but no 3D.
4. The Shark Tank badge is EzPac's claim; it shows only on EzPac-imported products.
5. Saved designs do not store the packaging choice yet (the saved-design schema is strict).

## Re-running

- Capture / apply source data: `npm run import:external-catalog:ezpac-quotation [-- --apply [--dry-run]] [-- --only=<slug>]`
- Browser check: `npm run build && npx next start -p 3010`, then `node scripts/verify-parity.cjs`
  (results in `docs/research/parity-browser-results.txt`, screenshots `docs/research/parity-*.png`).
- Gates at hand-off: typecheck 0 errors, `test:domain` 409/409, `test:external-catalog` 29/29, build OK.
