import { getCategoryListingRecipe, type ListingProductModel } from "./category-listing-playbook";
import { resolvePackagingDimensions } from "./packaging-dimensions";
import { defaultProduct3DDimensionsMm } from "../components/configurator/product-3d-dimensions";

/**
 * The shapes the visualization studio can model from a product photo.
 *
 * `resolveVisualizationProductModel` derives the product model from the
 * template's geometry kind and product type, so the plan below must pair a
 * geometry kind and a product type that resolve back to the same model —
 * otherwise publishing is refused by the studio and, later, by
 * `assertProductPreviewAllowed`. (A "bag" geometry always resolves to
 * `paper-bag`, which is why the flat mailer envelope uses "custom".)
 */
export type PackagingVisualizationModel =
  | "folding-carton" | "mailer-box" | "square-box" | "rectangular-box" | "rigid-lid-box"
  | "paper-bag" | "stand-up-pouch" | "mailer-envelope";

export type VisualizationGeometryKind = "box" | "bag" | "pouch" | "custom";

export type PackagingFace =
  | "front" | "back" | "left" | "right" | "top" | "bottom"
  | "gusset" | "gusset-left" | "gusset-right";

export interface VisualizationShapePlan {
  model: PackagingVisualizationModel;
  geometryKind: VisualizationGeometryKind;
  /** Finished size in mm, keyed the way the studio expects for this geometry. */
  dimensions: Record<string, number>;
}

const MODEL_GEOMETRY: Record<PackagingVisualizationModel, VisualizationGeometryKind> = {
  "folding-carton": "box",
  "mailer-box": "box",
  "rectangular-box": "box",
  "rigid-lid-box": "box",
  "square-box": "box",
  "paper-bag": "bag",
  "stand-up-pouch": "pouch",
  "mailer-envelope": "custom",
};

const BOX_FACES: readonly PackagingFace[] = ["front", "back", "left", "right", "top", "bottom"];
const FACES_BY_GEOMETRY: Record<VisualizationGeometryKind, readonly PackagingFace[]> = {
  box: BOX_FACES,
  custom: BOX_FACES,
  bag: ["front", "back", "gusset-left", "gusset-right", "bottom"],
  pouch: ["front", "back", "gusset"],
};

const isPackagingModel = (model: string | undefined | null): model is PackagingVisualizationModel =>
  Boolean(model && model in MODEL_GEOMETRY);

/** Bags and pouches measure their side as a gusset; boxes and envelopes as depth. */
function studioDimensions(
  geometryKind: VisualizationGeometryKind,
  size: { width: number; height: number; depth: number },
): Record<string, number> {
  return geometryKind === "bag" || geometryKind === "pouch"
    ? { width: size.width, height: size.height, gusset: size.depth }
    : { width: size.width, height: size.height, depth: size.depth };
}

function sizeFor(
  model: PackagingVisualizationModel,
  categorySlug: string | undefined | null,
  productDimensions: Readonly<Record<string, number>> | null | undefined,
) {
  const resolved = resolvePackagingDimensions({ productDimensions, categorySlug });
  const fallback = defaultProduct3DDimensionsMm(model);
  const pick = (key: "width" | "height" | "depth") => {
    const value = resolved?.[key] ?? (key === "depth" ? resolved?.gusset : undefined);
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback[key];
  };
  const size = { width: pick("width"), height: pick("height"), depth: pick("depth") };
  // A square box is square in plan; keep the studio's square detection honest.
  if (model === "square-box") size.depth = size.width;
  return size;
}

export interface ShapePlanContext {
  categorySlug?: string | null;
  productName?: string | null;
  productSlug?: string | null;
  /** The product's own measured size in mm, when it has one. */
  productDimensions?: Readonly<Record<string, number>> | null;
}

export function visualizationShapePlan(
  model: string | undefined | null,
  context: ShapePlanContext = {},
): VisualizationShapePlan | undefined {
  if (!isPackagingModel(model)) return undefined;
  const geometryKind = MODEL_GEOMETRY[model];
  return {
    model,
    geometryKind,
    dimensions: studioDimensions(geometryKind, sizeFor(model, context.categorySlug, context.productDimensions)),
  };
}

/** Every panel of the shape. Only the front carries the uploaded photo by default. */
export function packagingFaces(plan: VisualizationShapePlan): Array<{ face: PackagingFace; textured: boolean }> {
  return FACES_BY_GEOMETRY[plan.geometryKind].map((face) => ({ face, textured: face === "front" }));
}

/** Tuck-top e-commerce mailers are named as such; plain shipping cartons are not. */
const MAILER_BOX_NAME = /mailer|e-?commerce|tuck/iu;

function modelForShelf(recipeModel: ListingProductModel | undefined, context: ShapePlanContext) {
  if (context.categorySlug === "shipping-boxes") {
    const identity = `${context.productName ?? ""} ${context.productSlug ?? ""}`;
    return MAILER_BOX_NAME.test(identity) ? "mailer-box" : "rectangular-box";
  }
  return recipeModel;
}

/**
 * The template-backed shape for a product's shelf. Returns undefined when the
 * shelf has no honest 3D model (flat print, open trays) or uses built-in
 * geometry instead — in both cases a template must never be created.
 */
export function templateShapePlanForCategory(
  categorySlug: string | undefined | null,
  context: Omit<ShapePlanContext, "categorySlug"> = {},
): VisualizationShapePlan | undefined {
  const recipe = getCategoryListingRecipe(categorySlug);
  if (!recipe || recipe.threeDPath !== "template") return undefined;
  const fullContext = { ...context, categorySlug };
  return visualizationShapePlan(modelForShelf(recipe.model3D, fullContext), fullContext);
}

export interface ArtworkAssessment {
  confidence: "high" | "low";
  /** Edge colour of the cropped artwork; unprinted panels are painted to match. */
  edgeColor?: string;
}

export const LIFESTYLE_PHOTO_NOTE =
  "Photo is a lifestyle shot — upload flat front artwork for a sharper 3D preview.";

/**
 * Everything the studio needs to confirm a MANUAL analysis for this shape.
 *
 * Only the front is persisted as a surface mapping: the studio requires source
 * bounds for every additional surface, and bounds make that face show a crop of
 * the photo. Unprinted faces are therefore left out and rendered as plain board
 * (see the packaging fallbacks in `product-3d-surfaces.ts`).
 */
export function visualizationConfirmationFor(plan: VisualizationShapePlan, artwork?: ArtworkAssessment) {
  return {
    productType: plan.model,
    geometry: { kind: plan.geometryKind },
    dimensions: { unit: "mm" as const, ...plan.dimensions },
    surfaceMappings: [{ surfaceId: "front", label: "Front", role: "front" as const }],
    manufacturingValidated: false,
    materialSettings: {
      artworkConfidence: artwork?.confidence ?? "low",
      // A confident crop's edge is the board itself; a lifestyle photo's edge is the room.
      ...(artwork?.confidence === "high" && artwork.edgeColor ? { baseColor: artwork.edgeColor } : {}),
      ...(artwork?.confidence === "high" ? {} : { artworkNote: LIFESTYLE_PHOTO_NOTE }),
    },
  };
}
