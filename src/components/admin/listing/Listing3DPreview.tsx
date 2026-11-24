"use client";

import { useMemo } from "react";

import { Product3DPreview } from "@/components/configurator/Product3DPreview";
import type { CategoryListingRecipe } from "@/lib/category-listing-playbook";
import type { QuickListPrintArea } from "@/lib/admin-quick-list";
import { clampSize, type SizeMm, type SizePreset } from "@/lib/listing-wizard";
import { listing3DScene } from "./listing-3d";
import styles from "../admin.module.css";

/**
 * The live 3D tab. Loaded on demand (it pulls in Three.js), rendered by the
 * storefront's own `Product3DPreview`, so rotate/auto-spin/zoom behave exactly
 * as they do for customers: a plain model, with only the sample name on it.
 * Size inputs reshape the model as you type.
 */
export default function Listing3DPreview({
  recipe,
  size,
  presets,
  printAreas,
  sampleText,
  productName,
  onSizeChange,
}: {
  recipe: CategoryListingRecipe;
  size: SizeMm;
  presets: readonly SizePreset[];
  printAreas: readonly QuickListPrintArea[];
  sampleText: string;
  productName: string;
  onSizeChange: (size: SizeMm) => void;
}) {
  const scene = useMemo(
    () => listing3DScene({ recipe, size, printAreas, sampleText, productName }),
    [recipe, size, printAreas, sampleText, productName],
  );
  const activePreset = presets.find((preset) => preset.width === size.width && preset.height === size.height && preset.depth === size.depth);
  const depthLabel = recipe.model3D === "paper-bag" || recipe.model3D === "stand-up-pouch" ? "Side" : "D";

  if (!scene) return <p className={styles.listingMuted}>This product type uses the 2D customiser only.</p>;
  return (
    <div className={styles.listing3D}>
      <div className={styles.listing3DStage}>
        <Product3DPreview
          accent="#3A3D42"
          background="#F4F5F7"
          dimensionsMm={scene.dimensionsMm}
          document={scene.document}
          productName={productName || recipe.displayName}
          productType={scene.productType}
          structuralDesign={scene.structuralDesign}
          surfaces={scene.surfaces}
        />
      </div>
      {presets.length > 0 && <div className={styles.listingSizeRow} role="group" aria-label="Size">
        {presets.map((preset) => (
          <button
            aria-pressed={activePreset?.id === preset.id}
            className={activePreset?.id === preset.id ? styles.listingChipActive : styles.listingChip}
            key={preset.id}
            onClick={() => onSizeChange({ width: preset.width, height: preset.height, depth: preset.depth })}
            type="button"
          >{preset.label}</button>
        ))}
      </div>}
      <div className={styles.listingSizeInputs}>
        {(["width", "height", "depth"] as const).map((key) => (
          <label key={key}>
            <span>{key === "width" ? "W" : key === "height" ? "H" : depthLabel}</span>
            <input
              aria-label={`${key === "width" ? "Width" : key === "height" ? "Height" : depthLabel === "Side" ? "Side gusset" : "Depth"} in millimetres`}
              className={styles.input}
              inputMode="decimal"
              min={1}
              onChange={(event) => onSizeChange(clampSize({ ...size, [key]: Number(event.target.value) }, size))}
              type="number"
              value={size[key]}
            />
          </label>
        ))}
        <span className={styles.listingMuted}>mm</span>
      </div>
    </div>
  );
}
