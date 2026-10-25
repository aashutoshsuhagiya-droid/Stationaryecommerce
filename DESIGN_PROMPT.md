# Naamly Storefront — Premium Grey & White Redesign Brief

Act as a top-tier product designer + senior frontend engineer. This is a UI/UX visual redesign
task. The feature logic, data models, API routes, and product behavior are FROZEN — do not
change them.

## Non-negotiable rules

1. **No behavioral or structural changes.** Do not rename routes, move files between app/ and
   components/ (CSS modules may be touched in place), add/remove pages, or alter data
   fetching. This is pure presentation-layer work: CSS variables, class values, small
   layout-class tweaks. JSX class names may stay as-is; if a truly new visual element is
   required, add classes rather than restructure components.
2. **This repo uses a NON-STANDARD version of Next.js with breaking changes.** Before writing
   any code, read the relevant guide in `node_modules/next/dist/docs/` and heed deprecation
   notices. Do not assume App Router conventions from training data.
3. **Design tokens live in `:root` in `src/app/globals.css`.** All component CSS must consume
   tokens (var(--...)), never hard-code hex values. The token block is the single source of
   truth — if you need a new value, add a token first, then use it.
4. **Product "accent" colors in `src/lib/data.ts` (per-product `accent`, `visual-bg`,
   template thumbnails) are data, not theme.** Recolor that palette to harmonize with the
   greyscale system (light neutral tints, subtle warm/cool neutrals, one graphite accent)
   without changing any other field, ids, or copy. The 3D preview and CSS-drawn product
   visuals derive their colors from these — keep them rendering correctly after the change.
5. **Verify after changing:** run `npm run typecheck` and `npm run test:domain` — both must
   pass. Then build and eyeball: home, /products, a product page (with the customization
   studio and 3D preview), cart, checkout, wishlist, account, admin and vendor dashboards.

## Design system — "Premium Monochrome" (premium-store grade, à la Apple Store / Aesop)

### Palette (define exactly these in `:root`, remapping legacy token names onto them so
### old class code keeps working)

- Surfaces: white `#FFFFFF` (cards, header, inputs) · off-white `#F7F7F8` (page/soft
  section backgrounds) · `#F1F1F3` (elevated/hover fills, table striping, swatch
  backgrounds) · `#EAEAEA` (strong hover)
- Borders: hairlines `#E6E6E9` (default) · `#D6D6DA` (strong borders, focus rings, input
  borders on focus)
- Text: near-black `#111418` (headings, primary buttons) · `#45484F` (body) · `#85888F`
  (secondary, meta) · `#B4B6BB` (muted, placeholders, disabled)
- Ink buttons: black `#111418`, hover `#2B2E33`; secondary = white with 1px `#D6D6DA`
  border, hover fill `#F1F1F3`.
- One permitted accent: graphite `#3A3D42` for active states, icons, ratings, links on hover.
  Everything else is monochrome.
- Semantic exception (use sparingly): success `#2E7D5B`, warning `#B45309`, danger `#B91C1C`,
  each with a matching light-tint background for badges/alerts. Only in admin/vendor
  status chips, form validation, and price/stock markers.

### Typography & spacing (elevation without shadows)

- Keep Inter (load via `next/font` in `src/app/layout.tsx` if not already). Scale: h1
  clamp(2.5rem→3.25rem), section h2 clamp(1.5rem→1.9rem), body 16px/1.6, meta/labels
  11–12px uppercase with +8% letter-spacing.
- Hierarchy comes from **hairlines + light/dark blocks, not shadows.** Set all shadow
  tokens to none except: hover lift on interactive cards = `0 1px 2px rgba(17,20,24,.05),
  0 8px 24px rgba(17,20,24,.08)`. Menus/dropdowns get the strong shadow at rest.
- Radius scale: 8 (inputs, buttons) · 12 (cards, tiles) · 16 (large cards, media, drawers).
- Buttons: min-height 48px, font-weight 700. Icon buttons: 48×48, rounded-12, 1px hairline
  on hover.
- Sections: 96px vertical padding desktop / 64px mobile. Max width 1180px shell.
- Product/illustration blocks sit on flat `#F7F7F8` (or `#F1F1F3`) rounded-12 surfaces —
  never gradients, never color washes.

### Component passes (work through in this order)

1. **`src/app/globals.css`** — rewrite the `:root` token block (map every legacy name —
   navy/teal/amber/mint/rose/ink/slate/muted/line/paper/cloud — onto the monochrome
   values above). Then sweep every section block (hero, trust strip, process cards,
   collection cards, FAQ, section-soft, etc.): kill gradients and colored fills, swap to
   flat surface/border tokens, keep all layout properties (grid, flex, gaps, responsive
   media queries) intact.
2. **Header + mega-menu + footer** (`Header.tsx`, `CategoryMegaMenu.tsx`, `Footer.tsx`,
   `ui/Logo.tsx` + their CSS in globals): white header with 1px `#E6E6E9` base, black
   brand block, hairline nav separators, dropdown panel = white + strong shadow, rounded-16
   bottom. Announcement bar: `#111418` with white text. Logo mark: solid black, no gradient.
3. **Product grids & cards** (home, /products, search, wishlist): white cards, 1px hairline,
   hover = translateY(-3px) + shadow + border `#C9C9CE`. Rating stars, "✦ customisable",
   badges, compare-price → all neutral greys (badge fills `#F1F1F3`, text `#45484F`).
4. **Product page + customization studio** (`configurator/*.module.css`,
   `commerce/ProductVisual.tsx`): editor chrome = white panels on `#F7F7F8` page, hairline
   dividers, swatches recolored to the neutral palette, 3D preview stage background
   `#F1F1F3` rounded-16 with subtle inner ring. The design itself can still use colors —
   only the UI chrome is monochrome.
5. **Cart, checkout, order confirmation** (`commerce/CartView.tsx`, `CheckoutView.tsx`,
   `OrderConfirmationView.tsx` + related CSS): monochrome forms (white inputs, 1px
   `#D6D6DA` border, focus ring `#3A3D42`), summary panel on `#F7F7F8`, semantic colors
   only for totals/validation.
6. **Customer areas** (`customer/customer.module.css`), **admin**
   (`admin/admin.module.css`) and **vendor** (`vendor/*.module.css`) dashboards: same token
   discipline, data tables with hairline row borders + `#F1F1F3` striping, status chips in
   the semantic colors only.
7. **States & chrome:** skeletons (`ui/storefront-skeletons.module.css`) = flat `#F1F1F3`,
   no shimmer color; loading (`loading.tsx`), error, 404; sticky mobile cart bar; toasts.
8. **Accessibility sweep:** WCAG AA contrast on all new pairings (verify `#85888F` on white
   ≥ 4.5:1 for small text — darken to `#6E7178` if it fails), visible focus rings, prefers-
   reduced-motion.

## Definition of done

- Zero hard-coded colors outside the `:root` block (product data accents in `src/lib/data.ts`
  are the only permitted exception).
- All greys/black consistent — one near-black for headings AND buttons; no two different
  "blacks."
- No visual regression in behavior: menus open, search overlay, studio live preview and 3D
  render, cart totals, admin/vendor tables all function exactly as before.
- `npm run typecheck` and `npm run test:domain` green.
