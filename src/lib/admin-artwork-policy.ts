import type { ArtworkImageMimeType, ProductArtworkPolicy } from "./types";

export interface AdminPrintAreaInput {
  id: string;
  label: string;
  widthMm: number | null;
  heightMm: number | null;
  safeInsetMm: number | null;
}

const editable = { move: true, resize: true, rotate: true, color: true, font: true };
const imageEditable = { ...editable, color: false, font: false };

function surfaceGeometry(area: AdminPrintAreaInput) {
  const ratio = area.widthMm && area.heightMm ? area.widthMm / area.heightMm : 5 / 3;
  const width = ratio >= 1 ? 600 : Math.max(240, Math.round(600 * ratio));
  const height = ratio >= 1 ? Math.max(180, Math.round(600 / ratio)) : 600;
  const safeInset = area.safeInsetMm && area.widthMm && area.heightMm
    ? Math.max(8, Math.round(Math.min(width * area.safeInsetMm / area.widthMm, height * area.safeInsetMm / area.heightMm)))
    : Math.max(18, Math.round(Math.min(width, height) * 0.09));
  return {
    width,
    height,
    bounds: {
      x: safeInset,
      y: safeInset,
      width: width - safeInset * 2,
      height: height - safeInset * 2,
    },
  };
}

export function buildDefaultAdminArtworkPolicy(
  areas: readonly AdminPrintAreaInput[],
  options: {
    uploadsEnabled: boolean;
    allowedMimeTypes: readonly string[];
    maximumBytes?: number;
  },
): ProductArtworkPolicy {
  const allowedMimeTypes = options.allowedMimeTypes.filter(
    (mimeType): mimeType is ArtworkImageMimeType =>
      mimeType === "image/jpeg" || mimeType === "image/png" || mimeType === "image/webp",
  );
  return {
    maximumElements: 20,
    surfaces: areas.map((area) => {
      const { width, height, bounds } = surfaceGeometry(area);
      const textWidth = bounds.width * 0.6;
      const textHeight = Math.min(70, bounds.height * 0.25);
      const imageWidth = Math.min(bounds.width * 0.55, bounds.height * 0.8);
      const imageHeight = Math.min(imageWidth, bounds.height * 0.8);
      return {
        id: area.id,
        label: area.label,
        coordinateSpace: { width, height },
        printableBounds: bounds,
        text: {
          enabled: true,
          maximumElements: 5,
          permissions: { ...editable },
          geometry: {
            default: {
              x: bounds.x + (bounds.width - textWidth) / 2,
              y: bounds.y + (bounds.height - textHeight) / 2,
              width: textWidth,
              height: textHeight,
              rotation: 0,
            },
            minimumWidth: Math.min(20, bounds.width),
            maximumWidth: bounds.width,
            minimumHeight: Math.min(20, bounds.height),
            maximumHeight: bounds.height,
            minimumRotation: -180,
            maximumRotation: 180,
          },
          defaultColor: "#17324d",
          allowedColors: [],
          defaultFontFamily: "rounded",
          allowedFontFamilies: ["rounded", "sans", "serif"],
          defaultFontSize: Math.max(8, Math.min(180, textHeight * 0.64)),
          minimumFontSize: 8,
          maximumFontSize: 180,
          defaultTextAlign: "center",
          allowedTextAlignments: ["left", "center", "right"],
        },
        image: {
          enabled: options.uploadsEnabled,
          required: false,
          maximumElements: options.uploadsEnabled ? 1 : 0,
          permissions: { ...imageEditable },
          geometry: {
            default: {
              x: bounds.x + (bounds.width - imageWidth) / 2,
              y: bounds.y + (bounds.height - imageHeight) / 2,
              width: imageWidth,
              height: imageHeight,
              rotation: 0,
            },
            minimumWidth: Math.min(20, bounds.width),
            maximumWidth: bounds.width,
            minimumHeight: Math.min(20, bounds.height),
            maximumHeight: bounds.height,
            minimumRotation: -180,
            maximumRotation: 180,
          },
          allowedMimeTypes: options.uploadsEnabled ? allowedMimeTypes : [],
          maximumBytes: options.uploadsEnabled ? options.maximumBytes ?? 2_000_000 : 0,
          minimumSourceWidth: 1,
          maximumSourceWidth: 50_000,
          minimumSourceHeight: 1,
          maximumSourceHeight: 50_000,
          allowedAspectRatios: [],
          aspectRatioTolerance: 0.02,
          allowTransparency: true,
          allowCrop: true,
          approvalRequired: true,
          chargePerImagePaise: 0,
        },
      };
    }),
  };
}

export function reconcileAdminArtworkPolicy(
  policy: ProductArtworkPolicy,
  areas: readonly AdminPrintAreaInput[],
  options: {
    uploadsEnabled: boolean;
    allowedMimeTypes: readonly string[];
    maximumBytes?: number;
  },
) {
  const defaults = buildDefaultAdminArtworkPolicy(areas, options);
  const currentById = new Map(policy.surfaces.map((surface) => [surface.id, surface]));
  const hadConfiguredImage = policy.surfaces.some((surface) =>
    surface.image.enabled || surface.image.maximumElements > 0 || surface.image.allowedMimeTypes.length > 0);
  return {
    ...policy,
    surfaces: defaults.surfaces.map((fallback) => {
      const current = currentById.get(fallback.id);
      if (!current) return fallback;
      if (options.uploadsEnabled && !hadConfiguredImage) {
        return { ...current, label: fallback.label, image: fallback.image };
      }
      return {
        ...current,
        label: fallback.label,
        image: {
          ...current.image,
          enabled: options.uploadsEnabled && current.image.enabled,
          required: options.uploadsEnabled && current.image.enabled && current.image.required,
          maximumElements: options.uploadsEnabled ? current.image.maximumElements : 0,
          allowedMimeTypes: options.uploadsEnabled
            ? current.image.allowedMimeTypes.filter((mimeType) => fallback.image.allowedMimeTypes.includes(mimeType))
            : [],
          maximumBytes: options.uploadsEnabled ? current.image.maximumBytes : 0,
        },
      };
    }),
  };
}
