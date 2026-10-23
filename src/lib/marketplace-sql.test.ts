import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { normalizeServiceCity } from "./marketplace-assignment";

const migrationPath = resolve(
  process.cwd(),
  "prisma/migrations/20261023113000_add_vendor_service_category_eligibility/migration.sql",
);
const originalMigrationPath = resolve(
  process.cwd(),
  "prisma/migrations/20261023073000_add_vendor_assignment_marketplace/migration.sql",
);
const runtimeInstallerPath = resolve(process.cwd(), "prisma/install-marketplace-runtime.ts");

test("forward migration backfills approved category scope without rewriting the original migration", async () => {
  const [sql, originalSql, installer] = await Promise.all([
    readFile(migrationPath, "utf8"),
    readFile(originalMigrationPath, "utf8"),
    readFile(runtimeInstallerPath, "utf8"),
  ]);
  const originalProfileTable = originalSql.match(/CREATE TABLE "VendorProfile" \(([\s\S]*?)\n\);/)?.[1];
  assert.ok(originalProfileTable, "Original VendorProfile definition must remain available");
  assert.doesNotMatch(originalProfileTable, /serviceCategoryIds/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "serviceCategoryIds" TEXT\[\]/);
  assert.match(sql, /SET "serviceCategoryIds" = application\."serviceCategoryIds"/);
  assert.match(sql, /application\."id" = profile\."applicationId"/);
  assert.match(sql, /ALTER COLUMN "serviceCategoryIds" SET DEFAULT ARRAY\[\]::TEXT\[\]/);
  assert.match(sql, /ALTER COLUMN "serviceCategoryIds" SET NOT NULL/);
  assert.match(sql, /USING GIN \("serviceCategoryIds"\)/);
  assert.match(installer, /20261023113000_add_vendor_service_category_eligibility/);
});

test("database and application city normalization share the NFKD ASCII contract", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.equal(normalizeServiceCity("  Bengal\u016bru  "), "bengaluru");
  assert.equal(normalizeServiceCity("S\u00e3o---Paulo"), "sao paulo");
  assert.match(sql, /CREATE OR REPLACE FUNCTION "normalizeMarketplaceCity"/);
  assert.ok(sql.includes("normalize(input_city, NFKD), U&'[\\0300-\\036f]'"));
  assert.match(sql, /'\[\^a-z0-9\]\+'/);
  assert.match(sql, /"normalizeMarketplaceCity"\(address\."city"\) = selected_offer\.normalized_city/);
});

test("offer acceptance SQL uses server time, order-first locking and all operational gates", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /accepted_at TIMESTAMP\(3\) := clock_timestamp\(\)/);
  assert.doesNotMatch(sql, /p_accepted_at/);
  const orderLock = sql.indexOf('PERFORM 1 FROM "Order" WHERE "id" = target_order_id FOR UPDATE');
  const offerLock = sql.indexOf("FOR UPDATE OF offer, assignment, vendor");
  assert.ok(orderLock > 0 && offerLock > orderLock, "Order must be locked before offer/vendor rows");
  assert.match(sql, /verification_status <> 'APPROVED'/);
  assert.match(sql, /operational_status <> 'ACTIVE'/);
  assert.match(sql, /availability_status <> 'ONLINE'/);
  assert.match(sql, /payment_status <> 'CAPTURED'/);
  assert.match(sql, /order_status IN \('DELIVERED', 'CANCELLED', 'REFUND_PROCESSING', 'REFUNDED'\)/);
  assert.match(sql, /normalized_city/);
  assert.match(sql, /address\."city"/);
  assert.match(sql, /product\."categoryId" = ANY \(selected_offer\.service_category_ids\)/);
  assert.match(sql, /SUM\(item\."quantity"\)/);
});

test("terminal order SQL releases vendor capacity idempotently", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /CREATE TRIGGER "Order_release_vendor_capacity"/);
  assert.match(sql, /GREATEST\("activeOrderCount" - 1, 0\)/);
  assert.match(sql, /NEW\."status" IN \('DELIVERED', 'CANCELLED', 'REFUNDED'\)/);
  assert.match(sql, /OLD\."status" NOT IN \('DELIVERED', 'CANCELLED', 'REFUNDED'\)/);
});
