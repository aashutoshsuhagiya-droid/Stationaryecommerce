# Codex task — Close the "upload → customize → order" loop (RanBazaar-style personalization)

Read this whole document before touching code. It is scoped to this repository only.

## 0. Ground rules (highest priority)

1. **This is NOT the Next.js you know.** Before writing any route, page, or client
   component, read the relevant guide in `node_modules/next/dist/docs/` (resolved from
   the repo root) and heed deprecation notices. Do not assume the App Router conventions
   from your training data.
2. **Do not restructure the existing project.** No renaming or moving of existing routes,
   components, or lib modules. No edits to existing Prisma models. All database changes are
   **additive**: one new model plus a `prisma db push` + `npm run db:generate` cycle.
   Existing pages keep their behavior; you add new UI inside existing panels.
3. **Pricing and order-snapshot invariants are frozen.** Browser totals are never
   authoritative; quotes/orders go through the existing pricing service. Do not modify
   `src/lib/pricing-service.ts`, `src/lib/runtime-pricing-service.ts`,
   `src/lib/order-service.ts`, `src/lib/runtime-order-service.ts`, or the checkout demo
   boundary. Uploaded customer photos already flow through the existing private
   artwork-asset claim pipeline — do not invent a parallel one.
4. **Verification gate, run before you finish:** `npm run typecheck`,
   `npm run test:domain`, `npm run build`. All three must pass. New pure logic gets a
   colocated `*.test.ts` in the same directory, run by the existing
   `tsx --test` convention (see `src/lib/artwork-upload.test.ts` for the style).
5. Customer-visible copy must stay neutral and truthful: the app is a demo storefront;
   never claim a payment succeeded or that a printer/CRM was notified.

## 1. What already exists (reuse, do not rebuild)

- **Product configuration contract** — `src/lib/product-configuration.ts`
  builds `ProductConfigurationSchema` per product: modes, variants, personalization fields,
  artwork surfaces/policies, uploads flag, pricing rules, readiness flags. The customer
  studio consumes exactly this; extend it, don't fork it.
- **Customer studio** — `/products/[slug]` → `src/components/commerce/CustomizationStudio.tsx`
  → `src/components/configurator/ArtworkEditor.tsx` (SVG editor: text layers, image layers,
  drag/resize/rotate, undo/redo, safe-area guides). The editor already accepts a
  `baseImages?: Record<surfaceId, url>` prop and renders the base image under the layers
  (`ArtworkEditor.tsx` ~line 781). Today that map is built only from visualization-template
  texture URLs and personalization-template production surfaces (CustomizationStudio ~line
  550) — **the product's own uploaded images are not in it. That is the main gap.**
- **Customer photo uploads** — `POST /api/artwork-assets` (rate-limited, decoded-raster
  validation via `src/lib/artwork-upload.ts`, private storage via
  `src/lib/artwork-assets.ts`, opaque claim tokens attached at checkout). Keep it.
- **Admin product editor** — `/admin/products` → `src/components/admin/ProductsPanel.tsx`
  with the persisted API `src/app/api/admin/catalog/route.ts` (zod-validated,
  `catalog.manage` + Super Admin). It already supports: configuration fields, printable
  surfaces with mm dimensions, artwork-upload toggle + accepted MIME types, per-surface
  placement policy editor (`ProductArtworkPolicyEditor`), RanBazaar customization starters
  (`src/lib/ranbazaar-customization-presets.ts`) and category import, design template links,
  quantity tiers, publish toggle. **The only missing admin action is uploading images from
  disk** — the "Product image URL" field and the TemplateManager "Base image URL" field
  (`src/components/admin/TemplateManager.tsx` ~line 316) are URL-paste-only.
- **Precedent for serving stored image bytes** — `src/app/api/visualization-assets/[id]/route.ts`
  (ETag, rate limit, strict CSP headers, database `Bytea` storage via
  `VisualizationAsset`). `POST /api/visualization-assets` + `src/lib/visualization-studio-upload.ts`
  show the multipart-into-database upload pattern. Mirror these patterns.
- **Admin order/design review** — `/admin/customizations` and
  `src/lib/artwork-review.ts` + `GET /api/artwork-assets/[id]` (permission-scoped) already
  let admins see customer artwork. Verify, don't rewrite.

## 2. The feature to build

An admin uploads images from the admin panel; a customer then sees that base image inside
the product's 2D studio, adds their name and a photo, and places an order — end to end.

### A. New image storage (additive schema)

1. Add **one** new Prisma model to `prisma/schema.prisma`, e.g.
   ```
   model ProductImageAsset {
     id          String   @id @default(cuid())
     productId   String
     kind        String   // "primary" | "gallery" | "surface-base"
     surfaceId   String?  // set when kind = "surface-base"
     altText     String?  @db.VarChar(240)
     mimeType    String
     sizeBytes   Int
     width       Int
     height      Int
     sha256      String
     content     Byte
     createdAt   DateTime @default(now())
     updatedAt   DateTime @updatedAt
     product     Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
     @@index([productId, kind])
   }
   ```
   Add the `imageAssets ProductImageAsset[]` relation on `Product` (additive). Then
   `npm run db:generate` and `npm run db:push`. Follow how `ArtworkAsset`/`VisualizationAsset`
   store bytes; note in a comment that object storage is the production cutover (do NOT
   build object storage now).
2. New service module `src/lib/product-image-assets.ts` (+ colocated test):
   - `createProductImageAsset({ productId, kind, surfaceId?, file })` — decode/validate the
     raster exactly like `validateArtworkUpload` (JPG/PNG/WEBP only, ~10 MB cap, dimension
     sanity checks, reject animated/web-shape payloads), store sha256 + dimensions.
   - `getProductImageAssetForServing({ id, ifNoneMatch })` — returns bytes/headers or an
     error, modeled on `visualization-studio-public-assets.ts`.
3. New public serving route `src/app/api/product-images/[id]/route.ts` — GET, mirroring
   `src/app/api/visualization-assets/[id]/route.ts` (rate limit via `consumeRateLimit`,
   `ETag`/304, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`,
   `Cross-Origin-Resource-Policy: same-origin`, `Cache-Control` like the visualization route).

### B. Admin upload endpoints

New route `src/app/api/admin/catalog/images/route.ts` (multipart, Node runtime,
`force-dynamic`), gated exactly like the catalog route: `assertSameOrigin` +
`requireRequestActor(request, "catalog.manage")` + Super Admin check (extract or reuse the
logic from `requireCatalogAdmin` — a small shared helper is fine; do not change the existing
route's behavior):

- `POST` form fields: `productId`, `kind` (`primary` | `gallery` | `surface-base`),
  `surfaceId` (required for `surface-base`, must match one of the product's configured
  print-area IDs), `altText`, file `image`.
  - Creates a `ProductImageAsset` row.
  - For `kind=primary`: also upsert the product's `ProductImage` (sortOrder 0) with
    `url = /api/product-images/<assetId>` — this makes the storefront product photo, cart,
    and order snapshots show the uploaded image with **zero** changes to
    `src/lib/runtime-catalog.ts`.
  - For `kind=surface-base`: also write
    `metadata.configurator[<surfaceId>.baseImage] = /api/product-images/<assetId>` via the
    same metadata plumbing as `productMetadata` (additive key; bump `configurationVersion`
    as the catalog route already does on metadata changes).
  - Returns the created asset including its public URL.
- `DELETE` (`productId`, `assetId`): removes the asset; if it was the primary image's
  source, clear/replace the `ProductImage` url; if it was a surface-base, remove the
  metadata key. Bump `configurationVersion` in both cases and `revalidatePath("/", "layout")`.

Validate `surfaceId` against the product's `metadata.configurator.printAreas` before
accepting — reject unknown surface IDs with a 422.

### C. Admin UI (existing panels, additive controls)

In `src/components/admin/ProductsPanel.tsx` (inside the existing product drawer, new visual
elements get new CSS-module classes — follow `DESIGN_PROMPT.md` token discipline if you
touch styling):

1. Replace the "Product image URL" text-only input with a **file picker + preview**, keeping
   the URL input as an advanced fallback (paste still works for external URLs). On pick:
   POST the multipart to the new images endpoint, show the returned preview, and retain the
   URL in the form so create/patch still sends `imageUrl` (now the first-party URL).
   For a *new* product the row doesn't exist yet — persist the picked file after the
   initial `POST /api/admin/catalog` save (two-step: save draft, then upload, then
   PATCH imageUrl), or have the images endpoint accept `productId` omitted and attach on
   create. Pick the approach that requires the fewest changes to the existing catalog
   route and implement it cleanly; add a small note in the UI explaining the step order.
2. Add a **"Base images"** subsection next to "Printable surfaces": for each configured
   print area, a picker that uploads with `kind=surface-base` + that `surfaceId`, showing
   the current base image and a remove button (DELETE). Helper copy: "Customers see this
   image behind their design on the <surface> surface."
3. In `src/components/admin/TemplateManager.tsx`, convert the "Base image URL" field to the
   same picker-with-fallback pattern (template base images also get stored as
   first-party URLs; template API accepts a URL string, so only the UI changes there).

### D. Studio wiring (the customer sees the admin's image)

1. Extend `ProductConfigurationSchema` **additively** in
   `src/lib/product-configuration.ts`: under `preview`, add
   `baseImages?: Record<string, string>` — surfaceId → first-party image URL — built from
   the product metadata keys written in step B (read the product's
   `metadata.configurator` through whatever `Product` accessor already exposes it, e.g.
   the configurator block in `src/lib/types.ts` `Product.configurator`; add the field there
   additively too). Products without surface bases omit the key entirely.
   - Read these values from the live catalog, not from `src/lib/data.ts` demo data.
2. In `src/components/commerce/CustomizationStudio.tsx` where `templateBaseImages` is
   built (~line 550), merge with this precedence: **admin-set per-surface base image
   (highest) > visualization-template textureUrl > selected personalization template's
   production baseImageUrl**. Preserve existing behavior when a product has no
   `preview.baseImages`.
3. `ArtworkEditor.tsx` needs no change if `baseImages` flows through — verify the image
   renders under layers with `imageFit`-style scaling (contain, centered).
4. The 2D preview/quote/order paths must stay untouched: a surface base image is
   presentation-only — it must **not** enter pricing, the artwork document, or the order
   snapshot (customer-uploaded layers already do; the base image must not be claimed as an
   asset or billed).

### E. Catalog API schema adjustments (minimal)

`src/app/api/admin/catalog/route.ts`:
- `productSchema.imageUrl` and `categorySchema.imageUrl` are `z.string().url()` — first-party
  relative URLs (`/api/product-images/<id>`) must also be accepted: allow a string that is
  either an absolute http(s) URL or starts with `/api/`. Nothing else in those schemas
  changes.
- No other catalog-route behavior changes. The metadata write for surface bases happens in
  the new images endpoint, not in POST/PATCH of the catalog route.

## 3. End-to-end acceptance test (you must be able to walk this)

Assuming a local dev database (`npm run db:setup`, `npm run db:bootstrap-admin`):

1. Admin → Products → Add product → category "Note Books" → apply RanBazaar starter
   "Notebook" (gives name + subtitle + font fields, one portrait surface, image upload
   enabled) → set the surface's width/height mm → enable customer artwork upload → set the
   name field required → pick a product photo file → pick a base image file for the
   "primary" surface → price 249 → publish.
2. Customer opens `/products/<slug>`: the studio's 2D canvas shows the uploaded base image
   behind the layout guides; they type a name (length limits enforced), upload a photo
   (drag/resize/rotate within policy), preview updates live.
3. Add to cart → the configured line is independently keyed (existing behavior) →
   `POST /api/quotes` prices it server-side → demo checkout completes.
4. The created order's item snapshot contains the artwork document with the customer
   image asset claim; the base image did **not** leak into the snapshot or pricing.
5. Admin → Orders/Customizations: the submitted design (customer photo + name) is
   viewable for review (existing permission-scoped artwork routes).
6. Unpublish or archive the product → its base/primary images stop being publicly served
   only if you implement product-status gating on the serving route (recommended: serve
   first-party product images only while the product is ACTIVE and published; otherwise
   404). Re-run the full gate: typecheck, test:domain, build.

## 4. Explicit non-goals

- No 3D geometry changes, no dieline/production export, no object-storage migration,
  no malware scanning, no custom-dimension pricing, no bulk-order changes, no vendor-flow
  changes, no checkout/payment changes, no seed-catalog edits.
- Do not seed demo products to prove the flow; create one via the admin UI in the
  acceptance test.

## 5. Reporting

When done, report: files added/changed (grouped by steps A–E), the exact commands you ran
and their results, the acceptance-test walkthrough outcome, and any place where you had
to deviate from this document (with the reason).
