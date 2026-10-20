# Customization implementation audit

## Scope and reference limitation

This audit covers the Naamly repository as it existed on 20 October 2026. The requested live
EzPac and RanBazaar audit could not be completed in this execution environment: no browser surface
was available and opening an in-app browser was unavailable. The reference-site column below is
therefore deliberately marked **unverified**, rather than inferred from screenshots, snippets or
the request itself. No reference functionality is claimed as observed.

## Existing architecture

| Area | Current implementation |
| --- | --- |
| Front end | Next.js 16 App Router, React client components and CSS modules |
| APIs | Next route handlers for products, configurations, quotes, orders, coupons, search and bulk requests |
| Catalog | Deterministic in-repository catalog (`src/lib/data.ts`) behind catalog/query services |
| Database target | Prisma/PostgreSQL schema with catalog, variants, customization configurations, carts, order snapshots, production jobs and bulk requests |
| Pricing | Server-side integer-paise catalog pricing; quote and order share the same pricing service |
| Cart and checkout | Browser-persisted cart, independently keyed configured lines, checkout revalidation and immutable demo order snapshots |
| Admin | Demo admin panels for catalog, templates, orders, reports, promotions and settings; mutations are not persisted to Prisma yet |
| Uploads | PNG/JPG preview uploads are browser-local only; no production object storage is connected |
| Preview | SVG 2D artwork studio and client-only Three.js product-aware 3D preview |

## Feature comparison and priorities

| Feature | EzPac | RanBazaar | Existing implementation | Gap / recommended solution | Priority |
| --- | --- | --- | --- | --- | --- |
| Discovery and categories | Unverified | Unverified | Search, category pages, filters, pagination, breadcrumbs and related items | Keep the catalog data source and add only merchant-approved categories | P1 |
| Product variants | Unverified | Unverified | Catalog-backed variant, material, pack and stock selection | Persist admin mutations through Prisma before launch | P1 |
| Fixed dimensions | Unverified | Unverified | Exact catalog sizes with mm/cm/in display where unambiguous | Keep custom size quote-only until approved rate cards exist | P0 |
| Custom dimensions | Unverified | Unverified | Explicit quote-only handoff | Add per-product limits, increments and server-side rates when supplied | P1 |
| Personalization | Unverified | Unverified | Required-field validation, templates, fonts, colour, save/reopen and separate configured cart lines | Production renderer still required | P0 |
| 2D design studio | Unverified | Unverified | Text/artwork placement, drag, numeric position/size, free rotation, opacity, safe area, undo/redo and resolution warnings | Add approved dielines and a production export worker | P1 |
| 3D preview | Unverified | Unverified | Interactive Three.js geometry profiles for labels, notebooks, bottles, pencils, tags, geometry boxes and keychains | Replace parametric previews with approved product meshes where manufacturing accuracy is required | P2 |
| Upload security | Unverified | Unverified | PNG/JPG signature/size checks for browser-local previews | Private storage, malware scan, metadata removal and signed access are required before enabling fulfilment uploads | P0 |
| Dynamic pricing | Unverified | Unverified | Server-verified catalog variant and template premium pricing | Add merchant-defined material, finish, dimension and quantity rule tables; do not invent prices | P0 |
| Bulk ordering | Unverified | Unverified | Quote form, constraints, CSV personalization validation and bulk-request API | Connect durable storage and CRM/notification adapter | P1 |
| Checkout persistence | Unverified | Unverified | Checkout sends configuration and artwork snapshot; order service reprices it | Replace process-memory demo order repository with Prisma transaction + payment webhook | P0 |
| Administration | Unverified | Unverified | Admin configuration views and a comprehensive Prisma target schema | Protect authentication/authorization and persist mutations | P1 |
| Accessibility / mobile | Unverified | Unverified | Labels, visible field errors, keyboard SVG movement, responsive editor and mobile buy bar | Manual browser/assistive-technology QA remains required | P1 |

## Implemented customization contract

`ProductConfigurationSchema` now returns composable `modes` for every catalog product:

- `standard`
- `specification_based`
- `personalized` when the product supports it
- `design_studio` when the product supports it
- `bulk_order` only for products that support multiple names

The studio displays these capabilities, drives fields and options from the returned schema, and
lazy-loads the Three.js preview only after the customer selects the 3D view. This protects the
initial product-page bundle for customers using only the 2D editor.

## Category inventory and mapping

The active catalog retains its existing categories; no new reference-inventory category was added
because the repository has no approved products for those categories. Current mappings are:

| Current catalog category | Closest reference grouping |
| --- | --- |
| Customized Name Slips | Personalized stationery / Name Slips |
| Waterproof Stickers | Marketing and print products / Stickers |
| Personalized Pencils & Pens | Personalized products / Pens and pencils |
| School Label Sets | Personalized stationery / School kits |
| Personalized Notebooks | Personalized products / Notebooks |
| Bottle & Tiffin Labels | Personalized products / Kids' utilities |
| School Bags & Accessories | Personalized products / Bag and luggage tags |
| Personalized Gifts | Personalized products / Decorative and gifting |
| Name Plates & Keychains | Personalized products / Name plates and keychains |
| Bulk Orders | Personalized products / Bulk buy |

Future packaging categories such as boxes, pouches and branded bags should be created only with
approved products, images, materials, dielines and pricing rules. The current Prisma `Category`
model already supports parent-child hierarchy, slugs, images, active state and ordering.

## Data and production requirements

The Prisma schema already models products, variants, category hierarchy, personalization fields,
templates, configuration snapshots, carts, orders, production jobs and bulk requests. No migration
is included in this change because the running storefront still uses the documented catalog/demo
repositories. Before a live launch, connect:

1. Prisma repositories and transactional inventory/order writes.
2. Authenticated admin mutations and audit records.
3. Product-specific dimension/material/finish/quantity pricing tables.
4. Private artwork storage, MIME sniffing, malware scanning, image processing and signed URLs.
5. Approved 3D meshes, dielines, bleed/safe areas, colour profiles and a server production renderer.
6. Payment webhooks, tax/shipping rules and durable rate limiting.

## Verification

Automated verification is recorded with each change. The repository domain suite covers catalog
configuration, personalization validation, quote/order price parity, tampered-price rejection,
cart/order artwork validation, bulk CSV data and product preview profiles. Manual reference-site
and browser QA were not run because no browser surface was available.
