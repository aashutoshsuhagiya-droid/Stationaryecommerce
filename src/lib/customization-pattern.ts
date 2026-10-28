export const MAX_CUSTOMIZATION_PATTERN_LENGTH = 200;

/** Empty admin values mean that no character restriction is configured. */
export function normalizeCustomizationPattern(value: unknown) {
  if (typeof value !== "string") return undefined;
  const pattern = value.trim();
  return pattern || undefined;
}

/**
 * Returns a user-facing issue without ever allowing RegExp construction errors
 * to escape into an admin request or storefront catalog read.
 */
export function customizationPatternIssue(value: unknown) {
  const pattern = normalizeCustomizationPattern(value);
  if (!pattern) return undefined;
  if (pattern.length > MAX_CUSTOMIZATION_PATTERN_LENGTH) {
    return `The allowed-character pattern must be ${MAX_CUSTOMIZATION_PATTERN_LENGTH} characters or fewer.`;
  }
  if (/[\u0000-\u001f\u007f]/u.test(pattern)) {
    return "The allowed-character pattern must stay on one line and cannot contain control characters.";
  }

  try {
    new RegExp(pattern, "u");
  } catch {
    return "Enter a valid JavaScript regular-expression pattern.";
  }

  // Customer input is bounded, but these common ambiguous repetition forms can
  // still create avoidable backtracking. Character classes provide a safer way
  // to express allowed characters (for example ^[A-Za-z .'-]+$).
  const repeatedGroup = /\((?:\\.|[^()])*(?:[+*]|\{\d+(?:,\d*)?\})(?:\\.|[^()])*\)(?:[+*]|\{\d+(?:,\d*)?\})/u;
  const repeatedAlternation = /\((?:\\.|[^()])*\|(?:\\.|[^()])*\)(?:[+*]|\{\d+(?:,\d*)?\})/u;
  if (repeatedGroup.test(pattern) || repeatedAlternation.test(pattern)) {
    return "Use a character class instead of nested or repeated alternatives in this pattern.";
  }
  return undefined;
}

export function isSafeCustomizationPattern(value: unknown): value is string {
  return Boolean(normalizeCustomizationPattern(value)) && !customizationPatternIssue(value);
}
