# Marketplace and vendor onboarding implementation status

## Implemented vendor onboarding

- Public `/vendor/register` application with mobile OTP verification, password authentication,
  business/address/service/equipment fields, GST details, terms acceptance and bounded private
  document uploads.
- Transactional registration creates the user, restricted `vendor_applicant` role, revocable
  database session, `SUBMITTED` application, inert `PENDING`/`INACTIVE` vendor profile, history
  event and in-app notification together.
- Authenticated `/vendor` workspace shows submitted, under-review, action-required, approved,
  rejected and suspended states. Requested corrections and replacement documents can be
  resubmitted without creating another account.
- Protected Super Admin application queue supports search, status filters, full business and
  document inspection, document decisions, internal notes, start-review/request-changes,
  approve/reject and suspend/reactivate actions. Application decisions, document reviews and
  correction snapshots are retained in event/audit history.
- Approval atomically activates the profile, swaps the applicant role for the vendor role and
  creates product capabilities for the admin-approved categories. Rejection and suspension force
  the profile offline and unable to accept work.
- Approved vendors have availability controls, incoming offer actions, assigned-order production
  transitions and a clearly labelled gross fulfilled-order-value view. Customer address details
  are not exposed until an offer is assigned.

## Assignment safety

- Planning requires a captured payment, an exact normalized match to the vendor's registered
  workshop city, exact service PIN coverage, approved categories, an approved and active vendor,
  online/accepting state, available capacity and every requested product capability/quantity.
  City and PIN are intentionally an intersection: extra service PIN codes do not authorize a
  second city until onboarding supports an explicit reviewed list of service cities.
- Dispatch persists an idempotent assignment and bounded offer batch. An authenticated admin can
  dispatch a captured database order with `POST /api/admin/orders/:id/dispatch-vendors`.
- The offer batch limit is stored under the stable `marketplace.maxVendorsPerOrder` `StoreSetting`
  key and can be changed by a Super Admin from the vendor applications page. Dispatch reads it in
  the same serializable transaction used to create offers. When no database override exists,
  `VENDOR_MAX_OFFERS_PER_ORDER` is used, followed by a default of 10; accepted values are 1–100.
- The protected same-origin `GET`/`PATCH /api/admin/marketplace-settings` endpoint validates the
  limit and records each effective change in `AuditLog` with its actor and request identifier.
- PostgreSQL `acceptVendorOrderOffer` locks the order before the assignment/vendor rows, uses
  database time, rechecks payment/order/vendor/capability/service-area state and commits exactly
  one winner while closing competing offers.
- Pending/rejected/suspended vendors are blocked both by permissions and by the database function.
- A database trigger releases vendor capacity when an assigned order becomes delivered, cancelled
  or refunded.
- Expired offers can be retried against vendors not previously offered the order. Run the protected
  admin recovery route or schedule `POST /api/internal/assignments/recover-expired` with a strong
  `ASSIGNMENT_RECOVERY_SECRET` bearer token.

## Local database setup

`npm run db:setup` is the fresh-development path. It pushes the complete Prisma schema, installs
the row-locked marketplace functions/trigger and runs the idempotent catalog/authorization seed.
`npm run db:bootstrap-admin` creates the first administrator only when temporary strong bootstrap
credentials are explicitly supplied; it refuses to overwrite an existing user.

The checked-in migration is intended for a reviewed existing schema. Do not run it blindly against
production. Use backups, a staging rehearsal and the deployment database role that owns (or is
explicitly granted execute access to) the marketplace functions.

## Verification completed

- Prisma schema validation and client generation.
- Strict application TypeScript check.
- Domain tests for pending/rejected/suspended eligibility, exact PIN/capability/capacity matching,
  payment capture, first-accept concurrency semantics, idempotent replay, expiry/retry decisions,
  validation/normalization, application transitions, fulfilment transitions, password hashing,
  document signature checks and bounded multipart parsing.

## Production integration still required

- The storefront checkout remains a safe in-memory demonstration. A signed, idempotent payment
  webhook must persist the real order/payment and call `dispatchCapturedOrderToVendors`; browser
  payment callbacks must never mark payment captured or dispatch work.
- Configure the SMS provider and durable distributed rate limiting. Development OTP codes are
  intentionally returned only outside production.
- Connect the notification outbox to configured email/SMS workers. Status remains visible in-app
  without those providers.
- Move business documents to private object storage with malware scanning and retention controls
  before production-scale onboarding; current bytea storage is private and authorization-gated but
  intentionally small (4 MB per file).
- Run the register → review → approve → dispatch → accept workflow and accept/cancel race tests
  against a migrated disposable PostgreSQL database before release. No database was mutated by the
  repository verification run documented here.
