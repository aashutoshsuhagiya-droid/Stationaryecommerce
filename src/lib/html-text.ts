export function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x([0-9a-f]+);/gi, (match, hexadecimal: string) => {
      const codePoint = Number.parseInt(hexadecimal, 16);
      return Number.isFinite(codePoint) && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : match;
    })
    .replace(/&#(\d+);/g, (match, decimal: string) => {
      const codePoint = Number.parseInt(decimal, 10);
      return Number.isFinite(codePoint) && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : match;
    });
}

const HTML_TAG = /<\/?[a-z][^>]*>/i;

/** Tags are removed before entities are decoded, so escaped markup stays literal text. */
export function htmlToPlainText(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
      .replace(/<br\s*\/?\s*>/gi, " ")
      .replace(/<\/?[a-z][^>]*>/gi, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

/** Prose blocks first, then list items: bullets are attribute rows more often than summaries. */
function htmlBlocks(value: string): string[] {
  const listItems: string[] = [];
  const prose = value
    .replace(/<li\b[^>]*>([\s\S]*?)(?:<\/li\s*>|(?=<li\b)|$)/gi, (_match, item: string) => {
      listItems.push(htmlToPlainText(item));
      return " ";
    })
    .split(/<\/?(?:p|ul|ol|div|h[1-6]|br)\b[^>]*>/i)
    .map(htmlToPlainText);
  return [...prose, ...listItems].filter(Boolean);
}

/** Headings such as "Product Description:" or attribute rows such as "Color: Blue" are not a summary. */
function isSummarySentence(text: string): boolean {
  return text.length >= 25 && !text.endsWith(":");
}

function truncateAtWord(text: string, maximum: number): string {
  if (text.length <= maximum) return text;
  const cut = text.slice(0, maximum - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > maximum * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.–-]+$/, "")}…`;
}

/**
 * Display-safe one-line summary for a product. Admin-typed plain text is kept as is;
 * imported source HTML is flattened, and a heading-only paragraph falls back to the
 * first real sentence of the full description.
 */
export function productSummaryText(shortDescription: string | null | undefined, description: string | null | undefined, maximum = 300): string {
  const short = shortDescription?.trim() ?? "";
  if (short && !HTML_TAG.test(short) && !/&[#a-z0-9]+;/i.test(short)) return short;
  const candidates = [...htmlBlocks(short), ...htmlBlocks(description ?? "")];
  const summary = candidates.find(isSummarySentence);
  return summary ? truncateAtWord(summary, maximum) : "";
}
