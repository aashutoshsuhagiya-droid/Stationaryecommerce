import { getProductBySlug } from "./data";
import { resolveProductArtworkPolicy } from "./artwork-policy";
import { buildCustomSizeQuotePath } from "./bulk-quote-prefill";
import { isEzpacPackagingProductType } from "./ezpac-packaging-presets";
import { resolveProductTemplateLinks } from "./product-template-resolution";
import type {
  CustomizationField,
  CurrencyCode,
  ArtworkImageMimeType,
  PersonalizationTemplate,
  Product,
  ProductArtworkPolicy,
  ProductVisualizationTemplate,
  StockStatus,
} from "./types";

export type MeasurementUnit = "mm" | "cm" | "in";
export type ProductCustomizationMode =
  | "standard"
  | "personalized"
  | "specification_based"
  | "design_studio"
  | "bulk_order";

export interface DimensionPreset {
  id: string;
  label: string;
  dimensionsMm: Record<string, number> | null;
}

export interface ConfiguratorVariant {
  id: string;
  sku: string;
  label: string;
  material: string;
  packSize: number;
  stockStatus: StockStatus;
  unitPricePaise: number;
}

export interface ConfiguratorTemplate {
  id: string;
  label: string;
  premiumPricePaise: number;
  preview: {
    background: string;
    foreground: string;
    accent: string;
    fontFamily: string;
    textAlign: "left" | "center" | "right";
    safeArea: { x: number; y: number; width: number; height: number };
  };
  production?: PersonalizationTemplate["production"];
}

export interface ProductConfigurationSchema {
  schemaVersion: "1.0";
  product: {
    id: string;
    slug: string;
    name: string;
    productType: string;
    structuralDesign: string;
    currency: CurrencyCode;
  };
  modes: ProductCustomizationMode[];
  dimensions: {
    mode: "fixed_catalog";
    catalogDescription: string;
    canonicalUnit: "mm";
    supportedDisplayUnits: MeasurementUnit[];
    defaultPresetId: string;
    presets: DimensionPreset[];
    custom: {
      supported: false;
      purchaseMode: "quote_only";
      fields: never[];
      reason: string;
      quotePath: string;
    };
  };
  variants: ConfiguratorVariant[];
  personalization: {
    supported: boolean;
    supportsMultipleNames: boolean;
    fields: CustomizationField[];
    templates: ConfiguratorTemplate[];
  };
  quantity: { minimum: number; maximum: number; increment: number; default: number; tiers: Array<{ minimum: number; label: string; priceDeltaPaise: number }> };
  artwork: {
    mode: "template_fields" | "none";
    surfaces: Array<{ id: string; label: string; widthMm?: number; heightMm?: number; safeInsetMm?: number }>;
    uploads: {
      supported: boolean;
      acceptedMimeTypes: ArtworkImageMimeType[];
      maximumBytes: number;
      endpoint: "/api/artwork-assets";
      reason: string;
    };
    policy: ProductArtworkPolicy;
  };
  preview: {
    mode: "catalog_2d";
    artworkKey: string;
    template?: string;
    model?: string;
    visualization?: ProductVisualizationTemplate;
    supportedModes: Array<"2d" | "3d">;
    defaultMode: "2d" | "3d" | null;
  };
  pricing: {
    mode: "server_quote";
    currency: CurrencyCode;
    endpoint: "/api/quotes";
    rules: Array<"variant_catalog_price" | "template_catalog_premium" | "field_price_delta" | "option_price_delta" | "artwork_image" | "quantity_tier" | "setup_charge">;
    quantityTiers: Array<{ minimum: number; label: string; priceDeltaPaise: number }>;
  };
  productionReadiness: {
    customDimensions: "blocked_missing_limits_and_rates";
    artworkUploads: "ready_private_raster_storage" | "disabled_by_product";
    threeDimensionalPreview: "ready_versioned_visualization_template" | "blocked_missing_validated_geometry";
    productionExport: "ready_manufacturing_validated" | "blocked_missing_dielines_and_color_profiles";
  };
}

const toPaise = (rupees: number) => Math.round(rupees * 100);

const presetId = (label: string, index: number) =>
  `size-${index + 1}-${label
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()}`;

function parseLegacyDimensions(label: string): Record<string, number> | null {
  if (/\b(?:approx|mixed|standard|three|two)\b/i.test(label)) return null;
  const match = label.match(/(?:^|\D)(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(mm|cm)\b/i);
  if (!match) return null;
  const multiplier = match[3].toLowerCase() === "cm" ? 10 : 1;
  return {
    width: Number(match[1]) * multiplier,
    height: Number(match[2]) * multiplier,
  };
}

function parseExactDimensions(label: string): Record<string, number> | null {
  if (/\b(?:approx|mixed|standard|three|two)\b/i.test(label)) return null;
  const match = label.match(
    /(?:^|\D)(\d+(?:\.\d+)?)\s*(?:x|\u00d7)\s*(\d+(?:\.\d+)?)(?:\s*(?:x|\u00d7)\s*(\d+(?:\.\d+)?))?\s*(mm|cm|in)\b/i,
  );
  if (!match) return parseLegacyDimensions(label);
  const unit = match[4].toLowerCase();
  const multiplier = unit === "cm" ? 10 : unit === "in" ? 25.4 : 1;
  const dimensions: Record<string, number> = {
    width: Number(match[1]) * multiplier,
    height: Number(match[2]) * multiplier,
  };
  if (match[3]) dimensions.depth = Number(match[3]) * multiplier;
  return dimensions;
}

function activeTemplates(product: Product): ConfiguratorTemplate[] {
  return resolveProductTemplateLinks(product).map(({ template }) => ({
    id: template.id,
    label: template.name,
    premiumPricePaise: toPaise(template.premiumPrice),
    preview: template.preview,
    ...(template.production ? { production: template.production } : {}),
  }));
}

export function productSupportsMultipleNames(product: Product) {
  return product.categorySlug === "bulk-orders" || product.tags.includes("multiple names");
}

export function buildProductConfiguration(product: Product): ProductConfigurationSchema {
  const sizeLabels = product.sizes?.length ? product.sizes : [product.dimensions];
  const publishedVisualization = product.configurator?.visualizationTemplate;
  const presets = sizeLabels.map((label, index) => ({
      id: presetId(label, index),
      label,
      dimensionsMm:
        parseExactDimensions(label) ??
        (sizeLabels.length === 1
          ? parseExactDimensions(product.dimensions) ?? publishedVisualization?.dimensionsMm ?? null
          : null),
    }),
  );
  const hasNumericDimensions = presets.some((preset) => preset.dimensionsMm !== null);
  const defaultPreset = presets[0];
  const defaultQuantity = product.configurator?.quantityMin ?? 1;
  const previewModes = ([
    product.configurator?.allow2D !== false && "2d",
    product.configurator?.allow3D === true &&
      (!isEzpacPackagingProductType(product.productType) || Boolean(publishedVisualization)) &&
      product.configurator.productModel &&
      "3d",
  ].filter(Boolean) as Array<"2d" | "3d">);
  const modes: ProductCustomizationMode[] = ["standard", "specification_based"];
  if (product.customizable) modes.push("personalized", "design_studio");
  if (productSupportsMultipleNames(product)) modes.push("bulk_order");
  const artworkPolicy: ProductArtworkPolicy = product.customizable
    ? resolveProductArtworkPolicy(product)
    : { maximumElements: 0, surfaces: [] };
  const configuredArtworkMimeTypes = product.configurator?.artworkUpload?.acceptedMimeTypes.filter(
    (mimeType): mimeType is ArtworkImageMimeType =>
      mimeType === "image/jpeg" || mimeType === "image/png" || mimeType === "image/webp",
  ) ?? [];
  const policyArtworkMimeTypes = [...new Set(artworkPolicy.surfaces.flatMap((surface) => surface.image.allowedMimeTypes))];
  const acceptedArtworkMimeTypes = configuredArtworkMimeTypes.filter((mimeType) => policyArtworkMimeTypes.includes(mimeType));
  const artworkUploadSupported = Boolean(
    product.customizable &&
    product.configurator?.artworkUpload?.enabled &&
    acceptedArtworkMimeTypes.length &&
    artworkPolicy.surfaces.some((surface) => surface.image.enabled),
  );
  const maximumArtworkBytes = artworkUploadSupported
    ? Math.min(
        product.configurator?.artworkUpload?.maximumBytes ?? 0,
        ...artworkPolicy.surfaces.filter((surface) => surface.image.enabled).map((surface) => surface.image.maximumBytes),
      )
    : 0;

  return {
    schemaVersion: "1.0",
    product: {
      id: product.id,
      slug: product.slug,
      name: product.name,
      productType: product.productType ?? product.categorySlug,
      structuralDesign: product.artwork,
      currency: "INR",
    },
    modes,
    dimensions: {
      mode: "fixed_catalog",
      catalogDescription: product.dimensions,
      canonicalUnit: "mm",
      supportedDisplayUnits: hasNumericDimensions ? ["mm", "cm", "in"] : [],
      defaultPresetId: defaultPreset.id,
      presets,
      custom: {
        supported: false,
        purchaseMode: "quote_only",
        fields: [],
        reason:
          "Approved manufacturing limits and custom-dimension pricing are not configured for this product.",
        quotePath: buildCustomSizeQuotePath({
          productId: product.id,
          quantity: defaultQuantity,
          dimensions: defaultPreset.label,
        }),
      },
    },
    variants: product.variants.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      label: variant.name,
      material: variant.material ?? product.material,
      packSize: variant.packSize ?? product.packSize,
      stockStatus: variant.stockStatus,
      unitPricePaise: toPaise(variant.price),
    })),
    personalization: {
      supported: product.customizable,
      supportsMultipleNames: productSupportsMultipleNames(product),
      fields: product.customizationFields,
      templates: activeTemplates(product),
    },
    quantity: { minimum: defaultQuantity, maximum: Math.max(defaultQuantity, product.configurator?.quantityMax ?? 100), increment: 1, default: defaultQuantity, tiers: (product.configurator?.quantityTiers ?? []).map((tier) => ({ minimum: tier.minimum, label: tier.label || `${tier.minimum}+ units`, priceDeltaPaise: toPaise(tier.priceDelta) })).sort((left, right) => left.minimum - right.minimum) },
    artwork: {
      mode: product.customizable ? "template_fields" : "none",
      surfaces: product.customizable ? (product.configurator?.printAreas ?? [{ id: "primary", label: "Primary print area" }]) : [],
      uploads: {
        supported: artworkUploadSupported,
        acceptedMimeTypes: acceptedArtworkMimeTypes,
        maximumBytes: maximumArtworkBytes,
        endpoint: "/api/artwork-assets",
        reason: artworkUploadSupported
          ? "Uploads are signature-checked, preflighted and stored privately until attached to an order."
          : "Artwork upload is not enabled with a safe raster policy for this product.",
      },
      policy: artworkPolicy,
    },
    preview: {
      mode: "catalog_2d",
      artworkKey: product.artwork,
      template: product.configurator?.previewTemplate,
      model: product.configurator?.productModel,
      ...(publishedVisualization ? { visualization: publishedVisualization } : {}),
      supportedModes: previewModes,
      defaultMode: previewModes.includes("3d") ? "3d" : previewModes.includes("2d") ? "2d" : null,
    },
    pricing: {
      mode: "server_quote",
      currency: "INR",
      endpoint: "/api/quotes",
      rules: ["variant_catalog_price", "template_catalog_premium", "field_price_delta", "option_price_delta", "artwork_image", "quantity_tier", "setup_charge"],
      quantityTiers: (product.configurator?.quantityTiers ?? []).map((tier) => ({ minimum: tier.minimum, label: tier.label || `${tier.minimum}+ units`, priceDeltaPaise: toPaise(tier.priceDelta) })).sort((left, right) => left.minimum - right.minimum),
    },
    productionReadiness: {
      customDimensions: "blocked_missing_limits_and_rates",
      artworkUploads: artworkUploadSupported ? "ready_private_raster_storage" : "disabled_by_product",
      threeDimensionalPreview: publishedVisualization && previewModes.includes("3d")
        ? "ready_versioned_visualization_template"
        : "blocked_missing_validated_geometry",
      productionExport: publishedVisualization?.manufacturingValidated
        ? "ready_manufacturing_validated"
        : "blocked_missing_dielines_and_color_profiles",
    },
  };
}

export function getProductConfigurationBySlug(slug: string) {
  const product = getProductBySlug(slug);
  return product ? buildProductConfiguration(product) : undefined;
}
