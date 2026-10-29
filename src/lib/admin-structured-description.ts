import {
  EZPAC_BULLET_MATCHERS,
  EZPAC_FEATURE_BULLET_LABELS,
  type EzpacFeatureBullet,
} from "./ezpac-feature-bullets";

export interface StructuredDescription {
  intro?: string;
  bestFor?: string[];
  featureBullets?: EzpacFeatureBullet[];
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_match, hexadecimal: string) => {
      const codePoint = Number.parseInt(hexadecimal, 16);
      return Number.isFinite(codePoint) && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : _match;
    })
    .replace(/&#(\d+);/g, (_match, decimal: string) => {
      const codePoint = Number.parseInt(decimal, 10);
      return Number.isFinite(codePoint) && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : _match;
    });
}

function stripHtml(value: string): string {
  return decodeHtmlEntities(value)
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<\/(?:p|div|li|h[1-6])\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchFeatureBullet(fragment: string): EzpacFeatureBullet | undefined {
  const normalized = fragment.toLowerCase();
  return EZPAC_BULLET_MATCHERS.find(([, phrases]) =>
    phrases.some((phrase) => normalized.includes(phrase)),
  )?.[0];
}

/**
 * Converts an EzPac export body into display-safe structured copy. Unrecognized
 * feature text is intentionally dropped instead of inventing a product claim.
 */
export function parseEzpacBodyHtml(bodyHtml: string): StructuredDescription {
  const plain = stripHtml(bodyHtml);
  if (!plain) return {};

  const bulletStart = plain.indexOf("\u2705");
  const beforeBullets = (bulletStart === -1 ? plain : plain.slice(0, bulletStart)).trim();
  const bulletFragments = bulletStart === -1
    ? []
    : plain.slice(bulletStart).split("\u2705").slice(1);
  const bestForMarker = /\bBest\s+for\s*:/i.exec(beforeBullets);
  const intro = (bestForMarker
    ? beforeBullets.slice(0, bestForMarker.index)
    : beforeBullets).trim();
  const bestFor = bestForMarker
    ? beforeBullets
        .slice(bestForMarker.index + bestForMarker[0].length)
        .replace(/[.\s]+$/, "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : [];
  const featureBullets = Array.from(new Set(
    bulletFragments
      .map(matchFeatureBullet)
      .filter((bullet): bullet is EzpacFeatureBullet => Boolean(bullet)),
  ));

  return {
    ...(intro ? { intro } : {}),
    ...(bestFor.length ? { bestFor } : {}),
    ...(featureBullets.length ? { featureBullets } : {}),
  };
}

/** Formats structured description data back to the plain product-description field. */
export function formatStructuredDescription(value: StructuredDescription): string {
  const intro = value.intro?.trim() ?? "";
  const bestFor = (value.bestFor ?? []).map((entry) => entry.trim()).filter(Boolean);
  const featureLabels = (value.featureBullets ?? [])
    .map((bullet) => EZPAC_FEATURE_BULLET_LABELS[bullet])
    .filter((label): label is string => Boolean(label));

  let output = intro;
  if (bestFor.length) {
    output += (output ? "\n\n" : "") + "Best for: " + bestFor.join(", ");
  }
  if (featureLabels.length) {
    output += (output ? (bestFor.length ? "\n" : "\n\n") : "")
      + "\u2705 " + featureLabels.join("  \u2705 ");
  }

  return output.slice(0, 10_000);
}
