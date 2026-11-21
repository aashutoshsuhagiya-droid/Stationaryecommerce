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
 * skipped. Ambiguous shapes are skipped and reported — never guessed.
 */
import "../../prisma/load-env";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { EZPAC_SHOPIFY_PRODUCT_MAPPING } from "../../src/lib/ezpac-product-mapping";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type PackagingModel = "folding-carton" | "mailer-box" | "square-box" | "paper-bag" | "stand-up-pouch";

interface ModelPlan {
  model: PackagingModel;
  geometryKind: "box" | "bag" | "pouch";
  dimensions: Record<string, number>;
}

const BOX_DIMENSIONS = { width: 150, height: 100, depth: 50 };
const SQUARE_DIMENSIONS = { width: 100, height: 100, depth: 100 };
const BAG_DIMENSIONS = { width: 250, height: 350, gusset: 80 };
const POUCH_DIMENSIONS = { width: 160, height: 240, gusset: 90 };

const carton: ModelPlan = { model: "folding-carton", geometryKind: "box", dimensions: BOX_DIMENSIONS };
const bag: ModelPlan = { model: "paper-bag", geometryKind: "bag", dimensions: BAG_DIMENSIONS };

/**
 * Conservative per-preset mapping. Only preset slugs that unambiguously name a
 * packaging shape are listed; everything else stays 2D-only.
 * - slider/plain boxes → folding-carton; window → mailer-box; square → square-box
 * - bags and courier mailers → paper-bag; ziplock pouch → stand-up-pouch
 * - pillow/triangle/popcorn/tray shapes and flat print products are ambiguous → skipped
 */
const PRESET_MODEL_PLANS: Record<string, ModelPlan> = {
  "soap-box": carton,
  "perfume-box": carton,
  "cosmetic-beauty-brand-box": carton,
  "cosmetic-beauty-box-with-inside-holder": carton,
  "slider-box-thick-wall": carton,
  "slider-box-thin-wall": carton,
  "gift-box": carton,
  "pooja-box": carton,
  "flower-box": carton,
  "snack-box": carton,
  "paan-box": carton,
  "mithai-box-top-bottom-style": carton,
  "brownie-box": carton,
  "chocolate-box": carton,
  "chocolate-pack-box": carton,
  "cereal-box": carton,
  "food-delivery-box": carton,
  "food-parcel-box": carton,
  "pen-set-box": carton,
  "tissue-paper-box": carton,
  "side-open-box": carton,
  "zipper-box": carton,
  "mobile-cover-box": carton,
  "sachet-box": carton,
  "unboxing-experience-box": carton,
  "hanging-box": carton,
  "middle-hanging-box": carton,
  "window-box": { model: "mailer-box", geometryKind: "box", dimensions: BOX_DIMENSIONS },
  "square-box": { model: "square-box", geometryKind: "box", dimensions: SQUARE_DIMENSIONS },
  "d-cut-paper-bag": bag,
  "custom-branded-laminated-carry-bag": bag,
  "parcel-bag": bag,
  "courier-bags": bag,
  "e-commerce-mailers": bag,
  "d2c-mailer-bag": bag,
  "brand-ziplock-pouch": { model: "stand-up-pouch", geometryKind: "pouch", dimensions: POUCH_DIMENSIONS },
};

interface ReportRow {
  slug: string;
  handle: string | null;
  presetId: string | null;
  outcome: "published" | "already-linked" | "skipped-ambiguous" | "skipped-no-image" | "failed";
  model?: PackagingModel;
  templateId?: string;
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
      where: { metadata: { path: ["importSource"], equals: "ezpac" } },
      select: { id: true, slug: true, name: true, metadata: true },
      orderBy: { slug: "asc" },
    });
    console.info(`${products.length} EzPac products found.`);

    for (const product of products) {
      const metadata = (product.metadata ?? {}) as Record<string, unknown>;
      const handle = handleById.get(String(metadata.externalId ?? "")) ?? null;
      const mapping = handle ? EZPAC_SHOPIFY_PRODUCT_MAPPING.find((entry) => entry.shopifyHandle === handle) : undefined;
      const presetId = mapping?.presetId ?? null;
      const plan = presetId ? PRESET_MODEL_PLANS[presetId] : undefined;

      const published = await prisma.visualizationTemplate.findFirst({
        where: { productId: product.id, status: "PUBLISHED", archivedAt: null },
        select: { id: true },
      });
      if (published) {
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
        let mimeType = mimeFromResponse(response, image.url);
        if (!mimeType) throw new Error("Unsupported image mime type.");
        let bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength > VISUALIZATION_MAXIMUM_FILE_BYTES) throw new Error("Image exceeds the 12 MB studio limit.");
        // Large hero bytes cannot be inserted within the service's 5 s interactive
        // transaction against the remote DB; a texture does not need print resolution.
        if (bytes.byteLength > 500 * 1024) {
          const { default: sharp } = await import("sharp");
          bytes = new Uint8Array(await sharp(bytes).resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer());
          mimeType = "image/webp";
        }
        const upload = await validateArtworkUpload(
          new File([bytes], `${product.slug}-hero`.slice(0, 180), { type: mimeType }),
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
        const confirmation = {
          productType: plan.model,
          geometry: { kind: plan.geometryKind },
          dimensions: { unit: "mm" as const, ...plan.dimensions },
          surfaceMappings: [{ surfaceId: "front", label: "Front", role: "front" as const }],
          manufacturingValidated: false,
        };
        await service.confirmVisualizationAnalysis(job.id, confirmation);
        const template = await service.saveVisualizationTemplate(admin.id, job.id, {
          name: `${product.name}`.slice(0, 150) + " 3D",
          productId: product.id,
          productType: confirmation.productType,
          geometry: confirmation.geometry,
          dimensions: confirmation.dimensions,
          surfaces: confirmation.surfaceMappings,
        });
        await service.changeVisualizationTemplateStatus(template.id, "publish");
        report.push({ slug: product.slug, handle, presetId, outcome: "published", model: plan.model, templateId: template.id });
        console.info(`PUBLISHED 3D ${product.slug} → ${plan.model} (${template.id})`);
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
