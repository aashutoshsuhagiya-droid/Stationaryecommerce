# Naamly — personalised products commerce

A premium, responsive Next.js storefront for personalised labels, school essentials and gifts. The repository includes the customer storefront, live personalisation studio, persistent cart, guided checkout, customer service pages, a role-shaped admin experience, API contracts, and a normalized PostgreSQL schema.

## Run locally

```powershell
npm.cmd install
Copy-Item .env.example .env.local
npm.cmd run dev
```

Open `http://localhost:3000`. The demo catalog works without a database. PostgreSQL is required only when replacing the seeded in-memory adapters with persistent services.

## Useful commands

```powershell
npm.cmd run typecheck
npm.cmd run build
npm.cmd run db:generate
npm.cmd run db:push
npm.cmd run db:seed
```

## Main routes

- `/` — storefront home
- `/products` and `/search` — searchable, filterable catalog
- `/products/everyday-name-slips-72-pack` — live customisation studio
- `/cart` and `/checkout` — persistent cart and guided demo checkout
- `/account`, `/wishlist`, `/track-order`, `/bulk-orders` — customer workflows
- `/admin` — operations dashboard and management modules

## Production cutover

The checkout intentionally remains in safe demo mode: it never collects card data and does not claim a payment succeeded. To take live orders, configure PostgreSQL and merchant credentials, replace the demo repository adapters, create payment orders server-side, verify gateway signatures and webhooks, add authentication/authorization, and connect transactional email and shipping providers. See `docs/ARCHITECTURE.md` for the data and service boundaries.

All customer-visible shipping, offer, review and delivery claims should remain tied to configured business data. The seed catalog is demonstrative content, not operational evidence.
