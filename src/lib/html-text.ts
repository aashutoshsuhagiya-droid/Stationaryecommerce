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

export interface DescriptionBlock {
  kind: "paragraph" | "item";
  /** A leading bold label such as "Dimensions" (trailing colon removed). */
  label?: string;
  text: string;
}

const LEADING_LABEL = /^\s*<(strong|b)\b[^>]*>([\s\S]*?)<\/\1\s*>\s*:?\s*/i;

function descriptionBlock(kind: DescriptionBlock["kind"], inner: string): DescriptionBlock | null {
  const labelMatch = inner.match(LEADING_LABEL);
  let label = labelMatch ? htmlToPlainText(labelMatch[2]).replace(/\s*:\s*$/, "") : "";
  let text = htmlToPlainText(labelMatch ? inner.slice(labelMatch[0].length) : inner).replace(/^:\s*/, "");
  // A whole bullet in bold ("<strong>Great Gift Idea: Carry it…</strong>") keeps only its short lead as the label.
  const lead = label.match(/^([^:]{1,40}):\s+(.+)$/);
  if (!text && lead) [label, text] = [lead[1], lead[2]];
  if (!label && !text) return null;
  return label ? { kind, label, text } : { kind, text };
}

/** A specification table row: first cell is the label, the remaining cells its value. */
function tableRowBlock(row: string): DescriptionBlock | null {
  const cells = [...row.matchAll(/<(td|th)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)].map((cell) => htmlToPlainText(cell[2])).filter(Boolean);
  if (!cells.length) return null;
  if (cells.length === 1) return { kind: "item", text: cells[0] };
  return { kind: "item", label: cells[0].replace(/\s*:\s*$/, ""), text: cells.slice(1).join(", ") };
}

/**
 * Splits a product description into plain-text paragraphs and list items for
 * display without injecting HTML. Empty spacer paragraphs (`<p>&nbsp;</p>`) are dropped.
 */
export function htmlToDescriptionBlocks(value: string | null | undefined): DescriptionBlock[] {
  const source = value?.trim() ?? "";
  if (!source) return [];
  if (!HTML_TAG.test(source)) {
    return source.split(/\n\s*\n/).map((part) => decodeHtmlEntities(part).replace(/\s+/g, " ").trim()).filter(Boolean).map((text) => ({ kind: "paragraph" as const, text }));
  }
  const blocks: DescriptionBlock[] = [];
  const pattern = /<(p|li|h[1-6]|tr)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    const tag = match[1].toLowerCase();
    const block = tag === "tr" ? tableRowBlock(match[2]) : descriptionBlock(tag === "li" ? "item" : "paragraph", match[2]);
    if (block) blocks.push(block);
  }
  if (blocks.length) return blocks;
  const text = htmlToPlainText(source);
  return text ? [{ kind: "paragraph", text }] : [];
}
