import assert from "node:assert/strict";
import test from "node:test";

import {
  buildArtworkExportFilename,
  createStoredZip,
  getArtworkExportSize,
} from "./design-export";

test("uses physical millimetres for exact 300 DPI export dimensions", () => {
  assert.deepEqual(getArtworkExportSize({
    id: "front",
    label: "Front",
    width: 600,
    height: 360,
    safeInset: 20,
    physicalWidthMm: 25.4,
    physicalHeightMm: 50.8,
  }), { width: 300, height: 600 });
});

test("falls back to twice the design resolution", () => {
  assert.deepEqual(getArtworkExportSize({
    id: "front",
    label: "Front",
    width: 600,
    height: 360,
    safeInset: 20,
  }), { width: 1200, height: 720 });
});

test("builds a filesystem-safe PNG name", () => {
  assert.equal(
    buildArtworkExportFilename("Kid's / Bottle", "Front & Back", 1200, 720),
    "naamly-kid-s-bottle-front-back-1200x720@300dpi.png",
  );
});

test("creates a standard stored ZIP with UTF-8 names and a central directory", () => {
  const encoder = new TextEncoder();
  const zip = createStoredZip([
    { name: "front.png", data: encoder.encode("front") },
    { name: "back.png", data: encoder.encode("back") },
  ], new Date(2026, 9, 23, 12, 30, 0));
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);

  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(view.getUint16(6, true), 0x0800);
  assert.equal(view.getUint16(8, true), 0);
  assert.equal(view.getUint32(zip.byteLength - 22, true), 0x06054b50);
  assert.equal(view.getUint16(zip.byteLength - 14, true), 2);
  assert.equal(view.getUint16(zip.byteLength - 12, true), 2);

  const centralOffset = view.getUint32(zip.byteLength - 6, true);
  assert.equal(view.getUint32(centralOffset, true), 0x02014b50);
});
