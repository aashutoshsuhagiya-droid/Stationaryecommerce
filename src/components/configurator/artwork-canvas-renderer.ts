import type {
  ArtworkDocument,
  ArtworkLayer,
  PrintableSurfaceDefinition,
} from "./artwork-types";
import { getArtworkLayersInRenderOrder } from "./artwork-types";
import { neutralPresentationPalette } from "../../lib/data";

const imageCache = new Map<string, HTMLImageElement>();

function getLoadedImage(src: string): Promise<HTMLImageElement | null> {
  const cached = imageCache.get(src);
  if (cached && cached.complete) {
    return Promise.resolve(cached);
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imageCache.set(src, img);
      resolve(img);
    };
    img.onerror = () => {
      resolve(null);
    };
    img.src = src;
  });
}

export async function preloadArtworkImages(document: ArtworkDocument): Promise<void> {
  const promises: Promise<HTMLImageElement | null>[] = [];
  for (const surface of document.surfaces) {
    for (const layer of surface.layers) {
      if (layer.type === "image" && layer.src) {
        promises.push(getLoadedImage(layer.src));
      }
    }
  }
  await Promise.all(promises);
}

export function getFontFamilyString(family?: string): string {
  switch (family) {
    case "serif":
      return "Georgia, 'Times New Roman', serif";
    case "clean":
    case "sans":
      return "system-ui, -apple-system, sans-serif";
    case "rounded":
    default:
      return "'Quicksand', 'Nunito', system-ui, -apple-system, sans-serif";
  }
}

export function wrapTextLines(
  text: string,
  maxWidth: number,
  maxLines: number,
  measureText: (value: string) => number,
): string[] {
  if (!text || maxWidth <= 0 || maxLines <= 0) return [];

  const lines: string[] = [];
  const pushLine = (line: string) => {
    if (lines.length < maxLines) lines.push(line);
    return lines.length >= maxLines;
  };

  for (const paragraph of text.replace(/\r\n?/g, "\n").split("\n")) {
    const words = paragraph.trim().split(/\s+/u).filter(Boolean);
    if (!words.length) {
      if (pushLine("")) return lines;
      continue;
    }

    let currentLine = "";
    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      if (measureText(candidate) <= maxWidth) {
        currentLine = candidate;
        continue;
      }

      if (currentLine && pushLine(currentLine)) return lines;
      currentLine = "";

      if (measureText(word) <= maxWidth) {
        currentLine = word;
        continue;
      }

      let fragment = "";
      for (const character of Array.from(word)) {
        const nextFragment = `${fragment}${character}`;
        if (fragment && measureText(nextFragment) > maxWidth) {
          if (pushLine(fragment)) return lines;
          fragment = character;
        } else {
          fragment = nextFragment;
        }
      }
      currentLine = fragment;
    }

    if (currentLine && pushLine(currentLine)) return lines;
  }

  return lines;
}

export function renderLayerToContext(
  ctx: CanvasRenderingContext2D,
  layer: ArtworkLayer,
  scale: number = 1,
) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity ?? 1));

  const centerX = (layer.x + layer.width / 2) * scale;
  const centerY = (layer.y + layer.height / 2) * scale;
  const rad = ((layer.rotation ?? 0) * Math.PI) / 180;

  ctx.translate(centerX, centerY);
  if (rad !== 0) {
    ctx.rotate(rad);
  }

  const renderW = layer.width * scale;
  const renderH = layer.height * scale;
  const drawX = -renderW / 2;
  const drawY = -renderH / 2;

  if (layer.type === "image" && layer.src) {
    const img = imageCache.get(layer.src);
    if (img && img.complete) {
      const fit = layer.imageFit ?? "contain";
      if (fit === "stretch") {
        ctx.drawImage(img, drawX, drawY, renderW, renderH);
      } else {
        const imageAspect = img.naturalWidth / img.naturalHeight;
        const targetAspect = renderW / renderH;
        const scaleFactor = fit === "cover"
          ? (imageAspect > targetAspect ? renderH / img.naturalHeight : renderW / img.naturalWidth)
          : (imageAspect > targetAspect ? renderW / img.naturalWidth : renderH / img.naturalHeight);
        const width = img.naturalWidth * scaleFactor;
        const height = img.naturalHeight * scaleFactor;
        if (fit === "cover") {
          ctx.save();
          ctx.beginPath();
          ctx.rect(drawX, drawY, renderW, renderH);
          ctx.clip();
        }
        ctx.drawImage(img, drawX + (renderW - width) / 2, drawY + (renderH - height) / 2, width, height);
        if (fit === "cover") ctx.restore();
      }
    }
  } else if (layer.type === "text" && layer.text) {
    const fontSize = Math.max(12, (layer.fontSize ?? 32) * scale);
    const fontStr = `${fontSize}px ${getFontFamilyString(layer.fontFamily)}`;
    ctx.font = `600 ${fontStr}`;
    ctx.fillStyle = layer.color || neutralPresentationPalette.ink;
    const textAlign = layer.textAlign ?? "center";
    ctx.textAlign = textAlign;
    ctx.textBaseline = "middle";
    const lineHeight = fontSize * 1.2;
    const maxLines = Math.max(1, Math.floor(renderH / lineHeight));
    const lines = wrapTextLines(
      layer.text,
      renderW,
      maxLines,
      (value) => ctx.measureText(value).width,
    );
    const firstLineY = -((lines.length - 1) * lineHeight) / 2;
    const textX = textAlign === "left" ? drawX : textAlign === "right" ? drawX + renderW : 0;
    lines.forEach((line, index) => {
      ctx.fillText(line, textX, firstLineY + index * lineHeight);
    });
  }

  ctx.restore();
}

export function renderSurfaceToCanvas(
  canvas: HTMLCanvasElement,
  document: ArtworkDocument,
  surfaceId: string,
  surfaceDef: PrintableSurfaceDefinition,
  background: string,
  accent?: string,
  resolution: number | { width: number; height: number } = 2,
): void {
  const width = Math.max(1, Math.round(
    typeof resolution === "number" ? surfaceDef.width * resolution : resolution.width,
  ));
  const height = Math.max(1, Math.round(
    typeof resolution === "number" ? surfaceDef.height * resolution : resolution.height,
  ));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, width, height);

  // Background fill
  ctx.fillStyle = background || neutralPresentationPalette.surface;
  ctx.fillRect(0, 0, width, height);

  const scaleX = width / Math.max(1, surfaceDef.width);
  const scaleY = height / Math.max(1, surfaceDef.height);
  ctx.save();
  ctx.scale(scaleX, scaleY);

  // Optional subtle decorative border / accent
  if (accent) {
    ctx.save();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 4;
    ctx.strokeRect(
      2,
      2,
      surfaceDef.width - 4,
      surfaceDef.height - 4,
    );
    ctx.restore();
  }

  const surface = document.surfaces.find((s) => s.id === surfaceId) ?? document.surfaces[0];
  if (surface) {
    for (const layer of getArtworkLayersInRenderOrder(surface.layers)) {
      renderLayerToContext(ctx, layer);
    }
  }
  ctx.restore();
}
