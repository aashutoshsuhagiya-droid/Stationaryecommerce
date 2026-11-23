/**
 * Natural pixel sizes of Ranbazaar design mockups.
 *
 * The reference editor fits each mockup into a 600 × 600 box anchored
 * top-left, and its text coordinates are relative to that fitted box — so a
 * template's canvas size depends on the mockup's aspect ratio. Sizes are
 * measured once (sharp reads the image header) and cached in a checked-in
 * JSON file, so imports and tests stay offline and deterministic.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

export interface MockupSize {
  width: number;
  height: number;
}

export type MockupSizes = Map<string, MockupSize>;

export const MOCKUP_SIZES_PATH = join(process.cwd(), "docs", "research", "ranbazaar", "mockup-sizes.json");

let cached: MockupSizes | null = null;

export function loadMockupSizes(path = MOCKUP_SIZES_PATH): MockupSizes {
  if (cached && path === MOCKUP_SIZES_PATH) return cached;
  const sizes: MockupSizes = new Map();
  if (existsSync(path)) {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, [number, number]>;
    for (const [url, pair] of Object.entries(raw)) {
      if (Array.isArray(pair) && pair[0] > 0 && pair[1] > 0) sizes.set(url, { width: pair[0], height: pair[1] });
    }
  }
  if (path === MOCKUP_SIZES_PATH) cached = sizes;
  return sizes;
}

export function saveMockupSizes(sizes: MockupSizes, path = MOCKUP_SIZES_PATH): void {
  const entries = [...sizes.entries()].sort(([left], [right]) => left.localeCompare(right));
  const body = Object.fromEntries(entries.map(([url, size]) => [url, [size.width, size.height]]));
  writeFileSync(path, `${JSON.stringify(body, null, 1)}\n`, "utf8");
}

async function measure(url: string): Promise<MockupSize | null> {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) return null;
  const metadata = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
  return metadata.width && metadata.height ? { width: metadata.width, height: metadata.height } : null;
}

/** Measures the URLs not yet in `sizes` (a few at a time) and adds them. Returns the URLs that failed. */
export async function measureMissingMockups(urls: Iterable<string>, sizes: MockupSizes, concurrency = 6): Promise<string[]> {
  const queue = [...new Set(urls)].filter((url) => !sizes.has(url));
  const failed: string[] = [];
  const worker = async () => {
    for (let url = queue.shift(); url; url = queue.shift()) {
      try {
        const size = await measure(url);
        if (size) sizes.set(url, size);
        else failed.push(url);
      } catch {
        failed.push(url);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
  return failed;
}
