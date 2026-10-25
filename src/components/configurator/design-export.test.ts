import assert from "node:assert/strict";
import test from "node:test";

import {
  buildArtworkExportFilename,
  createStoredZip,
  createStoredZipBlob,
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
  }), { width: 300, height: 600, density: "300dpi" });
});

test("falls back to twice the design resolution", () => {
  assert.deepEqual(getArtworkExportSize({
    id: "front",
    label: "Front",
    width: 600,
    height: 360,
    safeInset: 20,
  }), { width: 1200, height: 720, density: "2x" });
});

test("builds a filesystem-safe PNG name with an honest resolution suffix", () => {
  assert.equal(
    buildArtworkExportFilename("Kid's / Bottle", "Front & Back", 1200, 720, "300dpi"),
    "naamly-kid-s-bottle-front-back-1200x720@300dpi.png",
  );
  assert.equal(
    buildArtworkExportFilename("Kid's / Bottle", "Front & Back", 1200, 720, "2x"),
    "naamly-kid-s-bottle-front-back-1200x720@2x.png",
  );
});

test("creates a parseable two-entry stored ZIP with correct local offsets", async () => {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const entries = [
    { name: "frönt.png", data: encoder.encode("front") },
    { name: "back.png", data: encoder.encode("back") },
  ];
  const modifiedAt = new Date(2026, 9, 23, 12, 30, 0);
  const zip = createStoredZip(entries, modifiedAt);
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const eocdOffset = zip.byteLength - 22;

  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(view.getUint32(eocdOffset, true), 0x06054b50);
  assert.equal(view.getUint16(eocdOffset + 4, true), 0);
  assert.equal(view.getUint16(eocdOffset + 6, true), 0);
  assert.equal(view.getUint16(eocdOffset + 8, true), entries.length);
  assert.equal(view.getUint16(eocdOffset + 10, true), entries.length);

  const centralSize = view.getUint32(eocdOffset + 12, true);
  const centralOffset = view.getUint32(eocdOffset + 16, true);
  assert.equal(centralOffset + centralSize, eocdOffset);

  const parsedEntries: Array<{ name: string; data: string; localOffset: number }> = [];
  let centralCursor = centralOffset;
  let expectedLocalOffset = 0;

  for (let index = 0; index < entries.length; index += 1) {
    assert.equal(view.getUint32(centralCursor, true), 0x02014b50);
    assert.equal(view.getUint16(centralCursor + 8, true), 0x0800);
    assert.equal(view.getUint16(centralCursor + 10, true), 0);
    const checksum = view.getUint32(centralCursor + 16, true);
    const compressedSize = view.getUint32(centralCursor + 20, true);
    const uncompressedSize = view.getUint32(centralCursor + 24, true);
    const nameLength = view.getUint16(centralCursor + 28, true);
    const extraLength = view.getUint16(centralCursor + 30, true);
    const commentLength = view.getUint16(centralCursor + 32, true);
    const localOffset = view.getUint32(centralCursor + 42, true);
    const centralName = decoder.decode(zip.subarray(
      centralCursor + 46,
      centralCursor + 46 + nameLength,
    ));

    assert.equal(localOffset, expectedLocalOffset);
    assert.equal(view.getUint32(localOffset, true), 0x04034b50);
    assert.equal(view.getUint16(localOffset + 6, true), 0x0800);
    assert.equal(view.getUint16(localOffset + 8, true), 0);
    assert.equal(view.getUint32(localOffset + 14, true), checksum);
    assert.equal(view.getUint32(localOffset + 18, true), compressedSize);
    assert.equal(view.getUint32(localOffset + 22, true), uncompressedSize);

    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const localName = decoder.decode(zip.subarray(
      localOffset + 30,
      localOffset + 30 + localNameLength,
    ));
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataOffset + compressedSize;

    assert.equal(localName, centralName);
    assert.equal(centralName, entries[index].name);
    assert.equal(compressedSize, uncompressedSize);
    assert.deepEqual(zip.subarray(dataOffset, dataEnd), entries[index].data);
    parsedEntries.push({
      name: centralName,
      data: decoder.decode(zip.subarray(dataOffset, dataEnd)),
      localOffset,
    });

    expectedLocalOffset = dataEnd;
    centralCursor += 46 + nameLength + extraLength + commentLength;
  }

  assert.equal(expectedLocalOffset, centralOffset);
  assert.equal(centralCursor, eocdOffset);
  assert.deepEqual(parsedEntries, [
    { name: "frönt.png", data: "front", localOffset: 0 },
    {
      name: "back.png",
      data: "back",
      localOffset: 30 + encoder.encode("frönt.png").byteLength + encoder.encode("front").byteLength,
    },
  ]);

  const blob = createStoredZipBlob(entries, modifiedAt);
  assert.equal(blob.type, "application/zip");
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), zip);
});
