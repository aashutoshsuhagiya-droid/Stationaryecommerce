import type {
  ArtworkDocument,
  ArtworkLayer,
  PrintableSurfaceDefinition,
} from "./artwork-types";

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
      return "var(--font-sans, system-ui, -apple-system, sans-serif)";
    case "rounded":
    default:
      return "'Quicksand', 'Nunito', system-ui, -apple-system, sans-serif";
  }
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
      ctx.drawImage(img, drawX, drawY, renderW, renderH);
    }
  } else if (layer.type === "text" && layer.text) {
    const fontSize = Math.max(12, (layer.fontSize ?? 32) * scale);
    const fontStr = `${fontSize}px ${getFontFamilyString(layer.fontFamily)}`;
    ctx.font = `600 ${fontStr}`;
    ctx.fillStyle = layer.color || "#17324d";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Text wrapping or single line fitting
    ctx.fillText(layer.text, 0, 0, renderW);
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
  resolutionMultiplier: number = 2,
): void {
  const width = Math.round(surfaceDef.width * resolutionMultiplier);
  const height = Math.round(surfaceDef.height * resolutionMultiplier);

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, width, height);

  // Background fill
  ctx.fillStyle = background || "#ffffff";
  ctx.fillRect(0, 0, width, height);

  // Optional subtle decorative border / accent
  if (accent) {
    ctx.save();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 4 * resolutionMultiplier;
    ctx.strokeRect(
      2 * resolutionMultiplier,
      2 * resolutionMultiplier,
      width - 4 * resolutionMultiplier,
      height - 4 * resolutionMultiplier,
    );
    ctx.restore();
  }

  const surface = document.surfaces.find((s) => s.id === surfaceId) ?? document.surfaces[0];
  if (!surface) return;

  for (const layer of surface.layers) {
    renderLayerToContext(ctx, layer, resolutionMultiplier);
  }
}
