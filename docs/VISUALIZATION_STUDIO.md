# Product visualization studio

The visualization studio extends the existing catalog, configurator, cart and order flow. It does not
replace the existing 2D editor or product gallery. A published visualization adds a lazy-loaded 3D mode;
the normal 2D/static preview remains the purchase fallback if WebGL or a texture cannot load.

## Architecture

- `VisualizationAsset` stores the signature-checked private source raster and optional generated asset
  references. Source images are never exposed by the administrator download route without catalog-admin
  authorization.
- `VisualizationProcessingJob` is the persisted, bounded processing queue. Upload and retry requests
  return immediately, Next.js `after()` processes work outside the response, and administrator reads
  recover queued jobs after a process restart. Interrupted claims become explicit retryable failures.
- `VisualizationTemplate` stores immutable versions of confirmed geometry, millimetre dimensions, panel
  mappings, material/preview metadata and manufacturing-validation state.
- The optional external analyzer is isolated in `visualization-studio-analyzer.ts`. With no provider
  configured, the same workflow runs in truthful guided-manual mode and never invents a confidence score
  or mesh.
- Publishing selects a supported 3D profile, archives the older active version, and atomically activates
  the product metadata. Only a published template connected to an active, published product can serve a
  public texture.
- The storefront catalog exposes a validated, read-only template descriptor. The 3D preview combines all
  mapped panels with the customer's existing artwork in an ephemeral document; it never rewrites the
  saved 2D artwork IDs.
- Checkout rebuilds the visualization snapshot from trusted catalog data. Browser-supplied geometry,
  dimensions and prices are not accepted as order truth.

## Administrator workflow

1. Save the product once, then edit it in the existing Products panel.
2. In **Image-to-3D studio**, choose a source JPG, PNG or WebP image (maximum 12 MB).
3. Confirm the product type, shape and physical dimensions. Dimensions can be entered in mm, cm or in and
   are stored in millimetres.
4. Map each printable surface to a semantic model face. For a multi-panel source image, enable normalized
   source bounds (`x`, `y`, `width`, `height`, each from 0 to 1) for every crop.
5. Upload and review the real job status. Failed jobs expose bounded retry; manual mode asks for explicit
   confirmation.
6. Confirm the configuration, save a versioned draft template, and publish it. Packaging 3D controls stay
   locked until this publish step succeeds.
7. Archive a template to remove it from the storefront. Existing order snapshots retain their saved
   template version and geometry metadata.

For another saved product, **Start from published setup** can load a published template's geometry,
dimensions and surface map. Source artwork is intentionally not copied between products; upload and
confirm the new product's artwork before saving its own version.

Supported studio profiles are rectangular box, square box, folding carton, mailer box, paper bag,
stand-up pouch, product sleeve, cylindrical bottle, flat sticker sheet and product label. Existing
catalog-specific 3D profiles remain available unchanged.

## External analyzer (optional)

Set both server-only variables to enable an external service:

```dotenv
IMAGE_TO_3D_ANALYSIS_ENDPOINT="https://analyzer.example.com/v1/analyze"
IMAGE_TO_3D_ANALYSIS_API_KEY="replace-with-provider-secret"
```

The endpoint receives multipart form data with the original `file` and a versioned JSON `context`. It must
return the strict schema accepted by `visualizationAnalyzerResponseSchema`. The server enforces HTTPS in
production, redirects off, a 10-second default timeout, a 256 KB response limit and schema validation.
Provider asset URLs remain private references; they are not forwarded to the browser. Provider pricing,
retention and model-quality limits are deployment-specific and must be reviewed before enabling it.

Leaving both values blank is supported and uses the guided template/manual path.

## Deployment

Generate the client, validate the schema and apply the additive migration before using the studio:

```powershell
npm.cmd run db:generate
npx.cmd prisma validate
npx.cmd prisma migrate deploy
```

The migration is `prisma/migrations/20261028120000_add_visualization_studio/migration.sql`. Do not publish a
template until its product has a valid catalog image, price, variant and artwork policy. A visualization is
marked manufacturing-ready only when the stored manufacturing validation flag is true; otherwise it is a
visual simulation that still requires production preflight.

## Operational limits

- Automatic classification, dieline detection and mesh generation require a compatible external analyzer.
  Without one, dimensions and panel relationships are administrator-confirmed.
- Public source textures are served from database-backed raster assets. A production deployment expecting
  high image volume should move the storage adapter to private object storage plus signed/internal reads.
- Generated meshes are treated as visual approximations unless separately validated against production
  dimensions, folds, bleed and material requirements.
