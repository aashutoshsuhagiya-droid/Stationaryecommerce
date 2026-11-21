/**
 * Publishes (or rolls back) imported external-catalog products.
 *
 * Usage: tsx scripts/import-external-catalog/publish-imported.ts --source=ezpac|ranbazaar|both [--rollback] [--dry-run]
 *
 * Publishing requires the latest import plan for the source to contain zero
 * failures; the importer is the only writer of product content, this script
 * only flips status/publishedAt. Rollback is non-destructive: status→DRAFT,
 * publishedAt→null; SKUs, images and fields survive.
 */
import "../../prisma/load-env";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

type Source = "ezpac" | "ranbazaar";

interface CliOptions {
  sources: Source[];
  rollback: boolean;
  dryRun: boolean;
}

function usage(message?: string): never {
  if (message) console.error(message);
  console.error("Usage: tsx scripts/import-external-catalog/publish-imported.ts --source=ezpac|ranbazaar|both [--rollback] [--dry-run]");
  process.exit(2);
}

function parseArgs(args: readonly string[]): CliOptions {
  let sources: Source[] | null = null;
  let rollback = false;
  let dryRun = false;
  for (const arg of args) {
    if (arg.startsWith("--source=")) {
      const candidate = arg.slice("--source=".length);
      if (candidate === "both") sources = ["ezpac", "ranbazaar"];
      else if (candidate === "ezpac" || candidate === "ranbazaar") sources = [candidate];
      else usage(`Invalid --source value: ${candidate}`);
    } else if (arg === "--rollback") {
      rollback = true;
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else {
      usage(`Unknown argument: ${arg}`);
    }
  }
  if (!sources) usage("--source is required (publish EzPac first, smoke-test, then Ranbazaar).");
  return { sources, rollback, dryRun };
}

/** The newest import plan must report zero failures for a source before publishing it. */
function assertLatestPlanClean(source: Source) {
  const researchDir = join(process.cwd(), "docs", "research");
  const planFiles = readdirSync(researchDir)
    .filter((file) => /^import-plan-\d{4}-\d{2}-\d{2}\.json$/.test(file))
    .sort();
  const latest = planFiles[planFiles.length - 1];
  if (!latest) throw new Error("No import plan found in docs/research/. Run the importer first.");
  const plan = JSON.parse(readFileSync(join(researchDir, latest), "utf8")) as {
    summaries?: Array<{ source: string; discovered: number; failed: unknown[] }>;
  };
  const summary = plan.summaries?.find((entry) => entry.source === source);
  if (!summary) throw new Error(`Latest plan ${latest} has no summary for ${source}. Run the importer for that source first.`);
  if (Array.isArray(summary.failed) && summary.failed.length > 0) {
    throw new Error(`Latest plan ${latest} reports ${summary.failed.length} failure(s) for ${source}; fix those before publishing.`);
  }
  console.info(`Plan gate ${latest}: ${source} discovered ${summary.discovered}, 0 failures.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const connectionString = (process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL)?.trim();
  if (!connectionString) throw new Error("DATABASE_URL_POOLED or DATABASE_URL is required.");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    for (const source of options.sources) {
      if (!options.rollback) assertLatestPlanClean(source);
      const candidates = await prisma.product.findMany({
        where: { metadata: { path: ["importSource"], equals: source } },
        select: { id: true, slug: true, status: true, publishedAt: true },
      });
      const now = new Date();
      const pending = options.rollback
        ? candidates.filter((product) => product.status !== "DRAFT" || product.publishedAt !== null)
        : candidates.filter((product) => product.status !== "ACTIVE" || !product.publishedAt);
      console.info(`${source}: ${candidates.length} imported products, ${pending.length} to ${options.rollback ? "roll back" : "publish"}.`);
      if (options.dryRun || !pending.length) continue;
      const result = await prisma.product.updateMany({
        where: { id: { in: pending.map((product) => product.id) } },
        data: options.rollback
          ? { status: "DRAFT", publishedAt: null }
          : { status: "ACTIVE", publishedAt: now },
      });
      console.info(`${source}: ${options.rollback ? "rolled back" : "published"} ${result.count} products.`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
