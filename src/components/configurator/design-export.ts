import {
  preloadArtworkImages,
  renderSurfaceToCanvas,
} from "./artwork-canvas-renderer";
import type {
  ArtworkDocument,
  PrintableSurfaceDefinition,
} from "./artwork-types";

const EXPORT_DPI = 300;
const ZIP_UTF8_FLAG = 0x0800;
const CRC32_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return value >>> 0;
});

export interface ArtworkExportOptions {
  document: ArtworkDocument;
  surfaces: PrintableSurfaceDefinition[];
  background: string;
  accent?: string;
  productName: string;
}

export interface ArtworkExportResult {
  fileCount: number;
  filename: string;
  zipped: boolean;
}

interface StoredZipEntry {
  name: string;
  data: Uint8Array;
}

function safeFilenamePart(value: string, fallback: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 64);
  return normalized || fallback;
}

export function getArtworkExportSize(surface: PrintableSurfaceDefinition): {
  width: number;
  height: number;
  density: "300dpi" | "2x";
} {
  const hasPhysicalSize = Number.isFinite(surface.physicalWidthMm)
    && Number.isFinite(surface.physicalHeightMm)
    && (surface.physicalWidthMm ?? 0) > 0
    && (surface.physicalHeightMm ?? 0) > 0;

  if (hasPhysicalSize) {
    return {
      width: Math.max(1, Math.round((surface.physicalWidthMm! / 25.4) * EXPORT_DPI)),
      height: Math.max(1, Math.round((surface.physicalHeightMm! / 25.4) * EXPORT_DPI)),
      density: "300dpi",
    };
  }

  return {
    width: Math.max(1, Math.round(surface.width * 2)),
    height: Math.max(1, Math.round(surface.height * 2)),
    density: "2x",
  };
}

export function buildArtworkExportFilename(
  productName: string,
  surfaceName: string,
  width: number,
  height: number,
  density: "300dpi" | "2x",
): string {
  const product = safeFilenamePart(productName, "product");
  const surface = safeFilenamePart(surfaceName, "surface");
  return `naamly-${product}-${surface}-${width}x${height}@${density}.png`;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function getDosTimestamp(date: Date): { date: number; time: number } {
  const year = Math.min(2107, Math.max(1980, date.getFullYear()));
  return {
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
  };
}

function joinBytes(chunks: Uint8Array[], totalLength: number): Uint8Array {
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

export function createStoredZip(entries: StoredZipEntry[], modifiedAt = new Date()): Uint8Array {
  if (!entries.length) throw new Error("A ZIP archive needs at least one file.");
  if (entries.length > 0xffff) throw new Error("Too many files for this ZIP archive.");

  const encoder = new TextEncoder();
  const localSectionChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  const timestamp = getDosTimestamp(modifiedAt);
  let localSectionSize = 0;
  let centralSize = 0;

  for (const entry of entries) {
    const filename = encoder.encode(entry.name);
    if (filename.byteLength > 0xffff) throw new Error("A ZIP filename is too long.");
    if (entry.data.byteLength > 0xffffffff) throw new Error("A ZIP entry is too large.");

    const localHeaderOffset = localSectionSize;
    const checksum = crc32(entry.data);
    const localHeader = new Uint8Array(30 + filename.byteLength);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, ZIP_UTF8_FLAG, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, timestamp.time, true);
    localView.setUint16(12, timestamp.date, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, entry.data.byteLength, true);
    localView.setUint32(22, entry.data.byteLength, true);
    localView.setUint16(26, filename.byteLength, true);
    localView.setUint16(28, 0, true);
    localHeader.set(filename, 30);
    // A stored ZIP interleaves every local header with that entry's payload.
    localSectionChunks.push(localHeader, entry.data);
    localSectionSize += localHeader.byteLength + entry.data.byteLength;

    const centralHeader = new Uint8Array(46 + filename.byteLength);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, ZIP_UTF8_FLAG, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, timestamp.time, true);
    centralView.setUint16(14, timestamp.date, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, entry.data.byteLength, true);
    centralView.setUint32(24, entry.data.byteLength, true);
    centralView.setUint16(28, filename.byteLength, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, localHeaderOffset, true);
    centralHeader.set(filename, 46);
    centralChunks.push(centralHeader);

    centralSize += centralHeader.byteLength;
    if (localSectionSize > 0xffffffff || centralSize > 0xffffffff) {
      throw new Error("The design is too large for a standard ZIP archive.");
    }
  }

  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, localSectionSize, true);
  endView.setUint16(20, 0, true);

  return joinBytes(
    [...localSectionChunks, ...centralChunks, endRecord],
    localSectionSize + centralSize + endRecord.byteLength,
  );
}

export function createStoredZipBlob(
  entries: StoredZipEntry[],
  modifiedAt = new Date(),
): Blob {
  const bytes = createStoredZip(entries, modifiedAt);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer], { type: "application/zip" });
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("The browser could not encode the design as PNG."));
      }, "image/png");
    } catch (error) {
      reject(error);
    }
  });
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = url;
  link.download = filename;
  link.hidden = true;
  window.document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export async function downloadArtworkDesign({
  document: artworkDocument,
  surfaces,
  background,
  accent,
  productName,
}: ArtworkExportOptions): Promise<ArtworkExportResult> {
  if (typeof window === "undefined") {
    throw new Error("Design downloads are only available in the browser.");
  }
  if (!artworkDocument.surfaces.length) {
    throw new Error("This design does not contain an artwork surface.");
  }

  await preloadArtworkImages(artworkDocument);

  const files: Array<{ name: string; blob: Blob }> = [];
  for (const [index, artworkSurface] of artworkDocument.surfaces.entries()) {
    const configuredSurface = surfaces.find((surface) => surface.id === artworkSurface.id)
      ?? surfaces[index];
    const surface: PrintableSurfaceDefinition = configuredSurface
      ? { ...configuredSurface, id: artworkSurface.id, label: artworkSurface.label }
      : {
          id: artworkSurface.id,
          label: artworkSurface.label,
          width: 600,
          height: 360,
          safeInset: 0,
        };
    const size = getArtworkExportSize(surface);
    const canvas = window.document.createElement("canvas");
    renderSurfaceToCanvas(
      canvas,
      artworkDocument,
      artworkSurface.id,
      surface,
      background,
      accent,
      size,
    );
    const blob = await canvasToPngBlob(canvas);
    files.push({
      name: buildArtworkExportFilename(
        productName,
        artworkSurface.id || artworkSurface.label,
        size.width,
        size.height,
        size.density,
      ),
      blob,
    });
    canvas.width = 1;
    canvas.height = 1;
  }

  if (files.length === 1) {
    downloadBlob(files[0].blob, files[0].name);
    return { fileCount: 1, filename: files[0].name, zipped: false };
  }

  const zipEntries = await Promise.all(files.map(async (file) => ({
    name: file.name,
    data: new Uint8Array(await file.blob.arrayBuffer()),
  })));
  const archiveName = `naamly-${safeFilenamePart(productName, "product")}-design.zip`;
  downloadBlob(createStoredZipBlob(zipEntries), archiveName);
  return { fileCount: files.length, filename: archiveName, zipped: true };
}
