"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import {
  Box,
  Check,
  ChevronDown,
  CircleAlert,
  Clock3,
  Download,
  Heart,
  Layers3,
  LockKeyhole,
  Minus,
  PackageCheck,
  Plus,
  RotateCcw,
  Save,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Truck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArtworkEditor } from "@/components/configurator/ArtworkEditor";
import { DesignCompletionMeter } from "@/components/configurator/DesignCompletionMeter";
import { buildVisualization3DPreview } from "@/components/configurator/visualization-preview";
import { setPersonalizedNameColor } from "@/components/configurator/artwork-color";
import { calculateDesignCompletion } from "@/components/configurator/design-completion";
import { downloadArtworkDesign } from "@/components/configurator/design-export";
import {
  createArtworkDocument,
  keepArtworkLayerInForeground,
  normalizeArtworkDocumentToPolicy,
  removePreviewImageLayers,
  type ArtworkDocument,
  type PrintableSurfaceDefinition,
} from "@/components/configurator/artwork-types";
import { resolveArtworkTextTypography } from "@/lib/artwork-text-policy";
import configuratorStyles from "@/components/configurator/configurator.module.css";
import { useStore } from "@/components/store/StoreProvider";
import { PreviewSkeleton } from "@/components/ui/StorefrontSkeletons";
import { useScrollReveal } from "@/components/ui/use-scroll-reveal";
import { buildCustomSizeQuotePath } from "@/lib/bulk-quote-prefill";
import {
  initialConfigurationFieldValue,
  visibleConfigurationFields,
} from "@/lib/configuration-field-visibility";
import { formatPrice, neutralPresentationPalette } from "@/lib/data";
import { EZPAC_FEATURE_BULLET_LABELS } from "@/lib/ezpac-feature-bullets";
import type { ProductConfigurationSchema } from "@/lib/product-configuration";
import { newestSavedDesign } from "@/lib/saved-design";
import type { Product } from "@/lib/types";
import { artworkDocumentSchema } from "@/lib/validation";

const Product3DPreview = dynamic(
  () => import("@/components/configurator/Product3DPreview").then((module) => module.Product3DPreview),
  {
    ssr: false,
    loading: () => <PreviewSkeleton />,
  },
);

type QuoteLine = {
  quantity: number;
  unitPricePaise: number;
  lineTotalPaise: number;
  adjustments: Array<{ label: string; amountPaise: number; scope?: "unit" | "line" }>;
};

type QuoteSummary = {
  quoteId: string;
  pricingVersion: string;
  calculatedAt: string;
  subtotalPaise: number;
  items: QuoteLine[];
  requiresCheckoutRevalidation: true;
};

type QuoteState =
  | { status: "idle"; message: string }
  | { status: "loading"; message: string }
  | { status: "error"; message: string }
  | { status: "ready"; message: string; data: QuoteSummary };

type SavedDesign = {
  id: string;
  productId: string;
  title: string;
  variantId: string;
  templateId: string;
  dimensionPresetId: string;
  displayUnit: "mm" | "cm" | "in";
  quantity: number;
  fields: Record<string, string>;
  artwork: ArtworkDocument;
  savedAt: string;
};

const SAVED_DESIGNS_KEY = "naamly-saved-designs-v1";

function uniqueId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function initialFields(configuration: ProductConfigurationSchema) {
  return Object.fromEntries(
    configuration.personalization.fields
      .filter((field) => field.type !== "template")
      .map((field) => [field.id, initialConfigurationFieldValue(field)]),
  );
}

function normalizedPersonalizationFields(
  configuration: ProductConfigurationSchema,
  source: Record<string, string> | undefined,
  legacy?: { name?: string; detail?: string; font?: string },
) {
  const legacyFont = Object.entries({
    rounded: "Friendly rounded",
    clean: "Clean sans",
    serif: "Classic serif",
  }).find(([, label]) => label === legacy?.font)?.[0] ?? legacy?.font;
  const candidates: Record<string, string | undefined> = {
    name: legacy?.name,
    ...(legacy?.detail ? { "class-details": legacy.detail } : {}),
    font: legacyFont,
    ...source,
  };
  return Object.fromEntries(
    configuration.personalization.fields
      .filter((field) => field.type !== "template")
      .map((field) => [
        field.id,
        typeof candidates[field.id] === "string"
          ? candidates[field.id]
          : initialConfigurationFieldValue(field),
      ]),
  ) as Record<string, string>;
}

function normalizedQuantity(configuration: ProductConfigurationSchema, value: number) {
  const { minimum, maximum, increment } = configuration.quantity;
  const clamped = Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? Math.trunc(value) : minimum));
  return Math.min(maximum, minimum + Math.floor((clamped - minimum) / increment) * increment);
}

function artworkFontFamily(value: string | undefined): "rounded" | "sans" | "serif" | undefined {
  if (value === "rounded") return "rounded";
  if (value === "clean" || value === "sans") return "sans";
  if (value === "serif") return "serif";
  return undefined;
}

function preserveSupportedArtworkFont(
  configuration: ProductConfigurationSchema,
  fields: Record<string, string>,
  document: ArtworkDocument | undefined,
) {
  const layerFont = document?.surfaces
    .flatMap((surface) => surface.layers)
    .find((layer) => layer.id === "personalization-name" && layer.type === "text")
    ?.fontFamily;
  const fieldValue = layerFont === "sans" ? "clean" : layerFont;
  const supported = configuration.personalization.fields
    .find((field) => field.id === "font")
    ?.options?.some((option) => option.value === fieldValue);
  return supported && fieldValue ? { ...fields, font: fieldValue } : fields;
}

function surfaceDefinitions(
  configuration: ProductConfigurationSchema,
  preset = configuration.dimensions.presets[0],
): PrintableSurfaceDefinition[] {
  const designKey = configuration.product.structuralDesign.toLowerCase();
  const fallbackRatio = designKey.includes("pencil")
    ? 6
    : designKey.includes("notebook")
      ? 148 / 210
      : designKey.includes("geometry-box")
        ? 2.5
        : 5 / 3;
  if (configuration.artwork.policy.surfaces.length) {
    return configuration.artwork.policy.surfaces.map((surfacePolicy) => {
      const surface = configuration.artwork.surfaces.find((candidate) => candidate.id === surfacePolicy.id);
      const physicalWidthMm = surface?.widthMm ?? preset?.dimensionsMm?.width;
      const physicalHeightMm = surface?.heightMm ?? preset?.dimensionsMm?.height;
      const bounds = surfacePolicy.printableBounds;
      const safeInset = Math.max(0, Math.min(
        bounds.x,
        bounds.y,
        surfacePolicy.coordinateSpace.width - bounds.x - bounds.width,
        surfacePolicy.coordinateSpace.height - bounds.y - bounds.height,
      ));
      return {
        id: surfacePolicy.id,
        label: surfacePolicy.label,
        width: surfacePolicy.coordinateSpace.width,
        height: surfacePolicy.coordinateSpace.height,
        safeInset,
        physicalWidthMm,
        physicalHeightMm,
        targetDpi: 300,
      };
    });
  }
  return configuration.artwork.surfaces.map((surface) => {
    const physicalWidthMm = surface.widthMm ?? preset?.dimensionsMm?.width;
    const physicalHeightMm = surface.heightMm ?? preset?.dimensionsMm?.height;
    const ratio = physicalWidthMm && physicalHeightMm ? physicalWidthMm / physicalHeightMm : fallbackRatio;
    const width = ratio >= 1 ? 600 : Math.max(240, Math.round(600 * ratio));
    const height = ratio >= 1 ? Math.max(180, Math.round(600 / ratio)) : 600;
    const safeInset = surface.safeInsetMm && physicalWidthMm && physicalHeightMm
      ? Math.max(8, Math.round(Math.min(width * (surface.safeInsetMm / physicalWidthMm), height * (surface.safeInsetMm / physicalHeightMm))))
      : Math.max(18, Math.round(Math.min(width, height) * 0.09));
    return { id: surface.id, label: surface.label, width, height, safeInset, physicalWidthMm, physicalHeightMm, targetDpi: 300 };
  });
}

function createInitialArtwork(configuration: ProductConfigurationSchema) {
  const definitions = surfaceDefinitions(configuration);
  const document = createArtworkDocument(definitions);
  if (!configuration.personalization.fields.some((field) => field.id === "name")) return document;
  const primaryPolicy = configuration.artwork.policy.surfaces[0];
  if (!primaryPolicy?.text.enabled) return document;
  const geometry = primaryPolicy.text.geometry.default;
  const typography = resolveArtworkTextTypography(primaryPolicy.text);
  const initial = {
    ...document,
    surfaces: document.surfaces.map((surface, index) =>
      index === 0
        ? {
            ...surface,
            layers: [
              {
                id: "personalization-name",
                type: "text" as const,
                name: "Personalized name",
                ...geometry,
                opacity: 1,
                text: "Your name",
                color: primaryPolicy.text.defaultColor,
                fontSize: typography.defaultFontSize,
                fontFamily: primaryPolicy.text.defaultFontFamily,
                textAlign: typography.defaultTextAlign,
              },
            ],
          }
        : surface,
    ),
  };
  return normalizeArtworkDocumentToPolicy(initial, configuration.artwork.policy);
}

function synchronizePersonalizationArtwork(
  configuration: ProductConfigurationSchema,
  document: ArtworkDocument,
  fields: Record<string, string>,
) {
  const fontFamily = artworkFontFamily(fields.font) ?? "rounded";
  return normalizeArtworkDocumentToPolicy(keepArtworkLayerInForeground({
    ...document,
    surfaces: document.surfaces.map((surface) => ({
      ...surface,
      layers: surface.layers.map((layer) => layer.id === "personalization-name" && layer.type === "text" ? {
        ...layer,
        text: fields.name || "Your name",
        fontFamily,
      } : layer),
    })),
  }, "personalization-name"), configuration.artwork.policy);
}

function readSavedDesigns(): SavedDesign[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(SAVED_DESIGNS_KEY) || "[]");
    if (!Array.isArray(value)) return [];
    return value.filter(isSavedDesign);
  } catch {
    return [];
  }
}

function isSavedDesign(item: unknown): item is SavedDesign {
  if (!item || typeof item !== "object") return false;
  const candidate = item as Partial<SavedDesign>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.productId === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.variantId === "string" &&
    typeof candidate.templateId === "string" &&
    typeof candidate.dimensionPresetId === "string" &&
    (candidate.displayUnit === "mm" || candidate.displayUnit === "cm" || candidate.displayUnit === "in") &&
    typeof candidate.quantity === "number" &&
    Number.isInteger(candidate.quantity) &&
    candidate.quantity > 0 &&
    !!candidate.fields &&
    typeof candidate.fields === "object" &&
    Object.values(candidate.fields).every((field) => typeof field === "string") &&
    artworkDocumentSchema.safeParse(candidate.artwork).success &&
    typeof candidate.savedAt === "string"
  );
}

function mergeSavedDesigns(local: SavedDesign[], remote: SavedDesign[]) {
  const merged = new Map(local.map((design) => [design.id, design]));
  for (const design of remote) {
    const localDesign = merged.get(design.id);
    if (!localDesign) {
      merged.set(design.id, design);
      continue;
    }
    const newest = newestSavedDesign(localDesign, design);
    if (newest === localDesign) continue;
    const previewByAssetId = new Map(localDesign.artwork.surfaces.flatMap((surface) =>
      surface.layers.flatMap((layer) =>
        layer.type === "image" && layer.asset?.id && layer.src
          ? [[layer.asset.id, layer.src] as const]
          : [])));
    merged.set(design.id, {
      ...design,
      artwork: {
        ...design.artwork,
        surfaces: design.artwork.surfaces.map((surface) => ({
          ...surface,
          layers: surface.layers.map((layer) => {
            if (layer.type !== "image" || layer.src || !layer.asset?.id) return layer;
            const src = previewByAssetId.get(layer.asset.id);
            return src ? { ...layer, src } : layer;
          }),
        })),
      },
    });
  }
  return [...merged.values()]
    .sort((left, right) => right.savedAt.localeCompare(left.savedAt))
    .slice(0, 50);
}

async function blobDataUrl(blob: Blob) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Could not read artwork preview."));
    reader.onload = () => typeof reader.result === "string"
      ? resolve(reader.result)
      : reject(new Error("Could not read artwork preview."));
    reader.readAsDataURL(blob);
  });
}

function mergeRefreshedArtworkClaims(
  local: ArtworkDocument,
  refreshed: ArtworkDocument,
): ArtworkDocument {
  const refreshedAssets = new Map(refreshed.surfaces.flatMap((surface) =>
    surface.layers.flatMap((layer) =>
      layer.type === "image" && layer.asset
        ? [[`${surface.id}:${layer.id}`, layer.asset] as const]
        : [])));
  if (!refreshedAssets.size) return local;
  return {
    ...local,
    surfaces: local.surfaces.map((surface) => ({
      ...surface,
      layers: surface.layers.map((layer) => {
        if (layer.type !== "image") return layer;
        const asset = refreshedAssets.get(`${surface.id}:${layer.id}`);
        return asset ? { ...layer, asset } : layer;
      }),
    })),
  };
}

async function refreshSavedDesignArtworkClaims(design: SavedDesign): Promise<SavedDesign> {
  const hasPrivateArtwork = design.artwork.surfaces.some((surface) =>
    surface.layers.some((layer) => layer.type === "image" && Boolean(layer.asset?.id)));
  if (!hasPrivateArtwork) return design;
  try {
    const response = await fetch("/api/customizations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: design.id, productId: design.productId }),
    });
    if (!response.ok) return design;
    const payload = await response.json() as { data?: unknown };
    if (!isSavedDesign(payload.data)) return design;
    if (newestSavedDesign(design, payload.data) === design) {
      return {
        ...design,
        artwork: mergeRefreshedArtworkClaims(design.artwork, payload.data.artwork),
      };
    }
    return payload.data;
  } catch {
    return design;
  }
}

async function hydrateSavedDesignArtwork(design: SavedDesign): Promise<SavedDesign> {
  const reusableDesign = await refreshSavedDesignArtworkClaims(design);
  const pending = reusableDesign.artwork.surfaces.flatMap((surface) =>
    surface.layers.flatMap((layer) =>
      layer.type === "image" && !layer.src && layer.asset?.id
        ? [{ id: layer.asset.id, claimToken: layer.asset.claimToken }]
        : []));
  if (!pending.length) return reusableDesign;
  const previews = new Map<string, string>();
  await Promise.all([...new Map(pending.map((asset) => [asset.id, asset])).values()].map(async (asset) => {
    try {
      const response = await fetch(`/api/artwork-assets/${encodeURIComponent(asset.id)}`, {
        headers: asset.claimToken ? { "X-Artwork-Claim-Token": asset.claimToken } : undefined,
      });
      if (response.ok) previews.set(asset.id, await blobDataUrl(await response.blob()));
    } catch {
      // A missing or expired preview does not invalidate the rest of the saved design.
    }
  }));
  if (!previews.size) return reusableDesign;
  return {
    ...reusableDesign,
    artwork: {
      ...reusableDesign.artwork,
      surfaces: reusableDesign.artwork.surfaces.map((surface) => ({
        ...surface,
        layers: surface.layers.map((layer) => {
          if (layer.type !== "image" || layer.src || !layer.asset?.id) return layer;
          const src = previews.get(layer.asset.id);
          return src ? { ...layer, src } : layer;
        }),
      })),
    },
  };
}

function displayMeasurement(valueMm: number, unit: "mm" | "cm" | "in") {
  const value = unit === "mm" ? valueMm : unit === "cm" ? valueMm / 10 : valueMm / 25.4;
  const precision = unit === "mm" ? 0 : unit === "cm" ? 1 : 2;
  return `${value.toFixed(precision)} ${unit}`;
}

function customizationModeLabel(mode: ProductConfigurationSchema["modes"][number]) {
  return {
    standard: "Standard product",
    personalized: "Personalization",
    specification_based: "Specifications",
    design_studio: "Design studio",
    bulk_order: "Bulk ordering",
  }[mode];
}

function validateFields(configuration: ProductConfigurationSchema, fields: Record<string, string>, templateId: string) {
  const errors: Record<string, string> = {};
  for (const field of visibleConfigurationFields(configuration.personalization.fields, fields)) {
    if (field.type === "template") {
      if (field.required && !templateId) errors[field.id] = "Choose a design.";
      continue;
    }
    const value = (fields[field.id] ?? "").trim();
    if (field.required && !value) {
      errors[field.id] = `${field.label} is required.`;
      continue;
    }
    if (!value) continue;
    if (field.type === "number") {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) errors[field.id] = "Enter a valid number.";
      else if (field.minValue !== undefined && numericValue < field.minValue) errors[field.id] = `Use ${field.minValue} or more.`;
      else if (field.maxValue !== undefined && numericValue > field.maxValue) errors[field.id] = `Use ${field.maxValue} or less.`;
      else if (field.step && field.minValue !== undefined && Math.abs((numericValue - field.minValue) / field.step - Math.round((numericValue - field.minValue) / field.step)) > 1e-8) errors[field.id] = `Use increments of ${field.step}.`;
      continue;
    }
    if (field.minLength && value.length < field.minLength) errors[field.id] = `Use at least ${field.minLength} characters.`;
    if (field.maxLength && value.length > field.maxLength) errors[field.id] = `Use no more than ${field.maxLength} characters.`;
    if (field.allowedPattern) {
      try {
        if (!new RegExp(field.allowedPattern, "u").test(value)) errors[field.id] = "Remove unsupported characters.";
      } catch {
        errors[field.id] = "This field has an invalid catalog validation rule.";
      }
    }
    if (field.options?.length && !field.options.some((option) => option.value === value)) {
      errors[field.id] = "Choose an available option.";
    }
  }
  return errors;
}

export function CustomizationStudio({
  product,
  configuration,
}: {
  product: Product;
  configuration: ProductConfigurationSchema;
}) {
  const { cart, isHydrated, addItem, removeItem, toggleWishlist, isWishlisted } = useStore();
  const firstVariant = configuration.variants[0];
  const firstTemplate = configuration.personalization.templates[0];
  const defaultPreset = configuration.dimensions.presets.find(
    (preset) => preset.id === configuration.dimensions.defaultPresetId,
  ) ?? configuration.dimensions.presets[0];
  const [previewMode, setPreviewMode] = useState<"3d" | "2d" | null>(configuration.preview.defaultMode);
  const [configurationId, setConfigurationId] = useState(uniqueId);
  const [variantId, setVariantId] = useState(firstVariant?.id ?? "");
  const [templateId, setTemplateId] = useState(firstTemplate?.id ?? "");
  const [dimensionPresetId, setDimensionPresetId] = useState(defaultPreset?.id ?? "");
  const [displayUnit, setDisplayUnit] = useState<"mm" | "cm" | "in">(configuration.dimensions.supportedDisplayUnits[0] ?? "mm");
  const [quantity, setQuantity] = useState<number>(configuration.quantity.default);
  const [fields, setFields] = useState<Record<string, string>>(() => initialFields(configuration));
  const [artwork, setArtwork] = useState<ArtworkDocument>(() => createInitialArtwork(configuration));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [quote, setQuote] = useState<QuoteState>({ status: "idle", message: "Complete the required details for a verified price." });
  const [savedDesigns, setSavedDesigns] = useState<SavedDesign[]>([]);
  const [saveMessage, setSaveMessage] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);
  const [added, setAdded] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const [selectedProductImage, setSelectedProductImage] = useState(product.image);
  const initializedProductId = useRef<string | null>(null);
  const productHeroReveal = useScrollReveal<HTMLElement>();
  const practicalDetailsReveal = useScrollReveal<HTMLDivElement>();
  const handlePreviewReadyChange = useCallback((ready: boolean) => {
    setPreviewReady(ready);
  }, []);

  const primaryTextPolicy = configuration.artwork.policy.surfaces[0]?.text;
  const artworkUploadsEnabled = configuration.artwork.uploads.supported;
  const productImages = product.images.length
    ? product.images
    : [{ id: "legacy-product-image", src: product.image, alt: product.name, width: 0, height: 0 }];
  const selectedProductImageUrl = productImages.some((image) => image.src === selectedProductImage)
    ? selectedProductImage
    : productImages[0]?.src ?? product.image;
  const structuredDescription = product.configurator?.structuredDescription;
  const structuredBulletLabels = (structuredDescription?.featureBullets ?? []).flatMap((bullet) => {
    if (!Object.prototype.hasOwnProperty.call(EZPAC_FEATURE_BULLET_LABELS, bullet)) return [];
    return [EZPAC_FEATURE_BULLET_LABELS[bullet as keyof typeof EZPAC_FEATURE_BULLET_LABELS]];
  });
  const hasStructuredDescription = Boolean(
    structuredDescription?.intro?.trim()
    || structuredDescription?.bestFor?.length
    || structuredBulletLabels.length,
  );
  const usesStandardPreview = previewMode !== "3d" && !(configuration.personalization.supported && previewMode === "2d");
  const productImageGallery = productImages.length > 1 ? (
    <div className={configuratorStyles.standardPreviewMedia}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={selectedProductImageUrl} alt={product.name} />
      <div className={configuratorStyles.standardPreviewThumbnails} aria-label="Product images" role="group">
        {productImages.map((image, index) => (
          <button
            aria-label={`Show product image ${index + 1}`}
            aria-pressed={image.src === selectedProductImageUrl}
            className={image.src === selectedProductImageUrl ? configuratorStyles.standardPreviewThumbnailActive : ""}
            key={image.id || image.src}
            onClick={() => setSelectedProductImage(image.src)}
            type="button"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt={image.alt || `${product.name} ${index + 1}`} src={image.src} />
          </button>
        ))}
      </div>
    </div>
  ) : null;
  const visiblePersonalizationFields = useMemo(
    () => visibleConfigurationFields(configuration.personalization.fields, fields),
    [configuration.personalization.fields, fields],
  );
  const visibleCustomerFields = useMemo(() => visiblePersonalizationFields
    .filter((field) => field.type !== "template" && (field.id !== "font" || primaryTextPolicy?.permissions.font !== false))
    .map((field) => field.id === "font" && primaryTextPolicy?.allowedFontFamilies.length
      ? {
          ...field,
          options: field.options?.filter((option) => {
            const family = artworkFontFamily(option.value);
            return Boolean(family && primaryTextPolicy.allowedFontFamilies.includes(family));
          }),
        }
      : field), [primaryTextPolicy, visiblePersonalizationFields]);
  const customerFieldValues = useMemo(
    () => Object.fromEntries(visibleCustomerFields.map((field) => [field.id, fields[field.id] ?? ""])),
    [fields, visibleCustomerFields],
  );
  const persistedArtwork = useMemo(() => removePreviewImageLayers(artwork), [artwork]);
  const selectedVariant = configuration.variants.find((variant) => variant.id === variantId) ?? firstVariant;
  const selectedTemplate = configuration.personalization.templates.find((template) => template.id === templateId) ?? firstTemplate;
  const templateBaseImages = useMemo<Record<string, string>>(() => {
    const images: Record<string, string> = {};
    const production = selectedTemplate?.production;

    // Lowest precedence: the selected template's production surface image.
    if (production) {
      const defaultSurface = production.surfaces.find((surface) => surface.id === production.defaultSurfaceId)
        ?? production.surfaces[0];
      for (const [surfaceId, baseImageUrl] of configuration.artwork.surfaces.flatMap((surface, index) => {
        const templateSurface = production.surfaces.find((candidate) => candidate.id === surface.id)
          ?? (index === 0 ? defaultSurface : undefined);
        return templateSurface?.baseImageUrl ? [[surface.id, templateSurface.baseImageUrl] as const] : [];
      })) images[surfaceId] = baseImageUrl;
    }

    // Published visualization textures supplement templates, but an admin base wins.
    for (const [surfaceId, textureUrl] of configuration.preview.visualization?.surfaces.flatMap((surface) =>
      surface.textureUrl ? [[surface.surfaceId, surface.textureUrl] as const] : [],
    ) ?? []) images[surfaceId] = textureUrl;
    Object.assign(images, configuration.preview.baseImages ?? {});
    return images;
  }, [configuration.artwork.surfaces, configuration.preview.baseImages, configuration.preview.visualization, selectedTemplate]);
  const selectedPreset = configuration.dimensions.presets.find((preset) => preset.id === dimensionPresetId) ?? defaultPreset;
  const activeSurfaceDefinitions = useMemo(
    () => surfaceDefinitions(configuration, selectedPreset),
    [configuration, selectedPreset],
  );
  const visualization3DPreview = useMemo(
    () => buildVisualization3DPreview(
      artwork,
      activeSurfaceDefinitions,
      configuration.preview.visualization,
    ),
    [activeSurfaceDefinitions, artwork, configuration.preview.visualization],
  );
  const productIsWishlisted = isWishlisted(product.id);
  const errors = useMemo(() => validateFields(configuration, fields, templateId), [configuration, fields, templateId]);
  const estimatedUnitPaise = (selectedVariant?.unitPricePaise ?? 0) + (selectedTemplate?.premiumPricePaise ?? 0);
  const quotedLine = quote.status === "ready" ? quote.data.items[0] : undefined;
  const displayUnitPrice = quotedLine?.unitPricePaise ?? estimatedUnitPaise;
  const displaySubtotal = quotedLine?.lineTotalPaise ?? estimatedUnitPaise * quantity;
  const templateBackground = selectedTemplate?.preview.background ?? neutralPresentationPalette.surfaceSubtle;
  const templateForeground = selectedTemplate?.preview.foreground ?? neutralPresentationPalette.ink;
  const templateAccent = selectedTemplate?.preview.accent ?? neutralPresentationPalette.graphite;
  const personalizationFontOptions = visiblePersonalizationFields
    .find((field) => field.id === "font")
    ?.options?.reduce<Array<{ value: "rounded" | "sans" | "serif"; label: string }>>((options, option) => {
      const value = artworkFontFamily(option.value);
      if (value && !options.some((candidate) => candidate.value === value)) {
        options.push({ value, label: option.label });
      }
      return options;
    }, []) ?? [];
  const nameField = visiblePersonalizationFields.find((field) => field.id === "name");
  const nameValue = nameField ? (fields[nameField.id] ?? "").trim() : "";
  const hasSizeRequirement = configuration.dimensions.presets.length > 0 || configuration.variants.length > 0;
  const designCompletion = calculateDesignCompletion({
    name: nameField
      ? (!nameField.required && !nameValue) || (Boolean(nameValue) && !errors[nameField.id])
      : undefined,
    theme: configuration.personalization.templates.length
      ? configuration.personalization.templates.some((template) => template.id === templateId)
      : undefined,
    size: hasSizeRequirement
      ? configuration.dimensions.presets.some((preset) => preset.id === dimensionPresetId) ||
        configuration.variants.some((variant) => variant.id === variantId)
      : undefined,
    preview: configuration.artwork.surfaces.length
      ? previewMode === "2d" || previewReady
      : undefined,
  });

  useEffect(() => {
    if (
      !isHydrated
      || initializedProductId.current === product.id
      || typeof window === "undefined"
    ) return;
    initializedProductId.current = product.id;
    const stored = readSavedDesigns();
    const localDesigns = stored.filter((design) => design.productId === product.id);
    setSavedDesigns(localDesigns);

    const search = new URLSearchParams(window.location.search);
    const editKey = search.get("edit");
    const designId = search.get("design");
    const cartItem = editKey ? cart.find((item) => item.key === editKey && item.productId === product.id) : undefined;
    const saved = designId ? stored.find((design) => design.id === designId && design.productId === product.id) : undefined;

    if (cartItem) {
      setEditingKey(cartItem.key);
      setVariantId(configuration.variants.some((variant) => variant.id === cartItem.variantId)
        ? cartItem.variantId ?? ""
        : firstVariant?.id ?? "");
      setQuantity(normalizedQuantity(configuration, cartItem.quantity));
      if (cartItem.customization) {
        const custom = cartItem.customization;
        const restoredFields = preserveSupportedArtworkFont(
          configuration,
          normalizedPersonalizationFields(configuration, custom.fields, custom),
          custom.artwork,
        );
        setConfigurationId(custom.configurationId ?? uniqueId());
        setTemplateId(configuration.personalization.templates.some((template) => template.id === custom.templateId)
          ? custom.templateId ?? ""
          : firstTemplate?.id ?? "");
        setDimensionPresetId(configuration.dimensions.presets.some((preset) => preset.id === custom.dimensionPresetId)
          ? custom.dimensionPresetId ?? ""
          : defaultPreset?.id ?? "");
        setDisplayUnit(custom.displayUnit ?? "mm");
        setFields(restoredFields);
        setArtwork(synchronizePersonalizationArtwork(
          configuration,
          custom.artwork ?? createInitialArtwork(configuration),
          restoredFields,
        ));
      }
    } else if (saved) {
      void loadDesign(saved);
    } else if (editKey) {
      setSaveMessage("This cart item could not be restored. It may have been removed or belongs to another product.");
    } else if (designId) {
      setSaveMessage("Looking for this saved design in your account...");
    }
  }, [cart, configuration, defaultPreset?.id, firstTemplate?.id, firstVariant?.id, isHydrated, product.id]);

  useEffect(() => {
    setSelectedProductImage(product.image);
  }, [product.id, product.image]);

  useEffect(() => {
    if (!isHydrated || typeof window === "undefined") return;
    const stored = readSavedDesigns();
    const localDesigns = stored.filter((design) => design.productId === product.id);
    const designId = new URLSearchParams(window.location.search).get("design");
    const saved = designId
      ? localDesigns.find((design) => design.id === designId)
      : undefined;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`/api/customizations?productId=${encodeURIComponent(product.id)}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          if (designId && !saved && (response.status === 401 || response.status === 403)) {
            setSaveMessage("This saved design could not be restored on this device. Sign in to access account designs.");
          }
          return;
        }
        const payload = await response.json() as { data?: unknown };
        const remoteDesigns = Array.isArray(payload.data)
          ? payload.data.filter(isSavedDesign)
          : [];
        setSavedDesigns((current) => mergeSavedDesigns(
          current.length ? current : localDesigns,
          remoteDesigns,
        ));
        if (designId) {
          const remote = remoteDesigns.find((design) =>
            design.id === designId && design.productId === product.id);
          if (remote && (!saved || newestSavedDesign(saved, remote) === remote)) {
            void loadDesign(remote);
          } else if (!remote && !saved) {
            setSaveMessage("This saved design could not be found in your account.");
          }
        }
      } catch (error) {
        if (designId && !saved && error instanceof Error && error.name !== "AbortError") {
          setSaveMessage("Account designs are temporarily unavailable. Your device drafts are still available.");
        }
      }
    })();
    return () => controller.abort();
  }, [configuration, isHydrated, product.id]);

  useEffect(() => {
    const foreground = keepArtworkLayerInForeground(artwork, "personalization-name");
    if (foreground !== artwork) {
      setArtwork(normalizeArtworkDocumentToPolicy(foreground, configuration.artwork.policy));
    }
  }, [artwork, configuration.artwork.policy]);

  useEffect(() => {
    setArtwork((current) => normalizeArtworkDocumentToPolicy(
      setPersonalizedNameColor(current, templateForeground),
      configuration.artwork.policy,
    ));
  }, [configuration.artwork.policy, templateForeground]);

  useEffect(() => {
    if (Object.keys(errors).length || !selectedVariant) {
      setQuote({ status: "idle", message: "Complete the required details for a verified price." });
      return;
    }
    const controller = new AbortController();
    setQuote({ status: "loading", message: "Checking the current catalog price..." });
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(configuration.pricing.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            items: [{
              productId: product.id,
              variantId: selectedVariant.id,
              quantity,
              ...(configuration.personalization.supported ? {
                customization: { ...(templateId ? { templateId } : {}), fields: customerFieldValues, previewVersion: 1, artwork: persistedArtwork },
              } : {}),
            }],
          }),
        });
        const payload = await response.json() as { data?: QuoteSummary; error?: { message?: string } };
        if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "The current price is unavailable.");
        if (!controller.signal.aborted) setQuote({ status: "ready", message: "Server-verified catalog price", data: payload.data });
      } catch (error) {
        if (!controller.signal.aborted) setQuote({ status: "error", message: error instanceof Error ? error.message : "The current price is unavailable." });
      }
    }, 320);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [configuration.personalization.supported, configuration.pricing.endpoint, customerFieldValues, errors, persistedArtwork, product.id, quantity, selectedVariant, templateId]);

  function changeField(fieldId: string, value: string) {
    if (fieldId === "font" && primaryTextPolicy) {
      const family = artworkFontFamily(value);
      if (!primaryTextPolicy.permissions.font || !family || (primaryTextPolicy.allowedFontFamilies.length && !primaryTextPolicy.allowedFontFamilies.includes(family))) return;
    }
    setFields((current) => ({ ...current, [fieldId]: value }));
    setFieldErrors((current) => ({ ...current, [fieldId]: "" }));
    if (fieldId === "name" || fieldId === "font") {
      setArtwork((current) => normalizeArtworkDocumentToPolicy({
        ...current,
        updatedAt: new Date().toISOString(),
        surfaces: current.surfaces.map((surface) => ({
          ...surface,
          layers: surface.layers.map((layer) => layer.id === "personalization-name" ? {
            ...layer,
            ...(fieldId === "name" ? { text: value || "Your name" } : {}),
            ...(fieldId === "font" ? { fontFamily: value === "serif" ? "serif" as const : value === "clean" ? "sans" as const : "rounded" as const } : {}),
          } : layer),
        })),
      }, configuration.artwork.policy));
    }
  }

  function updateArtwork(next: ArtworkDocument) {
    const normalized = normalizeArtworkDocumentToPolicy(
      keepArtworkLayerInForeground(next, "personalization-name"),
      configuration.artwork.policy,
    );
    setArtwork(normalized);
    const nameLayer = normalized.surfaces.flatMap((surface) => surface.layers).find((layer) => layer.id === "personalization-name");
    if (nameLayer?.type === "text") {
      const nextName = !nameLayer.text?.trim() || nameLayer.text === "Your name" ? "" : nameLayer.text;
      const nextFont = nameLayer.fontFamily === "sans" ? "clean" : nameLayer.fontFamily;
      const supportedFont = configuration.personalization.fields
        .find((field) => field.id === "font")
        ?.options?.some((option) => option.value === nextFont);
      if (nextName !== fields.name || (supportedFont && nextFont !== fields.font)) {
        setFields((current) => ({
          ...current,
          ...(nextName !== fields.name ? { name: nextName } : {}),
          ...(supportedFont && nextFont !== fields.font ? { font: nextFont } : {}),
        }));
        setFieldErrors((current) => ({
          ...current,
          ...(nextName !== fields.name ? { name: "" } : {}),
          ...(supportedFont && nextFont !== fields.font ? { font: "" } : {}),
        }));
      }
    }
  }

  async function loadDesign(savedDesign: SavedDesign) {
    setSaveMessage(`Loading ${savedDesign.title}...`);
    const design = await hydrateSavedDesignArtwork(savedDesign);
    const restoredFields = preserveSupportedArtworkFont(
      configuration,
      normalizedPersonalizationFields(configuration, design.fields),
      design.artwork,
    );
    setConfigurationId(design.id);
    setVariantId(configuration.variants.some((variant) => variant.id === design.variantId) ? design.variantId : firstVariant?.id ?? "");
    setTemplateId(configuration.personalization.templates.some((template) => template.id === design.templateId) ? design.templateId : firstTemplate?.id ?? "");
    setDimensionPresetId(configuration.dimensions.presets.some((preset) => preset.id === design.dimensionPresetId) ? design.dimensionPresetId : defaultPreset?.id ?? "");
    setDisplayUnit(configuration.dimensions.supportedDisplayUnits.includes(design.displayUnit) ? design.displayUnit : configuration.dimensions.supportedDisplayUnits[0] ?? "mm");
    setQuantity(normalizedQuantity(configuration, design.quantity));
    setFields(restoredFields);
    setArtwork(synchronizePersonalizationArtwork(configuration, design.artwork, restoredFields));
    setSavedDesigns((current) => mergeSavedDesigns(
      current.filter((candidate) => candidate.id !== design.id),
      [design],
    ));
    setFieldErrors({});
    setSaveMessage(`Loaded ${design.title}.`);
  }

  async function saveDesign() {
    const currentErrors = validateFields(configuration, fields, templateId);
    setFieldErrors(currentErrors);
    if (Object.keys(currentErrors).length) {
      setSaveMessage("Complete the required product details before saving.");
      return;
    }
    const id = configurationId || uniqueId();
    const title = (fields.name || product.name).trim();
    const saved: SavedDesign = {
      id,
      productId: product.id,
      title,
      variantId,
      templateId,
      dimensionPresetId,
      displayUnit,
      quantity,
      fields,
      artwork,
      savedAt: new Date().toISOString(),
    };
    let savedOnDevice = false;
    try {
      const all = readSavedDesigns();
      const next = [...all.filter((design) => design.id !== id), saved].slice(-20);
      localStorage.setItem(SAVED_DESIGNS_KEY, JSON.stringify(next));
      setSavedDesigns(next.filter((design) => design.productId === product.id));
      savedOnDevice = true;
      setSaveMessage("Design saved on this device.");
    } catch {
      setSaveMessage("Local draft storage is full. Trying your account instead...");
    }
    const rememberSavedDesignLocation = () => {
      setConfigurationId(id);
      const url = new URL(window.location.href);
      url.searchParams.set("design", id);
      if (!editingKey) url.searchParams.delete("edit");
      window.history.replaceState(null, "", url);
    };
    if (savedOnDevice) rememberSavedDesignLocation();

    try {
      const response = await fetch("/api/customizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...saved,
          templateId: saved.templateId || undefined,
          artwork: persistedArtwork,
          savedAt: undefined,
        }),
      });
      const payload = await response.json() as {
        data?: unknown;
        error?: { message?: string };
      };
      if (response.ok && isSavedDesign(payload.data)) {
        if (!savedOnDevice) rememberSavedDesignLocation();
        const merged = mergeSavedDesigns(
          savedDesigns.filter((design) => design.id !== id),
          [{ ...payload.data, artwork: saved.artwork }],
        );
        setSavedDesigns(merged);
        setSaveMessage(savedOnDevice
          ? "Design saved to your account and this device."
          : "Design saved to your account. Local draft storage remains unavailable.");
      } else if (response.status === 401 || response.status === 403) {
        setSaveMessage(savedOnDevice
          ? "Design saved on this device. Sign in to sync it across devices."
          : "Sign in to save this design to your account; local draft storage is unavailable.");
      } else {
        const message = payload.error?.message ?? "Account sync is unavailable.";
        setSaveMessage(savedOnDevice
          ? `Design saved on this device. ${message}`
          : `The design could not be saved locally or to your account. ${message}`);
      }
    } catch {
      setSaveMessage(savedOnDevice
        ? "Design saved on this device. Account sync is temporarily unavailable."
        : "The design could not be saved locally, and account sync is temporarily unavailable.");
    }
  }

  async function downloadDesign() {
    setIsDownloading(true);
    setSaveMessage("Preparing print-resolution artwork...");
    try {
      const result = await downloadArtworkDesign({
        document: artwork,
        surfaces: surfaceDefinitions(configuration, selectedPreset),
        background: templateBackground,
        accent: templateAccent,
        productName: product.name,
      });
      setSaveMessage(result.zipped
        ? `Downloaded ${result.fileCount} artwork surfaces in ${result.filename}.`
        : `Downloaded ${result.filename}.`);
    } catch (error) {
      setSaveMessage(error instanceof Error
        ? `Could not download this design: ${error.message}`
        : "Could not download this design. Try again.");
    } finally {
      setIsDownloading(false);
    }
  }

  function resetConfiguration() {
    setConfigurationId(uniqueId());
    setVariantId(firstVariant?.id ?? "");
    setTemplateId(firstTemplate?.id ?? "");
    setDimensionPresetId(defaultPreset?.id ?? "");
    setDisplayUnit(configuration.dimensions.supportedDisplayUnits[0] ?? "mm");
    setQuantity(configuration.quantity.default);
    setFields(initialFields(configuration));
    setArtwork(createInitialArtwork(configuration));
    setFieldErrors({});
    setSaveMessage("");
  }

  function addToCart() {
    const currentErrors = validateFields(configuration, fields, templateId);
    setFieldErrors(currentErrors);
    if (Object.keys(currentErrors).length) return;
    if (!selectedVariant || quote.status !== "ready" || !quotedLine) {
      setSaveMessage("Wait for the server-verified price before adding this configuration.");
      return;
    }
    if (editingKey) removeItem(editingKey);
    const fontValue = customerFieldValues.font || "rounded";
    const fontLabel = visiblePersonalizationFields.find((field) => field.id === "font")?.options?.find((option) => option.value === fontValue)?.label ?? fontValue;
    const personalizationNameLayer = artwork.surfaces
      .flatMap((surface) => surface.layers)
      .find((layer) => layer.id === "personalization-name" && layer.type === "text");
    addItem({
      productId: product.id,
      variantId: selectedVariant.id,
      slug: product.slug,
      name: product.name,
      price: quotedLine.unitPricePaise / 100,
      ...(quotedLine.lineTotalPaise !== quotedLine.unitPricePaise * quantity ? { lineAdjustment: (quotedLine.lineTotalPaise - quotedLine.unitPricePaise * quantity) / 100 } : {}),
      quantity,
      visual: product.artwork,
      customization: configuration.personalization.supported ? {
        configurationId,
        name: customerFieldValues.name || product.name,
        detail: customerFieldValues["class-details"] || customerFieldValues.subtitle || "",
        fields: customerFieldValues,
        templateId: selectedTemplate?.id,
        template: selectedTemplate?.label ?? "Product default",
        font: fontLabel,
        textColor: personalizationNameLayer?.color ?? selectedTemplate?.preview.foreground ?? neutralPresentationPalette.ink,
        backgroundColor: templateBackground,
        pack: selectedVariant.label,
        material: selectedVariant.material,
        dimensionPresetId: selectedPreset?.id,
        dimensionLabel: selectedPreset?.label ?? configuration.dimensions.catalogDescription,
        displayUnit,
        artwork,
        ...(configuration.preview.model && configuration.preview.supportedModes.includes("3d") ? {
          visualization: {
            schemaVersion: 1 as const,
            previewMode: "3d" as const,
            model: configuration.preview.model,
            configurationVersion: product.configurator?.configurationVersion || `catalog-${configuration.schemaVersion}`,
            dimensionPresetId: selectedPreset?.id ?? configuration.dimensions.defaultPresetId,
            dimensionsMm: selectedPreset?.dimensionsMm ? { ...selectedPreset.dimensionsMm } : null,
            material: selectedVariant.material,
            surfaceIds: configuration.artwork.surfaces.map((surface) => surface.id),
            ...(configuration.preview.visualization ? {
                templateId: configuration.preview.visualization.id,
                templateVersion: configuration.preview.visualization.version,
                ...(configuration.preview.visualization.sourceAsset ? {
                  sourceAssetId: configuration.preview.visualization.sourceAsset.id,
                } : {}),
                surfaceMappings: configuration.preview.visualization.surfaces.map((surface) => ({
                surfaceId: surface.surfaceId,
                role: surface.role,
              })),
            } : {}),
          },
        } : {}),
        quote: {
          id: quote.data.quoteId,
          pricingVersion: quote.data.pricingVersion,
          calculatedAt: quote.data.calculatedAt,
          unitPricePaise: quotedLine.unitPricePaise,
        },
      } : undefined,
    });
    if (editingKey) {
      const url = new URL(window.location.href);
      url.searchParams.delete("edit");
      window.history.replaceState(null, "", url);
    }
    setEditingKey(null);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 3000);
  }

  const purchasePanel = (
    <div className={configuratorStyles.purchasePanel}>
      <div className={configuratorStyles.priceStatus}>
        <span>{quote.status === "ready" ? <Check /> : quote.status === "error" ? <CircleAlert /> : <Clock3 />} {quote.message}</span>
        <strong>{formatPrice(displaySubtotal / 100)}</strong>
        <small>{formatPrice(displayUnitPrice / 100)} each x {quantity}</small>
      </div>
      {quotedLine?.adjustments.map((adjustment) => (
        <p className={configuratorStyles.adjustment} key={`${adjustment.label}-${adjustment.amountPaise}`}><span>{adjustment.label}{adjustment.scope === "line" ? " (per line)" : ""}</span><strong>{adjustment.amountPaise >= 0 ? "+" : "−"}{formatPrice(Math.abs(adjustment.amountPaise) / 100)}</strong></p>
      ))}
      <div className={configuratorStyles.purchaseActions}>
        <div className={configuratorStyles.designFileActions}>
          <button type="button" onClick={saveDesign}><Save /> Save design</button>
          <button type="button" onClick={downloadDesign} disabled={isDownloading} aria-busy={isDownloading}>
            <Download /> {isDownloading ? "Preparing..." : "Download design"}
          </button>
        </div>
        <button type="button" className={configuratorStyles.primaryAction} onClick={addToCart} disabled={quote.status !== "ready"}>
          {added ? <Check /> : <ShoppingBag />} {added ? "Added to cart" : editingKey ? "Update cart item" : "Add to cart"}
        </button>
      </div>
      {saveMessage && <p className={configuratorStyles.saveMessage} role="status">{saveMessage}</p>}
      {quantity >= configuration.quantity.maximum && <Link className={configuratorStyles.quoteLink} href={`/bulk-orders?product=${encodeURIComponent(product.id)}&quantity=${quantity}`}>Need a larger run? Request a production quote</Link>}
      <p className={configuratorStyles.revalidation}><ShieldCheck /> Price, availability and personalization are checked again at checkout.</p>
    </div>
  );

  return (
    <>
      <section className={configuratorStyles.configuratorPage}>
        <header
          ref={productHeroReveal.ref}
          className={`${configuratorStyles.configuratorHeader} ${productHeroReveal.className}`}
          data-scroll-reveal={productHeroReveal.state}
        >
          <div>
            <span className={configuratorStyles.status}>{product.stockStatus === "out_of_stock" ? "Unavailable" : product.stockStatus === "in_stock" ? "In stock" : "Made to order"}</span>
            <h1>{product.name}</h1>
            <p>{product.shortDescription}</p>
          </div>
          <div className={configuratorStyles.headerActions}>
            <button type="button" onClick={resetConfiguration} aria-label="Reset configuration" title="Reset configuration"><RotateCcw /></button>
            <button
              type="button"
              className={productIsWishlisted ? configuratorStyles.wishlisted : ""}
              onClick={() => toggleWishlist(product.id)}
              aria-label={productIsWishlisted ? "Remove from wishlist" : "Save to wishlist"}
              aria-pressed={productIsWishlisted}
              title={productIsWishlisted ? "Remove from wishlist" : "Save to wishlist"}
            >
              <Heart />
            </button>
          </div>
        </header>

        {editingKey && <div className={configuratorStyles.editNotice}>Editing a cart configuration. Adding it again will replace that cart line.</div>}

        <div className={configuratorStyles.workspace}>
          <aside className={configuratorStyles.optionsPanel} aria-label="Product configuration">
            <div className={configuratorStyles.productThumb}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={product.image} alt="" />
              <div><span>SKU {selectedVariant?.sku ?? product.sku}</span><strong>{selectedVariant?.label ?? product.name}</strong></div>
            </div>

            <div className={configuratorStyles.modeSummary} aria-label="Customization capabilities">
              {configuration.modes.map((mode) => <span key={mode}>{customizationModeLabel(mode)}</span>)}
            </div>

            {savedDesigns.length > 0 && (
              <label className={configuratorStyles.savedSelect}>
                <span>Reopen a saved design</span>
                <div><select defaultValue="" onChange={(event) => { const design = savedDesigns.find((item) => item.id === event.target.value); if (design) loadDesign(design); }}><option value="" disabled>Choose saved design</option>{savedDesigns.map((design) => <option key={design.id} value={design.id}>{design.title} - {new Date(design.savedAt).toLocaleDateString("en-IN")}</option>)}</select><ChevronDown /></div>
              </label>
            )}

            <fieldset className={configuratorStyles.optionSection}>
              <legend><span>1</span><div><strong>Format and material</strong><small>Choose a purchasable catalog option</small></div></legend>
              <div className={configuratorStyles.choiceList}>
                {configuration.variants.map((variant) => (
                  <button key={variant.id} type="button" aria-pressed={variant.id === variantId} className={variant.id === variantId ? configuratorStyles.selectedChoice : ""} onClick={() => setVariantId(variant.id)} disabled={variant.stockStatus === "out_of_stock"}>
                    <span><strong>{variant.label}</strong><small>{variant.material} - {variant.packSize} pieces</small></span>
                    <b>{formatPrice(variant.unitPricePaise / 100)}</b>
                    {variant.id === variantId && <Check />}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className={configuratorStyles.optionSection}>
              <legend><span>2</span><div><strong>Dimensions</strong><small>Physical size stays fixed when units change</small></div></legend>
              {configuration.dimensions.supportedDisplayUnits.length > 0 && (
                <div className={configuratorStyles.segmented} aria-label="Measurement unit">
                  {configuration.dimensions.supportedDisplayUnits.map((unit) => <button key={unit} type="button" aria-pressed={displayUnit === unit} className={displayUnit === unit ? configuratorStyles.active : ""} onClick={() => setDisplayUnit(unit)}>{unit}</button>)}
                </div>
              )}
              <div className={configuratorStyles.sizeChoices}>
                {configuration.dimensions.presets.map((preset) => (
                  <button type="button" key={preset.id} aria-pressed={preset.id === dimensionPresetId} className={preset.id === dimensionPresetId ? configuratorStyles.selectedChoice : ""} onClick={() => setDimensionPresetId(preset.id)}>
                    <strong>{preset.label}</strong>
                    {preset.dimensionsMm && <small>{Object.values(preset.dimensionsMm).map((value) => displayMeasurement(value, displayUnit)).join(" x ")}</small>}
                  </button>
                ))}
              </div>
              <Link className={configuratorStyles.blockedOption} href={buildCustomSizeQuotePath({ productId: product.id, quantity, dimensions: selectedPreset?.label })}><LockKeyhole /><span><strong>Custom size - request a quote</strong><small>{configuration.dimensions.custom.reason}</small></span></Link>
            </fieldset>

            {configuration.personalization.supported && visibleCustomerFields.length > 0 && (
              <fieldset className={configuratorStyles.optionSection}>
                <legend><span>3</span><div><strong>Personal details</strong><small>These values are validated for this product</small></div></legend>
                <div className={configuratorStyles.fieldList}>
                  {visibleCustomerFields.map((field) => (
                    <label key={field.id}>
                      <span>{field.label}{field.unit && <small>({field.unit})</small>}{field.required && <em>*</em>}{field.maxLength && <small>{(fields[field.id] ?? "").length}/{field.maxLength}</small>}</span>
                      {field.type === "select" ? (
                        <select value={fields[field.id] ?? ""} onChange={(event) => changeField(field.id, event.target.value)}>{field.options?.map((option) => <option key={option.id} value={option.value}>{option.label}</option>)}</select>
                      ) : field.type === "color" ? (
                        <input type="color" value={fields[field.id] || neutralPresentationPalette.ink} onChange={(event) => changeField(field.id, event.target.value)} />
                      ) : (
                        <input type={field.type === "number" ? "number" : "text"} value={fields[field.id] ?? ""} placeholder={field.placeholder} min={field.type === "number" ? field.minValue : undefined} max={field.type === "number" ? field.maxValue : undefined} step={field.type === "number" ? field.step : undefined} maxLength={field.maxLength} aria-invalid={Boolean(fieldErrors[field.id])} onBlur={() => setFieldErrors(validateFields(configuration, fields, templateId))} onChange={(event) => changeField(field.id, event.target.value)} />
                      )}
                      {field.helpText && <small>{field.helpText}</small>}
                      {fieldErrors[field.id] && <b role="alert">{fieldErrors[field.id]}</b>}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            {configuration.personalization.templates.length > 0 && (
              <fieldset className={configuratorStyles.optionSection}>
                <legend><span>4</span><div><strong>Design theme</strong><small>Premium additions appear in the quote</small></div></legend>
                <div className={configuratorStyles.templateChoices}>
                  {configuration.personalization.templates.map((template) => (
                    <button key={template.id} type="button" aria-pressed={template.id === templateId} className={template.id === templateId ? configuratorStyles.selectedChoice : ""} onClick={() => setTemplateId(template.id)}>
                      <i style={{ background: template.preview.background, borderColor: template.preview.accent, color: template.preview.foreground }}>Aa</i>
                      <span><strong>{template.label}</strong><small>{template.premiumPricePaise ? `+${formatPrice(template.premiumPricePaise / 100)}` : "Included"}</small></span>
                    </button>
                  ))}
                </div>
              </fieldset>
            )}

            <fieldset className={configuratorStyles.optionSection}>
              <legend><span>5</span><div><strong>Quantity</strong><small>{configuration.quantity.minimum}-{configuration.quantity.maximum} per cart line</small></div></legend>
              <div className={configuratorStyles.quantityRow}>
                <button type="button" aria-label="Decrease quantity" onClick={() => setQuantity((value) => Math.max(configuration.quantity.minimum, value - configuration.quantity.increment))} disabled={quantity <= configuration.quantity.minimum}><Minus /></button>
                <input aria-label="Quantity" type="number" min={configuration.quantity.minimum} max={configuration.quantity.maximum} step={configuration.quantity.increment} value={quantity} onChange={(event) => setQuantity(Math.max(configuration.quantity.minimum, Math.min(configuration.quantity.maximum, Number(event.target.value) || configuration.quantity.minimum)))} />
                <button type="button" aria-label="Increase quantity" onClick={() => setQuantity((value) => Math.min(configuration.quantity.maximum, value + configuration.quantity.increment))} disabled={quantity >= configuration.quantity.maximum}><Plus /></button>
              </div>
              {configuration.quantity.tiers.length > 0 && <small>Quantity price breaks: {configuration.quantity.tiers.map((tier) => `${tier.label} ${tier.priceDeltaPaise >= 0 ? "+" : "−"}${formatPrice(Math.abs(tier.priceDeltaPaise) / 100)} each`).join(" · ")}</small>}
            </fieldset>

            <div className={configuratorStyles.productionFacts}>
              <div><span>Material</span><strong>{selectedVariant?.material}</strong></div>
              <div><span>Print area</span><strong>{configuration.artwork.surfaces.map((surface) => surface.label).join(", ") || "Not customizable"}</strong></div>
              <div><span>Production files</span><strong>Preflight required</strong></div>
            </div>
          </aside>

          <main className={configuratorStyles.designArea}>
              <div className={configuratorStyles.designHeading}>
               <div><Sparkles /><span><strong>{previewMode === "3d" ? "Interactive 3D preview" : previewMode === "2d" && configuration.personalization.supported ? "Live 2D artwork studio" : "Product preview"}</strong><small>{previewMode === "3d" ? "Rotate and inspect your customized product in 3D." : previewMode === "2d" && configuration.personalization.supported ? "Drag elements on the print area. Dashed guides mark the safe zone." : "This product is configured without a customer design preview."}</small></span></div>
              <div className={configuratorStyles.viewModeToggle} role="group" aria-label="Preview mode">
                {configuration.preview.supportedModes.includes("3d") && <button
                  type="button"
                  aria-pressed={previewMode === "3d"}
                  className={previewMode === "3d" ? configuratorStyles.viewModeActive : ""}
                  onClick={() => setPreviewMode("3d")}
                  title="3D interactive model"
                >
                  <Box className="w-3.5 h-3.5" /> 3D View
                </button>}
                {configuration.preview.supportedModes.includes("2d") && <button
                  type="button"
                  aria-pressed={previewMode === "2d"}
                  className={previewMode === "2d" ? configuratorStyles.viewModeActive : ""}
                  onClick={() => setPreviewMode("2d")}
                  title={configuration.personalization.supported ? "2D design editor" : "2D product preview"}
                >
                  <Layers3 className="w-3.5 h-3.5" /> {configuration.personalization.supported ? "2D Studio" : "2D View"}
                </button>}
              </div>
            </div>
             {previewMode === "3d" ? (
                <div className={configuratorStyles.preview3dContainer}>
                  <DesignCompletionMeter completion={designCompletion} />
                  <Product3DPreview
                    document={visualization3DPreview.document}
                    surfaces={visualization3DPreview.surfaces}
                    background={templateBackground}
                    accent={templateAccent}
                     structuralDesign={configuration.preview.model ?? product.artwork}
                    productType={product.categorySlug}
                    dimensionsMm={selectedPreset?.dimensionsMm}
                    materialName={selectedVariant?.material || product.material}
                    productName={product.name}
                    onReadyChange={handlePreviewReadyChange}
                  />
                  {purchasePanel}
                </div>
              ) : configuration.personalization.supported && previewMode === "2d" ? (
                   <ArtworkEditor
                  productId={product.id}
                  document={artwork}
                  surfaces={surfaceDefinitions(configuration, selectedPreset)}
                  policy={configuration.artwork.policy}
                  uploads={configuration.artwork.uploads}
                  background={templateBackground}
                  foreground={templateForeground}
                  accent={templateAccent}
                  baseImages={templateBaseImages}
                  personalizationFontOptions={personalizationFontOptions}
                  designCompletion={designCompletion}
                  onChange={updateArtwork}
                  footer={purchasePanel}
                />
              ) : (
              <div className={configuratorStyles.standardPreview}>
                {productImageGallery ?? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={product.image} alt={product.name} />
                  </>
                )}
                {purchasePanel}
              </div>
             )}
             {productImageGallery && !usesStandardPreview && <section aria-label="Product images" className={configuratorStyles.catalogImageGallery}>{productImageGallery}</section>}
             {configuration.preview.template && <div className={configuratorStyles.capabilityNotice}><CircleAlert /><span><strong>Preview template: {configuration.preview.template}</strong>This reference is saved with the product configuration. Production artwork still requires review.</span></div>}
             {artworkUploadsEnabled ? (
              <div className={configuratorStyles.capabilityNotice}><ShieldCheck /><span><strong>Uploads are validated and stored privately.</strong>Only claimed asset references continue to checkout; local preview data is removed from the order payload.</span></div>
             ) : !configuration.artwork.uploads.supported && (
              <div className={configuratorStyles.capabilityNotice}><CircleAlert /><span><strong>Image upload is unavailable for this product.</strong>{configuration.artwork.uploads.reason}</span></div>
            )}
            <div className={configuratorStyles.readinessGrid}>
              <div><PackageCheck /><span><strong>Manufacturing review</strong><small>Custom dimensions remain unavailable until approved limits and rates are configured.</small></span></div>
              <div><ShieldCheck /><span><strong>Artwork preflight</strong><small>Bleed, resolution, colour and rights must be checked before production.</small></span></div>
              <div><Truck /><span><strong>Checkout revalidation</strong><small>Current catalog price and availability are recalculated on the server.</small></span></div>
            </div>
          </main>
        </div>
      </section>

      <section className="product-information section-soft">
        <div
          ref={practicalDetailsReveal.ref}
          className={`shell product-info-grid ${practicalDetailsReveal.className}`}
          data-scroll-reveal={practicalDetailsReveal.state}
        ><div><span className="eyebrow">The practical details</span><h2>Made for everyday use</h2>{hasStructuredDescription ? <>{structuredDescription?.intro && <p>{structuredDescription.intro}</p>}{structuredDescription?.bestFor?.length ? <p><strong>Best for:</strong> {structuredDescription.bestFor.join(", ")}</p> : null}{structuredBulletLabels.length ? <ul>{structuredBulletLabels.map((label, index) => <li key={`${label}-${index}`}><Check /> {label}</li>)}</ul> : null}</> : <><p>{product.description}</p><ul>{product.features.map((feature) => <li key={feature}><Check /> {feature}</li>)}</ul></>}</div><dl><div><dt>Material</dt><dd>{selectedVariant?.material || product.material}</dd></div><div><dt>Dimensions</dt><dd>{product.dimensions}</dd></div><div><dt>What is included</dt><dd>{selectedVariant?.packSize || product.packSize} pieces in your selected format</dd></div><div><dt>Production window</dt><dd>{product.productionDays.min}-{product.productionDays.max} working days after design review</dd></div>{product.careInstructions && <div><dt>Care</dt><dd>{product.careInstructions}</dd></div>}</dl></div>
      </section>

      <div className={configuratorStyles.mobileBuyBar}><div><small>{quote.message}</small><strong>{formatPrice(displaySubtotal / 100)}</strong></div><button type="button" onClick={addToCart} disabled={quote.status !== "ready"}>{added ? "Added" : "Add to cart"}</button></div>
    </>
  );
}
