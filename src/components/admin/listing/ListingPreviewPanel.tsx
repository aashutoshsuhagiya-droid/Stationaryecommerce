"use client";

import dynamic from "next/dynamic";
import { useEffect, useId, useState } from "react";
import { Box, ChevronDown, ImageIcon, LayoutGrid, Type } from "lucide-react";

import { ProductCard } from "@/components/commerce/ProductCard";
import { renderStudioPreview } from "@/components/configurator/design-export";
import type { QuickListConfigurationField, QuickListPrintArea } from "@/lib/admin-quick-list";
import type { CategoryListingRecipe } from "@/lib/category-listing-playbook";
import { positionStudioText, type SizeMm, type SizePreset, type TextPosition } from "@/lib/listing-wizard";
import { defaultStudioDesign, DEFAULT_STUDIO_FIELD } from "@/lib/studio-design";
import type { Product } from "@/lib/types";
import styles from "../admin.module.css";

// Three.js only loads when the 3D tab is opened.
const Listing3DPreview = dynamic(() => import("./Listing3DPreview"), {
  ssr: false,
  loading: () => <p className={styles.listingMuted}>Loading 3D…</p>,
});

export type PreviewTab = "card" | "2d" | "3d";

export interface PreviewPhoto {
  url: string;
  width: number;
  height: number;
}

function previewProduct(input: { name: string; price: number; compareAtPrice?: number; categoryName: string; categorySlug: string; imageUrl: string; customizable: boolean }): Product {
  return {
    id: "listing-preview",
    slug: "listing-preview",
    sku: "PREVIEW",
    name: input.name,
    categorySlug: input.categorySlug,
    category: input.categoryName,
    price: input.price,
    ...(input.compareAtPrice && input.compareAtPrice > input.price ? { compareAtPrice: input.compareAtPrice } : {}),
    customizable: input.customizable,
    description: "",
    shortDescription: "",
    material: "",
    dimensions: "",
    packSize: 1,
    artwork: "labels",
    image: input.imageUrl,
    images: [],
    stockStatus: "made_to_order",
    featured: false,
    newArrival: true,
    tags: [],
    features: [],
    productionDays: { min: 0, max: 0 },
    variants: [],
    customizationFields: [],
    templateIds: [],
  };
}

/** The 2D tab: the default design drawn by the storefront studio renderer (the cart uses the same one). */
function Studio2DPreview({ photo, field, sampleText, position }: { photo: PreviewPhoto | null; field: QuickListConfigurationField | undefined; sampleText: string; position: TextPosition }) {
  const [image, setImage] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!photo || !field) return;
    let live = true;
    const timer = window.setTimeout(() => {
      const config = positionStudioText(defaultStudioDesign(photo.url, photo.width && photo.height ? { width: photo.width, height: photo.height } : null, {
        ...DEFAULT_STUDIO_FIELD,
        key: field.key,
        label: field.label,
        placeholder: field.placeholder || field.label,
      }), position);
      renderStudioPreview({ config, values: { [field.key]: sampleText } })
        .then((url) => { if (live) { setImage(url); setFailed(false); } })
        .catch(() => { if (live) setFailed(true); });
    }, 120);
    return () => { live = false; window.clearTimeout(timer); };
  }, [photo, field, sampleText, position]);

  if (!photo) return <div className={styles.listingPreviewEmpty}><ImageIcon size={22} aria-hidden /><span>Add a photo to see the customiser.</span></div>;
  if (!field) {
    return <figure className={styles.listingStudioFigure}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt="Product photo as the design background" src={photo.url} />
      <figcaption>Customers add their own logo or artwork on top of this.</figcaption>
    </figure>;
  }
  return <figure className={styles.listingStudioFigure}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {image && !failed ? <img alt={`Customiser preview with the name ${sampleText}`} src={image} /> : <div className={styles.listingPreviewEmpty}><span>{failed ? "The preview couldn't be drawn." : "Drawing…"}</span></div>}
  </figure>;
}

/**
 * Always-visible live preview: the real storefront card, the 2D customiser and
 * the 3D model, all from what the admin has entered so far. On phones it is a
 * collapsible bottom sheet.
 */
export function ListingPreviewPanel({
  tab,
  onTabChange,
  photo,
  name,
  price,
  compareAtPrice,
  categoryName,
  recipe,
  fields,
  printAreas,
  sampleText,
  onSampleTextChange,
  textPosition,
  onTextPositionChange,
  size,
  sizePresets,
  onSizeChange,
}: {
  tab: PreviewTab;
  onTabChange: (tab: PreviewTab) => void;
  photo: PreviewPhoto | null;
  name: string;
  price: string;
  compareAtPrice: string;
  categoryName: string;
  recipe: CategoryListingRecipe | undefined;
  fields: readonly QuickListConfigurationField[];
  printAreas: readonly QuickListPrintArea[];
  sampleText: string;
  onSampleTextChange: (value: string) => void;
  textPosition: TextPosition;
  onTextPositionChange: (value: TextPosition) => void;
  size: SizeMm | null;
  sizePresets: readonly SizePreset[];
  onSizeChange: (size: SizeMm) => void;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const panelId = useId();
  const textField = fields.find((field) => field.inputType === "text" && field.enabled && field.customerVisible);
  const has3D = Boolean(recipe?.model3D && recipe.threeDPath !== "none");
  const priceValue = Number(price);
  const tabs: Array<{ id: PreviewTab; label: string; icon: typeof Box }> = [
    { id: "card", label: "Product card", icon: LayoutGrid },
    { id: "2d", label: "2D customiser", icon: Type },
    { id: "3d", label: "3D", icon: Box },
  ];

  return (
    <aside aria-label="Live preview" className={`${styles.listingPreview} ${sheetOpen ? styles.listingPreviewOpen : ""}`}>
      <button aria-controls={panelId} aria-expanded={sheetOpen} className={styles.listingSheetToggle} onClick={() => setSheetOpen((open) => !open)} type="button">
        <span>Live preview</span><ChevronDown aria-hidden size={16} />
      </button>
      <div className={styles.listingPreviewBody} id={panelId}>
        <div aria-label="Preview type" className={styles.listingTabs} role="tablist">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button aria-selected={tab === id} className={tab === id ? styles.listingTabActive : styles.listingTab} id={`${panelId}-${id}`} key={id} onClick={() => onTabChange(id)} role="tab" type="button">
              <Icon aria-hidden size={14} /> {label}
            </button>
          ))}
        </div>
        <div aria-labelledby={`${panelId}-${tab}`} className={styles.listingTabPanel} role="tabpanel">
          {tab === "card" && (photo
            ? <div className={styles.listingCardFrame} inert>
                <ProductCard product={previewProduct({
                  name: name.trim() || "Your product",
                  price: Number.isFinite(priceValue) && priceValue > 0 ? priceValue : 0,
                  compareAtPrice: Number(compareAtPrice) || undefined,
                  categoryName: categoryName || "Category",
                  categorySlug: recipe?.categorySlug ?? "",
                  imageUrl: photo.url,
                  customizable: fields.length > 0,
                })} />
              </div>
            : <div className={styles.listingPreviewEmpty}><ImageIcon size={22} aria-hidden /><span>Add a photo to see the product card.</span></div>)}
          {tab === "2d" && <Studio2DPreview field={textField} photo={photo} position={textPosition} sampleText={sampleText || "Aarav"} />}
          {tab === "3d" && (has3D && recipe && size
            ? <Listing3DPreview
                onSizeChange={onSizeChange}
                presets={sizePresets}
                printAreas={printAreas}
                productName={name}
                recipe={recipe}
                sampleText={textField ? sampleText : ""}
                size={size}
              />
            : <div className={styles.listingNo3D}>
                <p>{recipe ? "This product type uses the 2D customiser only." : "Choose what you're selling to see it in 3D."}</p>
                {recipe && <Studio2DPreview field={textField} photo={photo} position={textPosition} sampleText={sampleText || "Aarav"} />}
              </div>)}
        </div>
        {(tab === "2d" || tab === "3d") && textField && (
          <div className={styles.listingTryName}>
            <label>
              <span className={styles.fieldLabel}>Try a name</span>
              <input className={styles.input} maxLength={40} onChange={(event) => onSampleTextChange(event.target.value)} value={sampleText} />
            </label>
            {tab === "2d" && <div aria-label="Adjust text position" className={styles.listingSizeRow} role="group">
              {(["top", "middle", "bottom"] as const).map((position) => (
                <button aria-pressed={textPosition === position} className={textPosition === position ? styles.listingChipActive : styles.listingChip} key={position} onClick={() => onTextPositionChange(position)} type="button">
                  {position === "top" ? "Text at top" : position === "middle" ? "Middle" : "Bottom"}
                </button>
              ))}
            </div>}
          </div>
        )}
      </div>
    </aside>
  );
}
