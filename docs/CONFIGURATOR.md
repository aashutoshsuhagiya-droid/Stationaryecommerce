# Product configurator

## Reference inspection status

Direct access to `ezpac.in` was unavailable in this execution environment: no browser surface was
exposed and the network approval service rejected the external request before a connection was made.
Its exact public flow is therefore unverified. The implementation follows the supplied requirements
and the existing Naamly architecture; it does not claim parity with behavior that could not be observed.

## Implemented customer flow

Every product detail page now receives a catalog-derived `ProductConfigurationSchema`. Customizable
products open in a responsive workspace with catalog variants and materials, fixed-size presets,
measurement display conversion where dimensions are unambiguous, product-specific text fields,
compatible templates, quantity controls, saved local drafts and independent configured cart lines.

The 2D artwork workspace supports:

- multiple printable surfaces when the product schema supplies them;
- editable text and validated PNG/JPG preview uploads up to 2 MB;
- drag positioning, numeric sizing and rotation, opacity, font and colour controls;
- duplicate, delete, front/back layer order and horizontal/vertical alignment;
- undo, redo, zoom, reset, safe-area guides and boundary/resolution warnings;
- local save and reopen through the product URL's `design` query parameter.

Uploaded images are deliberately preview-only. They are stored in browser-local draft/cart data and
are not sent to the order API or represented as production assets.

## Configuration contract

`GET /api/products/:slug/configuration` returns:

- product identity and structural design key;
- canonical millimetre dimensions, display units and fixed catalog presets;
- purchasable variants, material, pack size, stock state and integer-paise catalog price;
- validated personalization fields and compatible templates;
- quantity boundaries and printable surfaces;
- quote endpoint and applicable catalog pricing rules;
- explicit readiness flags for custom dimensions, uploads, 3D and production export.

Current catalog products expose `dimensions.mode = "fixed_catalog"`. Custom dimensions stay disabled
until approved per-product limits, increments and rates exist. The UI never derives a sellable custom
size or manufacturing price from descriptive copy. The visible custom-size action transfers the
selected catalog product into the quote workflow, where the requested dimensions can be reviewed.

## Pricing and checkout

`POST /api/quotes` accepts the same product, variant, quantity and customization IDs used by checkout.
It validates the configuration, rejects unknown keys, and returns variant price plus compatible
template adjustments in integer paise. Quote responses include a catalog pricing version and require
checkout revalidation. Shipping, tax and final total remain unset until checkout has the required
delivery context.

Order creation calls the same pricing service. Browser totals, saved quote totals and cart display
prices are never authoritative.

## Bulk quotation

`POST /api/bulk-requests` validates contact and business details, an available catalog product,
dimensions, material, printing, finishing, quantity, delivery PIN and notes. The current adapter is
clearly labelled `process-memory-demo`; a successful response does not claim that a CRM or production
team was notified. Attachments remain disabled until secure storage and scanning are connected.
`BULK_QUOTE_MIN_QUANTITY` and `BULK_QUOTE_MAX_QUANTITY` configure the accepted request range; the
neutral defaults are `1` and `100000`, not assumed merchant policy.

Quote and bulk-request endpoints have bounded, process-local rate limits. Client identifiers are
hashed before storage. A multi-instance deployment must replace this adapter with a shared store and
trusted-proxy configuration so limits apply consistently across instances.

## Production dependencies

No database migration is required for the current demonstration layer. The optional bulk quantity
environment variables are documented in `.env.example`.
Before enabling production capabilities, the merchant must supply and connect:

1. Approved dimension limits, increments, material/thickness matrices, setup fees and quantity tiers.
2. Private object storage, authorization, MIME sniffing, malware scanning, metadata removal and
   retention rules for artwork.
3. Dedicated 3D product geometry and physical shader presets: Three.js powers the client-side
   interactive 3D preview (`Product3DPreview.tsx`), with real-time canvas texture projection mapping
   the customer's 2D artwork onto parametric geometries (hardcover notebooks, cylindrical bottles,
   personalized pencils, luggage tags, and card stacks).
4. Product dielines, bleed/safe-area specifications, target DPI, colour profiles and a production
   renderer before any export may be called print-ready.
5. Durable repositories, authentication/authorization, rate limiting and an operational notification
   or CRM adapter for bulk requests and saved designs.

## Verification

```powershell
npm.cmd run typecheck
npm.cmd run test:domain
npm.cmd run build
```

On the constrained Windows runner, `tsx` may fail before test discovery if Node's `os.userInfo()`
returns `ENOMEM`. This is a host runtime problem; running with a test-only `NODE_OPTIONS` shim for that
single OS call executes the unchanged suite. The tests cover catalog configuration, canonical
dimensions, quote arithmetic, order/quote parity, incompatible templates and rejection of
browser-supplied prices.
