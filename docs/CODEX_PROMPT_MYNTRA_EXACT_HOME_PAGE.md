# Codex task v2 — Myntra-EXACT homepage: real Myntra colors, category dock filter, trending rows

Read this whole document before touching code. It is scoped to this repository only.
**This document SUPERSEDES `docs/CODEX_PROMPT_MYNTRA_STYLE_HOME_PAGE.md` (v1).**
v1 intentionally kept the store's old monochrome system; the result was "not Myntra".
v2 (this doc) applies Myntra's actual visual language — its real colors, its
top category dock that filters products, its trending product rows, its card
anatomy. The working tree already contains the v1 build (commit `1bd64f7` —
`HomePromoCarousel`, hotspots, reassurance band, `discountPercent`,
`carousel-helpers`). **Rebuild-on-top: rewire sections, re-skin classes, do not
delete v1 components.**

## 0. Ground rules (highest priority)

1. **This is NOT the Next.js you know.** Before touching any route/page/component,
   read the relevant guide in `node_modules/next/dist/docs/` and heed deprecation
   notices.
2. **Scope:** `src/app/page.tsx`, `src/components/layout/Header.tsx` +
   `Footer.tsx` (presentation-only edits, their links/behavior frozen),
   `src/components/commerce/` (re-skin existing + one new `CategoryDock`
   component), `src/app/globals.css` (token additions + homepage class families),
   `src/lib/data.ts` (**ONLY**: additive `compareAtPrice` values on existing
   products — see §D; no other data change, no new exports).
3. **Frozen behavior:** every link target, the search overlay (Ctrl/K),
   wishlist/cart counts, quick-add, product routes, `/products` filter
   semantics, admin, vendor, checkout — byte-identical behavior. Only
   presentation-layer changes.
4. **Verification gate:** `npm run typecheck`, `npm run test:domain`,
   `npm run build` all green; then the §F walkthrough.
5. **All colors come from the token block in §A.** Define the tokens in
   `:root` (new `--my-*` / `--cat-*` names), then consume `var(…)` everywhere.
   The v1 monochrome treatment of the homepage is REMOVED where this doc says so
   (grayscale filters, graphite CTA).

## 1. Verified Myntra reference values (from Myntra's own homepage data)

Colors below were extracted from Myntra's live homepage/nav data — use these
exact hexes, no substitutions:

| Token | Hex | Myntra source |
|---|---|---|
| `--my-pink` | `#FF3F6C` | brand accent (CTAs, active) |
| `--my-pink-strong` | `#E82F5C` | CTA hover |
| `--my-pink-soft` | `#FFE9EF` | pink tints (chips, strips) |
| `--my-ink` | `#282C3F` | headings / product names (verified) |
| `--my-slate` | `#696E79` | secondary/meta text |
| `--my-faint` | `#9BA0AC` | muted text, placeholders |
| `--my-line` | `#E3E8EE` | hairlines / card borders |
| `--my-surface` | `#F5F5F6` | soft section backgrounds, card image bg |
| `--my-deal` | `#2F855A` | "% OFF" text/badges (green, Myntra style) |
| `--my-deal-soft` | `#DFF3E7` | deal badge background |
| `--cat-1…--cat-5` | `#EE5F73` `#FB56C1` `#F26A10` `#F2C210` `#0DB7AF` | category dock chip colors (verified from Myntra's nav "template_config.color" data: Men #ee5f73, Women #fb56c1, Kids #f26a10, Home #f2c210, Beauty #0db7af) |

Verified Myntra copy/headings to reuse: search placeholder **"Search for
products, brands and more"**, section titles **"Trending"** (sub "Trending and
New Product Launches"), **"Shop by Category"**, "See All" right-side link on
every row. Card anatomy: image on soft-grey bg → product name (13–14px, 600,
ink) → price row: `₹<now>` bold + `₹<compare>` struck grey + `N% OFF` green;
top-left green pill badge `N% OFF` on the image when a compare price exists.

## 2. Kado mapping (use these real values — no invented slugs/routes)

| Category slug | Name | Dock chip color |
|---|---|---|
| `customized-name-slips` | Name Slips | `--cat-1` |
| `waterproof-stickers` | Stickers | `--cat-2` |
| `personalized-pencils-pens` | Pencils & Pens | `--cat-3` |
| `school-labels` | School Labels | `--cat-4` |
| `personalized-notebooks` | Notebooks | `--cat-5` |
| `bottle-tiffin-labels` | Bottle & Tiffin Labels | `--cat-1` |
| `school-accessories` | School Accessories | `--cat-2` |
| `personalized-gifts` | Gifts | `--cat-3` |
| `name-plates-keychains` | Keychains | `--cat-4` |
| `bulk-orders` | Bulk Orders | `--cat-5` |

Chip image = `category.image` in a 56px circle. Destinations =
`/products?category=<slug>` (all exist). Extra routes available:
`/products/everyday-name-slips-72-pack`, `/about`, `/faq`, `/track-order`,
`/search?q=…`, `/products`.

## 3. The exact build, section by section

### A. Tokens
Append to `:root` in `globals.css` the 12 tokens from §1. Do not rename any
existing token.

### B. Announcement strip (Myntra's top ribbon)
The existing top strip ("Thoughtfully personalised, carefully made / Track your
order →") becomes Myntra's sale-ribbon treatment: `var(--my-pink)` background,
white 12px text, single line: **"Every order includes free shipping · Live
preview on every customisable product"** + right-aligned "Track your order →"
link (keeps its `/track-order` target). Mobile: single line, ellipsis.

### C. Header — Myntra presentation, frozen behavior
`Header.tsx` + its CSS only:
- White bg, 1px `var(--my-line)` bottom border; remove any shadow.
- **Search pill:** centered, flex-1 up to 560px; 1px `var(--my-line)` border,
  radius 999px, white bg; search icon (lucide `Search`) left in `var(--my-faint)`;
  placeholder text → exactly **"Search for products, brands and more"**;
  focus ring `var(--my-pink)`. Focus behavior (opens the existing search
  overlay / Ctrl+K) unchanged.
- Right icon group: account → wishlist → cart, 20px icons, 40×40 hover square
  with `var(--my-surface)` fill; count badge fill `var(--my-pink)`, white
  text. Left logo unchanged.
- Category mega menu behavior untouched; its panel border switches to
  `var(--my-line)`.

### D. Trending row + compareAtPrice data (Myntra's "Trending" section)
1. `src/lib/data.ts` — **only permitted data change**: add `compareAtPrice`
   (₹, > price, realistic 35–60% off) to exactly these products: the first
   four `featuredProducts` entries. No other field/entry touched.
2. Replace the v1 "Trending now" grid section with Myntra's row:
   - Header: **left** `Trending` (18px, 700, `var(--my-ink)`) + small sub
     `Trending and New Product Launches` (12px `var(--my-slate)`); **right**
     "See All →" text-link (pink on hover) → `/products`.
   - **Horizontal snap-scroll row** (native CSS: `overflow-x:auto`,
     `scroll-snap-type:x mandatory`), cards `width:210px; flex:0 0 210px;
     scroll-snap-align:start`; show 4 cards on desktop (rest off-canvas, no
     JS needed). Card anatomy exactly as §1: soft `var(--my-surface)` image
     square (radius 12), name, price row (`₹<price>` 14px 700 ink; `₹<compare>`
     12px struck `var(--my-faint)`; `N% OFF` 11px 700 `var(--my-deal)`), and
     the top-left **green pill badge** (`var(--my-deal)` text on
     `var(--my-deal-soft)`, 10px 700, radius 999px) using the existing
     `discountPercent()` from `@/lib/data`.
   - Hide the horizontal scrollbar visually (`scrollbar-width:none`) but keep
     it scrollable.
   - Reuse the `ProductCard` quick-add/wishlist behavior is NOT required here —
     this row uses plain cards linking to `/products/<slug>` (Myntra rows don't
     inline add-to-cart); do not nest `ProductCard`, build a small
     `TrendingCard` inside the same commerce folder.

### E. "Shop by Category" tiles (Myntra's tile grid, verified heading)
Restyle the existing category section into Myntra tiles:
- Exactly the heading **"Shop by Category"** (18px 700 ink) + "See All →"
  right link → `/products`.
- Grid: 5 tiles desktop (2 rows: 3+2 centered or 5-across if it fits at
  1180px shell — choose 5-across, gap 12px), 2-across mobile. Tile: 150px
  tall, radius 16, `var(--my-surface)` bg; category image cover (NO
  grayscale — remove any filter), label = white pill bottom-left
  (white bg 85% opacity, 12px 600 ink, radius 999, padding 6px 12px) + the
  chip color from §2 as a 3px left edge accent on the pill border-start.
  Destination `/products?category=<slug>`.
- Keep using `CategoryCard` internals if the DOM allows; otherwise restyle
  via new `.catTiles*` classes in page.tsx JSX.

### F. Category dock — THE top product filter (Myntra's icon rail)
New presentation component `src/components/layout/CategoryDock.tsx`
(client, no state beyond hover):
- Sits **directly under the header, above the carousel**, full-width white
  band, 1px `var(--my-line)` bottom border.
- Left chip: **"Shop All"** — 56px circle with grid icon (lucide
  `LayoutGrid`), ink border.
- Then the 10 chips from §2: 56px circle with `category.image` (border 2px
  transparent; **on hover: border-color = the chip's `--cat-n` color**, label
  color turns to that same color), 11px 600 `var(--my-ink)` label below,
  centered. Chips 64px wide, row `justify-content: space-between` on desktop
  (fits 11 chips at 1180px), **horizontal scroll + snap on mobile** (no JS
  carousel).
- Every chip is a `next/link` to `/products?category=<slug>` — this is the
  "top filter" the store is missing vs Myntra's dock.
- Class family: `.catDock*` in `globals.css`, token-only.

### G. Carousel re-skin (v1 `HomePromoCarousel` → Myntra colors)
Keep component + logic (autoplay, hotspots, dots, arrows, keyboard). Change:
- **Remove** `filter: grayscale(1) contrast(1.04)` from carousel images and
  category tile images — Myntra banners are full-color.
- Section bg `var(--my-surface)`; slide bg white; slide border `var(--my-line)`.
- Kicker → `var(--my-pink)`; H1/H2 → `var(--my-ink)`; body → `var(--my-slate)`;
  CTA button → `var(--my-pink)` bg, white text, radius 8px, hover
  `var(--my-pink-strong)` (replaces the graphite `.button-primary` use here —
  add a `.myPill` CTA class, don't mutate global `.button-primary`).
- Dots: active `var(--my-pink)`, inactive `var(--my-line)`; arrows: white
  bg + `var(--my-line)` border, ink icon.
- Hotspot chips: border `var(--my-pink)`, plus icon `var(--my-pink)`; hover
  fill `var(--my-pink)`, icon white.

### H. Campaign row (Myntra's split deal banners)
Restyle the existing two collection cards: white bg, 1px `var(--my-line)`
border, radius 16, image right (full color), CTA becomes the pink pill
("Shop Now" for name labels, "Explore Gifts" for gifts), small eyebrow in
`var(--my-pink)`. Links unchanged.

### I. "How it works" / story / FAQ — Myntra-neutral re-skin
No copy or structure change; recolor only: section headers `var(--my-ink)`,
eyebrows `var(--my-pink)`, hairlines `var(--my-line)`, step cards white +
`var(--my-line)` border (no shadows), FAQ open `+` icon in `var(--my-pink)`.

### J. Footer — Myntra's column layout (presentation-only, keep every href)
Reorder/restyle `Footer.tsx` into Myntra's 5-column grid:
1. **Shop** — Name Slips, Stickers, Pencils & Pens, School Labels, Notebooks
   (each → its `/products?category=…`),
2. **Company** — About, FAQ, Contact,
3. **Help** — Track Order, Shipping Policy, Returns Policy,
4. **Policies** — Terms, Privacy,
5. **Stay in the loop** — existing newsletter form (kept as-is) or a "Sell
   with us" link.
Column heads: 11px 700 uppercase `var(--my-slate)`, links 13px
`var(--my-ink)`, hover pink. Above the columns: Myntra's
**"Trending Searches"** row — label + 4 inline links with arrows:
`name slips → /search?q=name+slips`, `gifts → /search?q=gifts`,
`notebook → /search?q=notebook`, `stickers → /search?q=stickers` (verify
`/search` accepts `q` — it does today). Bottom bar: hairline, copyright +
"Made in India" chip (pink-tint bg `var(--my-pink-soft)`, 11px).

### K. Home section ORDER (Myntra's own order)
1. Announcement strip (pink) → 2. Header → 3. **Category dock (F)** →
4. **Promo carousel (G)** → 5. **"Trending" row (D)** → 6. **"Shop by
   Category" tiles (E)** → 7. Campaign row (H) → 8. How-it-works → 9. Story →
10. FAQ → 11. Footer (J). (v1's reassurance band is dropped from the layout —
   its content already lives in the announcement strip + trust notes; delete
   the section wrapper only, keep CSS unused-safe by removing its classes at
   the end if unused, grep first.)

## 4. Explicit non-goals

- No new routes/pages; no API changes; no Prisma files; no admin/vendor edits.
- No new dependencies; no image files; carousel/tile art = existing
  `data.ts`/template assets only.
- No `data.ts` change other than the four additive `compareAtPrice` values.
- Search overlay behavior, cart/wishlist logic, quick-add: frozen.
- Do not rename/delete v1 files (`HomePromoCarousel.tsx`,
  `carousel-helpers.ts` stay; re-skinned in place).

## 5. End-to-end acceptance walkthrough (do every step)

1. `npm run dev` → `/`: pink strip on top; header search pill says "Search for
   products, brands and more"; **dock shows 11 chips** (Shop All + 10
   categories), each chip's hover ring uses its §2 color; chip 3 (Pencils &
   Pens) → `/products?category=personalized-pencils-pens` shows that
   category filtered.
2. Carousel: images are **full color** (no grayscale), CTA is pink, 4 dots
   with active pink, hotspots have pink chips on slide 4 (3 of them, distinct
   destinations).
3. Trending row: horizontal snap scroll; first 4 products show `₹<price>
   ₹<compare> N% OFF` + green top-left badge; scroll works with no
   horizontal page overflow; products without compare price show no badge.
4. "Shop by Category" tiles: 5 tiles, white pill labels, full-color images,
   each → correct `/products?category=…`.
5. Footer: 5 columns + "Trending Searches" row; every link still works (spot-
   check Track Order + 2 category links + one search link).
6. Mobile (390px): dock scrolls horizontally; trending row snaps; carousel
   media 220px tall; no overflow.
7. Gate: `npm run typecheck` + `npm run test:domain` + `npm run build` green;
   `git diff --stat` shows no changes outside §0.2 scope.

## 6. Reporting
Report: files changed (grouped A–K), the 4 `compareAtPrice` values added,
commands + results, walkthrough steps 1–7 outcomes, and any deviation with
reason.
