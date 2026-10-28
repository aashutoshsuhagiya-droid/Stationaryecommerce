import type {
  DimensionPreset,
  ProductConfigurationSchema,
} from "./product-configuration";
import type { PersonalizationValues, Product } from "./types";

type VisualizationSnapshot = NonNullable<PersonalizationValues["visualization"]>;

/**
 * Builds a trusted, versioned visual specification from the catalog.
 * Browser-authored geometry is deliberately not accepted by checkout.
 */
export function createOrderVisualizationSnapshot(
  product: Product,
  configuration: ProductConfigurationSchema,
  preset: DimensionPreset,
  material: string,
): VisualizationSnapshot | undefined {
  const model = configuration.preview.model?.trim();
  if (!model || !configuration.preview.supportedModes.includes("3d")) return undefined;
  return {
    schemaVersion: 1,
    previewMode: "3d",
    model,
    configurationVersion:
      product.configurator?.configurationVersion?.trim()
      || `catalog-${configuration.schemaVersion}`,
    dimensionPresetId: preset.id,
    dimensionsMm: preset.dimensionsMm ? { ...preset.dimensionsMm } : null,
    material,
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
  };
}
