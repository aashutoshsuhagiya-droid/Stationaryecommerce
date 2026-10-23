import { designTemplates, getProductBySlug } from "./data";
import { buildCustomSizeQuotePath } from "./bulk-quote-prefill";
import type {
  CustomizationField,
  CurrencyCode,
  Product,
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
  quantity: { minimum: 1; maximum: 100; increment: 1; default: 1 };
  artwork: {
    mode: "template_fields" | "none";
    surfaces: Array<{ id: string; label: string }>;
    uploads: { supported: false; acceptedMimeTypes: never[]; reason: string };
  };
  preview: { mode: "catalog_2d"; artworkKey: string };
  pricing: {
    mode: "server_quote";
    currency: CurrencyCode;
    endpoint: "/api/quotes";
    rules: Array<"variant_catalog_price" | "template_catalog_premium">;
    quantityTiers: never[];
  };
  productionReadiness: {
    customDimensions: "blocked_missing_limits_and_rates";
    artworkUploads: "blocked_missing_private_storage_and_preflight";
    threeDimensionalPreview: "blocked_missing_validated_geometry";
    productionExport: "blocked_missing_dielines_and_color_profiles";
  };
}

const toPaise = (rupees: number) => Math.round(rupees * 100);

const presetId = (label: string, index: number) =>
  `size-${index + 1}-${label
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()}`;

function parseExactDimensions(label: string): Record<string, number> | null {
  if (/\b(?:approx|mixed|standard|three|two)\b/i.test(label)) return null;
  const match = label.match(/(?:^|\D)(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(mm|cm)\b/i);
  if (!match) return null;
  const multiplier = match[3].toLowerCase() === "cm" ? 10 : 1;
  return {
    width: Number(match[1]) * multiplier,
    height: Number(match[2]) * multiplier,
  };
}

function activeTemplates(product: Product): ConfiguratorTemplate[] {
  return designTemplates
    .filter(
      (template) =>
        template.active &&
        product.templateIds.includes(template.id) &&
        template.compatibleProductIds.includes(product.id),
    )
    .map((template) => ({
      id: template.id,
      label: template.name,
      premiumPricePaise: toPaise(template.premiumPrice),
      preview: template.preview,
    }));
}

export function productSupportsMultipleNames(product: Product) {
  return product.categorySlug === "bulk-orders" || product.tags.includes("multiple names");
}

export function buildProductConfiguration(product: Product): ProductConfigurationSchema {
  const sizeLabels = product.sizes?.length ? product.sizes : [product.dimensions];
  const presets = sizeLabels.map((label, index) => ({
      id: presetId(label, index),
      label,
      dimensionsMm:
        parseExactDimensions(label) ??
        (sizeLabels.length === 1 ? parseExactDimensions(product.dimensions) : null),
    }),
  );
  const hasNumericDimensions = presets.some((preset) => preset.dimensionsMm !== null);
  const defaultPreset = presets[0];
  const defaultQuantity = 1;
  const modes: ProductCustomizationMode[] = ["standard", "specification_based"];
  if (product.customizable) modes.push("personalized", "design_studio");
  if (productSupportsMultipleNames(product)) modes.push("bulk_order");

  return {
    schemaVersion: "1.0",
    product: {
      id: product.id,
      slug: product.slug,
      name: product.name,
      productType: product.categorySlug,
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
    quantity: { minimum: 1, maximum: 100, increment: 1, default: defaultQuantity },
    artwork: {
      mode: product.customizable ? "template_fields" : "none",
      surfaces: product.customizable ? [{ id: "primary", label: "Primary print area" }] : [],
      uploads: {
        supported: false,
        acceptedMimeTypes: [],
        reason:
          "Private asset storage, MIME sniffing, malware scanning and production preflight are not configured.",
      },
    },
    preview: { mode: "catalog_2d", artworkKey: product.artwork },
    pricing: {
      mode: "server_quote",
      currency: "INR",
      endpoint: "/api/quotes",
      rules: ["variant_catalog_price", "template_catalog_premium"],
      quantityTiers: [],
    },
    productionReadiness: {
      customDimensions: "blocked_missing_limits_and_rates",
      artworkUploads: "blocked_missing_private_storage_and_preflight",
      threeDimensionalPreview: "blocked_missing_validated_geometry",
      productionExport: "blocked_missing_dielines_and_color_profiles",
    },
  };
}

export function getProductConfigurationBySlug(slug: string) {
  const product = getProductBySlug(slug);
  return product ? buildProductConfiguration(product) : undefined;
}
