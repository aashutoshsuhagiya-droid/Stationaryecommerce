import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const migrationPath = resolve(
  process.cwd(),
  "prisma/migrations/20261023073000_add_vendor_assignment_marketplace/migration.sql",
);

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
  assert.match(sql, /SUM\(item\."quantity"\)/);
});

test("terminal order SQL releases vendor capacity idempotently", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /CREATE TRIGGER "Order_release_vendor_capacity"/);
  assert.match(sql, /GREATEST\("activeOrderCount" - 1, 0\)/);
  assert.match(sql, /NEW\."status" IN \('DELIVERED', 'CANCELLED', 'REFUNDED'\)/);
  assert.match(sql, /OLD\."status" NOT IN \('DELIVERED', 'CANCELLED', 'REFUNDED'\)/);
});
