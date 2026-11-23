/**
 * Fonts the 2D studio can draw with, and the one place that maps a source
 * site's font names onto them.
 *
 * Only fonts we may ship are listed (all SIL Open Font License via Google
 * Fonts, loaded with next/font in the root layout). Commercial source fonts are
 * mapped to the closest open substitute; if ops later license the original,
 * swap the entry in SOURCE_FONT_MAP and add the file — nothing else changes.
 */

export type StudioFontId =
  | "montserrat" | "roboto" | "fredoka" | "bebas-neue" | "allura" | "aleo" | "el-messiri" | "lato"
  | "rounded" | "sans" | "serif";

export interface StudioFont {
  label: string;
  /** CSS custom property set by next/font on <html>; resolves to the hashed family. */
  cssVariable?: string;
  /** Used until the web font loads, and in non-browser contexts. */
  fallback: string;
  /**
   * Draw glyphs this much larger than the source font size so a substitute with a
   * smaller cap height matches the original. Line height and positions keep the
   * source size, so placement does not move. Default 1.
   */
  glyphScale?: number;
  /** Move glyphs down by this fraction of the drawn size so their capitals centre on the line. Default 0. */
  glyphShift?: number;
}

export const STUDIO_FONTS: Readonly<Record<StudioFontId, StudioFont>> = {
  montserrat: { label: "Montserrat", cssVariable: "--font-studio-montserrat", fallback: "'Montserrat', Arial, sans-serif" },
  roboto: { label: "Roboto", cssVariable: "--font-studio-roboto", fallback: "'Roboto', Arial, sans-serif" },
  fredoka: { label: "Fredoka", cssVariable: "--font-studio-fredoka", fallback: "'Fredoka', 'Nunito', Arial, sans-serif" },
  // Measured side by side on the bottle sticker (85 px): Roundkey capitals are 89 px tall and
  // centred on the line; Bebas Neue capitals are ~0.68 em tall and sit 0.053 em above centre.
  "bebas-neue": { label: "Bebas Neue", cssVariable: "--font-studio-bebas-neue", fallback: "'Bebas Neue', 'Arial Narrow', Arial, sans-serif", glyphScale: 1.55, glyphShift: 0.053 },
  allura: { label: "Allura", cssVariable: "--font-studio-allura", fallback: "'Allura', 'Brush Script MT', cursive" },
  aleo: { label: "Aleo", cssVariable: "--font-studio-aleo", fallback: "'Aleo', Georgia, serif" },
  "el-messiri": { label: "El Messiri", cssVariable: "--font-studio-el-messiri", fallback: "'El Messiri', Georgia, serif" },
  lato: { label: "Lato", cssVariable: "--font-studio-lato", fallback: "'Lato', Arial, sans-serif" },
  // The editor's original three families stay valid ids.
  rounded: { label: "Rounded", fallback: "'Quicksand', 'Nunito', system-ui, sans-serif" },
  sans: { label: "Sans", fallback: "system-ui, -apple-system, Arial, sans-serif" },
  serif: { label: "Serif", fallback: "Georgia, 'Times New Roman', serif" },
};

/**
 * Source font name → the font we draw it with.
 * Gilroy Extrabold is commercial: Montserrat ExtraBold is its closest open
 * geometric match. Roundkey Medium (always set in capitals on the source) is a
 * tall condensed display face: Bebas Neue matches its proportions. The outline
 * face Indigo Outline becomes the rounded display face Fredoka.
 */
export const SOURCE_FONT_MAP: Readonly<Record<string, StudioFontId>> = {
  "gilroy extrabold": "montserrat",
  roboto: "roboto",
  "roundkey medium": "bebas-neue",
  "indigo outline": "fredoka",
  "allura-regular": "allura",
  allura: "allura",
  "aleo regular": "aleo",
  aleo: "aleo",
  "elmessiri bold": "el-messiri",
  "el messiri": "el-messiri",
  "lato regular": "lato",
  lato: "lato",
  "arial, sans-serif": "sans",
  arial: "sans",
};

/** How much larger than the source size this font is drawn (1 for most fonts). */
export function studioFontGlyphScale(id: string | undefined): number {
  return isStudioFontId(id) ? STUDIO_FONTS[id].glyphScale ?? 1 : 1;
}

/** How far down (fraction of the drawn size) this font's glyphs are moved (0 for most fonts). */
export function studioFontGlyphShift(id: string | undefined): number {
  return isStudioFontId(id) ? STUDIO_FONTS[id].glyphShift ?? 0 : 0;
}

export function isStudioFontId(value: unknown): value is StudioFontId {
  return typeof value === "string" && value in STUDIO_FONTS;
}

export function studioFontForSource(sourceFont: string | null | undefined): StudioFontId {
  const key = (sourceFont ?? "").trim().toLowerCase();
  return SOURCE_FONT_MAP[key] ?? "montserrat";
}

/**
 * A CSS font-family value. In the browser the next/font variable is resolved
 * first (it carries the real, hashed family name); the plain stack follows.
 */
export function studioFontStack(id: string | undefined, resolveVariable?: (name: string) => string): string {
  const font = isStudioFontId(id) ? STUDIO_FONTS[id] : STUDIO_FONTS.rounded;
  const resolved = font.cssVariable && resolveVariable ? resolveVariable(font.cssVariable).trim() : "";
  return resolved ? `${resolved}, ${font.fallback}` : font.fallback;
}
