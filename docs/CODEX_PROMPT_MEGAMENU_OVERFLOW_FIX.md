# Codex task — Fix the mega menu panel that overflows the screen (unbounded columns + unpositioned panel)

Read this document before touching code. It is scoped to this repository only.
It is a **follow-up bugfix** to `docs/CODEX_PROMPT_MYNTRA_HOVER_MEGAMENU.md`
(hover mega menu). Symptom in the deployed build: opening the "All products"
panel makes a very tall panel with one column (~20 packaging subcategories)
extending past the bottom of the viewport. Myntra-style it should stay inside
the screen. **Fix the two root causes below; do not redesign the panel.**

## 0. Ground rules

1. **This is NOT the Next.js you know.** Read the relevant guide in
   `node_modules/next/dist/docs/` before touching anything.
2. **Scope:** `src/components/layout/CategoryMegaMenu.tsx` (grouping logic +
   per-column truncation), `src/app/globals.css` (`.megaPanel*` / `.megaMenu`
   positioning only). Nothing else. No new files, no new dependencies.
3. **Frozen behavior:** hover-intent timing (250ms close delay), keyboard
   controls, outside-click/scroll-close, the `/api/products` live category
   fetch, every link destination, mobile drawer + Ctrl/K search, and the
   whole rail row (its layout is fine — do not restyle it).
4. **Gate:** `npm run typecheck`, `npm run test:domain`, `npm run build`;
   then the §3 walkthrough.

## 1. Root causes (both must be fixed)

### RC-1 · Panel is unbounded in height
`CategoryMegaMenu.tsx` → `groups` `useMemo` (lines ~269–292): categories not
in `knownSlugs` are pushed into the first group ("Label Essentials") when
their parent is unknown or has no mapped group — so ~15–20 packaging
subcategories (Boxes, Soap Boxes, Perfume & Cosmetic Boxes, … Ziplock
Pouches) all land in column 1. That column grows without limit and the panel
runs off-screen.

**Fix (pure logic, so it gets a test):**
- Cap every group's *visible* items at **8** (a `const MAX_MENU_ITEMS = 8`,
  exported).
- When a group has more than 8 items, render the first 8 then a final list
  item that is a `Link` to `/products` labeled `+N more {group.title} →`
  (`N = items.length - 8`), styled `.megaPanelMore` (12px, `var(--mega-column-accent)`,
  weight 700, no underline by default).
- Keep the cap inside a **pure helper** so it is testable:
  `export function truncateMenuItems(items: Category[], limit = 8): { visible: Category[]; moreCount: number }`
  in `src/components/layout/CategoryMegaMenu.tsx` (colocated) or a new
  `src/lib/menu-truncation.ts` with `src/lib/menu-truncation.test.ts`
  (node:test + node:assert/strict — must pass under `npm run test:domain`).
  Test cases: ≤8 items → `moreCount` 0; 9 → visible 8 / moreCount 1; empty →
  both empty.
- Also stop the unbounded default: unknown-parent categories should **not**
  silently pile into "Label Essentials". If a category's `parentId` resolves
  to a known group, keep the current behavior; otherwise put it in "Label
  Essentials" ONLY if that group's pre-cap list is still < 8, else drop it
  from the menu (it remains reachable via `/products` search + the
  "View all products" footer link — the cap's "+N more" already covers the
  rest). Keep this rule simple and commented.

### RC-2 · Panel is positioned relative to the wrong container
`.megaPanel` is `position:absolute; top:100%; left:0; width:100%` — but its
containing block is `.megaMenu`, the **inline rail block** (flex
`0 0 auto` next to logo/search), not the header. So the panel's 100% width
and left edge are the rail's, not the shell's: it starts under the logo and
can overflow the viewport horizontally; nothing clamps its height vertically.

**Fix (CSS, token-only):**
- Put the panel at the **header row** width: change `.megaMenu`
  (the `position:relative` host) so the panel spans the full header shell:
  `.megaPanel { left: 0; width: calc(100vw - 64px); max-width: 1180px; }`
  anchored from `.megaMenu`'s left edge, then pull it left to align with
  the shell: since `.megaMenu` sits mid-row, add `transform:
  translateX(calc(-1 * var(--mega-align-x, 0px)))` is **not** the approach —
  instead move the positioning context up: give `.header-main`
  (the shell flex row) `position: relative` and render the panel into the
  DOM **inside** `.megaMenu` still, but with `position: fixed` fallback is
  also not desired. **Chosen approach:** keep the panel in `.megaMenu` and
  make `.megaPanel` use `position: fixed; top: <header bottom>; left: 50%;
  transform: translateX(-50%); width: min(1180px, calc(100vw - 48px));` —
  compute the fixed top from the rail's `getBoundingClientRect().bottom`
  read in a `useLayoutEffect` (store in state, no SSR flash because the
  panel only renders when open on desktop), and clamp:
  `max-height: calc(100dvh - <that top> - 16px); overflow-y: auto;`
  so the panel can never cover the taskbar or run off-screen. The inner
  scrollbar appears only when the cap (RC-1) didn't shrink it enough.
- Simpler acceptable alternative if the fixed-position plumbing feels
  fragile: keep `position:absolute` but relocate the positioning context —
  add `position: relative` to `.site-header` (the `<header>`), move
  `.megaMenu` out of flow alignment concerns by giving `.megaPanel`
  `left: max(24px, calc((100vw - 1180px) / 2)); width: min(1180px, calc(100vw - 48px));`
  so it aligns with the `.shell` left edge on wide screens, plus the same
  `max-height` + `overflow-y:auto` clamp. **Pick one, implement cleanly,
  report which.** Both must satisfy: panel never causes a horizontal
  scrollbar on the page, and never extends below the viewport's bottom
  padding (16px minimum).
- Keep `z-index: 75`, the 140ms open animation, border/radius/shadow as-is.
- Add `overscroll-behavior: contain` on the scrollable panel.

## 2. Non-goals

- No change to which groups exist, their order per rail item, colors,
  underlines, or the rail row layout.
- No change to the `groups` data source (still the `/api/products` live
  fetch with the `initialCategories` seed).
- No mobile changes (panel already desktop-only).
- Do not touch v1/v2 homepage docs or the carousel.

## 3. Acceptance walkthrough

1. `npm run dev` → hover "All products": panel opens; the "Label
   Essentials" column shows **at most 8 links + one "+N more …" link**,
   panel bottom edge stays **inside the viewport** (verify at 1440×900 AND
   1366×768 — the smaller one will engage the scroll clamp).
2. No horizontal scrollbar on the page in any rail state; panel's left
   edge aligns with the page content shell (≈ same left as the logo),
   right edge never passes `100vw - 24px`.
3. Hover each rail item (Labels / School / Gifts / Bulk): same cap applies;
   panel height varies but never off-screen.
4. Keyboard: Tab + Arrows still move between rail items; Escape closes;
   "+N more" link is reachable by Tab and announces its label.
5. Regression: live fetch still repopulates the panel after admin adds a
   category (open `/api/products?limit=1` in another tab, add a category in
   admin, reopen the panel — the new category appears under the right
   group, capped at 8); mobile drawer, Ctrl/K search, header search
   submit all unchanged.
6. `npm run menu-truncation test passes` (it is part of `test:domain`),
   `typecheck`, `build` green.

## 4. Reporting
Report: which RC-2 approach you picked + why, the final CSS for
`.megaPanel` (the block you shipped), the test file location, commands +
results, and walkthrough steps 1–6.
