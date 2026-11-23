/**
 * Backfills 2D studio designs onto already-imported products, without a full
 * re-import.
 *
 * Usage: tsx scripts/import-external-catalog/2d-templates.ts [--dry-run] [--source=ranbazaar] [--only=<slug>] [--force-studio]
 *
 * For each Ranbazaar product it reads the offline source snapshot, then (in one
 * transaction per product) upserts one PersonalizationTemplate per design
 * sample by its deterministic slug, links them in source order with the
 * source's default sample marked default, replaces the personalization fields
 * with the shared, source-limited set, and gives the design surface a size.
 * Re-running converges: unchanged templates are left alone. Products whose
 * designs were edited in the admin design editor are skipped unless
 * --force-studio is given (which resets them to the source).
 */
import "../../prisma/load-env";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "../../src/generated/prisma/client";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { planRanbazaarStudio, STUDIO_PHOTO_UPLOAD, studioPrintArea, writeStudioPlan } from "./studio-writer";
import { loadMockupSizes, measureMissingMockups, saveMockupSizes } from "./mockup-sizes";
import { parseRanbazaarStudio } from "./ranbazaar-studio";
import { studioEditedInAdmin } from "../../src/lib/studio-design";

interface Options {
  dryRun: boolean;
  source: "ranbazaar";
  only?: string;
  forceStudio: boolean;
}

function parseArgs(args: readonly string[]): Options {
  const options: Options = { dryRun: false, source: "ranbazaar", forceStudio: false };
  for (const arg of args) {
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg.startsWith("--only=")) options.only = arg.slice("--only=".length);
    else if (arg === "--force-studio") options.forceStudio = true;
    else if (arg.startsWith("--source=")) {
      const source = arg.slice("--source=".length);
      // EzPac has no source 2D data; its products fall back to their own photo.
      if (source !== "ranbazaar") throw new Error(`Only --source=ranbazaar has source 2D designs (got ${source}).`);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

function loadSnapshots(): Map<string, unknown> {
  const directory = join(process.cwd(), "docs", "research", "ranbazaar", "products");
  const byId = new Map<string, unknown>();
  for (const file of readdirSync(directory).filter((name) => name.endsWith(".json"))) {
    const product = object(JSON.parse(readFileSync(join(directory, file), "utf8"))).product;
    const id = object(product).id;
    if (typeof id === "string") byId.set(id, product);
  }
  return byId;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const connectionString = (process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL || "").trim();
  if (!connectionString) throw new Error("DATABASE_URL_POOLED or DATABASE_URL is required.");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const snapshots = loadSnapshots();

  const totals = {
    products: 0,
    withDesigns: 0,
    templates: { created: 0, updated: 0, unchanged: 0, planned: 0 },
    fieldsRemoved: 0,
    linksRemoved: 0,
    missingSnapshot: [] as string[],
    keptAdminEdits: [] as string[],
    unmeasuredMockups: [] as string[],
    failed: [] as Array<{ slug: string; reason: string }>,
  };

  try {
    const products = await prisma.product.findMany({
      where: { metadata: { path: ["importSource"], equals: options.source }, ...(options.only ? { slug: options.only } : {}) },
      select: { id: true, slug: true, metadata: true },
      orderBy: { slug: "asc" },
    });
    console.info(`${products.length} ${options.source} products${options.dryRun ? " (dry run)" : ""}.`);

    // Canvas size follows each mockup's aspect ratio, so measure any not yet cached.
    const sizes = loadMockupSizes();
    const mockups = products.flatMap((product) => {
      const source = snapshots.get(String(object(product.metadata).externalId ?? ""));
      return source ? parseRanbazaarStudio(source).samples.map((sample) => sample.mockupUrl) : [];
    });
    const before = sizes.size;
    const unmeasured = await measureMissingMockups(mockups, sizes);
    if (sizes.size > before) saveMockupSizes(sizes);
    totals.unmeasuredMockups = unmeasured;
    console.info(`Mockup sizes: ${sizes.size} known (${sizes.size - before} measured now, ${unmeasured.length} failed).`);

    for (const product of products) {
      totals.products += 1;
      const metadata = object(product.metadata);
      if (studioEditedInAdmin(metadata) && !options.forceStudio) {
        totals.keptAdminEdits.push(product.slug);
        console.info(`KEPT ${product.slug} · designs edited in admin (--force-studio resets them to the source)`);
        continue;
      }
      const externalId = typeof metadata.externalId === "string" ? metadata.externalId : "";
      const source = snapshots.get(externalId);
      if (!source) {
        totals.missingSnapshot.push(product.slug);
        continue;
      }
      const plan = planRanbazaarStudio(externalId, source, sizes);
      if (plan.templates.length) totals.withDesigns += 1;

      if (options.dryRun) {
        totals.templates.planned += plan.templates.length;
        const existing = await prisma.personalizationTemplate.count({ where: { slug: { in: plan.templates.map((template) => template.slug) } } });
        totals.templates.created += plan.templates.length - existing;
        continue;
      }

      try {
        const result = await prisma.$transaction(async (tx) => {
          const written = await writeStudioPlan(tx, product.id, plan);
          const configurator = object(metadata.configurator);
          await tx.product.update({
            where: { id: product.id },
            data: {
              // Photo-only designs (no text inputs) are still customised.
              customizable: plan.fields.length > 0 || plan.acceptsPhotos,
              ...(plan.templates.length
                ? {
                    metadata: {
                      ...metadata,
                      configurator: {
                        ...configurator,
                        printAreas: [studioPrintArea(plan)],
                        // Photo slots need uploads; products without them keep whatever they had.
                        ...(plan.acceptsPhotos ? STUDIO_PHOTO_UPLOAD : {}),
                      },
                    } as Prisma.InputJsonValue,
                  }
                : {}),
            },
          });
          return written;
        }, { maxWait: 15_000, timeout: 90_000 });
        totals.templates.created += result.templates.created;
        totals.templates.updated += result.templates.updated;
        totals.templates.unchanged += result.templates.unchanged;
        totals.fieldsRemoved += result.fieldsRemoved.length;
        totals.linksRemoved += result.linksRemoved;
        console.info(`OK ${product.slug} · ${plan.templates.length} designs · ${plan.fields.length} fields${result.fieldsRemoved.length ? ` · removed ${result.fieldsRemoved.join(", ")}` : ""}`);
      } catch (error) {
        const reason = error instanceof Error ? error.message.split("\n").slice(-1)[0] : String(error);
        totals.failed.push({ slug: product.slug, reason });
        console.error(`FAILED ${product.slug}: ${reason}`);
      }
    }
  } finally {
    await prisma.$disconnect();
    const report = { generatedAt: new Date().toISOString(), options, fidelity: { templates: totals.templates }, ...totals };
    writeFileSync(join(process.cwd(), "docs", "research", "2d-templates-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.info(`Summary: ${JSON.stringify({ products: totals.products, withDesigns: totals.withDesigns, templates: totals.templates, fieldsRemoved: totals.fieldsRemoved, keptAdminEdits: totals.keptAdminEdits.length, failed: totals.failed.length })}`);
    if (totals.failed.length) process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
