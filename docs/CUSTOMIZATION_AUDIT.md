# Customization implementation audit

## Scope and reference limitation

This audit covers the Naamly repository as it existed on 28 October 2026. The requested live
EzPac and RanBazaar audit could not be completed in this execution environment: no browser surface
was available and opening an in-app browser was unavailable. The reference-site column below is
therefore deliberately marked **unverified**, rather than inferred from screenshots, snippets or
the request itself. No reference functionality is claimed as observed.

## Existing architecture

| Area | Current implementation |
| --- | --- |
| Front end | Next.js 16 App Router, React client components and CSS modules |
| APIs | Next route handlers for products, configurations, quotes, orders, coupons, search and bulk requests |
| Catalog | Repository fallback plus Prisma-backed runtime catalog, category hierarchy and cross-listing |
| Database target | Prisma/PostgreSQL schema with catalog, variants, customization configurations, carts, order snapshots, production jobs and bulk requests |
| Pricing | Server-side integer-paise catalog pricing; quote and order share the same pricing service |
| Cart and checkout | Browser-persisted cart, independently keyed configured lines, server repricing and immutable Prisma order snapshots |
| Admin | Catalog, category mapping, product artwork policy, templates and order review persist through protected Prisma APIs; remaining panels retain their existing behavior |
| Uploads | Private JPG/PNG/WEBP artwork assets with decoded-image validation, opaque claims and order-item attachment; PostgreSQL byte storage is currently used |
| Preview | SVG 2D artwork studio and client-only Three.js product-aware 3D preview |

## Feature comparison and priorities

| Feature | EzPac | RanBazaar | Existing implementation | Gap / recommended solution | Priority |
| --- | --- | --- | --- | --- | --- |
| Discovery and categories | Unverified | Unverified | Search, filters, pagination, hierarchy, exact RanBazaar starter taxonomy and non-duplicating cross-listing | Run the scoped import on staging before production | P1 |
| Product variants | Unverified | Unverified | Catalog-backed variant, material, pack and stock selection with persisted admin mutation | Complete staging database and browser QA | P1 |
| Fixed dimensions | Unverified | Unverified | Exact catalog sizes with mm/cm/in display where unambiguous | Keep custom size quote-only until approved rate cards exist | P0 |
| Custom dimensions | Unverified | Unverified | Explicit quote-only handoff | Add per-product limits, increments and server-side rates when supplied | P1 |
| Personalization | Unverified | Unverified | Required-field validation, templates, fonts, colour, save/reopen and separate configured cart lines | Production renderer still required | P0 |
| 2D design studio | Unverified | Unverified | Text/artwork placement, drag, numeric position/size, free rotation, opacity, safe area, undo/redo and resolution warnings | Add approved dielines and a production export worker | P1 |
| 3D preview | Unverified | Unverified | Interactive Three.js geometry profiles for labels, notebooks, bottles, pencils, tags, geometry boxes and keychains | Replace parametric previews with approved product meshes where manufacturing accuracy is required | P2 |
| Upload security | Unverified | Unverified | Private JPG/PNG/WEBP storage, content decoding, bounds/policy checks, hashed claims and scoped access | Add malware scanning, metadata removal and external object storage at production scale | P0 |
| Dynamic pricing | Unverified | Unverified | Server-verified catalog variant and template premium pricing | Add merchant-defined material, finish, dimension and quantity rule tables; do not invent prices | P0 |
| Bulk ordering | Unverified | Unverified | Quote form, constraints, CSV personalization validation and bulk-request API | Connect durable storage and CRM/notification adapter | P1 |
| Checkout persistence | Unverified | Unverified | Prisma transaction reprices configuration, claims artwork and stores immutable template/artwork snapshots | Add payment webhook and customer order-detail QA | P0 |
| Administration | Unverified | Unverified | Protected persisted catalog, category, template, artwork-policy and order-review workflows | Add full customer-equivalent admin preview and audit coverage | P1 |
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

The existing catalog remains intact. An explicit, idempotent admin action can create or map the exact
RanBazaar category inventory under Name Slips & Labels, School Supplies & Stationery, Personalised
Accessories, and Personalised Gifts & Decorations. Bulk Buy remains an entry point to `/bulk-orders`.
`ProductCategory` cross-links let an existing product appear in multiple discovery categories without
duplicating it or widening its primary-category vendor fulfilment scope. EZPAC packaging starters are
also explicit admin presets and do not invent products, images, materials, dielines or prices.

## Data and production requirements

Three additive migrations introduce product-category cross-links, private artwork assets and atomic
primary-category vendor coverage checks. Catalog, template and order mutations use authenticated APIs;
checkout reprices and writes the order transactionally. Before a live launch:

1. Apply the migrations and scoped category import on staging; never run the general development seed
   against a populated production catalog.
2. Supply product-specific dimension/material/finish/quantity pricing tables where required.
3. Add malware scanning, metadata removal and an object-storage adapter for production artwork scale.
4. Supply approved 3D meshes, dielines, bleed/safe areas, colour profiles and a production renderer.
5. Connect payment webhooks, tax/shipping rules and durable shared rate limiting.

## Verification

Automated verification is recorded with each change. The repository domain suite covers catalog
configuration, personalization validation, quote/order price parity, tampered-price rejection,
cart/order artwork validation, bulk CSV data and product preview profiles. Manual reference-site
and browser QA were not run because no browser surface was available.
