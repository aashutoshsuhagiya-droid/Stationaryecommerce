# Codex task — Myntra-EXACT hover mega menu: category rail in the header, hover opens the multi-column panel

Read this whole document before touching code. It is scoped to this repository only.
This is an **additive header change**: Myntra puts its category sections (MEN /
WOMEN / KIDS / HOME / BEAUTY…) in the top header row, each opening a big
multi-column hover panel with colored group headings (see the reference
screenshot: hovering "WOMEN" shows a wide white panel, magenta group
headings, 5 columns of links, active item underlined in its own color).
Reproduce that exact pattern with kado's real categories.

If `docs/CODEX_PROMPT_MYNTRA_EXACT_HOME_PAGE.md` (v2) is already implemented,
its **category dock band (section F)** is now redundant with this rail — remove
the dock in this task; the rail replaces it. The dock lives in
`src/app/page.tsx` (import + `<CategoryDock categories={dockCategories} />`
usage around line 108, plus any dock-only CSS in `globals.css`) — delete the
import, the JSX usage, and the `CategoryDock` props/data wiring in `page.tsx`;
you may leave `src/components/layout/CategoryDock.tsx` on disk or delete it
(your call, but nothing else may import it after this task). Everything else
from v2 (`--my-*` tokens, carousel re-skin, trending row) stays untouched.

## 0. Ground rules

1. **This is NOT the Next.js you know.** Read the relevant guide in
   `node_modules/next/dist/docs/` before touching anything.
2. **Scope:** `src/components/layout/Header.tsx`,
   `src/components/layout/CategoryMegaMenu.tsx`, `src/app/globals.css`
   (new class families + tokens). Nothing else. No new files under other
   folders; no new dependencies.
3. **Frozen behavior:** every link destination stays identical
   (`/products`, `/products?category=<slug>`, `/bulk-orders`,
   `/vendor/register`, `/products?sort=newest`, quick links
   `/bulk-orders`, `/vendor/register`, `/products?sort=newest`), the Ctrl/K
   search overlay, the mobile drawer, the `/api/products` live-category fetch,
   and all of `primary-nav`'s routes. Presentation + trigger change only.
4. **Gate:** `npm run typecheck`, `npm run test:domain`, `npm run build`
   green + §5 walkthrough.

## 1. Myntra reference values (exact, from Myntra's live header/mega-menu)

- Top rail: `MEN WOMEN KIDS HOME BEAUTY GENZ STUDIO<NEW>` — 13–14px, weight
  700, color `#282C3F`, ~20px gap between items, 56px row height; the
  hovered/active item gets a **2–3px underline bar in that section's color**
  (WOMEN = magenta `#FB56C1` in the reference shot) and its text turns to the
  same color.
- Panel: full-width white, drop shadow `0 8px 24px rgba(17,20,24,.08)`, 1px
  `#E3E8EE` border, rounded **bottom** corners (16px), open with ~0 delay on
  hover, stay open while the cursor is inside the panel, close ~250ms after
  leaving.
- Panel content: 4–5 columns; each column = a **colored group heading**
  (13px, 700, uppercase-ish magenta/pink `#FB56C1`) with a link list under
  it (13–14px, `#282C3F`, generous line-height ~2.2; link hover = magenta).
  Myntra mixes cross-category columns (e.g. Gadgets / Jewellery inside the
  women's panel) — for kado we use the store's own groups instead.
- Myntra section accent colors (verified from its nav data): `#EE5F73`
  (Men), `#FB56C1` (Women), `#F26A10` (Kids), `#F2C210` (Home), `#0DB7AF`
  (Beauty).

## 2. kado mapping (use these — all slugs/routes already exist)

Top rail items (desktop order), each a section + its group (existing
`groupSlugs`/`groupTitles` in `CategoryMegaMenu.tsx`):

| Rail item (label) | Accent token / hex | Panel columns for this item |
|---|---|---|
| `⠿ All products` (grid chip, first item) | `--mega-all` `#F26A10` | ALL four group columns + Shortcuts (the full menu) |
| `Labels` | `--mega-labels` `#EE5F73` | Label Essentials → School & Writing → Gifts & Keepsakes → Shortcuts |
| `School` | `--mega-school` `#F2C210` | School & Writing → Label Essentials → Gifts & Keepsakes → Shortcuts |
| `Gifts` | `--mega-gifts` `#FB56C1` | Gifts & Keepsakes → Label Essentials → School & Writing → Shortcuts |
| `Bulk` | `--mega-bulk` `#0DB7AF` | Bulk & Institutional → Gifts & Keepsakes → School & Writing → Shortcuts |

Rules: **the hovered item's own group is always column 1.** "All products"
shows everything. Click (not hover) on a rail item navigates to
`/products?category=<that group's first slug>` (Labels → `customized-name-slips`,
School → `school-labels`, Gifts → `personalized-gifts`, Bulk → `bulk-orders`,
All products → `/products`) — same as Myntra, where the top item is also a
link. Existing `New arrivals · NEW` link keeps its slot at the far right of
the rail.

## 3. Layout change (desktop ≥ 1024px) — Myntra's single-row header

`Header.tsx` currently has row 1 (logo + search + icons) and row 2
(`.nav-row`: `CategoryMegaMenu` + `primary-nav` + new-link). Myntra has ONE
row. Restructure for desktop:

- **Rail items move INTO row 1**, between `<Logo/>` and `.header-search`
  (exactly where MEN/WOMEN/… sit in the reference). Search stays centered
  (flex, `margin-inline:auto`), icons right.
- **Row 2 (`.nav-row`) renders only below 1024px** (mobile keeps today's
  layout, no hover anyway). No duplicate rails.
- The panel is anchored **under row 1**, full shell width, not under row 2.

## 4. Component + CSS spec

### 4.1 `CategoryMegaMenu.tsx` (rework in place, keep the live-fetch effect)
1. Export `CategoryRail` (the top items, rendered inside `Header.tsx`'s row 1
   on desktop) and keep `CategoryMegaMenu` as the hover-zone wrapper that
   owns panel + state.
2. **Trigger change: click → hover-intent.** Per rail item:
   - `onMouseEnter` → open immediately, set `activeGroup`;
   - leave → `setTimeout(close, 250)`; re-enter clears the timer;
   - panel is a **sibling inside the same hover container** with `top:0`
     (zero gap between rail bottom and panel top) so moving into the panel
     never closes it.
   - **Click still works** (rail items are `next/link`s) — navigates per §2;
     keep the button semantics for keyboard (a wrapping `<a>` with a
     `button`-like focus style).
   - **Keyboard:** `onFocus` opens, `Escape` closes, `ArrowLeft/Right` move
     between rail items, `onBlur` (focus leaves the whole rail+panel
     container) closes after the same 250ms. Keep `aria-expanded`,
     `aria-haspopup` on each item.
   - **Touch/mobile (<1024px):** no panel at all — items are plain links
     (native tap); `hover` media query or matchMedia gate.
   - Keep: outside-click close (desktop), scroll close, and the
     `/api/products` fetch that swaps in live categories.
3. **Panel content per §2:** same DOM as today's `.mega-menu-panel`
   (4 group columns + Shortcuts column + footer "View all products") but
   **column order follows the hovered item**, and the **hovered group's
   column heading + its rail underline use that group's accent**. All link
   hrefs unchanged.
4. **Active styling:** hovered/focused rail item: text = accent, 2.5px
   accent underline bar at the row bottom (like the reference), panel opens.

### 4.2 Tokens + classes (append to `:root` in `globals.css`, token-only
CSS everywhere; if v2 already defined `--my-ink/--my-slate/--my-line/
--my-surface`, reuse — don't redefine)

```css
--mega-all:#F26A10; --mega-labels:#EE5F73; --mega-school:#F2C210;
--mega-gifts:#FB56C1; --mega-bulk:#0DB7AF;
--my-ink:#282C3F; --my-slate:#696E79; --my-line:#E3E8EE; --my-surface:#F5F5F6;
```

New class families (`.rail*`, `.megaPanel*` — or extend the existing
`.mega-menu*` names; your choice, one consistent set):
- `.rail`: flex, gap 0, items `padding:0 18px`, height 56px, 13px/700,
  `var(--my-ink)`, `letter-spacing:.02em`;
- `.railItem.is-active`: color = its accent (via `style={{ color }}` or
  per-item classes `railItem--labels` etc.), `box-shadow: inset 0 -2.5px 0
  0 <accent>` for the underline bar;
- `.railItem--all` grid chip: 30px circle, `var(--my-line)` border, ⠿ glyph,
  label `All products` alongside;
- `.megaPanel`: `position:absolute; top:100%; left:0; width:100%` of the
  shell; white bg; 1px `var(--my-line)` border; `border-radius: 0 0 16px
  16px`; `box-shadow: 0 8px 24px rgba(17,20,24,.08)`; padding 28px 32px;
  `z-index` above the rest of the header;
- `.megaPanelGrid`: `grid-template-columns: repeat(4, minmax(0,1fr))` when a
  rail item is active (3 group columns + Shortcuts), 5 columns for
  "All products" — `repeat(5, minmax(0,1fr))`; gap 28px;
- `.megaPanelCol h3`: 13px, 700, uppercase, accent color per group (via
  per-column classes), margin-bottom 14px;
- link list: 13.5px, `var(--my-ink)`, line-height 2.2; hover: color = that
  column's accent, `text-decoration:underline`;
- hide the rail + panel on <1024px; keep existing mobile drawer untouched.

## 5. Acceptance walkthrough (do every step, desktop + mobile)

1. Desktop (1440px): header is ONE row — logo, `⠿ All products · Labels ·
   School · Gifts · Bulk · New arrivals[NEW]`, centered search pill, right
   icons. No second nav row.
2. Hover `Labels`: panel opens instantly, column 1 heading "Label
   Essentials" in `#EE5F73` with rail underline in the same color; hover
   `Gifts`: panel re-orders, column 1 "Gifts & Keepsakes" in `#FB56C1`;
   move the mouse inside the panel → it stays open; move away → closes
   after ~250ms.
3. Click `School` (no hover needed): navigates to
   `/products?category=school-labels`.
4. Keyboard: Tab reaches each rail item; focus opens the panel; `ArrowRight`
   cycles items; `Escape` closes; visible focus rings in the item's accent.
5. Mobile (390px): row 2 layout as today; rail hidden or links-only; no
   panel; tap `Labels` → its category page; mobile drawer + Ctrl/K search
   still work exactly as before.
6. Regression: search overlay, wishlist/cart badges, "Talk to us",
   new-arrivals link, live category fetch (admin adds a category → it
   appears) — all unchanged.
7. Gate: `npm run typecheck` + `npm run test:domain` + `npm run build`
   green.

## 6. Non-goals
No new routes, no API changes, no new image assets, no changes to
`ProductCard`, carousel, footer, or any non-header component. No new
dependencies. Mobile drawer markup stays byte-identical in behavior.

## 7. Reporting
Report: files changed, the final rail-item → column-order table, exact hex
tokens added, commands + results, walkthrough steps 1–7 outcomes, and any
deviation with reason.
