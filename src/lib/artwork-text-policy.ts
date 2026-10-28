import type { ArtworkTextAlignment, ArtworkTextPolicy } from "./types";

export const DEFAULT_ARTWORK_FONT_SIZE_MINIMUM = 8;
export const DEFAULT_ARTWORK_FONT_SIZE_MAXIMUM = 180;
export const ARTWORK_TEXT_ALIGNMENTS = ["left", "center", "right"] as const satisfies readonly ArtworkTextAlignment[];

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

/** Resolves newer typography settings without invalidating older saved product policies. */
export function resolveArtworkTextTypography(policy: ArtworkTextPolicy) {
  const fontSizeConfigured = (
    typeof policy.defaultFontSize === "number" ||
    typeof policy.minimumFontSize === "number" ||
    typeof policy.maximumFontSize === "number"
  );
  const alignmentConfigured = Boolean(policy.defaultTextAlign || policy.allowedTextAlignments?.length);
  const minimumFontSize = policy.minimumFontSize ?? DEFAULT_ARTWORK_FONT_SIZE_MINIMUM;
  const maximumFontSize = policy.maximumFontSize ?? DEFAULT_ARTWORK_FONT_SIZE_MAXIMUM;
  const defaultFontSize = clamp(
    policy.defaultFontSize ?? policy.geometry.default.height * 0.64,
    minimumFontSize,
    maximumFontSize,
  );
  const allowedTextAlignments = policy.allowedTextAlignments?.length
    ? [...policy.allowedTextAlignments]
    : [...ARTWORK_TEXT_ALIGNMENTS];
  const requestedAlignment = policy.defaultTextAlign ?? "center";
  const defaultTextAlign = allowedTextAlignments.includes(requestedAlignment)
    ? requestedAlignment
    : allowedTextAlignments[0];

  return {
    minimumFontSize,
    maximumFontSize,
    defaultFontSize,
    allowedTextAlignments,
    defaultTextAlign,
    fontSizeConfigured,
    alignmentConfigured,
  };
}
