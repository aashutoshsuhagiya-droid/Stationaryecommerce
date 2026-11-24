/**
 * Best-effort 3D enablement for imported EzPac packaging products.
 *
 * Run with: tsx --conditions=react-server scripts/import-external-catalog/3d-enable.ts [--dry-run]
 * (the react-server condition neutralises the `server-only` guard inside src/lib).
 *
 * For each EzPac product whose mapping preset unambiguously names a packaging
 * shape, this drives the in-repo visualization studio in MANUAL analysis mode
 * (no external AI calls): source image → analysis job → confirmation → DRAFT
 * template → publish. Publishing itself writes the product's
 * metadata.configurator { allow3D, productModel, previewTemplate } via
 * `activateVisualizationProductMetadata`, keeping the admin invariant intact.
 *
 * Idempotency: products that already have a PUBLISHED, unarchived template are
 * skipped unless `--regenerate` is passed — then a fresh template is built with
 * the current pipeline, and publishing it archives the old one. Ambiguous
 * shapes are skipped and reported — never guessed. `--only=<slug>` limits the run.
 *
 * Sizes, front-artwork cropping and board colour come from the same shared
 * modules the admin's one-click "Create 3D preview" uses.
 */
import "../../prisma/load-env";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { EZPAC_SHOPIFY_PRODUCT_MAPPING } from "../../src/lib/ezpac-product-mapping";
import { parseExactDimensions } from "../../src/lib/product-configuration";
import { cropFrontArtwork, downscaleVisualizationSource } from "../../src/lib/visualization-artwork";
import {
  visualizationConfirmationFor,
  visualizationShapePlan,
  type PackagingVisualizationModel,
} from "../../src/lib/visualization-shape-presets";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Conservative per-preset mapping. Only preset slugs that unambiguously name a
 * packaging shape are listed; everything else stays 2D-only.
 * - tuck/slider/plain cartons → folding-carton; window → mailer-box; square → square-box
 * - gift/pooja/flower/unboxing boxes are rigid lid-and-base boxes → rigid-lid-box
 * - courier and parcel mailers are flat poly envelopes → mailer-envelope
 * - carry bags → paper-bag; ziplock pouch → stand-up-pouch
 * - pillow/triangle/popcorn/tray shapes and flat print products are ambiguous → skipped
 */
const PRESET_MODELS: Record<string, PackagingVisualizationModel> = {
  "soap-box": "folding-carton",
  "perfume-box": "folding-carton",
  "cosmetic-beauty-brand-box": "folding-carton",
  "cosmetic-beauty-box-with-inside-holder": "folding-carton",
  "slider-box-thick-wall": "folding-carton",
  "slider-box-thin-wall": "folding-carton",
  "snack-box": "folding-carton",
  "paan-box": "pyramid-box",
  "mithai-box-top-bottom-style": "folding-carton",
  "brownie-box": "folding-carton",
  "chocolate-box": "folding-carton",
  "chocolate-pack-box": "folding-carton",
  "cereal-box": "folding-carton",
  "food-delivery-box": "folding-carton",
  "food-parcel-box": "folding-carton",
  "pen-set-box": "folding-carton",
  "tissue-paper-box": "folding-carton",
  "side-open-box": "folding-carton",
  "zipper-box": "folding-carton",
  "mobile-cover-box": "folding-carton",
  "sachet-box": "folding-carton",
  "hanging-box": "folding-carton",
  "middle-hanging-box": "folding-carton",
  "gift-box": "rigid-lid-box",
  "pooja-box": "rigid-lid-box",
  "flower-box": "rigid-lid-box",
  "unboxing-experience-box": "rigid-lid-box",
  "window-box": "mailer-box",
  "square-box": "square-box",
  "d-cut-paper-bag": "paper-bag",
  "custom-branded-laminated-carry-bag": "paper-bag",
  "parcel-bag": "mailer-envelope",
  "courier-bags": "mailer-envelope",
  "e-commerce-mailers": "mailer-envelope",
  "d2c-mailer-bag": "mailer-envelope",
  "brand-ziplock-pouch": "stand-up-pouch",
};

interface ReportRow {
  slug: string;
  handle: string | null;
  presetId: string | null;
  outcome: "published" | "already-linked" | "skipped-ambiguous" | "skipped-no-image" | "failed";
  model?: PackagingVisualizationModel;
  templateId?: string;
  artworkConfidence?: "high" | "low";
  reason?: string;
}

function mimeFromResponse(response: Response, url: string): "image/jpeg" | "image/png" | "image/webp" | null {
  const header = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (header === "image/jpeg" || header === "image/png" || header === "image/webp") return header;
  const path = new URL(url).pathname.toLowerCase();
  if (/\.jpe?g$/.test(path)) return "image/jpeg";
  if (/\.png$/.test(path)) return "image/png";
  if (/\.webp$/.test(path)) return "image/webp";
  return null;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const regenerate = process.argv.includes("--regenerate");
  const only = process.argv.find((arg) => arg.startsWith("--only="))?.slice("--only=".length);
  const connectionString = (process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL)?.trim();
  if (!connectionString) throw new Error("DATABASE_URL_POOLED or DATABASE_URL is required.");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  (globalThis as Record<string, unknown>).__naamlyPrisma = prisma;

  // Loaded after the shared client is registered so the service reuses it.
  const service = await import("../../src/lib/visualization-studio-service");
  const { validateArtworkUpload, supportedArtworkMimeTypes } = await import("../../src/lib/artwork-upload");
  const { VISUALIZATION_MAXIMUM_FILE_BYTES } = await import("../../src/lib/visualization-studio-upload");

  const report: ReportRow[] = [];
  try {
    const admin = await prisma.user.findFirst({
      where: { roles: { some: { role: { key: "admin" } } }, status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true },
    });
    if (!admin) throw new Error("No active admin user found; run prisma/bootstrap-admin.ts first.");
    console.info(`Acting as admin ${admin.email}.`);

    const snapshot = JSON.parse(readFileSync(join(process.cwd(), "docs", "research", "ezpac", "products.json"), "utf8")) as {
      products?: Array<{ id?: unknown; handle?: unknown }>;
    };
    const handleById = new Map<string, string>();
    for (const row of snapshot.products ?? []) {
      if (row.id !== undefined && typeof row.handle === "string") handleById.set(String(row.id), row.handle);
    }

    const products = await prisma.product.findMany({
      where: { metadata: { path: ["importSource"], equals: "ezpac" }, ...(only ? { slug: only } : {}) },
      select: { id: true, slug: true, name: true, metadata: true, dimensions: true, category: { select: { slug: true } } },
      orderBy: { slug: "asc" },
    });
    console.info(`${products.length} EzPac products found${regenerate ? " (regenerating existing previews)" : ""}.`);

    for (const product of products) {
      const metadata = (product.metadata ?? {}) as Record<string, unknown>;
      const handle = handleById.get(String(metadata.externalId ?? "")) ?? null;
      const mapping = handle ? EZPAC_SHOPIFY_PRODUCT_MAPPING.find((entry) => entry.shopifyHandle === handle) : undefined;
      const presetId = mapping?.presetId ?? null;
      const display = (product.dimensions as { display?: unknown } | null)?.display;
      const plan = presetId && PRESET_MODELS[presetId]
        ? visualizationShapePlan(PRESET_MODELS[presetId], {
            categorySlug: product.category.slug,
            productName: product.name,
            productSlug: product.slug,
            productDimensions: typeof display === "string" ? parseExactDimensions(display) : null,
          })
        : undefined;

      const published = await prisma.visualizationTemplate.findFirst({
        where: { productId: product.id, status: "PUBLISHED", archivedAt: null },
        select: { id: true },
      });
      if (published && !regenerate) {
        report.push({ slug: product.slug, handle, presetId, outcome: "already-linked", templateId: published.id });
        continue;
      }
      if (!plan) {
        report.push({ slug: product.slug, handle, presetId, outcome: "skipped-ambiguous", reason: presetId ? `preset ${presetId} does not unambiguously name a packaging shape` : "no packaging preset mapping" });
        continue;
      }

      const image = await prisma.productImage.findFirst({
        where: { productId: product.id },
        orderBy: { sortOrder: "asc" },
        select: { url: true, altText: true },
      });
      if (!image) {
        report.push({ slug: product.slug, handle, presetId, outcome: "skipped-no-image", model: plan.model });
        continue;
      }

      if (dryRun) {
        report.push({ slug: product.slug, handle, presetId, outcome: "published", model: plan.model, reason: "dry-run (not executed)" });
        continue;
      }

      try {
        const response = await fetch(image.url);
        if (!response.ok) throw new Error(`Image fetch failed: ${response.status}`);
        if (!mimeFromResponse(response, image.url)) throw new Error("Unsupported image mime type.");
        const original = new Uint8Array(await response.arrayBuffer());
        if (original.byteLength > VISUALIZATION_MAXIMUM_FILE_BYTES) throw new Error("Image exceeds the 12 MB studio limit.");
        // Wrap the box's own front, not the scene it was photographed in; then keep
        // the bytes small enough for the studio's short interactive transaction.
        const frontAspect = (plan.dimensions.width ?? 1) / Math.max(1, plan.dimensions.height ?? 1);
        const artwork = await cropFrontArtwork(original, { targetAspect: frontAspect });
        const { bytes, mimeType } = await downscaleVisualizationSource(artwork.bytes, artwork.mimeType);
        const upload = await validateArtworkUpload(
          new File([bytes as unknown as BlobPart], `${product.slug}-hero`.slice(0, 180), { type: mimeType }),
          {
            allowedMimeTypes: supportedArtworkMimeTypes,
            maximumBytes: VISUALIZATION_MAXIMUM_FILE_BYTES,
            minimumWidth: 1,
            minimumHeight: 1,
            maximumWidth: 50_000,
            maximumHeight: 50_000,
            allowTransparency: true,
          },
        );

        const job = await service.startVisualizationAnalysis({
          actorId: admin.id,
          productId: product.id,
          analysisMode: "manual",
          upload,
          productType: plan.model,
          geometryKind: plan.geometryKind,
        });
        await service.processVisualizationJob(job.id);
        const processed = await prisma.visualizationProcessingJob.findUnique({ where: { id: job.id }, select: { status: true, errorCode: true } });
        if (processed?.status !== "NEEDS_CONFIRMATION") {
          throw new Error(`Manual analysis ended in ${processed?.status ?? "unknown"}${processed?.errorCode ? ` (${processed.errorCode})` : ""}.`);
        }
        const confirmation = visualizationConfirmationFor(plan, {
          confidence: artwork.confidence,
          edgeColor: artwork.edgeColor,
        });
        await service.confirmVisualizationAnalysis(job.id, confirmation);
        const template = await service.saveVisualizationTemplate(admin.id, job.id, {
          name: `${product.name}`.slice(0, 150) + " 3D",
          productId: product.id,
          productType: confirmation.productType,
          geometry: confirmation.geometry,
          dimensions: confirmation.dimensions,
          surfaces: confirmation.surfaceMappings,
          materialSettings: confirmation.materialSettings,
        });
        // Publishing archives the product's previous template and relinks metadata.
        await service.changeVisualizationTemplateStatus(template.id, "publish");
        report.push({ slug: product.slug, handle, presetId, outcome: "published", model: plan.model, templateId: template.id, artworkConfidence: artwork.confidence });
        console.info(`PUBLISHED 3D ${product.slug} → ${plan.model} (${template.id}, artwork ${artwork.confidence})`);
      } catch (error) {
        report.push({ slug: product.slug, handle, presetId, outcome: "failed", model: plan.model, reason: error instanceof Error ? error.message : String(error) });
        console.error(`FAILED 3D ${product.slug}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } finally {
    const counts = report.reduce<Record<string, number>>((acc, row) => {
      acc[row.outcome] = (acc[row.outcome] ?? 0) + 1;
      return acc;
    }, {});
    console.info(`3D enablement summary: ${JSON.stringify(counts)}`);
    writeFileSync(join(process.cwd(), "docs", "research", "3d-enable-report.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), counts, rows: report }, null, 2)}\n`, "utf8");
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
