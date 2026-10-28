import { CommerceError } from "./commerce-error";
import { buildProductConfiguration } from "./product-configuration";
import { resolveProductTemplate } from "./product-template-resolution";
import { snapshotJsonValue } from "./template-production";
import type { AuthoritativePriceLine } from "./pricing-service";
import type {
  ArtworkDocumentSnapshot,
  OrderTemplateSnapshot,
  PersonalizationValues,
  Product,
} from "./types";
import type { OrderItemInput } from "./validation";

const neutralPresentationPalette = { ink: "#17324d", surface: "#f8fafc" } as const;

/** Rebuilds display metadata from catalog and validated artwork, never from browser presentation hints. */
export function normalizePersistentOrderCustomization(
  product: Product,
  input: OrderItemInput,
  priced: AuthoritativePriceLine,
  verifiedArtwork?: ArtworkDocumentSnapshot,
): PersonalizationValues | undefined {
  const submitted = input.customization;
  if (!submitted) return undefined;
  const configuration = buildProductConfiguration(product);
  const preset = submitted.dimensionPresetId
    ? configuration.dimensions.presets.find((candidate) => candidate.id === submitted.dimensionPresetId)
    : configuration.dimensions.presets.find((candidate) => candidate.id === configuration.dimensions.defaultPresetId);
  if (!preset) {
    throw new CommerceError(422, "DIMENSION_PRESET_INVALID", "The selected dimensions are not available for this product.", {
      productId: product.id,
      dimensionPresetId: submitted.dimensionPresetId,
    });
  }
  if (submitted.dimensionLabel && submitted.dimensionLabel.trim() !== preset.label) {
    throw new CommerceError(422, "DIMENSION_LABEL_MISMATCH", "The selected dimensions do not match this product.", {
      productId: product.id,
      dimensionPresetId: preset.id,
    });
  }
  const supportedUnits = configuration.dimensions.supportedDisplayUnits;
  const displayUnit = submitted.displayUnit ?? supportedUnits[0] ?? configuration.dimensions.canonicalUnit;
  if (
    (supportedUnits.length > 0 && !supportedUnits.includes(displayUnit))
    || (supportedUnits.length === 0 && displayUnit !== configuration.dimensions.canonicalUnit)
  ) {
    throw new CommerceError(422, "DISPLAY_UNIT_INVALID", "The selected measurement unit is not available for this product.", {
      productId: product.id,
      displayUnit,
    });
  }

  const template = submitted.templateId
    ? resolveProductTemplate(product, submitted.templateId)
    : undefined;
  if (submitted.templateId && !template) {
    throw new CommerceError(422, "INVALID_TEMPLATE", "The selected design is not available for this product.", {
      productId: product.id,
      templateId: submitted.templateId,
    });
  }
  const nameLayer = verifiedArtwork?.surfaces
    .flatMap((surface) => surface.layers)
    .find((layer) => layer.id === "personalization-name" && layer.type === "text");
  const fontField = product.customizationFields.find((field) => field.id === "font");
  const fontValue = submitted.fields.font?.trim();
  const fontLabel = fontField?.options?.find((option) => option.value === fontValue)?.label
    ?? fontValue
    ?? (nameLayer?.type === "text" ? nameLayer.fontFamily : undefined)
    ?? template?.preview.fontFamily
    ?? "Product default";
  const name = submitted.fields.name?.trim() || product.name;
  const detail = submitted.fields["class-details"]?.trim() || submitted.fields.subtitle?.trim();
  const {
    quote: _untrustedQuote,
    presentation: _untrustedPresentation,
    artwork: _untrustedArtwork,
    dimensionPresetId: _untrustedPreset,
    dimensionLabel: _untrustedLabel,
    displayUnit: _untrustedUnit,
    ...stable
  } = submitted;

  return {
    ...stable,
    ...(verifiedArtwork ? { artwork: verifiedArtwork } : {}),
    dimensionPresetId: preset.id,
    dimensionLabel: preset.label,
    displayUnit,
    presentation: {
      name,
      ...(detail ? { detail } : {}),
      templateLabel: template?.name ?? "Product default",
      fontLabel,
      textColor: nameLayer?.type === "text"
        ? nameLayer.color
        : template?.preview.foreground ?? neutralPresentationPalette.ink,
      backgroundColor: template?.preview.background ?? neutralPresentationPalette.surface,
      packLabel: priced.productSnapshot.variantName,
      materialLabel: priced.productSnapshot.material,
    },
  };
}

/** Builds the immutable production specification persisted with an order personalization. */
export function createOrderTemplateSnapshot(
  product: Product,
  customization: PersonalizationValues | undefined,
): OrderTemplateSnapshot | undefined {
  if (!customization?.templateId) return undefined;
  const template = resolveProductTemplate(product, customization.templateId);
  if (!template) {
    throw new CommerceError(422, "INVALID_TEMPLATE", "The selected design is not available for this product.", {
      productId: product.id,
      templateId: customization.templateId,
    });
  }
  const production = template.production;
  return {
    schemaVersion: 1,
    templateId: template.id,
    slug: template.slug,
    name: template.name,
    theme: template.theme,
    description: template.description,
    thumbnail: template.thumbnail,
    artwork: template.artwork,
    premiumPricePaise: Math.round(template.premiumPrice * 100),
    rightsStatement: template.rightsStatement,
    preview: {
      ...template.preview,
      safeArea: { ...template.preview.safeArea },
    },
    previewConfig: production
      ? snapshotJsonValue(production.previewConfig)
      : snapshotJsonValue(template.preview),
    productionConfig: production ? snapshotJsonValue(production.productionConfig) : null,
    productionOutput: {
      widthPx: production?.widthPx ?? null,
      heightPx: production?.heightPx ?? null,
      dpi: production?.dpi ?? null,
    },
    ...(production?.defaultSurfaceId ? { defaultSurfaceId: production.defaultSurfaceId } : {}),
    surfaces: production?.surfaces.map((surface) => ({ ...surface })) ?? [],
  };
}
