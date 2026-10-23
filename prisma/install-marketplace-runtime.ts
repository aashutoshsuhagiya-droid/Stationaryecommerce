import "./load-env";

import { readFile } from "node:fs/promises";

import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required to install marketplace database functions.");

const migrationUrl = new URL("./migrations/20261023073000_add_vendor_assignment_marketplace/migration.sql", import.meta.url);
const migration = await readFile(migrationUrl, "utf8");
const startMarker = "-- BEGIN MARKETPLACE_RUNTIME_SQL";
const endMarker = "-- END MARKETPLACE_RUNTIME_SQL";
const start = migration.indexOf(startMarker);
const end = migration.indexOf(endMarker);
if (start < 0 || end <= start) throw new Error("Marketplace runtime SQL markers are missing from the migration.");

const pool = new Pool({ connectionString, max: 1 });
try {
  await pool.query(migration.slice(start + startMarker.length, end));
  console.info("Installed marketplace offer-acceptance and capacity-release database functions.");
} finally {
  await pool.end();
}
