import type {
  PersonalizationTemplate,
  PersonalizationTemplateSurface,
  SnapshotJsonValue,
} from "./types";

const recordValue = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const nonEmptyText = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

/** Allows only browser-renderable remote images or raster data URLs in UI-facing metadata. */
export function safeTemplateBaseImageUrl(value: unknown): string | undefined {
  const candidate = nonEmptyText(value);
  if (!candidate) return undefined;
  if (/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=\s]+$/i.test(candidate)) return candidate;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

const positiveInteger = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : undefined;

/** Copies a database JSON value so catalog objects cannot retain mutable Prisma references. */
export function snapshotJsonValue(value: unknown, path = "$"): SnapshotJsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map((item, index) => snapshotJsonValue(item, `${path}[${index}]`));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, snapshotJsonValue(item, `${path}.${key}`)]),
    );
  }
  throw new TypeError(`Template configuration at ${path} is not valid JSON.`);
}

export interface TemplateProductionSource {
  previewConfig: unknown;
  productionConfig: unknown;
  productionWidthPx: unknown;
  productionHeightPx: unknown;
  productionDpi: unknown;
}

/** Preserves raw renderer configuration and exposes a small, stable surface view for storefronts. */
export function normalizeTemplateProduction(
  source: TemplateProductionSource,
): NonNullable<PersonalizationTemplate["production"]> {
  const widthPx = positiveInteger(source.productionWidthPx);
  const heightPx = positiveInteger(source.productionHeightPx);
  const dpi = positiveInteger(source.productionDpi);
  if (!widthPx || !heightPx || !dpi) {
    throw new TypeError("Template production dimensions and DPI must be positive integers.");
  }

  const preview = recordValue(source.previewConfig);
  const production = recordValue(source.productionConfig);
  const previewSurfaces = Array.isArray(preview.surfaces) ? preview.surfaces.map(recordValue) : [];
  const productionSurfaces = Array.isArray(production.surfaces) ? production.surfaces.map(recordValue) : [];
  const surfaceIds = [...new Set([
    ...previewSurfaces.map((surface) => nonEmptyText(surface.id)),
    ...productionSurfaces.map((surface) => nonEmptyText(surface.id)),
  ].filter((id): id is string => Boolean(id)))];
  const configuredDefaultId = nonEmptyText(production.defaultSurfaceId)
    ?? nonEmptyText(preview.defaultSurfaceId);

  const surfaces: PersonalizationTemplateSurface[] = surfaceIds.map((id, index) => {
    const previewSurface = previewSurfaces.find((surface) => nonEmptyText(surface.id) === id) ?? {};
    const productionSurface = productionSurfaces.find((surface) => nonEmptyText(surface.id) === id)
      ?? productionSurfaces[index]
      ?? {};
    const baseImageUrl = safeTemplateBaseImageUrl(previewSurface.baseImageUrl)
      ?? safeTemplateBaseImageUrl(productionSurface.baseImageUrl);
    return {
      id,
      label: nonEmptyText(previewSurface.label)
        ?? nonEmptyText(productionSurface.label)
        ?? id,
      ...(baseImageUrl ? { baseImageUrl } : {}),
      widthPx: positiveInteger(previewSurface.widthPx)
        ?? positiveInteger(productionSurface.widthPx)
        ?? widthPx,
      heightPx: positiveInteger(previewSurface.heightPx)
        ?? positiveInteger(productionSurface.heightPx)
        ?? heightPx,
      dpi: positiveInteger(previewSurface.dpi)
        ?? positiveInteger(productionSurface.dpi)
        ?? dpi,
    };
  });

  if (!surfaces.length) {
    const id = configuredDefaultId ?? "front";
    const baseImageUrl = safeTemplateBaseImageUrl(preview.baseImageUrl)
      ?? safeTemplateBaseImageUrl(production.baseImageUrl);
    surfaces.push({
      id,
      label: id === "front" ? "Front" : id,
      ...(baseImageUrl ? { baseImageUrl } : {}),
      widthPx,
      heightPx,
      dpi,
    });
  }

  const defaultSurfaceId = configuredDefaultId && surfaces.some((surface) => surface.id === configuredDefaultId)
    ? configuredDefaultId
    : surfaces[0]?.id;
  return {
    previewConfig: snapshotJsonValue(source.previewConfig),
    productionConfig: snapshotJsonValue(source.productionConfig),
    widthPx,
    heightPx,
    dpi,
    ...(defaultSurfaceId ? { defaultSurfaceId } : {}),
    surfaces,
  };
}
