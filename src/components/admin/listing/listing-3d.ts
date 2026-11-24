import type { CategoryListingRecipe } from "@/lib/category-listing-playbook";
import type { QuickListPrintArea } from "@/lib/admin-quick-list";
import type { SizeMm } from "@/lib/listing-wizard";
import type { ProductVisualizationTemplate } from "@/lib/types";
import { visualizationShapePlan } from "@/lib/visualization-shape-presets";
import { createArtworkDocument, type ArtworkDocument, type ArtworkLayer, type PrintableSurfaceDefinition } from "@/components/configurator/artwork-types";
import { buildVisualization3DPreview } from "@/components/configurator/visualization-preview";

export interface Listing3DScene {
  document: ArtworkDocument;
  surfaces: PrintableSurfaceDefinition[];
  structuralDesign: string;
  productType: string;
  dimensionsMm: Record<string, number>;
}

/** The "Try a name" sample, centred on a canvas and sized so it fits across it. */
function sampleNameLayer(sampleText: string, width: number, height: number): ArtworkLayer[] {
  const text = sampleText.trim().slice(0, 40);
  if (!text) return [];
  // About 0.6 em per character, so a short name fills the line and a long one still fits.
  const fontSize = Math.round(Math.min(height * 0.16, (width * 0.84) / (0.6 * Math.max(4, text.length))));
  return [{
    id: "listing-sample-name", type: "text", name: "Sample name", x: width * 0.08, y: height * 0.36, width: width * 0.84, height: height * 0.28,
    rotation: 0, opacity: 1, text, color: "#111418", fontSize: Math.max(12, fontSize), fontFamily: "rounded", textAlign: "center",
  }];
}

/**
 * What customers will see in 3D, built in the browser before anything is saved,
 * through the storefront's own preview builders. The product photo is never
 * painted on a model; it is the picture behind the 2D customiser.
 *
 * - photo-made shapes (boxes, bags, pouches): an unsaved visualization template
 *   gives the plain shape at the chosen size, with the sample name on its front;
 * - built-in shapes (name slips, pens…): the generic model with the sample name
 *   on the product's first print area.
 *
 * `sampleText` is empty for product types without a text field.
 */
export function listing3DScene(input: {
  recipe: CategoryListingRecipe | undefined;
  size: SizeMm;
  printAreas: readonly QuickListPrintArea[];
  sampleText: string;
  productName: string;
}): Listing3DScene | null {
  const { recipe } = input;
  if (!recipe?.model3D || recipe.threeDPath === "none") return null;
  const name = input.productName.trim() || recipe.displayName;

  if (recipe.threeDPath === "template") {
    const plan = visualizationShapePlan(recipe.model3D, { categorySlug: recipe.categorySlug, productDimensions: input.size });
    if (!plan) return null;
    const visualization: ProductVisualizationTemplate = {
      id: "listing-preview",
      version: 1,
      name,
      productType: plan.model,
      geometryKind: plan.geometryKind,
      dimensionsMm: plan.dimensions,
      surfaces: [{ surfaceId: "front", label: "Front", role: "front" }],
      manufacturingValidated: false,
    };
    const preview = buildVisualization3DPreview(createArtworkDocument([]), [], visualization, plan.dimensions);
    const front = preview.surfaces[0];
    const document = {
      ...preview.document,
      surfaces: preview.document.surfaces.map((surface, index) => index === 0 && front
        ? { ...surface, layers: sampleNameLayer(input.sampleText, front.width, front.height) }
        : surface),
    };
    return { document, surfaces: preview.surfaces, structuralDesign: plan.model, productType: recipe.categorySlug, dimensionsMm: plan.dimensions };
  }

  // Built-in geometry: exactly what the product page shows, the generic model with the
  // customer's name on it.
  const area = input.printAreas[0];
  const aspect = area?.widthMm && area.heightMm ? area.heightMm / area.widthMm : 0.6;
  const width = 600;
  const height = Math.max(64, Math.round(width * aspect));
  const surface: PrintableSurfaceDefinition = {
    id: area?.id ?? "primary",
    label: area?.label ?? "Front",
    width,
    height,
    safeInset: 24,
    ...(area?.widthMm && area.heightMm ? { physicalWidthMm: area.widthMm, physicalHeightMm: area.heightMm } : {}),
  };
  const document = createArtworkDocument([surface]);
  document.surfaces[0].layers = input.sampleText.trim() ? [{
    id: "listing-sample-name", type: "text", name: "Sample name", x: width * 0.08, y: height * 0.36, width: width * 0.84, height: height * 0.28,
    rotation: 0, opacity: 1, text: input.sampleText.trim().slice(0, 40), color: "#111418", fontSize: Math.round(height * 0.16), fontFamily: "rounded", textAlign: "center",
  }] : [];
  return {
    document,
    surfaces: [surface],
    structuralDesign: recipe.model3D,
    productType: recipe.categorySlug,
    dimensionsMm: { ...input.size },
  };
}
