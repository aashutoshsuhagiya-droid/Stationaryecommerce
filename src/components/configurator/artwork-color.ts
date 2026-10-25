import type { ArtworkDocument } from "./artwork-types";
import { neutralPresentationPalette } from "../../lib/data";

const DARK_TEXT: string = neutralPresentationPalette.ink;
const LIGHT_TEXT: string = neutralPresentationPalette.surface;
const MINIMUM_TEXT_CONTRAST = 4.5;

function parseHexColor(value: string): [number, number, number] | null {
  const hex = value.trim().replace(/^#/u, "");
  if (/^[0-9a-f]{3}$/iu.test(hex)) {
    return Array.from(hex, (character) => Number.parseInt(`${character}${character}`, 16)) as [number, number, number];
  }
  if (!/^[0-9a-f]{6}$/iu.test(hex)) return null;
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ];
}

function relativeLuminance(color: [number, number, number]): number {
  const [red, green, blue] = color.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

export function getContrastRatio(foreground: string, background: string): number {
  const foregroundColor = parseHexColor(foreground);
  const backgroundColor = parseHexColor(background);
  if (!foregroundColor || !backgroundColor) return 0;
  const foregroundLuminance = relativeLuminance(foregroundColor);
  const backgroundLuminance = relativeLuminance(backgroundColor);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

export function getReadableTextColor(background: string, preferred = DARK_TEXT): string {
  if (getContrastRatio(preferred, background) >= MINIMUM_TEXT_CONTRAST) return preferred;
  return getContrastRatio(LIGHT_TEXT, background) > getContrastRatio(DARK_TEXT, background)
    ? LIGHT_TEXT
    : DARK_TEXT;
}

export function setPersonalizedNameColor(
  document: ArtworkDocument,
  color: string,
): ArtworkDocument {
  let changed = false;
  const surfaces = document.surfaces.map((surface) => ({
    ...surface,
    layers: surface.layers.map((layer) => {
      if (layer.id !== "personalization-name" || layer.color === color) return layer;
      changed = true;
      return { ...layer, color };
    }),
  }));

  return changed
    ? { ...document, surfaces, updatedAt: new Date().toISOString() }
    : document;
}
