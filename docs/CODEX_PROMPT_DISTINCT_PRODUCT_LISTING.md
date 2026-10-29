# Codex task — One fully-distinct product at a time: structured listings, extra images, quantity tiers, and a per-product 3D & layout drawer

Read this whole document before touching code. It is scoped to this repository only.
It builds on two studied reference catalogs (Ezpac, `docs/research/ezpac/`, and RanBazaar,
`docs/research/ranbazaar/`) and turns "every product's description, material, 3D layout and
pricing are different" into a repeatable admin listing flow: preset prefill + ~10 quick
per-product confirmations instead of ~45 hand-tuned values. The headline rule:
**the existing product-listing flow must keep working unchanged.** Everything in this task
is additive; no Prisma migration at all.

## 0. Ground rules (highest priority)

1. **This is NOT the Next.js you know.** Before writing any route, page, or client
   component, read the relevant guide in `node_modules/next/dist/docs/` (resolved from the
   repo root) and heed deprecation notices. Do not assume the App Router conventions from
   your training data.
2. **Do not restructure the existing project.** No renaming or moving of existing routes,
   components, or lib modules. New code = new files listed in section 2 + edits inside the
   named files. New CSS only, and only in `src/components/admin/admin.module.css`.
3. **Zero Prisma schema changes. Zero migrations.** No new models, columns, enums,
   indexes, or `Product` fields in `prisma/schema.prisma` — the file must have a **zero
   diff**. All new data rides on existing JSON/text columns:
   - `Product.metadata` (Json) — `metadata.configurator.structuredDescription` (new optional key).
   - `ProductImage` rows at `sortOrder` 1–5 (the model already has `@@unique([productId, sortOrder])`, `prisma/schema.prisma:665-678`).
   - `metadata.configurator.artworkPolicy` (existing JSON; schema in `src/lib/artwork-policy-schema.ts`).
   - The existing `VisualizationTemplate` table (`prisma/schema.prisma:537-570`) — read only, plus new optional `defaults` keys inside its surfaces' artwork-policy JSON (section 2.B.3's additive type keys).
   - `Product.dimensions` stays `{ display }` — do not change it; numeric dims continue living in configuration fields + `visualizationTemplate.dimensions` (`src/lib/types.ts` `ProductVisualizationTemplate`).
   - No new `PriceTier` model: `metadata.configurator.quantityTiers` already exists and is what `src/lib/pricing-service.ts` computes from; a new table would break order-snapshot pinning.
4. **Frozen invariants in `src/app/api/admin/catalog/route.ts` (extend, never modify behavior):**
   - The single auto-created **Standard variant** (`route.ts:505,587`). Never add a second variant — pricing-service and order snapshots key off `variants[0]`.
   - `productMetadata()` **spread-preserve** of `metadata.configurator` (`route.ts:202-210`) — new keys are appended; existing keys are never deleted; the `retainedConfigurator` baseImage regex (`route.ts:205-208`) is untouched.
   - `configurationVersion` **monotonic bump on every save** (`route.ts:67-70,209`) — order snapshots pin it. Bump exactly +1 per save; never delete or reset it.
   - `personalizationFields` deleteMany+create (`route.ts:588`) keeps **field keys stable** — keys come from the same presets, so order snapshots referencing them stay valid. Do not rename keys.
   - The closed **`productModelSchema` 18-value enum** (`route.ts:47`) is untouched in this task. Extending it (e.g. `food-tray`, `slider-box`) is an optional Phase-2 follow-up; 3D gating (`route.ts:214-256`) depends on it.
   - **2-level category tree** + "industry-collections is browse-only, never primary" (`route.ts:189-199,485-530`). Prefill only writes `categoryIds` cross-links; the primary category stays a sellable one.
   - Unknown catalog body types must **keep failing validation** exactly as today (unknown `type` → 422 via the discriminated union, `route.ts:58`).
5. **UI backward compatibility is byte-identical where the admin does not opt in:**
   - QuickListProductWizard steps 1–3 render and behave exactly as today for the blank
     product path and for any user who never clicks the new "Continue with full details"
     button. The 4-item step rail only appears when the drawer was started from a
     packaging or RanBazaar starter (section 2.C.1).
   - ProductsPanel classic form, `checkProductPublishReadiness`, and both
     `category-preset-import` buttons (`route.ts:472`, `ProductsPanel.tsx:688,709`) are
     untouched; the only row change is one new ghost button (section 2.C.2).
   - Storefront readers are `undefined`-safe: a product without
     `metadata.configurator.structuredDescription` renders the plain `description`
     exactly as before; a product with one image row renders one image exactly as before;
     `Product` gains optional fields only.
   - Presets stay **non-persistent, traceability-only** (see the header doc comment at
     `src/lib/ezpac-packaging-presets.ts:1-12`): they pre-fill form state, never seed
     records; a saved product is self-contained and publish never references a preset.
6. **Pricing and order-snapshot invariants are frozen.** Do not modify
   `src/lib/pricing-service.ts`, `src/lib/runtime-pricing-service.ts`,
   `src/lib/order-service.ts`, or `src/lib/runtime-order-service.ts`. Quantity tiers
   (`quantityTiers`, `setupCharge`, `quantityMin/Max` in the existing zod) already flow
   through them; this task only makes tiers easier to enter in the admin UI.
7. **Verification gate, run before you finish:** `npm run typecheck`,
   `npm run test:domain`, `npm run build`. All three must pass. New pure logic gets a
   colocated `*.test.ts` in the same directory, run by the existing `tsx --test`
   convention (`package.json` script `test:domain`), style per
   `src/lib/ranbazaar-category-presets.test.ts` (`node:test` + `node:assert/strict`).
8. **Customer-visible copy stays neutral and truthful:** the app is a demo storefront;
   never claim a payment succeeded or that a printer/CRM was notified.
9. **CSS token discipline:** new admin UI reuses existing `admin.module.css` class
   families (`.quickListDrawer`, `.quickListContent`, `.configCard`, `.fieldGroup`,
   `.buttonGhost`, …) and only adds new classes to that one file, consuming `:root`
   tokens (`var(--...)`), never hard-coded hex values.

## 1. What already exists (reuse, do not rebuild)

- **Catalog admin route** — `src/app/api/admin/catalog/route.ts` (595 lines):
  `productSchema` (line 57), `productModelSchema` 18-value enum (line 47),
  `configurationFieldSchema` with the "enabled customer-visible select needs ≥1 option"
  refinement (line 55), `quantityTierSchema` (line 46), `productMetadata()`
  spread-preserve + version bump (lines 202-210), `assertProductPreviewAllowed`
  (lines 214-256 — the "publish a visualization template first" packaging 3D gate),
  `assertArtworkUploadPublishable` (lines 258-299), `category-preset-import` handling
  (line 472) — the precedent for new additive body types, single Standard variant
  create/update (lines 505, 587), hero `ProductImage` upsert at `sortOrder` 0
  (line 586), `serializeCatalogProduct` (lines 72-136) for `GET ?productId=`.
- **QuickListProductWizard** — `src/components/admin/QuickListProductWizard.tsx`:
  3-step drawer (rail at line 242), step-3 success card with the "Open 3D visualization
  studio" button (line 272), `payload()` (lines 138-154), `request()` (lines 156-163),
  `save()`/`upload()` two-step image attach (lines 165-214). `admin-quick-list.ts`
  already imports `createRanBazaarStarterDraft` for step 1 (line 41 `packagingDraft`).
- **Admin quick-list lib** — `src/lib/admin-quick-list.ts`:
  `createRanBazaarStarterDraft(starterId)` (line 46) — the RanBazaar prefill source;
  `autoSku` (line 100); `checkProductPublishReadiness` (lines 127-165) whose four item
  ids are `mime-types`, `physical-dimensions`, `linked-templates`,
  `packaging-visualization` (the last one non-blocking, only blocking when
  `packagingRequiresVisualization` is true).
- **ProductsPanel** — `src/components/admin/ProductsPanel.tsx` (1256 lines): product
  table rows with one ghost button per row (lines 860-888, `MoreHorizontal` at line
  886), `editProduct`'s `GET /api/admin/catalog?productId=` load (lines 740-780),
  quantity-tier table UI (lines 1106-1107), `applyRanBazaarCustomizationStarter`
  (line 632), both `category-preset-import` POSTs (lines 688, 709),
  `<ProductArtworkPolicyEditor value={artworkPolicy} onChange={setArtworkPolicy} />`
  (line 1207) and `<ProductVisualizationStudio>` in the "3D visualization studio"
  `<details>` drawer slot (lines 1221-1224).
- **Preset libraries (pure data, no DB)** —
  `src/lib/ezpac-packaging-presets.ts` (1133 lines):
  `EZPAC_PACKAGING_CATEGORY_PRESETS` (line 218, incl. the browse-only
  `industry-collections` preset at line 81),
  `EZPAC_PACKAGING_FIELD_PRESETS` (lines 330-498: generic-packaging, soap-box,
  business-card, flat-print, paper-bag, ziplock-pouch, brochure, courier-bag, with
  `admin_configured` option fields that ship with no values),
  `EZPAC_PACKAGING_PRODUCT_TYPE_PRESETS` (lines 504-1000: 55 product types, each
  `primaryCategoryId` + `primarySubcategoryId` + `collectionIds` + `fieldPresetId`;
  e.g. `food-tray` at line 893 → sub `food-trays-delivery`), helpers
  `getEzpacPackagingProductType` / `getEzpacPackagingCategory` /
  `listEzpacPackagingProductTypes` / `isEzpacPackagingProductType`
  (lines 1025-1099).
  `src/lib/ranbazaar-customization-presets.ts` (450 lines): 8 customization starters
  (notebook, name-slips, pen-pencil, …) each with fields, `surfaces`
  (`coordinateSpace`, `printableInset`, `suggestedMm`) and `listRanBazaarCustomizationStarters()`.
- **Ezpac catalog export** — `docs/research/ezpac/products.json`:
  `{ "products": [ …55 rows…] }`; each row = `{ id, title, handle, body_html, tags,
  variants[0].price (string, "0.00"–"10.00" floor — often quote-only), images[]
  (.ezpac.3d CDN URLs, 1–6 each) }`. `body_html` (54 of 55) follows one fixed 3-part
  structure: intro paragraph → `<strong>Best for:</strong>` audience line →
  `✅` feature-bullet lines. "Cake Box with handle" (handle
  `cake-box-with-handle-box-with-handle`) has an **empty** `body_html` and is
  quote-only (price "0.00"). The saved product page
  `docs/research/ezpac/product-foodtray.html` confirms the size/quantity pricing copy
  ("price is dynamically calculated based on Quantity… and Size…").
- **Artwork policy** — `src/lib/artwork-policy-schema.ts` (181 lines):
  `productArtworkPolicySchema` with `surfaces[]` (min 1 max 8), per-surface
  `coordinateSpace` / `printableBounds` / `text` / `image` policies; types
  `ProductArtworkPolicy` / `ArtworkSurfacePolicy` in `src/lib/types.ts`
  (~lines 399-402); UI in `src/components/admin/ProductArtworkPolicyEditor.tsx`
  (props `value` + `onChange`, line 146); customer preview
  `src/components/admin/SurfaceCustomerPreview.tsx` (props
  `baseImageUrl, heightMm, productPhotoUrl, sampleText, surfaceLabel, widthMm`).
- **3D binding** — published `VisualizationTemplate` rows (`prisma/schema.prisma:537`),
  resolved model via `resolveVisualizationProductModel`
  (`src/lib/visualization-studio-service-policy.ts:121`, already imported by the catalog
  route line 29), the `previewTemplate = "visualization:<id>"` convention
  (`route.ts:235`), and the admin studio at
  `src/components/admin/ProductVisualizationStudio.tsx`.
- **Storefront** — `src/lib/runtime-catalog.ts`: `product.images` → `ProductImage[]`
  (line 366), `configurator` projection (lines 373-406 — `quantityTiers`,
  `setupCharge`, `productModel`, `configurationVersion`, …); product page
  `src/app/products/[slug]/page.tsx` → `ProductEngagement`; the "practical details"
  description block in `src/components/commerce/CustomizationStudio.tsx` (line 1292,
  renders `product.description` + `product.features`). Pricing tiers already ladder
  quotes through `src/lib/pricing-service.ts` — no change needed for the price display.

## 2. The feature to build

Outcome: (a) wizard step 4 "Full details" reached from step 3 success; (b) a
`ProductLayoutDrawer` (the "3D & Layout" row action) with 7 collapsible sections and
3D/layout sub-tabs; (c) structured description, up to 6 product-image slots, and the
quantity-tier table all editable there; (d) storefront renders the structured
description and extra images; (e) a new additive `artwork-policy-override` catalog body
type saves per-product layout-element defaults without touching anything else.

### A. New pure lib modules (no DB, no Next APIs)

1. **`src/lib/ezpac-feature-bullets.ts`** (+ colocated `ezpac-feature-bullets.test.ts`)
   — the closed-vocabulary bullet set. Exact shape:
   ```ts
   export const EZPAC_FEATURE_BULLETS = [
     "custom-branding", "free-3d-studio", "moq-10", "doorstep-delivery",
     "shark-tank", "food-safe", "tamper-evident", "premium-card-stock",
     "custom-size", "no-designer-needed", "food-grade-lining", "thick-wall",
   ] as const;
   export type EzpacFeatureBullet = (typeof EZPAC_FEATURE_BULLETS)[number];

   export const EZPAC_FEATURE_BULLET_LABELS: Record<EzpacFeatureBullet, string> = {
     "custom-branding": "Custom branding & design",
     "free-3d-studio": "Free 3D design studio",
     "moq-10": "MOQ from 10 pieces",
     "doorstep-delivery": "Doorstep delivery",
     "shark-tank": "As seen on Shark Tank India",
     "food-safe": "Food-safe material",
     "tamper-evident": "Tamper-evident seal",
     "premium-card-stock": "Premium card stock",
     "custom-size": "Custom size & design",
     "no-designer-needed": "No designer needed",
     "food-grade-lining": "Food-grade inner lining",
     "thick-wall": "Thick-wall construction",
   };

   /** Export copy → closed-vocabulary key, case-insensitive substring match. */
   export const EZPAC_BULLET_MATCHERS: ReadonlyArray<[EzpacFeatureBullet, readonly string[]]> = [
     ["custom-branding", ["custom branding", "custom design"]],
     ["free-3d-studio", ["free 3d"]],
     ["moq-10", ["moq"]],
     ["doorstep-delivery", ["doorstep"]],
     ["shark-tank", ["shark tank"]],
     ["food-safe", ["food-safe", "food safe"]],
     ["tamper-evident", ["tamper"]],
     ["premium-card-stock", ["premium paper"]],
     ["custom-size", ["custom size"]],
     ["no-designer-needed", ["no designer"]],
     ["food-grade-lining", ["food-grade", "food grade"]],
     ["thick-wall", ["thick wall", "thick-wall"]],
   ];
   /** The shared default set pre-checked in the generator when no export match applies. */
   export const DEFAULT_EZPAC_BULLETS: readonly EzpacFeatureBullet[] = [
     "custom-branding", "free-3d-studio", "moq-10", "doorstep-delivery", "shark-tank",
   ];
   ```
   Tests: every label is unique; every matcher key is a member of
   `EZPAC_FEATURE_BULLETS`; "Food-safe material" matches only `food-safe`;
   "Luxury thick-wall construction" matches `thick-wall`; "MOQ starts at just 10
   pieces" matches `moq-10`.
2. **`src/lib/admin-structured-description.ts`** (+ colocated test) —
   pure parse/flatten helpers, no DB:
   ```ts
   import type { EzpacFeatureBullet } from "./ezpac-feature-bullets";

   export interface StructuredDescription {
     intro?: string;
     bestFor?: string[];
     featureBullets?: EzpacFeatureBullet[];
   }
   /** body_html → { intro, bestFor, featureBullets }; strips tags, splits on "Best for:",
    *  splits ✅-prefixed fragments against EZPAC_BULLET_MATCHERS (unmatched fragments
    *  are dropped, never invented). "" body_html returns all-undefined. */
   export function parseEzpacBodyHtml(bodyHtml: string): StructuredDescription;
   /** → plain text, exact shape (used to keep `description` in sync):
    *  `${intro}\n\nBest for: ${bestFor.join(", ")}\n✅ ${label}  ✅ ${label}…`
    *  Sections omitted when empty; output capped at 10_000 chars. */
   export function formatStructuredDescription(value: StructuredDescription): string;
   ```
   Tests: parse the **Food Tray** fixture from `docs/research/ezpac/products.json`
   (intro "Custom branded food trays for restaurants…", bestFor the 6 audiences, bullets
   `food-safe, custom-branding, free-3d-studio, moq-10, doorstep-delivery,
   shark-tank`); parse `""` → all undefined; round-trip
   `formatStructuredDescription(parseEzpacBodyHtml(foodTrayHtml))` starts with the
   intro and contains "Best for:".
3. **`src/lib/ezpac-product-mapping.ts`** (+ colocated test) — the one-time Ezpac
   export → preset mapping table. Exact shape:
   ```ts
   import type { EzpacFeatureBullet } from "./ezpac-feature-bullets";
   import type { EzpacPackagingProductTypeId } from "./ezpac-packaging-presets";

   export interface EzpacExportPrefill {
     /** e.g. ziplock: "outside paper, inside food-grade aluminium lining". */
     materialHint?: string;
     intro?: string;
     bestFor?: string[];
     featureBullets?: EzpacFeatureBullet[];
     /** 1–6 .ezpac.3d CDN image URLs, in export order (position 1 = hero). */
     imageUrls?: string[];
     /** Variant price floor, in ₹; 0 = quote-only. */
     priceRupees: number;
   }

   export interface EzpacProductPresetMapping {
     /** Only when the export title maps to a preset (52 of 55 rows). */
     presetId?: EzpacPackagingProductTypeId;
     shopifyHandle: string;
     shopifyTitle: string;
     /** "Cake Box with handle", "Display Tray", "Shagun Envelope". */
     unmapped?: true;
     prefills: EzpacExportPrefill;
   }

   export const EZPAC_SHOPIFY_PRODUCT_MAPPING: readonly EzpacProductPresetMapping[]; // 55 rows

   /** Primary subcategory slug + "Also list in" collection preset ids for the row's preset.
    *  Returns undefined for unmapped rows (category is left blank; admin picks manually). */
   export function ezpacMappingCategory(presetId?: EzpacPackagingProductTypeId):
     { primarySubcategoryId?: string; collectionIds: readonly string[] } | undefined;
   ```
   Author the 55 rows **against `docs/research/ezpac/products.json`** (title → `shopifyTitle`,
   `handle`, `variants[0].price`, up to 6 `images[].src`, and `prefills` filled with the
   parsed `intro`/`bestFor`/`featureBullets` from `body_html` via the matcher above —
   use the Food Tray parse output as the worked example). Unmapped rows:
   `display-tray`, `money-cover-envelope` ("Shagun Envelope"), and `cake-box-with-handle-box-with-handle`
   ("Cake Box with handle") carry `unmapped: true`, `presetId` absent, but keep their
   `prefills` (images, price, and — where `body_html` is non-empty — parsed copy).
   "Brand Ziplock Pouch" carries `materialHint: "outside paper, inside food-grade
   aluminium lining"` and bullets `food-grade-lining, no-designer-needed`;
   "Slider Box — Thick Wall" carries `thick-wall`.
   The test asserts: exactly 55 rows, all `shopifyHandle` values distinct, all 55 handles
   present in `docs/research/ezpac/products.json` (read the file in the test), the 3
   unmapped rows are exactly the three above, and mapped rows' `presetId`s exist in
   `EZPAC_PACKAGING_PRODUCT_TYPE_PRESETS`.

### B. Catalog route: additive schema, new body type, extra images, template list

All changes in `src/app/api/admin/catalog/route.ts`. Nothing in this section changes
existing behavior for existing payloads.

1. **New optional `productSchema` keys** (line 57 object, inserted after
   `productModel`). `productSchema` is a non-strict object today, so two new
   **optional** keys are simply accepted (nothing about existing behavior changes):
   ```ts
   import { EZPAC_FEATURE_BULLETS } from "@/lib/ezpac-feature-bullets";

   const structuredDescriptionSchema = z.object({
     intro: z.string().trim().max(2000).optional(),
     bestFor: z.array(z.string().trim().min(1).max(120)).max(12).optional(),
     featureBullets: z.array(z.enum(EZPAC_FEATURE_BULLETS)).max(EZPAC_FEATURE_BULLETS.length).optional(),
   }).strict();

   // added to productSchema — both optional, additive:
   structuredDescription: structuredDescriptionSchema.optional(),
   /** Slot 0 (hero) remains `imageUrl`; this is slots 1–5, each a catalog image URL. */
   extraImages: z.array({ url: catalogImageUrlSchema, width: z.number().int().positive().optional(), height: z.number().int().positive().optional() }).max(5).optional(),
   ```
   Note `catalogImageUrlSchema` (line 35) already accepts external https URLs, so export
   CDN links work as-is.
2. **`productMetadata()`** (lines 202-210): add **one appended key** inside
   `configurator: { … }`:
   ```ts
   structuredDescription: input.structuredDescription ?? currentConfigurator.structuredDescription ?? null,
   ```
   Spread-preserve, the baseImage regex, and `nextConfigurationVersion` stay untouched —
   the version still bumps on every save, exactly as today.
3. **Extra image rows (POST + PATCH).** Slot 0 continues to use the existing
   `imageUrl` → `images.upsert` at `sortOrder` 0 (`route.ts:505,586`) — untouched. Add a
   helper and call it in both handlers' Prisma write:
   ```ts
   async function writeExtraProductImages(
     prisma: ReturnType<typeof getPrisma>,
     productId: string,
     extraImages: z.infer<ReturnType<typeof extraImagesField>> | undefined, // array or undefined
     altText: string,
   ) {
     // extraImages === undefined  → leave existing rows as-is (classic form sends no key).
     // defined → desired = the full slot-0..5 URL list (imageUrl + extraImages entries),
     // upsert rows at sortOrder 1..5 in order (dedupe by URL), then delete any
     // ProductImage rows with sortOrder > (URL list length - 1) for this product.
   }
   ```
   Keep the slot-0 upsert exactly where it is; the helper is additive work inside the
   same transaction. Existing products (no `extraImages` key ever sent) keep exactly
   their current single row.
4. **New body type `artwork-policy-override`** — additive discriminated-union member,
   mirroring the `category-preset-import` precedent at `route.ts:472`:
   ```ts
   const artworkPolicyOverrideSchema = z.object({
     type: z.literal("artwork-policy-override"),
     id: z.string().trim().min(1).max(100),
     /** A full artwork policy whose surface ids are a subset of the product's
    *  configured print areas; `defaults` keys are new optional additive fields (B.3). */
     artworkPolicy: productArtworkPolicySchema,
   }).strict();
   ```
   In `PATCH`, before the existing `id` parse at line 516, switch on
   `body.type === "artwork-policy-override"` (same early-exit pattern as
   `body.type === "category"` at line 518): load the product, parse with
   `artworkPolicyOverrideSchema` (validation error → 422 via `validationError`), verify
   the product exists (404 as today), verify each `surfaces[].id` matches one of the
   product's configured print-area ids in `metadata.configurator.printAreas` (same rule
   the `productSchema` superRefine applies, `route.ts:57` — mismatch → 422
   `ARTWORK_POLICY_SURFACE_INVALID`), then
   ```ts
   const configurator = objectRecord(objectRecord(existing.metadata).configurator);
   const metadata = { ...objectRecord(existing.metadata),
     configurator: { ...configurator, artworkPolicy: parsed.data.artworkPolicy,
                     configurationVersion: nextConfigurationVersion(configurator) } };
   await prisma.product.update({ where: { id: id.data.id }, data: { metadata } });
   ```
   **This writes ONLY `configurator.artworkPolicy` + the version bump** — no name,
   price, variants, personalization fields, status, or images are touched. Then
   `revalidatePath("/", "layout")` and return the re-serialized product
   (`serializeCatalogProduct` + `categoryIds`), status 200. Unknown `type` values must
   still fall through to today's validation failure.
5. **`defaults` element keys (additive policy schema extension).** In
   `src/lib/artwork-policy-schema.ts`, add to `textPolicySchema` and
   `imagePolicySchema` (both `.strict()` objects — extend in place, defaults optional,
   existing documents validate unchanged):
   ```ts
   // inside textPolicySchema:
   defaultTextLayers: z.array(z.object({
     label: z.string().trim().min(1).max(80),
     sampleText: z.string().trim().min(1).max(120),
     geometry: geometrySchema,
     color: colour,
     fontSize: z.number().finite().min(1).max(1_000),
     fontFamily: fontFamilySchema,
     fontWeight: z.number().int().min(100).max(900),
     rotation: z.number().finite().min(-360).max(360),
   }).strict()).max(8).optional(),
   // inside imagePolicySchema:
   defaultImageLayers: z.array(z.object({
     label: z.string().trim().min(1).max(80),
     geometry: z.object({ x: finiteCoordinate, y: finiteCoordinate,
                           width: positiveSize, height: positiveSize, rotation: z.number().finite().min(-360).max(360) }).strict(),
   }).strict()).max(8).optional(),
   ```
   and to the matching `ArtworkTextPolicy` / `ArtworkImagePolicy` interfaces in
   `src/lib/types.ts` (lines ~340-402):
   ```ts
   defaultTextLayers?: Array<{ label: string; sampleText: string; x: number; y: number; width: number; height: number; rotation: number; color: string; fontSize: number; fontFamily: ArtworkFontFamily; fontWeight: number }>;
   defaultImageLayers?: Array<{ label: string; x: number; y: number; width: number; height: number; rotation: number }>;
   ```
   Extend `surfacePolicySchema`'s `superRefine` with: when present, every
   `defaultTextLayers[i].geometry` / `defaultImageLayers[i].geometry` must lie inside
   the surface's `printableBounds` (reuse the existing default-placement check at
   lines 150-157 as the template; violation →
   "Default element placement must remain inside the printable bounds.").
   `product-configuration.ts` and the customer editor keep working: unknown keys in the
   persisted JSON are ignored by them today; no snapshot type changes.
6. **GET `?productId=` response extensions** (line 443-445, additive keys only):
   - `structuredDescription: configurator.structuredDescription ?? null`
   - `extraImages: product.images.filter((i) => i.sortOrder >= 1)` (rows already
     `orderBy: sortOrder asc` at line 443) — `Array<{ url, altText, width, height }>`.
   - `publishedVisualizationTemplates`: from the same `?productId=` handler, fetch
     ```ts
     const templates = await prisma.visualizationTemplate.findMany({
       where: { productId, status: "PUBLISHED" },
       select: { id: true, productType: true, geometry: true, dimensions: true, version: true, publishedAt: true },
       orderBy: [{ publishedAt: "desc" }, { version: "desc" }],
       take: 10,
     });
     ```
     and expose `templates.map((t) => ({ id: t.id, version: t.version,
     productType: t.productType ?? "", model: resolveVisualizationProductModel(t) ?? "" }))`
     (`resolveVisualizationProductModel` is already imported at line 29).

### C. Admin UI (new additive surfaces; classic flow byte-identical)

1. **Wizard step 4 — "Full details"** in
   `src/components/admin/QuickListProductWizard.tsx`:
   - **Gate:** the rail (line 242) shows 4 items — "Pick a starter", "Essentials",
     "Images & publish", "Full details" — **only** when `starterMode` is `"packaging"`
     or `"ranbazaar"` (blank stays 3 items, today's exact behavior).
   - **Entry:** on step-3 success (line 272 `quickListSuccess` card), add a second
     button **"Continue with full details"** next to "Open 3D visualization studio":
     `onClick → setStep(4)`. Nothing else in the success card changes.
   - **Step 4 content** — a `quickListContent` grid (form column + preview column with
     the existing `SurfaceCustomerPreview`):
     - **Section 0 "Start from preset / export"** (banner, `configCard`): two buttons —
       "Prefill from RanBazaar starter" (re-shows the step-1 starter cards via
       `createRanBazaarStarterDraft`, the same path `ProductsPanel.tsx:633` uses) and
       "Prefill from Ezpac export" (packaging mode only): a `<select>` over
       `EZPAC_SHOPIFY_PRODUCT_MAPPING` (label `shopifyTitle`, value `shopifyHandle`).
       On pick, prefill — name = `shopifyTitle`, price = `prefills.priceRupees`
       (the floor; admin edits), category = `ezpacMappingCategory(presetId)`'s
       subcategory record (matched in `categories` by slug, same logic as
       `applyProductTypeStarter` at `ProductsPanel.tsx:600`), "Also list in" = the
       matching `collection-*` category ids, material = `prefills.materialHint`,
       structured description = parsed `intro`/`bestFor`/`featureBullets`, image URLs
       = `prefills.imageUrls` (slot 0 = first), and set `productType` to the preset id
       where mapped. Unmapped rows show an inline **"Unmapped"** `StatusBadge` next to
       the select and leave category blank (admin picks in Essentials).
     - **Section 1 "Essentials"** — name (+ auto-SKU row, existing `autoSku` wiring at
       lines 83-103 stays), price (₹, the floor), category select, "Also list in"
       multi-select (checkbox list, ids into `categoryIds`), material free-text.
     - **Section 2 "Material & spec fields"** — render `draft.configurationFields`
       rows (the preset's fields: ziplock-pouch capacity/gusset/lining window,
       soap-box's 14 fields, …). Every `admin_configured` select arrives **disabled
       with the visible hint "Configure supported choices, then enable this field for
       customers."** (the existing `helpText` convention, `admin-quick-list.ts:70-72`);
       enabling one requires typing ≥1 option label in its comma box — the existing
       quick-list semantics; the server rule is `configurationFieldSchema`
       (`route.ts:55`), unchanged.
     - **Section 3 "Description (generator)"** — three controls: `intro` textarea
       (max 2000), `bestFor` comma box (max 12 audiences, each max 120 chars), and a
       checkbox list of the 12 `EZPAC_FEATURE_BULLETS` tags (labels from
       `EZPAC_FEATURE_BULLET_LABELS`). Live preview card below flattens via
       `formatStructuredDescription`. A **"Regenerate plain description"** button sets
       `description` = the flattened copy (max 10_000) so both the structured block and
       the classic `description` path stay in sync. On save, the step-4 payload sends
       **both** `description` (flattened when any of the three is set, else the
       step-2 text) and `structuredDescription` (omit the key when all three are empty —
       classic products stay byte-identical).
     - **Section 4 "Images grid"** — 6 slots (slot 0 = hero, bound to the existing
       `imageUrl` / upload flow, untouched; slots 1–5 = the new `extraImages`
       array): each slot is a URL input + thumbnail preview + file picker (file picks
       reuse the two-step `upload()` pattern at lines 165-172, `kind="primary"` is
       not used for slots 1–5; instead slots 1–5 accept pasted URLs, including the
       export CDN links, while a picked file is uploaded via the existing
       `POST /api/admin/catalog/images` pattern and its `/api/product-images/<id>` URL
       dropped into the slot). "Import URLs from export" button pre-fills all
       `prefills.imageUrls` (1–6) into slots; a "mark hero" toggle per slot moves that
       slot's URL to slot 0.
     - **Section 5 "Pricing & tiers"** — `quantityMin` / `quantityMax` number inputs
       (existing defaults 1 / 100) + the quantity-tier table (row = minimum qty + ₹
       price delta + optional customer label; add/remove rows — port the
       `ProductsPanel.tsx:1106-1107` table markup into the wizard) + `setupCharge`.
       Server-side, `quantityTierSchema` (`route.ts:46`) plus the existing uniqueness
       and within-range checks (`route.ts:57` superRefine) apply unchanged. Copy line
       under the table (neutral): "Higher quantity → lower price; 1000+ orders go to
       the bulk inquiry form."
     - **Section 6 "3D & Layout"** — same controls as the drawer tab in
       `ProductLayoutDrawer` (C.2), sharing one component: see C.2.
     - **Footer save** — step 4 replaces the footer Continue button with
       "Save draft" / "Save & publish", calling the existing `save()` with the step-4
       `payload(false|true, imageUrl)` extended with `structuredDescription` and
       `extraImages` (only when non-empty — omitted keys keep old products
       byte-identical). Publish readiness checklist (line 260) is shown in step 4
       again, with the `packaging-visualization` item rendered "not applicable" for
       non-packaging types (C.2 rule).
   - **Wizard CSS:** reuse `.quickListContent` / `.quickListForm` / `.configCard` /
     `.fieldGroup`; add at most a few new classes to `admin.module.css`
     (e.g. `.quickListSection` collapsible header) following token discipline.
2. **`ProductLayoutDrawer` — new file
   `src/components/admin/ProductLayoutDrawer.tsx`** (drawer shell mirrors
   `QuickListProductWizard`'s `drawer`/`drawerHeader`/`drawerBody`/`drawerFooter`,
   reusing the same classes):
   - **Preload:** `GET /api/admin/catalog?productId=<id>` on open (the
     `editProduct` pattern, `ProductsPanel.tsx:740-780`); shows name, status badge,
     and the 7 collapsible sections (`<details className={…}>` blocks, one each,
     the first open by default): **0 "Start from preset / export"** (only when the
     product's `productType` resolves a `EZPAC_SHOPIFY_PRODUCT_MAPPING` row — buttons
     "Prefill from Ezpac export" / "Prefill from RanBazaar starter" as in C.1),
     **1 Essentials**, **2 Material & spec fields**, **3 Description generator**,
     **4 Images grid**, **5 Pricing & tiers** (sections 1–5 reuse the same field
     components as wizard step 4; extract them into one shared
     `src/components/admin/ProductFullDetailsSections.tsx` used by both), and
     **6 "3D & Layout"** — sub-tabs "3D binding" | "Layout editor":
     - **3D binding tab:** a radio group — "No 3D for now" (`allow3D: false`,
       `previewTemplate` cleared) — and one radio per entry of
       `publishedVisualizationTemplates` (B.6): label "v<version> · <model>".
       Selecting one sets `allow3D: true` and `previewTemplate:
       "visualization:<id>"` in the save payload. A visible hint under the group:
       "Publish a confirmed visualization template in the 3D studio first — a draft
       does not enable previews. The product model must match the template's resolved
       model." The server gate (`assertProductPreviewAllowed`, `route.ts:214-256`)
       enforces the match; the UI hint is non-blocking.
     - **Layout editor tab (RanBazaar `/admin/customize-product-img` equivalent):**
       for each surface in the loaded `artworkPolicy` (fall back to
       `buildDefaultAdminArtworkPolicy` when null, as `ProductsPanel.tsx:768-771`
       does): render `<ProductArtworkPolicyEditor value={policy}
       onChange={setPolicy} />` **per surface** (a surface picker above the editor),
       plus a new **per-surface element panel** "Text elements" / "Image slots":
       add/remove/reorder rows bound to `surface.text.defaultTextLayers` and
       `surface.image.defaultImageLayers` (B.5).
       - Text element row inputs: `name` (label), `x`, `y`, `width`, `height`,
         `maxLength` (→ sample length cap), `required`, `color` (from the
         surface's `allowedColors` select), `fontSize`, `fontFamily` (from
         `allowedFontFamilies`), `fontWeight`, `rotation`.
       - Image slot row inputs: `name` (label), `x`, `y`, `width`, `height`
         (**new slots default to 200×200 at x=50, y=50**, the RanBazaar
         `customerImg` default), constrained to the surface's `printableBounds`
         (the B.5 superRefine enforces it server-side; the UI clamps on save and
         shows the 422 message otherwise).
       - **Save** (footer "Save layout" button): `PATCH /api/admin/catalog` with
         body `{ type: "artwork-policy-override", id, artworkPolicy: <full policy
         including the edited defaults> }` (B.4). On 200: `loadCatalog()` refresh +
         success status line. Save writes only `configurator.artworkPolicy` + bumps
         `configurationVersion` by exactly 1 — nothing else on the product changes.
       - Beside the surface: `<SurfaceCustomerPreview>` with `sampleText` = the
         first text element's `sampleText` (fallback "Sample") so the admin sees the
         new layout's sample render before saving.
   - **ProductsPanel row button (C.3 wiring):** in the product table's last `<td>`
     (`ProductsPanel.tsx:886`, next to the `MoreHorizontal` ghost button) add one
     ghost button, labeled with a `LayoutTemplate`-style icon and `aria-label`
     `"Open 3D and layout editor for <name>"`, text "3D & Layout". New state
     `layoutProductId`; when set, mount
     `<ProductLayoutDrawer productId={layoutProductId} onClose={…} onSaved={() => loadCatalog()} />`.
     The drawer's own save paths: full-product PATCH (sections 1–5, same `payload`
     shape as the wizard with `id` attached — classic `createProduct`-style payload
     minus image files, reusing `editProduct`'s loaded values as the base) and the
     `artwork-policy-override` PATCH (tab save).
3. **Shared payload builder.** Extract the step-4/full-details payload assembly into
   `src/components/admin/product-details-payload.ts` (pure, client-safe):
   `buildFullDetailsPatch(base: EditingProduct-shape, overrides) →
   { type: "product", id, …all productSchema fields, structuredDescription?,
   extraImages? }` — both the wizard (C.1) and the drawer (C.2) call it, so the two
   surfaces can never diverge on field order or defaults. `structuredDescription` /
   `extraImages` are omitted when empty.

### D. Storefront readers (all `undefined`-safe)

1. **`src/lib/types.ts`:** in `Product.configurator` (line ~126) add
   ```ts
   structuredDescription?: { intro?: string; bestFor?: string[]; featureBullets?: string[] };
   ```
   and (per B.5) the two optional `defaultTextLayers` / `defaultImageLayers` fields on
   `ArtworkTextPolicy` / `ArtworkImagePolicy`. Undefined for every existing product.
2. **`src/lib/runtime-catalog.ts`:** in the `configurator` projection (lines 373-406)
   add one line:
   ```ts
   structuredDescription: mappedStructuredDescription(configurator.structuredDescription, product.id),
   ```
   where `mappedStructuredDescription` (new local helper, same defensive style as
   `mappedQuantityTiers` / `mappedSetupCharge`) returns `undefined` for absent/invalid
   values — never throws.
3. **Product page** (`src/app/products/[slug]/page.tsx`'s render tree — the
   "practical details" block currently at `CustomizationStudio.tsx:1292` and the
   `ProductEngagement` copy): render, when
   `product.configurator?.structuredDescription` has any part: intro paragraph, then a
   "Best for:" line (`bestFor` joined with commas), then a `✅` bullet list (labels
   from `EZPAC_FEATURE_BULLET_LABELS`, unknown keys dropped). **Otherwise render
   `product.description` exactly as today — zero markup change for legacy products.**
4. **Images:** no reader change required for extra rows —
   `runtime-catalog.ts:366` already maps every `ProductImage` row (`orderBy sortOrder
   asc`, line 413) into `product.images`, hero first; the product page's image strip /
   `ProductVisual` (`src/components/commerce/ProductVisual.tsx`) gains nothing unless a
   thumbnail strip is missing today — if one is missing, add a simple
   thumbnail-strip loop over `product.images` (100px thumbs, hero first, clicking
   swaps the hero `<img>`; new CSS class in the commerce module, tokens only).
   A product with one image renders exactly as before.
5. **Tiers & 3D:** nothing to change. `pricing-service.ts` already ladders quotes
   from `quantityTiers` + `setupCharge`; 3D preview enables itself from
   `allow3D` + `previewTemplate` + a PUBLISHED template via the existing
   `product-configuration.ts` gating.

### E. Wireframes (layout reference)

```
Wizard rail (packaging/RanBazaar path only):
[1 Pick a starter] [2 Essentials] [3 Images & publish] [4 Full details]

Step 4 / drawer, two columns:
┌─ form column ─────────────────────────────┐ ┌─ preview column ──────────┐
│ ▸ Start from preset / export  [banner]    │ │  SurfaceCustomerPreview   │
│ ▾ Essentials  (name, ₹ price, category,  │ │  (sample text / photo)     │
│    also-list-in, material)               │ │                           │
│ ▸ Material & spec fields (admin selects   │ └───────────────────────────┘
│    disabled + hint)                       │
│ ▾ Description generator                    │
│    [intro…] [bestFor comma…] [12 ✅ tags]  │
│    preview: flattened copy   [Regenerate]  │
│ ▸ Images (6 slots: hero + 5) [Import URLs] │
│ ▸ Pricing & tiers [min/max] [tier rows]    │
│ ▾ 3D & Layout  ○ no 3D  ○ v2 · paper-bag  │
│   [3D binding | Layout editor]             │
│   Layout editor: surface picker +         │
│   ProductArtworkPolicyEditor +            │
│   text/image element rows (x,y,w,h,…)     │
└────────────────────────────────────────────┘
Footer: [Back] … [Save draft] [Save & publish]   (drawer: [Save layout] [Close])
```

## 3. End-to-end acceptance test (you must be able to walk this)

Prereq: local dev database — `npm run db:setup` + `npm run db:bootstrap-admin`, then
`npm run dev`. Categories already imported via the existing "Import packaging groups" /
"Import RanBazaar groups" buttons (`POST category-preset-import`,
`ProductsPanel.tsx:688,709`).

**A — No migration, no breakage**
1. `git diff prisma/schema.prisma` is **empty** → **no new tables/columns/indexes/migrations**.
   (Avoid running `npx prisma migrate diff` in sandboxed environments as Windows blocks query-engine binary spawning with `spawn EPERM`; `git diff prisma/schema.prisma` is the source of truth).
2. `npm run test:domain` → all existing suites green, including
   `admin-quick-list.test.ts`, the catalog/artwork-policy tests
   (`artwork-policy.test.ts`, `artwork-policy-schema.test.ts`), plus your new
   colocated tests (A.1–A.3 of section 2).

**B — Distinct-product listing (Food Tray, size-priced)**
3. Admin → Products → "Quick add product" → Packaging starter: **Food Tray** →
   step 2: name/slug/SKU/category prefilled, price 10.00 entered → step 3 →
   **"Continue with full details"**.
4. Section 0: "Prefill from Ezpac export" → pick **Food Tray** → intro, "Best for"
   line, 6 ✅ bullets, 1 CDN image in slot 0, primary subcategory
   `food-trays-delivery`, collection "Food Packaging" auto-checked.
5. Section 2: material "Corrugated, food-safe" typed; a `material`-style
   `admin_configured` select enabled by adding 2 option labels.
6. Section 4: "Import URLs from export"; slot 0 (hero) left as the first CDN link.
7. Section 5: tiers min10 Δ0, min50 −10, min100 −20; `quantityMin` 10,
   `quantityMax` 1000 — wait, the schema caps `quantityMax` at 1000 via
   `z.max(1000)` on `quantityMin/quantityMax` (`route.ts:57`): set `quantityMax` to
   1000; `setupCharge` 0. Save as **draft**. Row appears with "Draft".
8. Row → **"3D & Layout"** → Layout tab: on surface `primary`, add text element
   "Store name" (`maxLength` 14, x=20, y=10, bold weight) → **Save layout**. Network
   shows `PATCH /api/admin/catalog` body `{ "type": "artwork-policy-override", "id",
   "artworkPolicy" }` → 200; `metadata.configurator.configurationVersion` incremented
   by exactly 1; product name/price/variants unchanged (compare a second GET).
9. Upload the hero image via the existing images endpoint, switch to **Publish now**
   → the readiness panel shows all blocking items green → publish.
10. Storefront `/products/<slug>`: shows intro + "Best for:" + ✅ bullets, all 6
    images with the chosen hero first, the quote ladders at qty 50 (−10) via the
    existing pricing flow, and 3D preview **disabled** with the
    "publish a visualization template first" hint.
11. Studio: publish a `VisualizationTemplate` for the tray → back to the 3D & Layout
    tab → the template radio appears → select it → save → 3D preview enabled
    (`productModel` auto-matched by the server gate).

**C — Unmapped + quote-only (Cake Box with handle)**
12. New quick-add → section 0 prefill → "Cake Box with handle" shows the **Unmapped**
    badge → admin manually picks a sellable category (e.g. boxes → a subcategory),
    leaves the structured description empty, price 0.00 (quote flow) → save draft →
    publish works with no description (description is optional, `route.ts:57`).

**D — RanBazaar product (Notebook with per-product layout)**
13. New quick-add → "Prefill from RanBazaar starter: Notebook" → step 4 → Layout tab:
    add 1 image slot (top, 200×200 @ x=50, y=50) + "Name" text element below it at
    exact x/y, `maxLength` 18 → Save → the `SurfaceCustomerPreview` beside it renders
    the sample text with the new layout.
14. Publish readiness panel: all blocking items green (mime-types,
    physical-dimensions, linked-templates; the packaging-visualization item renders
    "not applicable" for non-packaging types).

**E — Backward compatibility spot-check**
15. Open ANY pre-existing classic product in the advanced form (ProductsPanel) and save
    with no new fields → 200, `configurationVersion` +1, its image row count
    unchanged, order quotes still compute (check one pending bulk/quote request),
    storefront page unchanged (no `structuredDescription` block rendered).

**Exit criteria:** A.1–A.2 (no schema diff, tests green), B.10 (new description +
tiers live on storefront), C.12 (unmapped path works), E.15 (old flow
byte-identical).

## 4. Explicit non-goals

- **No Prisma work of any kind** — no new models/fields/migrations; `db push` must
  be a no-op. (If `prisma migrate diff` in A.1 ever shows a diff, stop and fix the
  work, do not commit the migration.)
- **No `productModelSchema` enum extension** (`route.ts:47` stays 18 values;
  `food-tray` / `slider-box` values are a documented Phase-2 follow-up).
- **No `PriceTier` model, no changes to `pricing-service.ts`,
  `runtime-pricing-service.ts`, `order-service.ts`, `runtime-order-service.ts`**,
  order snapshots, or checkout.
- **No `extraImages`-style key in the classic ProductsPanel form** — the new keys are
  sent only by the wizard step 4 and the `ProductLayoutDrawer` (via
  `buildFullDetailsPatch`); the classic form's payload stays exactly as today.
- **No auto-seeding of products** from the mapping table or presets (traceability
  only, `ezpac-packaging-presets.ts:1-12`); the admin always confirms and saves.
- **No vendor flow, bulk-order form, i18n, object storage, or new public routes.**
- **No changes to `ArtworkDocumentSnapshot` / customer editor layer types** —
  `defaultTextLayers` / `defaultImageLayers` are admin-authored defaults on the
  policy; the customer canvas consumes them only as pre-placed sample layers, and
  snapshot types stay untouched.
- **No edits to `src/lib/data.ts` demo rows**; demo fallbacks keep today's shapes.

## 5. Reporting

When done, report: files added/changed grouped by steps A–E of section 2; the exact
commands run with results (`npm run typecheck`, `npm run test:domain`, `npm run
build`, and the `git diff prisma/schema.prisma` output
proving a zero schema diff); the acceptance-test walkthrough outcome for A–E of
section 3; and any place where you deviated from this document (with the reason).