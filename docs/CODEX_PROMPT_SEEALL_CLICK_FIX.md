# Codex task — Fix the flaky "See All" homepage links (click sometimes never registers)

Read this document before touching code. It is scoped to this repository only.
Symptom (reported by the user, reproduced in headless Chromium on the deployed
build): the **"See All →"** links in the homepage "Trending" and "Shop by
Category" headers navigate to `/products` only *sometimes*. A fast click on a
just-scrolled-into-view link frequently does nothing; the same link works if
you wait a moment. The user wants it to work reliably, Myntra-style.

## 0. Ground rules (highest priority)

1. **This is NOT the Next.js you know.** Read the relevant guide in
   `node_modules/next/dist/docs/` before touching anything; heed deprecation
   notices.
2. **Root cause (verified, do not re-diagnose from scratch):** the sections are
   wrapped in `ScrollReveal` (`src/components/ui/ScrollReveal.tsx` +
   `src/components/ui/scroll-reveal.module.css`). Its **pending** state applies
   `transform: translate3d(0, 8px, 0)` + `will-change: opacity, transform`.
   During the 420–560ms reveal animation the element (and the "See All" link
   inside it) is painted **8px above its final position**. A click in that
   window lands on the offset coordinates / a sibling, so the `<a>` never
   receives it. After the animation completes (transform → `none`) the same
   link works — which is exactly the flake we reproduced.
3. **Scope (three files, no others):**
   - `src/components/ui/scroll-reveal.module.css` (fix the offset so reveal
     items are never painted off-position — the core fix)
   - `src/app/globals.css` (give `.myntraSeeAll` a real click target + stable
     stacking; token-only)
   - `src/components/ui/use-scroll-reveal.ts` **only if** needed to clear a
     lingering `will-change` when a section is fully revealed (see §2-C)
4. **Frozen:** every link `href` stays exactly `/products`; no route, no data,
   no other-component change. The reveal *look* (fade + subtle rise) is kept;
   we only remove the **interaction-breaking offset** and the stray
   `will-change` after reveal.
5. **Gate:** `npm run typecheck`, `npm run test:domain`, `npm run build`; then
   the §4 headless click test must show 100% navigation.

## 1. What must be true after the fix

- A click on "See All →" navigates to `/products` **on the first click, every
  time**, including immediately after the section scrolls into view (no waiting).
- No visible layout jump on load (the fade-in still happens; we just stop the
  8px upward offset from ever intercepting a click).
- Reused everywhere `ScrollReveal` is used (home, `/products`, product
  cards) — because the fix is in the shared `scroll-reveal.module.css`, the
  whole store's cards/links become click-stable, not just the two "See All".

## 2. The fix, step by step

### A. `scroll-reveal.module.css` — remove the offset, keep the fade
Change the **pending** rule so it animates **opacity only** (no translate), and
make **visible** drop the transform AND clear the layer:

```css
.reveal { opacity: 1; /* no transform */ }

.reveal[data-scroll-reveal="pending"] {
  opacity: 0;                 /* was also translate3d(0,8px,0) + will-change */
  transition: none;
}

.reveal[data-scroll-reveal="visible"] {
  transition: opacity 420ms ease-out;  /* drop the 560ms transform transition */
}
```

- **Keep** the existing `@media (prefers-reduced-motion: reduce)` block (it
  already forces opacity:1 / transform:none / transition:none — still correct).
- **Do not** keep a persistent `will-change: opacity, transform` on the
  element in steady state. If the source currently sets `will-change` on
  `.reveal` or `.reveal[data-scroll-reveal="pending"]`, remove it, OR set
  `will-change: auto` on the visible state so the layer is released once the
  animation ends (an untransformed element with a live layer can still create
  a stacking-context / paint quirk). This is §2-C.

### B. `globals.css` — make `.myntraSeeAll` a reliable, Myntra-sized target
The link is `display:inline-flex; gap:5px; font-size:.8125rem; font-weight:800`.
Give it a comfortable hit area and a stable stacking context so it is never
hidden under a later-painted sibling during/after reveal:

```css
.myntraSeeAll {
  /* keep existing: flex:0 0 auto; display:inline-flex; align-items:center;
     gap:5px; color:var(--my-pink); font-size:.8125rem; font-weight:800; */
  position: relative;              /* new: stable stacking, click always hits it */
  z-index: 1;                      /* new: above any transformed sibling mid-reveal */
  padding: 8px 0;                 /* new: grows the vertical hit target to ~37px */
  text-decoration: none;          /* new: it is a link, make that explicit */
}
```
(Existing `.myntraSeeAll:hover { color: var(--my-pink-strong); }` stays.)

### C. `use-scroll-reveal.ts` — release the layer after reveal (only if needed)
If `use-scroll-reveal.ts` or the module sets `will-change` inline or via a
class that persists post-reveal, add one line: when the element reaches
`data-scroll-reveal="visible"` AND the transition has finished (or, simply,
always on visible), set `element.style.willChange = "auto"`. If the CSS in
§A already removed all `will-change`, **skip this file entirely** — do not
edit it. Report which case applied.

## 3. Frozen (do NOT change)
- `.myntraSeeAll` `href` = `/products` (both instances).
- The fade-in look; the reduced-motion block; every other `ScrollReveal`
  usage's structure; `.section`, `.myntraSectionHeader` layout;
  `next/link` client-side routing behavior.

## 4. Acceptance test (headless, run it, paste the log)

Drive the **dev** server (`npm run dev`) at 1600×900 with
`puppeteer-core` + system Chrome (no new dep committed; `--no-save` is fine
for local). For BOTH "See All" links, in a **fresh** page load, scroll the
link into view with `behavior:"instant"` and click **as fast as possible**
(no artificial settle wait). Assert navigation to `/products`. Repeat the
fast-click **5×** per link. Pass = 10/10 navigations (today it is ~5–8/10).

```
for i in 0..4, for link in [0,1]:
  goto /, wait domcontentloaded
  scrollIntoView(link, instant); wait 80ms; mouse.click(linkCenter)
  expect location.pathname === "/products"
```
Report the raw 10-line log. Also confirm no layout jump: screenshot at
`data-scroll-reveal="pending"` vs `"visible"` — the header text should sit at
the **same** y in both (offset gone).

## 5. Non-goals
No changes to `next/link`, the router, routes, or data. No new dependencies.
Do not "fix" this by removing `ScrollReveal` from the homepage — keep the
fade; only stop it from breaking clicks. No mega-menu / category-tree /
homepage-structure changes.

## 6. Reporting
Report: exact diff to the two CSS blocks (+ the one line in
`use-scroll-reveal.ts` if §2-C applied), the headless 10/10 click log,
`typecheck`/`test:domain`/`build` results, and any deviation + reason.
