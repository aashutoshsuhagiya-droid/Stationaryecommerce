# Codex task — Turn vendor category selection into a grouped parent → sub-category selector

Read this whole document before touching code. It is scoped to this repository only.

## 0. Ground rules (highest priority)

1. **This is NOT the Next.js you know.** Before writing any route, page, or client
   component, read the relevant guide in `node_modules/next/dist/docs/` (resolved from
   the repo root) and heed deprecation notices. Do not assume the App Router conventions
   from your training data.
2. **Do not restructure the existing project.** No renaming or moving of existing routes,
   components, or lib modules. No Prisma schema changes, no migrations, no `db push`.
   All changes are additive: new lib module + one new client component + CSS additions +
   edits inside the named files. `getVendorCategoryOptions()` in
   `src/lib/runtime-catalog.ts` (lines 462–469) stays untouched; you add a new function
   beside it.
3. **Vendor-flow invariants are frozen.** The submitted payload field
   `application.serviceCategoryIds` remains a `string[]` of active `Category` ids
   (parent or child rows), 1–30 entries, deduped. Do not modify
   `src/lib/vendor-onboarding-validation.ts` (the schema at line 41),
   `src/lib/vendor-onboarding.ts` (active-row re-check at lines 133–137 for registration,
   283–288 for corrections, the two `INVALID_SERVICE_CATEGORY` 400 throws at lines 137
   and 286, capability creation on approve at lines 681–693),
   `src/lib/product-category-links.ts`, or the
   routes `src/app/api/vendor/register/route.ts` and `src/app/api/vendor/application/route.ts`.
   The new UI changes *which* ids the vendor can pick; it must not change *what is
   submitted or how it is validated*.
4. **Pricing and order-snapshot invariants are frozen.** Do not modify
   `src/lib/pricing-service.ts`, `src/lib/runtime-pricing-service.ts`,
   `src/lib/order-service.ts`, or `src/lib/runtime-order-service.ts`.
5. **Decided — no new vendor-facing endpoint.** The vendor portal already receives live
   admin-created categories by server-side injection: `/vendor/register`
   (`src/app/vendor/register/page.tsx:33`) and `/vendor` (`src/app/vendor/page.tsx:31`)
   call a `getVendorCategoryOptions()`-style helper at render time, and every admin
   category write already calls `revalidatePath("/", "layout")`
   (`src/app/api/admin/catalog/route.ts:475, 491, 539`) — that revalidation is what
   keeps the pages current after an admin write. **Do not assume the pages render
   per-request on their own, though:** `/vendor/register` calls no dynamic API
   (`cookies()`/`headers()`/`searchParams`) anywhere in its tree, and under this Next
   version (AGENTS.md: conventions differ) such a page may be statically rendered and
   hold a stale category list. So add
   `export const dynamic = "force-dynamic"` to **both** pages (one additive line each,
   matching the pattern already used by this repo's API routes) — then the admin
   `revalidatePath` is the entire freshness mechanism, and a category an admin adds
   (manually or via preset import) appears in the vendor dropdown on the next request
   with no other vendor-side change. Do not add any vendor-side polling or data fetch.
   A new public GET endpoint would only duplicate what the public `GET /api/products`
   (`src/app/api/products/route.ts:27`) already exposes; there is no UX gain. Consume
   the existing SSR path. Vendor code must **never** call `GET /api/admin/catalog` — it
   is gated by `requireCatalogAdmin` (`src/lib/catalog-admin.ts:6-12`, permission
   `catalog.manage` + admin role).
6. **Verification gate, run before you finish:** `npm run typecheck`,
   `npm run test:domain`, `npm run build`. All three must pass. New pure logic gets a
   colocated `*.test.ts` in the same directory, run by the existing
   `tsx --test` convention (see `src/lib/ranbazaar-category-presets.test.ts` for the
   style: `node:test` + `node:assert/strict`).
7. **CSS goes in the existing vendor CSS modules** (`vendor-registration.module.css`,
   `vendor.module.css`) and must follow `DESIGN_PROMPT.md` token discipline: consume
   `:root` tokens (`var(--...)`), never hard-code hex values; if you need a new value,
   add a token first.
8. Customer- and vendor-visible copy stays neutral and truthful: the app is a demo
   storefront; never claim a reviewer was notified or an application was approved.

## 1. What already exists (reuse, do not rebuild)

- **Live category feed for the vendor portal** — `getVendorCategoryOptions()` in
  `src/lib/runtime-catalog.ts:462-469`: Prisma query on active `Category` rows joined
  with the parent name, flattened into `{ id, name: "Parent · Child", description }`;
  on DB failure it silently falls back to the flat demo categories
  (`demoCategories`, `src/lib/data.ts:791`). Called only from the two server pages
  named above. This is the function to *generalize* (new sibling function, same
  try/catch + demo-fallback discipline).
- **Storefront visibility rule** — `storefrontCategoryWhere` at
  `src/lib/runtime-catalog.ts:413`: `{ isActive: true, OR: [{ parentId: null },
  { parent: { isActive: true } }] }`. A subcategory is hidden when its parent is
  inactive; a post-query orphan filter exists at line 431. The new vendor helper must
  use the same visibility rule plus the two-key ordering
  `[{ parentId: "asc" }, { sortOrder: "asc" }]` already used by
  `getVendorCategoryOptions` (line 464). Filter on `isActive` **only** — a freshly
  imported category with zero products must still appear; do not filter on product
  count or storefront publishability.
- **Category model** — `prisma/schema.prisma:417-437`: `Category` with self-relation
  `parentId` (onDelete SetNull), `name`, `slug`, `description`, `sortOrder`,
  `isActive`; strictly 2 levels.
- **Admin category CRUD** — POST/PATCH in `src/app/api/admin/catalog/route.ts`
  (lines 464–592), `catalog.manage` + admin gated, with the depth rule
  "one main category and one subcategory level" (lines 485, 526) and
  `revalidatePath("/", "layout")` after every write. Admin UI:
  `src/components/admin/ProductsPanel.tsx` — "Add category" / "Add subcategory" /
  "Manage categories" buttons (lines 792–794), prompt-based `addCategory`
  (lines 701–714), rename/hide drawer (lines 862–895, `saveCategory` at ~754–764
  writes `isActive`). You do not touch any of this; it is the *source* of the data
  the vendor selector must surface.
- **Registration form** — `src/components/vendor/VendorRegistrationForm.tsx`:
  section 03 "Product categories" renders a 2-column checkbox card grid,
  `div.styles.choiceGrid` with `.choiceCard` labels and hidden
  `input[name=serviceCategoryIds]` checkboxes (lines 617–633). Selection state is
  `selectedCategories: string[]` (line 126); the at-least-one rule is at lines
  372–374; the id list goes into `payload.application.serviceCategoryIds`
  (line 426) in a multipart body (`payload` JSON string + `documents` files,
  lines 441–443) to `POST /api/vendor/register`. Error plumbing: `FieldError`
  component (lines 106–109), `describedBy()` (lines 143–147), the stable key
  `"application.serviceCategoryIds"` that API error mapping reuses.
- **Existing native-select styling** — `.field input` / `.field select` rules at
  `vendor-registration.module.css:386-419` (focus ring, `aria-invalid` danger
  styling). The form already uses plain `<select>`s (state/city at lines 594–599,
  GST status at 687, document type at 730). There is **no** custom dropdown, chip, or
  datalist pattern anywhere in the vendor forms — build on native HTML.
- **Reusable checkbox-list pattern** — `.checkList` at
  `vendor-registration.module.css:698-758` (used for printing services/equipment at
  form lines 642–648 and 659–665), plus `.hint` (421–425), `.fieldError` (427–434),
  `.gridTwo`/`.fullWidth` (356–364), and the `.choiceCard`/`.checkMark`
  focus-with-`:has()` pattern (618–628) to mirror for keyboard focus.
- **Corrections (action-required) flow** — `src/components/vendor/VendorActionRequiredForm.tsx`:
  its own flat category checkbox grid at lines 295–306 styled by
  `vendor.module.css` (`.actionGroupLabel` 476, `.actionCheckboxGrid` 556,
  `.actionInlineError`/`.actionFieldError` 538–547); selection initialized from
  `application.serviceCategoryIds` (line 79), toggle at 90–95, the
  at-least-one / max-30 client check at line 119, submit via
  `PATCH /api/vendor/application` (lines 97–185, permission
  `vendor.application.update`).
- **Dashboard** — `src/components/vendor/VendorDashboard.tsx` (props at lines
  193–201, passes `categories` to the action form at line 285, summary line at 324).
- **Admin review surface** — `/admin/vendor-applications` →
  `src/components/admin/VendorApplicationsPanel.tsx` shows each application's
  categories; used in the acceptance test.

## 2. The feature to build

The vendor's "Product categories" section becomes a **two-level grouped selector**
driven entirely by live admin data: a native parent-category `<select>` that drives a
grouped sub-category checkbox list, with a compact removable chip row summarizing every
chosen "Parent · Child" pair across all parents. Keep it native-HTML-friendly: one
`<select>` + checkbox labels + buttons; no custom listbox, no ARIA listbox roles, no
third-party component.

### A. Grouped data shape (lib + server pages)

1. New module `src/lib/vendor-category-options.ts` (+ colocated
   `src/lib/vendor-category-options.test.ts`):
   - Export
     ```ts
     export type VendorCategoryGroup = {
       id: string;
       name: string;
       description: string;
       children: Array<{ id: string; name: string; description: string; parentId: string }>;
     };
     ```
     Parents always carry `children` (possibly `[]`); a parent with `[]` children is
     a selectable whole category on its own.
   - `groupVendorCategories(records)` — pure: takes flat rows shaped
     `{ id, name, description, parentId: string | null, sortOrder: number }` and
     returns `VendorCategoryGroup[]` (roots first, children nested, both ordered by
     `sortOrder`; orphans whose parent is absent from the input are dropped — the
     same orphan-guard idea as `runtime-catalog.ts:431`).
   - `categorySelectionLabels(groups, selectedIds)` — pure: returns the ordered
     display labels for the chip row, `"Parent · Child"` for child ids and the bare
     parent name for parent ids, skipping ids unknown to the groups.
   - Tests: grouping/ ordering, orphan drop, empty-input, and label formatting
     (child, parent, unknown-id, dedupe) using `node:test` + `node:assert/strict`.
2. In `src/lib/runtime-catalog.ts`, **add** (do not modify
   `getVendorCategoryOptions`) a new exported function `getVendorCategoryGroups()`:
   ```ts
   const rows = await getPrisma().category.findMany({
     where: { isActive: true, OR: [{ parentId: null }, { parent: { isActive: true } }] },
     select: { id: true, name: true, description: true, parentId: true, sortOrder: true },
     orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }],
   });
   return groupVendorCategories(rows);
   ```
   `catch` branch: map `demoCategories` (`src/lib/data.ts:791`, flat — no
   `parentId`) through `groupVendorCategories` as top-level rows
   (`parentId: null`, `sortOrder` as today) so each demo category becomes a
   self-contained group with `children: []` — the demo fallback must return the
   grouped shape too, never the old flat shape.
3. In `src/app/vendor/register/page.tsx` (line 33) and `src/app/vendor/page.tsx`
   (line 31): call `getVendorCategoryGroups()` and pass the result to the form /
   dashboard as `categoryGroups`. In the same edits, add
   `export const dynamic = "force-dynamic"` to both pages (ground rule 5). Leave
   `getVendorCategoryOptions` in place (still exported) but no page consumes it.

### B. Registration form: grouped parent select + sub-category multi-select

In `src/components/vendor/VendorRegistrationForm.tsx`:

1. New presentational client component
   `src/components/vendor/VendorCategorySelector.tsx` (used by both forms in step C):
   - Props: `groups: VendorCategoryGroup[]`, `selected: string[]`,
     `onToggle(id: string)`, `activeParent: string`, `onActiveParent(id: string)`,
     `maxSelectable: number` (pass 30), and an optional `error?: string` rendered in
     the existing `.fieldError` class.
   - Markup, inside the form's existing section 03 `fieldset` (replace the
     `.choiceGrid` block at lines 617–633):
     - **Parent `<select>`** — `.field` wrapper, label "Category group", first
       option `""` ("Choose a category group"), one option per group. On change,
       call `onActiveParent` — changing the parent only switches which sub-category
       column is visible; it never clears selections.
     - **Sub-category checkbox list** — a `.checkList`-style column for the active
       parent: first row is the parent itself ("All of <group name>"), then one
       checkbox per child (" · " indented label or child name with the group name in
       the `title` attribute). Checkboxes toggle ids via `onToggle`; when
       `selected.length >= maxSelectable`, unchecked boxes are disabled with a
       `.hint` "Choose up to 30 categories." — that disable-at-30 is the shared
       client-side cap for both forms; the per-form error semantics are stated in
       step B.2 (registration) and step C.1 (corrections). Render the empty note
       ("No subcategories under this group yet — select the group itself.") only when
       the active group is a *known* group with no children and none of its ids are
       checked. When `activeParent` is `""` or an id that belongs to no group (a
       stale/orphan id left over from a deactivated category), show a neutral
       placeholder in the checkbox column ("Pick a category group to see its
       subcategories.") instead of the empty note.
     - **Chip row** — below the two controls, `categorySelectionLabels(groups,
       selected)` rendered as removable chips: each chip shows
       "Parent · Child" (or the bare parent name) with a small `×` button calling
       `onToggle(id)`; when nothing is selected the row is hidden. Give the row
       `role="list"` and each chip `role="listitem"`; the remove button is a real
       `<button type="button">` with an `aria-label` of the chip text.
   - Checkbox keyboard focus: reuse the `.checkList` `:has(input:focus-visible)`
     outline pattern (lines 731–734), not custom focus handling.
   - New CSS classes go in `src/components/vendor/vendor-registration.module.css`
     (additive, tokens only): `.categoryCascade` (stacked wrapper), `.categoryChips`
     (wrapping chip row), `.categoryChip` (bordered pill using
     `var(--registration-control-radius)` / `var(--border-default)` /
     `var(--registration-surface)`), `.categoryChipRemove` (ghost button), and
     `.categoryEmptyNote` (muted `.hint`-style copy). The parent select reuses the
     existing `.field` rules — no select restyling. Note: `--registration-surface` /
     `--registration-control-radius` are defined on `.page`
     (`vendor-registration.module.css` lines 1–5) and are **undefined** inside the
     dashboard's `.vendorFrame` (`vendor.module.css` lines 1–5 define only
     `--vendor-*` scoped tokens), so a chip rendered there would fall back to
     `initial`. If you add the one allowed additive class to `vendor.module.css`
     (step C.1), that class must re-declare the tokens the chip needs, sourced from
     the global `:root` values — e.g.
     `--registration-surface: var(--surface-main)` (`--surface-main` at
     `src/app/globals.css:2`) and
     `--registration-control-radius: var(--radius-control)` (line 66) — so the
     chip's existing `var(--registration-*)` lookups resolve under `.vendorFrame`.
     `var(--border-default)` (globals.css line 13) is already global and needs no
     re-declaration.
2. Form wiring:
   - Prop type changes from `categories: CategoryOption[]` to
     `categoryGroups: VendorCategoryGroup[]` (line 111). Drop the now-unused local
     `CategoryOption`-shaped expectations; keep `selectedCategories` (line 126) as the
     single source of truth — the selector is stateless and reports up.
   - Add `activeParent` state, initialized to `""`. If `selectedCategories` is
     non-empty, preselect the owning group so returning users see their choices'
     context, using this exact rule: `activeParent` = the parent group id of the
     first selected **child** id; if none of the selected ids are children, the
     first selected id that **is** a root (group) id; if neither applies (the
     selected ids are all stale/orphans — Step 6 deactivation leaves historical
     ids), keep `""`.
   - Keep, unchanged: the at-least-one rule (lines 372–374) with its exact message,
     the `payload.application.serviceCategoryIds` assignment (line 426), the
     multipart submit (lines 441–443), and the `"application.serviceCategoryIds"`
     key in `fieldErrors` / `applyApiErrors` / `describedBy`. That nested
     `application.serviceCategoryIds` key is specific to this form — the corrections
     flow (step C.1) uses the flat `serviceCategoryIds` key; do not mix the two.
     Wire the selector's `error` prop to
     `fieldError("application.serviceCategoryIds")` and keep the
     `FieldError` at line 632 as the error element (with `id`
     `application-serviceCategoryIds-error` and the existing `aria-describedby`
     target `category-help`).
   - **Max-30 semantics here:** the registration form has no client-side max-30 check
     today (only the min-1 rule at lines 372–374); the 30 cap is enforced by the
     shared selector's disable-at-30 behavior plus the server-side zod `max(30)`
     (`src/lib/vendor-onboarding-validation.ts:41`), whose over-cap error surfaces
     under the `application.serviceCategoryIds` key above. Do not add a new
     client-side >30 message to this form.
   - The old hidden `input[name=serviceCategoryIds]` checkboxes disappear with the
     grid; the submit handler reads state, never `FormData`, for categories — no
     payload impact.

### C. Mirror into the corrections flow and dashboard

1. `src/components/vendor/VendorActionRequiredForm.tsx`:
   - Prop `categories: CategoryOption[]` (lines 9, 72) becomes
     `categoryGroups: VendorCategoryGroup[]`.
   - Replace the `.actionCheckboxGrid` block (lines 295–306) with
     `<VendorCategorySelector>`: `selected` stays `selectedCategories`
     (initialized at line 79 from `application.serviceCategoryIds`), `onToggle` is
     the existing `toggleCategory` (lines 90–95, keep its error-clearing behavior),
     add an `activeParent` state initialized by the same rule as step B.2 (parent
     group id of the first selected child; else the first selected root; else `""`),
     and `maxSelectable={30}`. Keep the client min-1/max-30 check at line 119 and
     the `fieldErrors.serviceCategoryIds` message at lines 305 and
     538–547 (`vendor.module.css`) rendered below the selector. This is the
     action form's client-side cap error; the shared selector's disable-at-30 also
     applies here, but do not delete or relax line 119. No change to the
     `PATCH /api/vendor/application` payload (line 147) or submit path (lines 97–185).
   - **API error key here is flat, not nested:** the PATCH body is flat
     (`serviceCategoryIds` top-level, line 147), so API error details carry
     `issue.path === "serviceCategoryIds"`, matching the existing
     `fieldErrors.serviceCategoryIds` at lines 94, 119, and 305. That is a
     different key from the registration form's `application.serviceCategoryIds`
     (step B.2) — wire this form's selector `error` prop to
     `fieldError("serviceCategoryIds")`.
   - `vendor.module.css` gets no new classes — the selector styles live in
     `vendor-registration.module.css`, imported inside the selector component
     itself; if the chip row needs to fit the action panel's narrower column, add at
     most one additive class to `vendor.module.css` (tokens only, and it must
     re-declare the chip's needed `--registration-*` tokens from the global `:root`
     values, per the CSS note in step B.1).
2. `src/components/vendor/VendorDashboard.tsx`: prop at lines 193–199 becomes
   `categoryGroups`; pass-through at line 285; the summary line at line 324
   ("N service categories selected") stays exactly as written — it counts
   `application.serviceCategoryIds`, whose shape is unchanged.
3. `src/app/vendor/page.tsx` (lines 31–33): call `getVendorCategoryGroups()` and
   pass `categoryGroups` to `VendorDashboard` (the `force-dynamic` export for this
   page comes from step A.3).

## 3. End-to-end acceptance test (you must be able to walk this)

Assuming a local dev database (`npm run db:setup`, `npm run db:bootstrap-admin`)
and `npm run dev`:

1. **Admin adds a brand-new category tree.** Sign in as the bootstrapped admin →
   `/admin/products` → "Add category": create top-level **"Custom Demo Group"** →
   "Add subcategory": create **"Custom Demo Sub"** with parent "Custom Demo Group".
   Both writes go through `POST /api/admin/catalog` and call
   `revalidatePath("/", "layout")` — no restart, no seed.
2. **Vendor sees it on the next request (force-dynamic, no vendor-side data flow).**
   New tab (unauthenticated — the register page is public) → `/vendor/register` →
   section 03: the parent dropdown contains **Custom Demo Group**; selecting it
   reveals the checkbox list "All of Custom Demo Group" + **Custom Demo Sub**. Check
   the sub-category: a chip "Custom Demo Group · Custom Demo Sub" appears under the
   list. Check one more category from a different group; both chips coexist.
3. **Vendor submits.** Fill the remaining required fields (mobile OTP flow,
   services, equipment, documents) and submit → success screen; the multipart body
   carried `application.serviceCategoryIds` with exactly the checked ids (child id
   for the sub, parent id for a whole-group check).
4. **Admin sees it.** `/admin/vendor-applications` → open the new application:
   "Custom Demo Sub" (and any other chosen category) is listed. Approve it. On a
   product with primary categoryId = the new sub-category
   (`vendorProductCategoryScope`, `src/lib/product-category-links.ts:21-26`), the
   approved vendor gains a capability row — the dispatch path
   (`vendorCoversProductCategories`) is untouched, same as before.
5. **Corrections flow.** Set the application back to ACTION_REQUIRED (or repeat with
   a second vendor) requesting a category change → `/vendor` renders
   `VendorActionRequiredForm` with the same grouped selector, pre-checked from the
   stored ids; uncheck the sub, check the whole group, resubmit via
   `PATCH /api/vendor/application` → the application's ids update; the admin panel
   reflects it.
6. **Admin deactivation propagates.** In the "Manage categories" drawer, hide
   "Custom Demo Sub" (`isActive: false`) and save → hard-refresh `/vendor/register`:
   the sub-category is gone from the list while its parent group remains selectable.
   Then hide the parent too: the whole group disappears (visibility rule at
   `runtime-catalog.ts:413`), but any already-submitted applications keep their ids
   — historical data is never rewritten.
7. Re-run the gate: `npm run typecheck`, `npm run test:domain`, `npm run build`.

## 4. Explicit non-goals

- No new API routes (public or private) and no changes to any existing route
  handler: `/api/vendor/register`, `/api/vendor/application`, `/api/admin/catalog`,
  `/api/products` all stay byte-compatible on the wire.
- No Prisma schema/migration work; `Category` stays a 2-level self-referential
  model, and the selector never exposes more than that.
- No changes to `vendor-onboarding.ts` / `vendor-onboarding-validation.ts` /
  `product-category-links.ts`: the active-id re-check, `INVALID_SERVICE_CATEGORY`,
  and approval-time capability creation are untouched.
- No custom dropdown/listbox component, no datalist, no third-party dependency;
  native `<select>` + checkboxes + buttons only.
- No changes to the admin category CRUD UI, storefront catalog, pricing, orders,
  checkout, or bulk-order flows; no i18n; no object storage; no edits to
  `src/lib/data.ts` demo rows (the fallback just groups what is already there).
- Do not make the corrections form's other fields (PIN codes, services, equipment,
  documents) hierarchical — only the category block changes.

## 5. Reporting

When done, report: files added/changed (grouped by steps A–C), the exact commands
you ran and their results (typecheck, test:domain, build, and the acceptance
walkthrough steps 1–6), and any place where you had to deviate from this document
(with the reason).