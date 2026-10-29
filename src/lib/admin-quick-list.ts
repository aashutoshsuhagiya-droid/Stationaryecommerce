import { buildDefaultAdminArtworkPolicy } from "./admin-artwork-policy";
import {
  applyRanBazaarCustomizationStarterPolicy,
  getRanBazaarCustomizationStarter,
} from "./ranbazaar-customization-presets";
import type { ProductArtworkPolicy } from "./types";

export type QuickListPrintArea = {
  id: string;
  label: string;
  widthMm: number | null;
  heightMm: number | null;
  safeInsetMm: number | null;
};

export type QuickListConfigurationField = {
  key: string;
  label: string;
  inputType: "text" | "select" | "color" | "number";
  required: boolean;
  placeholder: string;
  helpText: string;
  defaultValue: string;
  minLength: number | null;
  maxLength: number | null;
  allowedPattern: string;
  options: Array<{ label: string; value: string; priceDelta: number }>;
  enabled: boolean;
  customerVisible: boolean;
};

export type RanBazaarStarterDraft = {
  id: string;
  name: string;
  configurationFields: QuickListConfigurationField[];
  printAreas: QuickListPrintArea[];
  artworkUpload: boolean;
  acceptedArtworkTypes: string[];
  artworkPolicy: ProductArtworkPolicy;
};

/**
 * The one source of truth for applying a RanBazaar starter in either listing
 * experience. It intentionally contains no product identity or pricing.
 */
export function createRanBazaarStarterDraft(starterId: string): RanBazaarStarterDraft | undefined {
  const starter = getRanBazaarCustomizationStarter(starterId);
  if (!starter) return undefined;
  const printAreas = starter.surfaces.map((surface) => ({
    id: surface.id,
    label: surface.label,
    widthMm: surface.suggestedMm?.widthMm ?? null,
    heightMm: surface.suggestedMm?.heightMm ?? null,
    safeInsetMm: null,
  }));
  const acceptedArtworkTypes = [...starter.artworkUpload.acceptedMimeTypes];
  const basePolicy = buildDefaultAdminArtworkPolicy(printAreas, {
    uploadsEnabled: starter.artworkUpload.enabled,
    allowedMimeTypes: acceptedArtworkTypes,
  });
  return {
    id: starter.id,
    name: starter.name,
    configurationFields: starter.fields.map((field) => ({
      key: field.key,
      label: field.label,
      inputType: field.inputType,
      required: field.required,
      placeholder: field.placeholder ?? "",
      helpText: field.helpText ?? (field.optionSource === "admin_configured"
        ? "Configure supported choices, then enable this field for customers."
        : ""),
      defaultValue: field.defaultValue ?? "",
      minLength: field.minLength ?? null,
      maxLength: field.maxLength ?? null,
      allowedPattern: field.allowedPattern ?? "",
      options: field.options?.map((option) => ({
        label: option.label,
        value: option.value,
        priceDelta: option.priceDelta ?? 0,
      })) ?? [],
      enabled: field.optionSource !== "admin_configured",
      customerVisible: field.optionSource !== "admin_configured",
    })),
    printAreas,
    artworkUpload: starter.artworkUpload.enabled,
    acceptedArtworkTypes,
    artworkPolicy: applyRanBazaarCustomizationStarterPolicy(basePolicy, starter.id),
  };
}

export function slugifyAdminValue(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function autoSku(name: string, random = Math.random) {
  const stem = slugifyAdminValue(name).toUpperCase() || "PRODUCT";
  const suffix = Math.max(0, Math.min(46_655, Math.floor(random() * 46_656)))
    .toString(36)
    .toUpperCase()
    .padStart(3, "0");
  return `${stem}-${suffix}`;
}

export type PublishReadinessInput = {
  artworkUpload: boolean;
  acceptedArtworkTypes: readonly string[];
  printAreas: readonly QuickListPrintArea[];
  artworkPolicy?: ProductArtworkPolicy | null;
  linkedTemplates?: readonly { status?: string | null }[];
  packagingRequiresVisualization?: boolean;
  hasPublishedVisualization?: boolean;
};

export type PublishReadinessItem = {
  id: "mime-types" | "physical-dimensions" | "linked-templates" | "packaging-visualization";
  ready: boolean;
  blocking: boolean;
  message: string;
};

/** Mirrors the catalog publish gates, with a non-blocking packaging studio hint. */
export function checkProductPublishReadiness(input: PublishReadinessInput) {
  const enabledImageSurfaceIds = input.artworkPolicy?.surfaces
    .filter((surface) => surface.image.enabled)
    .map((surface) => surface.id) ?? [];
  const areas = new Map(input.printAreas.map((area) => [area.id, area]));
  const dimensionsReady = !input.artworkUpload || enabledImageSurfaceIds.every((surfaceId) => {
    const area = areas.get(surfaceId);
    return Boolean(area && (area.widthMm ?? 0) > 0 && (area.heightMm ?? 0) > 0);
  });
  const templatesReady = (input.linkedTemplates ?? []).every((template) => template.status === "ACTIVE");
  const packagingReady = !input.packagingRequiresVisualization || input.hasPublishedVisualization === true;
  const items: PublishReadinessItem[] = [
    {
      id: "mime-types",
      ready: !input.artworkUpload || input.acceptedArtworkTypes.length > 0,
      blocking: true,
      message: "Choose at least one safe image type when customer artwork upload is enabled.",
    },
    {
      id: "physical-dimensions",
      ready: dimensionsReady,
      blocking: true,
      message: "Give every enabled image surface a positive width and height in millimetres.",
    },
    {
      id: "linked-templates",
      ready: templatesReady,
      blocking: true,
      message: "Activate every linked personalization template before publishing.",
    },
    {
      id: "packaging-visualization",
      ready: packagingReady,
      blocking: false,
      message: "Packaging 3D needs a published visualization template. You can add it from the studio after saving.",
    },
  ];
  return { items, canPublish: items.every((item) => !item.blocking || item.ready) };
}
