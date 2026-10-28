# Naamly — personalised products commerce

A premium, responsive Next.js storefront for personalised labels, school essentials and gifts. The repository includes the customer storefront, live personalisation studio, persistent cart, guided checkout, customer service pages, a role-shaped admin experience, API contracts, and a normalized PostgreSQL schema.

## Run locally

```powershell
npm.cmd install
Copy-Item .env.example .env.local
npm.cmd run dev
```

Open `http://localhost:3000`. The demo catalog works without a database. Vendor registration, login, review and marketplace operations require PostgreSQL.

## Useful commands

```powershell
npm.cmd run typecheck
npm.cmd run build
npm.cmd run db:generate
npm.cmd run db:setup
npm.cmd run db:bootstrap-admin
```

## Main routes

- `/` — storefront home
- `/products` and `/search` — searchable, filterable catalog
- `/products/everyday-name-slips-72-pack` — data-driven artwork and product configuration studio
- `/cart` and `/checkout` — persistent cart and guided demo checkout
- `/account`, `/wishlist`, `/track-order`, `/bulk-orders` — customer workflows
- `/admin` — operations dashboard and management modules
- `/vendor/register` — printing partner registration and mobile verification
- `/vendor` — vendor application status and approved partner workspace
- `/admin/vendor-applications` — protected vendor review and approval queue

The configurator contract, pricing boundary, bulk quote API and production dependencies are documented
in `docs/CONFIGURATOR.md`.

The administrator image-to-3D workflow, publishing boundary, optional analyzer contract and deployment
steps are documented in `docs/VISUALIZATION_STUDIO.md`.

For a fresh local database, `db:setup` pushes the Prisma schema, installs the atomic marketplace
database functions and trigger, and seeds the catalog plus authorization roles. Before the first
admin login, temporarily set `BOOTSTRAP_ADMIN_EMAIL` and a strong `BOOTSTRAP_ADMIN_PASSWORD`, run
`db:bootstrap-admin`, then remove both values from the environment. The bootstrap refuses to
overwrite an existing user.

Vendor onboarding requires PostgreSQL and the seeded authorization roles.
In non-production environments the OTP request response includes a development code; production
requires `VENDOR_OTP_PROVIDER_URL` and strong `VENDOR_OTP_SECRET` credentials.
Schedule a POST to `/api/internal/assignments/recover-expired` with
`Authorization: Bearer <ASSIGNMENT_RECOVERY_SECRET>` so expired/unassigned offers are retried.

## Production cutover

The checkout intentionally remains in safe demo mode: it never collects card data and does not claim a payment succeeded. To take live orders, configure PostgreSQL and merchant credentials, replace the demo repository adapters, create payment orders server-side, verify gateway signatures and webhooks, add authentication/authorization, and connect transactional email and shipping providers. See `docs/ARCHITECTURE.md` for the data and service boundaries.

All customer-visible shipping, offer, review and delivery claims should remain tied to configured business data. The seed catalog is demonstrative content, not operational evidence.
