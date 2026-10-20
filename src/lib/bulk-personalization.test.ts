import assert from "node:assert/strict";
import test from "node:test";

import {
  bulkPersonalizationPolicy,
  parseBulkPersonalizationCsv,
  validateBulkPersonalizationRows,
} from "./bulk-personalization";

test("parses RFC4180 quoting, embedded newlines and default quantities", () => {
  const parsed = parseBulkPersonalizationCsv(
    'name,details,quantity\r\n"Aarav, Mehta","Class 4\r\nSection B",2\r\n"Mira ""M"" Shah",,',
  );

  assert.deepEqual(parsed.fileIssues, []);
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0].name, "Aarav, Mehta");
  assert.equal(parsed.rows[0].details, "Class 4\r\nSection B");
  assert.equal(parsed.rows[0].quantity, 2);
  assert.equal(parsed.rows[1].rowNumber, 4);
  assert.equal(parsed.rows[1].name, 'Mira "M" Shah');
  assert.equal(parsed.rows[1].quantity, 1);
  assert.equal(parsed.validRowCount, 2);
});

test("preserves invalid rows with field-specific issues", () => {
  const parsed = parseBulkPersonalizationCsv(
    `name,details,quantity\n,Class 1,abc\n${"N".repeat(81)},,10001\nValid,,3,unexpected`,
  );

  assert.equal(parsed.rows.length, 3);
  assert.deepEqual(
    parsed.rows[0].issues.map((issue) => issue.code).sort(),
    ["INVALID_QUANTITY", "MISSING_NAME"],
  );
  assert.deepEqual(
    parsed.rows[1].issues.map((issue) => issue.code).sort(),
    ["INVALID_QUANTITY", "NAME_TOO_LONG"],
  );
  assert.equal(parsed.rows[2].issues[0].code, "COLUMN_COUNT");
  assert.equal(parsed.invalidRowCount, 3);
});

test("rejects missing, unknown and duplicate headers", () => {
  const missing = parseBulkPersonalizationCsv("details,quantity\nClass 1,1");
  const unknown = parseBulkPersonalizationCsv("name,colour\nAarav,blue");
  const duplicate = parseBulkPersonalizationCsv("name,NAME\nAarav,Aarav");

  assert.ok(missing.fileIssues.some((issue) => issue.includes('"name" header is missing')));
  assert.ok(unknown.fileIssues.some((issue) => issue.includes("Unknown header")));
  assert.ok(duplicate.fileIssues.some((issue) => issue.includes("Duplicate header")));
  assert.deepEqual(missing.rows, []);
  assert.deepEqual(unknown.rows, []);
  assert.deepEqual(duplicate.rows, []);
});

test("detects malformed CSV quotes", () => {
  const parsed = parseBulkPersonalizationCsv('name,details\n"Aarav,Class 1');
  assert.ok(parsed.fileIssues.some((issue) => issue.includes("Unclosed quoted field")));
  assert.deepEqual(parsed.rows, []);
});

test("detects duplicate names ignoring case and repeated whitespace", () => {
  const parsed = parseBulkPersonalizationCsv(
    "name,quantity\nAarav  Mehta,1\n  aarav mehta ,2\nMira,1",
  );

  assert.deepEqual(parsed.duplicateNames, ["Aarav Mehta"]);
  assert.equal(parsed.rows[0].issues[0].code, "DUPLICATE_NAME");
  assert.equal(parsed.rows[0].issues[0].severity, "warning");
  assert.equal(parsed.validRowCount, 3);
});

test("editable row validation recomputes policy and duplicate issues", () => {
  const validated = validateBulkPersonalizationRows([
    { rowNumber: 2, name: " Aarav ", details: "", quantity: 1 },
    { rowNumber: 3, name: "aarav", details: "x".repeat(161), quantity: 0 },
  ]);

  assert.deepEqual(validated.duplicateNames, ["Aarav"]);
  assert.equal(validated.rows[0].name, "Aarav");
  assert.deepEqual(
    validated.rows[1].issues.map((issue) => issue.code).sort(),
    ["DETAILS_TOO_LONG", "DUPLICATE_NAME", "INVALID_QUANTITY"],
  );
  assert.equal(validated.invalidRowCount, 1);
});

test("enforces the client file byte limit using UTF-8 bytes", () => {
  const oversized = `name\n${"é".repeat(bulkPersonalizationPolicy.maxClientFileBytes / 2)}`;
  const parsed = parseBulkPersonalizationCsv(oversized);
  assert.ok(parsed.fileIssues.some((issue) => issue.includes("larger than")));
});
