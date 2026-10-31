
# Codex task — Myntra-grade homepage: promo carousel with per-slide destinations, image hotspots, deal-style sections

Read this whole document before touching code. It is scoped to this repository only.
Companion docs: `DESIGN_PROMPT.md` (the monochrome design system this store already
follows — you must stay inside it) and `docs/CODEX_PROMPT_QUICK_LIST_VISUALIZATION.md`
(storefront conventions). **This task restyles and enriches the storefront homepage
(`src/app/page.tsx`) in the manner of Myntra's homepage, without changing any data,
API, route, cart, or product behavior.**

## 0. Ground rules (highest priority)

1. **This is NOT the Next.js you know.** Before touching any route/page/component, read
   the relevant guide in `node_modules/next/dist/docs/` and heed deprecation notices.
2. **Homepage scope only.** Work is confined to:
   - `src/app/page.tsx` (section reordering/rewiring — the `faqs`, `process` arrays and
     FAQ section stay verbatim),
   - **new** client component files under `src/components/commerce/` (you may ADD
     files — e.g. a carousel — but do not move or rename any existing file),
   - `src/app/globals.css` (new class families only, token-only: `var(--…)`, no
     hardcoded hex — follow `DESIGN_PROMPT.md` exactly),
   - `src/components/commerce/ProductCard.tsx` (add a discount badge element; its
     quick-add / wishlist / link behavior is a hard acceptance criterion, unchanged).
   The header, mega menu, footer, `/products`, product pages, customization studio,
   cart, checkout, admin, and vendor are **frozen** — no edits.
3. **No new routes, no fake offers.** Every `<Link>` must point to a route that
   already exists (`/products`, `/products?category=<slug>`, `/products/<slug>`,
   `/about`, `/faq`). Do NOT invent coupon codes, MynCash, or sale pages — Myntra's
   "End of Reason Sale / MYNTRA300" strip has no equivalent here, so its *pattern*
   (a reassurance/deal strip) is filled with the store's real value props.
4. **Images: use what exists.** Banner/carousel art must come from product images
   already referenced in `src/lib/data.ts` (`product.image`, `product.images[]`,
   template SVGs in `public/templates/`). No new image assets, no external URLs,
   no `next/image` config changes (remote domains already allowed must be the only
   ones used today).
5. **Verification gate before you finish:** `npm run typecheck`, `npm run
   test:domain`, `npm run build`. New pure logic (discount math, hotspot data
   validation, autoplay timing rules) gets a colocated `*.test.ts` (node:test +
   node:assert/strict, see `src/lib/scroll-reveal.test.ts` for style) under
   `src/lib/`.

## 1. What Myntra's homepage actually does (research summary — target feel)

Verified from Myntra's live homepage structure (section JSON + nav data),
adapted to this store:

- **Header pattern (already exists here — do not rebuild):** white header, logo,
  search, profile/wishlist/cart icons; below it a horizontal category rail with
  one icon-chip per category group (Myntra: Men / Women / Saree / Bags / Beauty /
  Watches / Home / Gadgets / Kids, each a colored icon). kado equivalent = the
  existing `CategoryMegaMenu` + category section; this task only restyles the
  category *section cards* toward that icon-chip look.
- **Promo carousel:** full-width banner slides; each slide is ONE image with its
  own CTA chip ("SHOP NOW", "KNOW MORE", "PLAY GAMES NOW…") and each slide links
  to a **different destination URL**. Slides auto-advance; dots + arrows for
  manual control. ← This is the "different images, different links" behavior.
- **Image hotspots (the second half of that behavior):** within a single banner
  image, distinct regions are independently clickable — different zones of the
  same image open different pages. On Myntra this happens inside composite sale
  banners; for kado we build it explicitly as one "hero showcase" slide with 2–3
  hotspot zones.
- **Deal/reassurance strip:** compact horizontal band of 3–4 promises
  ("Easy 14 days returns", "Guaranteed Refunds", "Easy Return & Exchange").
- **Product rows:** section header + arrow ("Trending now", "Shop by category"),
  grid/row of product cards; card = image, name, **price + struck compare price +
  "N% OFF" badge** top-left.
- **Footer** (already exists here — frozen).

## 2. The feature to build

### A. Homepage section order (rewrite `src/app/page.tsx` body in this order)

Keep the existing CSS section classes where they fit; copy/labels are the ones
below. Server component stays a server component — all interactivity lives in the
new client components from §B/§C.

1. **Reassurance strip** (replaces the current `trust-strip` position, Myntra's
   "Easy 14 days returns" band): 4 items, icon + strong line + small line:
   - "Live preview" / "See exactly what we'll print before you order"
   - "Made to order" / "Your design is produced only after you approve it"
   - "Made in India" / "Small batches, checked before dispatch"
   - "Human support" / "Design help with your saved artwork in context"
   (Keep existing icon imports; copy may adjust slightly, semantics stay real.)
2. **Promo carousel** (§B) — 4 slides.
3. **Shop by category** — the existing category section, restyled to Myntra
   icon-chip cards: each `CategoryCard` becomes a flat rounded tile (`.tile`-
   style: `#F1F1F3` surface, 1px hairline, icon circle top, bold label, small
   "N products" meta derived from what the card already shows) in a 4-across grid
   (2 on mobile). Reuse `CategoryCard.tsx` internals if needed — but prefer pure
   CSS changes to existing classes; add `.category-grid--chips` variant classes
   rather than restructuring JSX.
4. **Trending now** — the existing bestsellers section: header "Customer
   favourites" → "Trending now", sub "The picks our customers reorder — ready
   for your name." Card row styled like Myntra product rows: tighter grid
   (4-up desktop / 2-up mobile), cards get the discount badge (§D).
5. **Collections** (existing `collection-section`) restyled as Myntra's split
   "campaign" banners: two side-by-side wide cards, flat `#F1F1F3` block, image
   right, copy left, arrow link. No copy change.
6. **How it works** (`process` array) — unchanged content, Myntra-style compact
   horizontal step band (number + icon + one line, hairline dividers, no
   card shadows).
7. **Story + FAQ** — unchanged (copy and component structure byte-identical).
8. Delete the current `home-hero` section (its content moves into carousel slide
   1 — keep the H1! Accessibility: the H1 must remain on the page; render it
   inside carousel slide 1's slide content).

### B. `HomePromoCarousel` — new component, Myntra's "different slides → different links"

`src/components/commerce/HomePromoCarousel.tsx` (`"use client"`), styled with a
new `.promoCarousel*` class family in `globals.css` (token-only).

Slide data shape (defined in the component file, exported for reuse):

```ts
type CarouselSlide = {
  id: string;
  image: string;          // existing asset (product.image / template SVG / product image)
  alt: string;
  kicker: string;         // small eyebrow, e.g. "Made for school mornings"
  title: string;          // one line, ≤ 60 chars
  cta: string;            // "Shop now" / "See how"
  href: string;           // EXISTING route only
  hotspots?: { x: string; y: string; w: string; label: string; href: string }[];
};
```

Slides (4, derived from `featuredProducts` / `categories` in `@/lib/data`):
1. Hero slide — kicker "Personalised labels & gifts", the page H1 (shortened
   "Little things feel bigger with their name on it."), CTA "Shop the
   collection" → `/products`. Subtle `hero-orb` treatment is optional; default
   = flat background `#F1F1F3`.
2. "Name slips" slide → `/products?category=customized-name-slips` (CTA "Shop
   name labels").
3. "Gifts" slide → `/products?category=personalized-gifts` (CTA "Explore
   gifts").
4. **Hotspot slide** (§C).

Behavior:
- Auto-advance every 6s; pause on hover/focus and when `prefers-reduced-motion`
  is set; arrows (chevron buttons, 48×48, `.button` hairline style) and dots
  (10px, active = `#111418`, inactive `#D6D6DA`); dot focus jumps to slide.
- Each slide's image links to `slide.href` (wrapped in `next/link`, `next/image`
  `fill` inside a 420px-tall media block, 56px on mobile); the CTA button links
  to the same `slide.href`.
- Slide content: left text block (kicker 11px uppercase, title clamp(1.5rem→2.25rem),
  CTA) over/right of image; one slide = one destination. **Never two slides with
  the same destination.**
- Keyboard: arrows + dots are real `<button>`s in DOM order; left/right arrow
  keys on the focused carousel navigate slides (`onKeyDown` on the region with
  `role="region"` `aria-roledescription="carousel"`).
- Accessibility: aria-labels on controls; non-active slides `aria-hidden`.

### C. Image hotspots — the "click different parts of one image → different pages" behavior

On slide 4 ("See the studio in action" / showcase image of the flagship
customisable product):

- 3 hotspot zones absolutely positioned by `%` coordinates from the
  `hotspots` data (`left: x; top: y; width: w; height = 44px`):
  1. Zone over the **product nameplate/label** → `/products/everyday-name-slips-72-pack`
     (label "Try the live studio").
  2. Zone over the **category area** → `/products` (label "Browse all products").
  3. Zone over a **secondary thumbnail corner** → `/products?category=personalized-gifts`
     (label "Gift ideas").
- Render each as `<Link className="hotspot" aria-label={label}>` containing a
  44×44 circular chip (white fill, 1px `#D6D6DA` ring, `+` icon, 11px label
  beneath). Hover/focus: ring `#111418`, chip lifts 1px, label darkens. This is
  the visual affordance — Myntra relies on hover for hotspots; we make it
  discoverable with the persistent `+` chips.
- Hotspots only render on the active slide (they're inside that slide's DOM);
  the slide's base link still works when clicking outside a hotspot.
- Pure helper `hotspotStyle(h)` (cssProperties object builder) exported from the
  component file + colocated test in `src/lib/carousel-helpers.test.ts`
  (also test the discount math from §D there or in its own file — either way,
  it must run under `npm run test:domain`).

### D. Myntra-style product card: discount badge + struck price

`ProductCard.tsx` (additive change only):
- When `product.compareAtPrice` exists, compute
  `off = Math.max(0, Math.round((1 - price / compareAtPrice) * 100))` via a new
  pure export `discountPercent(product)` in `src/lib/data.ts` (additive export —
  do not touch existing exports).
- Badge top-left of the media block: `.discount-badge` pill — `var(--success)`
  on `var(--success-bg)` (both tokens already exist in `:root` per
  `DESIGN_PROMPT.md`'s semantic exception), 11px bold, `"{off}% OFF"` — this
  is the ONLY place the success color may appear on the storefront home.
- Struck price styling: `--muted` color, 12px, `text-decoration: line-through`
  (verify the existing `.compare-price` already does this; restyle via tokens
  only if it doesn't).
- Everything else in the card (quick-add button, wishlist heart, actions) is
  byte-identical behavior.

### E. Deal-strip restyle (Myntra coupon band → real reassurance band)

The strip from §A.1 gets Myntra's "End of Reason Sale" *treatment* without its
content: a `#111418` ink band, white 13px text, items separated by hairlines
(`#3A3D42`), each item = icon + `<strong>` line + `<small>` line, no CTA
buttons. On mobile it scrolls horizontally (native overflow, `scroll-snap`,
no JS). This replaces the current light `trust-strip`; old class removed in
this task's diff (it's homepage-scoped CSS in `globals.css` — allowed).

### F. Performance & motion discipline

- Carousel autoplay uses `requestAnimationFrame`-free plain `setInterval` in a
  `useEffect` with the reduced-motion check; clean up on unmount; do not touch
  SSR output beyond hydration-safe state (start at slide 0; no
  `document` access during render).
- Reuse the existing `ScrollReveal` wrapper for new sections; no new animation
  libraries, no dependencies of any kind.
- All new CSS: token-only, `.promoCarousel*` / `.hotspot*` / `.discount-badge` /
  reassurance-band class families appended to `globals.css`; kill no existing
  layout classes that other pages use (grep before removing — `trust-strip`
  must only be deleted if the grep shows it's homepage-only). Note: any hex
  value written in this document refers to a value that already exists in the
  `:root` token block of `globals.css` — always emit `var(…)` in CSS, never
  the raw hex.

## 3. End-to-end acceptance test (walk this)

1. `npm run dev` → `/` : section order = reassurance band (ink) → promo carousel
   → category chips → trending → collections → how-it-works → story → FAQ.
   H1 present in the DOM exactly once.
2. Carousel: 4 slides auto-advance at ~6s; hover pauses; arrows/dots work;
   **slide 1 → /products, slide 2 → /products?category=customized-name-slips,
   slide 3 → /products?category=personalized-gifts** (different destinations —
   verify by clicking each CTA and each slide image).
3. Hotspot slide: three `+` chips visible on the image; chip 1 →
   `/products/everyday-name-slips-72-pack`, chip 2 → `/products`, chip 3 →
   gifts category page; clicking the image outside a chip goes to that slide's
   base link; all three chips work with keyboard Tab + Enter and announce their
   labels.
4. Trending cards: any product with `compareAtPrice` shows the green "% OFF"
   pill and struck price; products without it show no badge.
5. Regression: wishlist heart + quick-add on a card still work (cart count
   updates); `/products`, `/products/<slug>`, studio, cart, checkout unchanged;
   mobile viewport (≤640px): carousel at 56px media height with 2-up trending
   grid, reassurance band scrolls horizontally, no horizontal page overflow.
6. Gate: `npm run typecheck`, `npm run test:domain`, `npm run build` all green.

## 4. Explicit non-goals

- No new routes/pages, no API changes, no `src/lib/data.ts` data changes
  (additive pure `discountPercent` export only), no Prisma/Prisma-adjacent
  files, no vendor/admin/configurator/checkout edits.
- No header/mega-menu/footer changes; no new dependencies; no i18n.
- No real coupon code, sale page, or MynCash-style rewards — Myntra's deal
  strip is represented by the reassurance band only.
- No new image files; carousel art reuses existing product/template assets.
- Do not restructure existing components into new folders.

## 5. Reporting

When done, report: files changed (grouped by A–F with the new classes added),
exact commands run + results, the acceptance walkthrough outcome for steps
1–6, and any place you deviated from this document (with the reason).
