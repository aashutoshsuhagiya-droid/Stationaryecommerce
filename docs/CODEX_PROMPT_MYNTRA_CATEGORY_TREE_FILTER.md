# Codex task — Myntra-style category/subcategory tree filter on the storefront `/products` page

Read this whole document before touching code. It is scoped to this repository only.
Goal: the `/products` filter sidebar (screenshot 1, current "CATEGORY" radio list)
becomes Myntra's left-sidebar **hierarchical category tree** (screenshot 2):
parent groups with expandable subcategory **checkboxes** (multi-select), item
counts in parentheses, an **active filter chips row** under the toolbar, and the
**"+N more"** collapse pattern. Selecting a subcategory filters the grid.

## 0. Ground rules (highest priority)

1. **This is NOT the Next.js you know.** Read the relevant guide in
   `node_modules/next/dist/docs/` before writing any code; heed deprecation notices.
2. **Data source is live:** the sidebar renders from `categories` that
   `ProductCatalog` already fetches (`/api/products` → `payload.categories`),
   which are **hierarchical** (`parentId` links children to parents; leaf
   categories have no `parentId`). Never hard-code the category list in the
   UI. **Frozen:** `queryProducts` in `src/lib/catalog.ts`,
   `productQuerySchema` in `src/lib/validation.ts`, and the
   `/api/products` route all keep their current single-`category`-string
   contract (no API/route changes anywhere in this task).
3. **Filtering stays client-side (Myntra's own model):** multi-category
   selection narrows the already-loaded `catalog` (up to the `visible`
   window, like today) — the API call only ever sends a **single**
   `category` param: a leaf when exactly one leaf is selected, the parent
   `slug` when a parent + its selected children resolve to *all* of that
   parent's children (equivalent set, so the API count stays correct),
   otherwise `all` and the client filters the loaded window. Do not change
   the single-value schema to support multi.
4. **Scope:** `src/components/commerce/ProductCatalog.tsx`,
   `src/lib/catalog.ts` (**additive pure helpers only — no existing exports
   or `queryProducts` behavior touched**), `src/app/globals.css` (new
   `.filterTree*` class family, token-only). No other files. No new
   dependencies.
5. **Gate:** `npm run typecheck`, `npm run test:domain`, `npm run build`
   green; then the §4 walkthrough.

## 1. Myntra reference (screenshot 2 — target feel, exact behaviors)

- Left sidebar "CATEGORIES" block: **parent items are indented, expandable
  checkbox rows** ("Wall Art", "Bed sheets", "Organisers"…) each with its
  **count in parentheses** `(91347)`; clicking the parent's **chevron**
  expands indented **subcategory checkboxes**; a parent row itself is a
  link to its `/products?category=<slug>` listing page (label is a link,
  chevron toggles).
- A **"+244 more"** link collapses long groups — same pattern used in the
  mega-menu; here it collapses overflow rows past 8.
- Selected categories appear as **removable chips** in the toolbar area
  (`40% And Above ×`, `Wall Art ×` style — Myntra shows them as soft-grey
  pills next to "FILTERS / CLEAR ALL"); clicking × removes that category
  from the selection (multi-select semantics).
- **CLEAR ALL** (existing `reset()` behavior) clears the whole category
  selection at once; Myntra's pink "CLEAR ALL" label maps to our
  `var(--my-pink)` token.
- Counts: category counts shown in grey after the label (Myntra's
  `(91347)`), our `productCount`.

## 2. What to build

### A. Additive pure helpers in `src/lib/catalog.ts` (new exports, colocated
tests `src/lib/catalog.test.ts` additions OR `src/lib/catalog-filter-tree.test.ts`
— node:test + node:assert/strict, run under `npm run test:domain`)

```ts
export type FilterTreeGroup = {
  id: string;            // parent id (or leaf id when standalone)
  name: string;
  slug: string;
  count: number;         // parent's own productCount (children add their own)
  children: Array<{ id: string; name: string; slug: string; count: number }>;
};

export function buildFilterTree(
  categories: Category[],
  options?: { groupCap?: number },   // default 8, mirrors the mega-menu cap
): FilterTreeGroup[];
// - Groups = top-level categories (parentId null/undefined), sorted by
//   sortOrder.
// - children = categories whose parentId === group.id (or, when a leaf has
//   no children, the group's own row has no children array → empty).
// - Children sorted by sortOrder then name; children with count > 0 always
//   listed; children beyond options.groupCap are dropped from `children`
//   and their total count is exposed as `moreChildren: number` on the
//   group (pure data, no "+N" string — the UI builds the label).
// - Groups whose count === 0 AND have zero children-with-count are still
//   included (a "See All" row) — the existing sidebar shows zero-count
//   categories too; keep that.

export function nextCategoryParam(
  selected: ReadonlySet<string>,
  group: FilterTreeGroup,
): string | null;
// - null → send no category param (select "all")
// - returns a single slug when: exactly one selected item is a leaf; or
//   selected === all of `group.children` whose count > 0 AND selected
//   includes the parent (→ parent slug); or selected has exactly one item
//   and it is a parent (→ that parent's slug).
// - Otherwise null (client-side narrowing over the loaded window).
```

Pure, no `console`, no DOM — the point is `npm run test:domain` coverage.

### B. `ProductCatalog.tsx` — sidebar tree + chips + narrow logic

Replace **only** the "CATEGORY" `filter-group` (the radio list at
`const filters = <>…`) with the new tree; keep "Shopping options",
"Current price range" and the help block **byte-identical**.

State: add `const [selectedCategories, setSelectedCategories] =
useState<ReadonlySet<string>>(new Set());` — derived initial value from
the existing `category` param: when `categoryParam` starts with `/`
(unchanged), selected = empty; when `categoryParam` is a known slug,
selected = { that slug }. Keep `customOnly` / `inStockOnly` / `sort`
untouched.

UI spec (new `.filterTree*` classes, Myntra-style):
- **Parent row:** 16px square checkbox (accent `var(--my-pink)` when
  checked, 1px `var(--my-line)` border radius 4), label (13px
  `var(--my-ink)`), count `var(--my-faint)` 11px right-aligned
  `(${count})`; parent label is a `<Link>` to `/products?category=<slug>`
  (navigates like today's radio did — uncheck the tree on navigation,
  leave `selectedCategories` re-derived from the param).
- **Chevron** (lucide `ChevronDown`, 14px, `var(--my-slate)`) on the far
  right toggles expansion of children (`useState` expanded id set; a group
  stays expanded if you check any child). **Zero-children groups render no
  chevron and no children block** — seed data (`src/lib/data.ts`) is flat
  (no `parentId`), so most groups start with no children; the chevron only
  appears when `group.children.length > 0`. Do not render a dead/disabled
  chevron.
- **Children:** indented `padding-left: 28px`, same 16px square checkbox,
  12.5px label, count; each `<label>` wraps checkbox + text; toggling a
  child updates `selectedCategories` (add/remove slug), resets `visible`
  to 8 (like today's `setCategory` did), and re-runs narrowing over the
  **loaded** `catalog` window (see §2-C).
- **"+N more"** row: when `group.moreChildren > 0`, a 12px
  `var(--my-pink)` 600-weight `<Link href="/products?category=<group.slug>">+N
  more →</Link>` after the visible children list (mirrors the mega-menu
  pattern; clicking loads that parent's full listing).
- **Chips row:** right below the existing toolbar (where `.active-filters`
  already sits — extend it, don't duplicate): one `.active-filters button`
  **per selected category** (label = `shortName ?? name`, `×` removes that
  slug), plus the existing category/`customOnly`/`inStockOnly` chips
  unchanged. `CLEAR ALL` (existing `reset()`) now also does
  `setSelectedCategories(new Set())`.
- **Accessibility:** checkboxes are real `<input type="checkbox">`
  (screen readers announce state); `aria-expanded` on chevron buttons;
  skip links n/a (in-page). No `role` changes to the aside.

### C. Narrowing the loaded window (client-side, API untouched)

In the existing `results` `useMemo` (line ~177), add the category set
check — when `selectedCategories.size > 1`, a product matches when
`product.categorySlugs ?? [product.categorySlug]` intersects
`selectedCategories` (OR semantics, Myntra's model). When
`selectedCategories.size === 1`, the existing single-slug path is used as
today (via `nextCategoryParam` deciding the single param sent to the API
— so the count stays server-correct for single-leaf / all-children
cases, and falls back to the loaded window otherwise). Wire
`nextCategoryParam` into the `catalogQuery` builder: the API's `category`
param becomes `nextCategoryParam(selected, activeGroup)` — where
`activeGroup` is the tree group containing the first selected item (or
the first group when selection is empty). Keep the 180ms-debounced
refetch (frozen behavior).

### D. CSS — `.filterTree*` in `globals.css`, token-only

Append near the existing `.filter-group` block: `.filterTree` (container,
`padding-block: 18px`, bottom hairline `var(--my-line)`), `.filterTreeGroup`
(parent row, `min-height: 44px`, `display: grid`, `grid-template-columns: 16px
1fr auto 24px`, `gap: 8px`, `align-items: center`), `.filterTreeGroupHead`
(the 16px square checkbox: `border: 1.5px solid var(--my-line)`,
`border-radius: 4px`, `appearance: none`, checked state `background:
var(--my-pink)`, border same color, white 10px check via
`::after`), `.filterTreeGroupLabel` (13px 600 `var(--my-ink)`, underline on
hover), `.filterTreeGroupCount` (11px `var(--my-faint)`),
`.filterTreeChevron` (14px `var(--my-slate)`, `rotate` transition 160ms,
`rotate(-90deg)` when collapsed), `.filterTreeChildren` (`padding-left:
28px`, `display: grid`, `gap: 2px`), `.filterTreeChild` (same checkbox
style at 14px square, 12.5px label, count 10.5px `var(--my-faint)`),
`.filterTreeMore` (12px 600 `var(--my-pink)`, underline on hover,
`margin-top: 4px`). Checked child/parent checkbox: background + border
`var(--my-pink)`, white `::after` check (9×6px, `border-right` +
`border-bottom` 1.5px white, 45°). Parent checkbox "tri-state" visual:
when *some but not all* children are selected, parent checkbox shows the
pink **border with a hollow center** (no fill, no check — a 2px
`var(--my-pink)` outline), Myntra's partial state.

## 3. Frozen (do NOT change)

`queryProducts` behavior; `productQuerySchema` single `category` string;
`/api/products` route; `availableFilters` / `filter-heading` / "Shopping
options" / "Current price range" / help block; mobile filter drawer (it
renders the same `filters` fragment — the tree must work inside it, verify
with a 390px viewport); `reset()`, `loadMoreProducts`, error/empty states;
`/search` mode behavior; every other page.

## 4. Acceptance walkthrough

1. `npm run dev` → `/products` (desktop 1440px): sidebar "CATEGORIES"
   block shows parents with counts; expand "Label Essentials" → its
   subcategories appear as checkboxes (indented, with counts).
2. Check **two** different leaves under the same parent → grid narrows to
   the union (OR) of those two; chip row shows **two** category chips
   side-by-side, each removable via `×`; a partial parent shows the
   hollow-pink **tri-state** checkbox.
3. Check **all** leaves of a parent + its parent row → the single
   `category` param sent to `/api/products` becomes that **parent's** slug
   (verify via Network tab — one request, `category=<parent-slug>`), count
   stays server-correct.
4. Hover / expand a group with >8 children → row 8 ends with a
   `"+N more →"` link to the parent listing; the parent row itself is a
   link to `/products?category=<slug>`.
5. `CLEAR ALL` clears selection AND chips; the "Shopping options" and
   "Current price range" groups are pixel-identical to before (diff their
   DOM: no changes).
6. Mobile (390px): the filter **drawer** shows the same tree; toggling a
   child updates the visible-window narrowing; `Show N products` still
   reflects the total.
7. Regression: `/search?q=…` still works; `/products?category=<slug>`
   (deep link, e.g. from the mega menu) auto-selects **that one** leaf/
   parent in the tree; load-more button counts unchanged.
8. Gate: `npm run typecheck`, `npm run test:domain` (the two new pure
   helpers must have passing tests), `npm run build` — all green.

## 5. Non-goals

No new API routes, no schema/migration changes, no changes to
`queryProducts` semantics or `productQuerySchema` (single-value
`category` stays as-is; multi is client-side). No other-page edits. No
new dependencies. No changes to the mega-menu or homepage docs.

## 6. Reporting
Report: files changed (grouped A–D with the new classes added), the two
helper signatures exactly as implemented, exact commands run + results
(typecheck / test:domain / build), the acceptance walkthrough outcome for
steps 1–8, and any place you deviated from this document (with the reason).
