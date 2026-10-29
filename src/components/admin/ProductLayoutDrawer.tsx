"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LoaderCircle, Save, X } from "lucide-react";

import { formatStructuredDescription } from "@/lib/admin-structured-description";
import { buildDefaultAdminArtworkPolicy } from "@/lib/admin-artwork-policy";
import { autoSku, createRanBazaarStarterDraft } from "@/lib/admin-quick-list";
import { ezpacIndustryCollectionCategorySlug } from "@/lib/ezpac-packaging-presets";
import { EZPAC_SHOPIFY_PRODUCT_MAPPING, ezpacMappingCategory } from "@/lib/ezpac-product-mapping";
import { StatusBadge } from "./AdminUI";
import { ProductFullDetailsSections, ProductLayoutControls, clampLayoutElementDefaults, type FullDetailsExportPreset, type PublishedVisualizationTemplate } from "./ProductFullDetailsSections";
import { buildFullDetailsPatch, type FullDetailsCategory, type FullDetailsProductBase } from "./product-details-payload";
import styles from "./admin.module.css";

type LoadedProduct = FullDetailsProductBase & {
  status?: string;
  publishedVisualizationTemplates?: PublishedVisualizationTemplate[];
};

function fallbackPolicy(product: Partial<LoadedProduct>) {
  return buildDefaultAdminArtworkPolicy(product.printAreas ?? [{ id: "primary", label: "Primary print area", widthMm: null, heightMm: null, safeInsetMm: null }], {
    uploadsEnabled: product.artworkUpload === true,
    allowedMimeTypes: product.acceptedArtworkTypes ?? ["image/png", "image/jpeg"],
  });
}

function normalizedProduct(input: LoadedProduct): LoadedProduct {
  return {
    ...input,
    categoryIds: input.categoryIds ?? [input.categoryId],
    productType: input.productType ?? "",
    material: input.material ?? "",
    sizes: input.sizes ?? [],
    sizeDescription: input.sizeDescription ?? "",
    features: input.features ?? [],
    description: input.description ?? "",
    customizable: input.customizable !== false,
    published: input.published === true,
    allow2D: input.allow2D !== false,
    allow3D: input.allow3D === true,
    quantityMin: input.quantityMin ?? 1,
    quantityMax: input.quantityMax ?? 100,
    quantityTiers: input.quantityTiers ?? [],
    setupCharge: input.setupCharge ?? 0,
    productionDaysMin: input.productionDaysMin ?? 0,
    productionDaysMax: input.productionDaysMax ?? 0,
    printAreas: input.printAreas?.length ? input.printAreas : [{ id: "primary", label: "Primary print area", widthMm: null, heightMm: null, safeInsetMm: null }],
    previewTemplate: input.previewTemplate ?? "",
    productModel: input.productModel ?? "",
    artworkUpload: input.artworkUpload === true,
    acceptedArtworkTypes: input.acceptedArtworkTypes?.length ? input.acceptedArtworkTypes : ["image/png", "image/jpeg"],
    templateLinks: input.templateLinks ?? [],
    configurationFields: input.configurationFields ?? [],
    extraImages: input.extraImages ?? [],
    artworkPolicy: input.artworkPolicy ?? fallbackPolicy(input),
  };
}

export function ProductLayoutDrawer({ productId, categories, onClose, onSaved }: { productId: string; categories: FullDetailsCategory[]; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const [product, setProduct] = useState<LoadedProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingSlots, setUploadingSlots] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [lastExport, setLastExport] = useState("");

  const exportPresets = useMemo<FullDetailsExportPreset[]>(() => EZPAC_SHOPIFY_PRODUCT_MAPPING.map((item) => ({ value: item.shopifyHandle, label: item.shopifyTitle, unmapped: item.unmapped === true })), []);
  const selectedMapping = useMemo(() => EZPAC_SHOPIFY_PRODUCT_MAPPING.find((item) => item.shopifyHandle === lastExport) ?? EZPAC_SHOPIFY_PRODUCT_MAPPING.find((item) => item.presetId === product?.productType), [lastExport, product?.productType]);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/admin/catalog?productId=${encodeURIComponent(productId)}`, { cache: "no-store" });
      const payload = await response.json().catch(() => undefined) as { data?: { product?: LoadedProduct }; error?: { message?: string } } | undefined;
      if (!response.ok || !payload?.data?.product) throw new Error(payload?.error?.message || "Could not load this product.");
      setProduct(normalizedProduct(payload.data.product));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load this product."); } finally { setLoading(false); }
  }, [productId]);

  useEffect(() => { void load(); }, [load]);

  function applyExport(handle: string) {
    const mapping = EZPAC_SHOPIFY_PRODUCT_MAPPING.find((item) => item.shopifyHandle === handle);
    if (!mapping || !product) return;
    setLastExport(handle);
    const categoryMapping = ezpacMappingCategory(mapping.presetId);
    const primary = categoryMapping?.primarySubcategoryId ? categories.find((item) => item.slug === categoryMapping.primarySubcategoryId) : undefined;
    const collectionIds = (categoryMapping?.collectionIds ?? []).flatMap((collectionId) => {
      const category = categories.find((item) => item.slug === ezpacIndustryCollectionCategorySlug(collectionId));
      return category ? [category.id] : [];
    });
    const structuredDescription = {
      ...(mapping.prefills.intro ? { intro: mapping.prefills.intro } : {}),
      ...(mapping.prefills.bestFor?.length ? { bestFor: [...mapping.prefills.bestFor] } : {}),
      ...(mapping.prefills.featureBullets?.length ? { featureBullets: [...mapping.prefills.featureBullets] } : {}),
    };
    const imageUrls = mapping.prefills.imageUrls ?? [];
    setProduct((current) => current ? {
      ...current,
      name: mapping.shopifyTitle,
      sku: autoSku(mapping.shopifyTitle),
      price: mapping.prefills.priceRupees,
      productType: mapping.presetId ?? current.productType,
      categoryId: primary?.id ?? "",
      categoryIds: [...new Set([primary?.id, ...collectionIds].filter((id): id is string => Boolean(id)))],
      material: mapping.prefills.materialHint ?? current.material,
      structuredDescription,
      description: formatStructuredDescription(structuredDescription),
      imageUrl: imageUrls[0] ?? current.imageUrl,
      extraImages: imageUrls.slice(1, 6).map((url) => ({ url })),
    } : current);
  }

  function importUrls() {
    if (!selectedMapping || !product) return;
    const urls = selectedMapping.prefills.imageUrls ?? [];
    setProduct({ ...product, imageUrl: urls[0] ?? product.imageUrl, extraImages: urls.slice(1, 6).map((url) => ({ url })) });
  }

  function prefillRanBazaar() {
    if (!product) return;
    const id = window.prompt("RanBazaar starter id (for example: notebook)")?.trim();
    if (!id) return;
    const starter = createRanBazaarStarterDraft(id);
    if (!starter) { setError("That RanBazaar starter was not found."); return; }
    setProduct({
      ...product,
      configurationFields: starter.configurationFields.map((field, index) => ({
        id: `${starter.id}-${index}`, key: field.key, label: field.label, inputType: field.inputType, required: field.required,
        options: field.options, priceDelta: 0, minLength: field.minLength ?? null, maxLength: field.maxLength ?? null,
        allowedPattern: field.allowedPattern ?? "", minValue: null, maxValue: null, step: null, placeholder: field.placeholder ?? "",
        helpText: field.helpText ?? "", defaultValue: field.defaultValue ?? "", unit: "", enabled: field.enabled, customerVisible: field.customerVisible, visibleWhen: null,
      })),
      printAreas: starter.printAreas,
      artworkUpload: starter.artworkUpload,
      acceptedArtworkTypes: starter.acceptedArtworkTypes,
      artworkPolicy: starter.artworkPolicy,
    });
  }

  async function uploadSlot(slot: number, file: File) {
    if (!product) return;
    setUploadingSlots((current) => [...new Set([...current, slot])]); setError("");
    try {
      const form = new FormData(); form.set("productId", product.id ?? productId); form.set("kind", slot === 0 ? "primary" : "gallery"); form.set("image", file);
      const response = await fetch("/api/admin/catalog/images", { method: "POST", body: form });
      const payload = await response.json().catch(() => undefined) as { data?: { asset?: { url?: string } }; error?: { message?: string } } | undefined;
      const url = payload?.data?.asset?.url;
      if (!response.ok || !url) throw new Error(payload?.error?.message || "The image could not be uploaded.");
      if (slot === 0) setProduct({ ...product, imageUrl: url });
      else { const images = Array.from({ length: 5 }, (_, index) => product.extraImages?.[index] ?? { url: "" }); images[slot - 1] = { ...images[slot - 1], url }; setProduct({ ...product, extraImages: images }); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The image could not be uploaded."); }
    finally { setUploadingSlots((current) => current.filter((item) => item !== slot)); }
  }

  async function saveProduct() {
    if (!product) return;
    setSaving(true); setError(""); setStatus("");
    try {
      const body = buildFullDetailsPatch(product, { artworkPolicy: product.artworkPolicy ? clampLayoutElementDefaults(product.artworkPolicy) : null });
      const response = await fetch("/api/admin/catalog", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json().catch(() => undefined) as { error?: { message?: string } } | undefined;
      if (!response.ok) throw new Error(payload?.error?.message || "Could not save full product details.");
      setStatus("Product details saved."); await onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save full product details."); }
    finally { setSaving(false); }
  }

  async function saveLayout() {
    if (!product?.artworkPolicy) return;
    setSaving(true); setError(""); setStatus("");
    try {
      const response = await fetch("/api/admin/catalog", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "artwork-policy-override", id: product.id ?? productId, artworkPolicy: clampLayoutElementDefaults(product.artworkPolicy) }) });
      const payload = await response.json().catch(() => undefined) as { error?: { message?: string } } | undefined;
      if (!response.ok) throw new Error(payload?.error?.message || "Could not save layout defaults.");
      setStatus("Layout saved."); await onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save layout defaults."); }
    finally { setSaving(false); }
  }

  return <>
    <button aria-label="Close 3D and layout editor" className={styles.drawerBackdrop} onClick={onClose} type="button" />
    <aside aria-label="3D and layout editor" className={`${styles.drawer} ${styles.fullDetailsDrawer}`}>
      <div className={styles.drawerHeader}><div><h3>3D &amp; Layout</h3><p>{product?.name ?? "Loading product details..."}</p></div><button aria-label="Close" className={styles.iconButton} onClick={onClose} type="button"><X size={16} /></button></div>
      <div className={styles.drawerBody}>
        {loading && <p className={styles.configHint}><LoaderCircle className={styles.studioSpin} size={14} /> Loading full product details...</p>}
        {!loading && product && <div className={styles.fullDetailsDrawerContent}>
          <div className={styles.fullDetailsDrawerTitle}><strong>{product.name}</strong>{product.status && <StatusBadge>{product.status}</StatusBadge>}</div>
          <ProductFullDetailsSections value={product} onChange={setProduct} categories={categories} exportPresets={exportPresets} includePresetSection={Boolean(selectedMapping)} onApplyExport={applyExport} onImportExportUrls={importUrls} onPrefillRanBazaar={prefillRanBazaar} onUploadSlot={uploadSlot} uploadingSlots={uploadingSlots} autoSku={autoSku} />
          <ProductLayoutControls value={product} onChange={setProduct} publishedTemplates={product.publishedVisualizationTemplates ?? []} />
        </div>}
        {error && <p className={styles.formError} role="alert">{error}</p>}
        {status && <p className={styles.formSuccess} role="status">{status}</p>}
      </div>
      <div className={styles.drawerFooter}><button className={styles.buttonSecondary} onClick={onClose} type="button">Close</button><button className={styles.buttonSecondary} disabled={saving || !product} onClick={() => void saveLayout()} type="button"><Save size={13} /> Save layout</button><button className={styles.buttonPrimary} disabled={saving || !product} onClick={() => void saveProduct()} type="button"><Save size={13} /> {saving ? "Saving..." : "Save details"}</button></div>
    </aside>
  </>;
}
