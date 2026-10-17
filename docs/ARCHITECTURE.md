# Naamly commerce architecture

This repository is deliberately split into a polished demonstration layer and a production data model. The catalog APIs are functional today. Order persistence and payment execution are explicitly demo-only until the PostgreSQL repository and provider webhook described below are connected.

## Runtime boundaries

- `src/lib/data.ts` is the deterministic storefront catalog and the shared UI contract. Prices in this file are rupees for convenient display.
- `src/lib/catalog.ts` provides real filtering, sorting, pagination, suggestions and lightweight typo tolerance over that catalog.
- `src/lib/validation.ts` is the Zod boundary for all public API input.
- `src/lib/order-service.ts` performs server-side catalog lookup, customization validation, price recomputation and idempotent demo order creation. It never accepts a browser-calculated total.
- `src/lib/payment.ts` performs constant-time HMAC comparisons using Node's crypto implementation.
- `prisma/schema.prisma` is the normalized PostgreSQL target. All database amounts are integer paise.
- `prisma/seed.ts` seeds catalog and configuration data, not fabricated customers, reviews, sales or revenue.

The in-memory order map is intentionally labelled `process-memory-demo` in API responses. It is neither durable nor shared across server instances and must not be used to accept real orders.

## API contracts

| Endpoint | Method | Purpose | Cache |
| --- | --- | --- | --- |
| `/api/products` | `GET` | Filtered and paginated catalog | 5 minutes at edge |
| `/api/products/:slug` | `GET` | Product, compatible templates and related products | 5 minutes at edge |
| `/api/search?q=` | `GET` | Product/category suggestions with simple typo tolerance | 1 minute at edge |
| `/api/orders` | `POST` | Validate, reprice and create a demo order | no-store |
| `/api/orders?orderNumber=&email=` | `GET` | Demo order lookup with contact verification | no-store |
| `/api/orders/:number?email=` | `GET` | Equivalent route-friendly order lookup | no-store |
| `/api/payment/demo/verify` | `POST` | Local HMAC payment simulation | no-store |
| `/api/payments/verify` | `POST` | Verify a Razorpay checkout signature; does not settle an order | no-store |

Product queries accept `category`, `q`, `minPrice`, `maxPrice`, `material`, `size`, `theme`, `customizable`, `availability`, `sort`, `page`, and `limit`. Sort values are `recommended`, `bestselling`, `price-asc`, `price-desc`, `newest`, and `rating`. The demo has no verified review data, so it does not publish ratings. In production, bestselling and rating order should come from paid-order and approved-review aggregates instead of merchandising fallbacks.

Order creation requires an `Idempotency-Key` header between 8 and 128 characters. A client should generate one UUID per checkout attempt and reuse it for retries. The body is shaped as follows:

```json
{
  "items": [
    {
      "productId": "prod-everyday-name-slips",
      "variantId": "var-everyday-72",
      "quantity": 1,
      "customization": {
        "templateId": "tpl-ocean-friends",
        "fields": {
          "name": "Aarav Mehta",
          "class-details": "Class 4 · B",
          "font": "rounded"
        },
        "previewVersion": 1
      }
    }
  ],
  "shippingAddress": {
    "fullName": "Aarav's parent",
    "mobile": "9876543210",
    "email": "parent@example.com",
    "addressLine1": "24 Example Road",
    "city": "Pune",
    "state": "Maharashtra",
    "postalCode": "411001",
    "country": "IN"
  },
  "shippingMethod": "standard",
  "acceptedTerms": true
}
```

Errors use one stable envelope:

```json
{
  "error": {
    "code": "CUSTOMIZATION_TOO_LONG",
    "message": "Name is too long.",
    "details": { "productId": "...", "fieldId": "name", "maxLength": 24 }
  }
}
```

## Money and historical truth

The UI catalog uses rupee values (`349`) and `formatPrice`. Every trusted server or database amount uses paise (`34900`) and integer arithmetic. Production order creation must run in one serializable transaction that:

1. Locks or atomically reserves each inventory row.
2. Reloads active product, variant, template, shipping, coupon and tax configuration.
3. Validates every personalization field and uploaded-asset reference.
4. Recalculates unit prices, discounts, tax and shipping.
5. Writes product, variant, price and template snapshots to `OrderItem` and `OrderPersonalization`.
6. Stores the unique idempotency key and converts or expires the cart.
7. Creates the provider payment order for exactly the persisted amount.

Order snapshots are intentional duplication: later catalog edits must not rewrite what a customer bought or what production staff must manufacture.

## PostgreSQL model

The schema groups data by responsibility:

- Identity and authorization: `User`, `Role`, `Permission`, their join tables, and `Address`.
- Catalog: hierarchical `Category`, `Product`, `ProductVariant`, `ProductImage`, normalized personalization fields and many-to-many templates.
- Stock: `Inventory` plus an append-only `InventoryMovement` ledger.
- Personalization: editable `CustomizationConfiguration`, immutable `OrderPersonalization`, and `ProductionJob`.
- Checkout: `Cart`, independent `CartItem` records for differently personalized copies, `Order`, address snapshots and item snapshots.
- Financial operations: `Payment`, idempotent `PaymentEvent`, `Refund`, coupons and redemption records.
- Fulfillment and service: `Shipment`, reviews, wishlists, bulk request rows, support tickets, notifications and audit logs.
- Managed content: `Announcement`, `Faq`, and typed JSON `StoreSetting` records.

PostgreSQL migrations should add check constraints that Prisma cannot express directly: all money and quantity fields are non-negative, review ratings are between 1 and 5, production maximum days are not less than minimum days, coupon percentages are bounded, and inventory reserved quantity cannot be negative. A partial unique index should enforce at most one default address per user and address type.

## Order state machine

Allowed forward transitions should be enforced in a domain service, never by accepting an arbitrary admin-provided enum:

```text
ORDER_RECEIVED -> PAYMENT_CONFIRMED -> CUSTOMIZATION_REVIEW
CUSTOMIZATION_REVIEW -> PRODUCTION_APPROVED -> IN_PRODUCTION
IN_PRODUCTION -> QUALITY_CHECK -> READY_TO_SHIP -> SHIPPED -> DELIVERED
```

Cancellation is allowed only from configured pre-production states. Refund flows move through `REFUND_PROCESSING` to `REFUNDED`; payment state changes separately. Exceptional reversals require a reason, permission check and `AuditLog` entry.

## Payments

`/api/payment/demo/verify` expects a hex SHA-256 HMAC of `orderNumber|paymentReference`. In development it uses a clearly named local fallback secret; in production it returns `503` unless `DEMO_PAYMENT_SECRET` is configured. This endpoint is a test harness, not a gateway.

`/api/payments/verify` checks the Razorpay checkout signature using `RAZORPAY_KEY_SECRET`, but deliberately returns `pending_webhook_reconciliation`. A browser callback is not authoritative payment settlement.

Before live checkout:

1. Create the provider order on the server after the database order is committed, then persist `providerOrderId`, amount and currency.
2. Add a raw-body webhook route and verify `RAZORPAY_WEBHOOK_SECRET` before parsing or mutating data.
3. Insert the provider event ID into `PaymentEvent`; the unique constraint makes webhook retries idempotent.
4. In a transaction, match provider order, merchant order, amount and currency before marking the payment captured.
5. Advance the order to `PAYMENT_CONFIRMED` only from a verified capture event. Never store raw card details.
6. Reconcile delayed, failed, disputed and refunded payments from provider events and scheduled reconciliation jobs.

Rate-limit payment, order, tracking and authentication endpoints. Add CSRF protection wherever cookie-authenticated mutations are introduced.

## Personalization and artwork

The saved `values`, template version and safe-area configuration are the canonical input for both the customer preview and production renderer. A production worker should render vector or high-resolution output at the template's stored dimensions and DPI, calculate a checksum, upload it to private object storage, and save a short-lived signed URL. A browser screenshot is never production artwork.

Uploaded assets need MIME sniffing, size and pixel limits, malware scanning, metadata removal and isolated object keys. Production files and customer data must remain private and follow a documented retention schedule.

## Running the data layer

With PostgreSQL available and `DATABASE_URL` configured:

```bash
npm run db:generate
npm run db:push
npm run db:seed
```

Use versioned `prisma migrate deploy` migrations, backups and recovery drills for a live environment; `db:push` is suitable only for local prototyping. Assign the seeded roles to real staff through a protected bootstrap process—`seed.ts` intentionally creates no default password or administrator account.

## Production cutover checklist

- Replace the file catalog repository with Prisma queries while retaining the public TypeScript/API contracts.
- Move search to PostgreSQL full-text/trigram indexes or a managed search index as catalog volume grows.
- Configure object storage, transactional email/SMS, shipping and payment providers with secret rotation.
- Add session authentication, server authorization and audit logging to every admin mutation.
- Add database-backed rate limits, observability, alerting, webhook replay tooling and scheduled reconciliation.
- Confirm shipping prices, taxes, production timings, returns, legal copy and accessibility with the merchant before launch.
- Publish only approved reviews and compute the verified-purchase flag from `OrderItem`, never from submitted input.
