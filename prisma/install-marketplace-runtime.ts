import "./load-env";

import { readFile } from "node:fs/promises";

import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required to install marketplace database functions.");

async function main() {
  const migrationUrls = [
    new URL("./migrations/20261023113000_add_vendor_service_category_eligibility/migration.sql", import.meta.url),
    new URL("./migrations/20261027130000_require_full_product_category_coverage/migration.sql", import.meta.url),
  ];
  const startMarker = "-- BEGIN MARKETPLACE_RUNTIME_SQL";
  const endMarker = "-- END MARKETPLACE_RUNTIME_SQL";
  // Managed Postgres (e.g. Prisma Postgres) runs the app under a restricted role that
  // cannot grant/revoke privileges, so skip those statements — the owning role already has full rights.
  const runtimeSql = (await Promise.all(migrationUrls.map(async (migrationUrl) => {
    const migration = await readFile(migrationUrl, "utf8");
    const start = migration.indexOf(startMarker);
    const end = migration.indexOf(endMarker);
    if (start < 0 || end <= start) throw new Error(`Marketplace runtime SQL markers are missing from ${migrationUrl.pathname}.`);
    return migration
      .slice(start + startMarker.length, end)
      .split("\n")
      .filter((line) => !/^\s*(GRANT|REVOKE)\b/i.test(line))
      .join("\n");
  }))).join("\n");

  const pool = new Pool({ connectionString, max: 1 });
  try {
    await pool.query(runtimeSql);
    console.info("Installed marketplace offer-acceptance and capacity-release database functions.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
