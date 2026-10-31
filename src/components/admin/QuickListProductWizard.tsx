"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, FileImage, LoaderCircle, Package, Sparkles, X } from "lucide-react";

import {
  autoSku,
  checkProductPublishReadiness,
  createRanBazaarStarterDraft,
  type QuickListConfigurationField,
  type QuickListPrintArea,
  type RanBazaarStarterDraft,
} from "@/lib/admin-quick-list";
import {
  getEzpacPackagingFieldsForProductType,
  getEzpacPackagingProductType,
  isEzpacPackagingProductType,
  listEzpacPackagingProductTypes,
} from "@/lib/ezpac-packaging-presets";
import { ezpacIndustryCollectionCategorySlug } from "@/lib/ezpac-packaging-presets";
import { formatStructuredDescription } from "@/lib/admin-structured-description";
import { EZPAC_SHOPIFY_PRODUCT_MAPPING, ezpacMappingCategory } from "@/lib/ezpac-product-mapping";
import { listRanBazaarCustomizationStarters } from "@/lib/ranbazaar-customization-presets";
import { StatusBadge } from "./AdminUI";
import { ProductFullDetailsSections, ProductLayoutControls, clampLayoutElementDefaults, type PublishedVisualizationTemplate } from "./ProductFullDetailsSections";
import { SurfaceCustomerPreview } from "./SurfaceCustomerPreview";
import { buildFullDetailsPatch, type FullDetailsProductBase } from "./product-details-payload";
import styles from "./admin.module.css";

type CategoryRecord = { id: string; slug: string; name: string; parentId: string | null; sortOrder: number };
type StepStatus = "waiting" | "working" | "done" | "failed" | "skipped";

const readinessLabels = {
  "mime-types": "Photo uploads: allowed formats",
  "physical-dimensions": "Print size set (mm)",
  "linked-templates": "Design template ready",
  "packaging-visualization": "3D preview ready (packaging only)",
} as const;

const categoryByStarter: Record<string, string> = {
  "name-slips": "premium-name-slips", "pen-pencil": "pen-pencil-custom", notebook: "note-books",
  "bottle-tiffin": "kids-bottle-tiffin-box", "bag-luggage-tag": "bag-luggage-tag",
  "t-shirt": "t-shirts", "name-plate": "name-plate", "wrapping-paper-vinyl-poster": "wrapping-paper",
};

const blankDraft = (): RanBazaarStarterDraft => ({
  id: "blank", name: "Blank product", configurationFields: [],
  printAreas: [{ id: "primary", label: "Primary print area", widthMm: null, heightMm: null, safeInsetMm: null }],
  artworkUpload: false, acceptedArtworkTypes: ["image/png", "image/jpeg"],
  artworkPolicy: createRanBazaarStarterDraft("name-slips")!.artworkPolicy,
});

function packagingDraft(productType: string): RanBazaarStarterDraft | undefined {
  const product = getEzpacPackagingProductType(productType);
  if (!product) return undefined;
  const fields: QuickListConfigurationField[] = getEzpacPackagingFieldsForProductType(productType).map((field) => ({
    key: field.key, label: field.label, inputType: field.inputType, required: field.required,
    placeholder: field.placeholder ?? "", helpText: field.helpText ?? (field.optionSource === "admin_configured" ? "Configure supported choices, then enable this field for customers." : ""),
    defaultValue: "", minLength: field.minLength ?? null, maxLength: field.maxLength ?? null, allowedPattern: field.allowedPattern ?? "",
    options: field.options?.map((option) => ({ label: option.label, value: option.value, priceDelta: option.priceDelta ?? 0 })) ?? [],
    enabled: field.optionSource !== "admin_configured", customerVisible: field.optionSource !== "admin_configured",
  }));
  const base = blankDraft();
  return { ...base, id: product.id, name: product.name, configurationFields: fields };
}

function previewFile(file: File | null, previous: string) {
  if (previous) URL.revokeObjectURL(previous);
  return file ? URL.createObjectURL(file) : "";
}

export function QuickListProductWizard({
  categories,
  onClose,
  onSaved,
  onOpenStudio,
  onImportRanBazaar,
  onImportPackaging,
}: {
  categories: CategoryRecord[];
  onClose: () => void;
  onSaved: (productId: string) => void | Promise<void>;
  onOpenStudio: (productId: string) => void | Promise<void>;
  onImportRanBazaar: () => void | Promise<void>;
  onImportPackaging: () => void | Promise<void>;
}) {
  const starters = useMemo(() => listRanBazaarCustomizationStarters(), []);
  const packagingStarters = useMemo(() => listEzpacPackagingProductTypes(), []);
  const exportPresets = useMemo(() => EZPAC_SHOPIFY_PRODUCT_MAPPING.map((mapping) => ({ value: mapping.shopifyHandle, label: mapping.shopifyTitle, unmapped: mapping.unmapped === true })), []);
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<RanBazaarStarterDraft>(() => blankDraft());
  const [starterMode, setStarterMode] = useState<"ranbazaar" | "blank" | "packaging" | null>(null);
  const [productType, setProductType] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [sku, setSku] = useState(() => autoSku(""));
  const [skuEdited, setSkuEdited] = useState(false);
  const [sampleText, setSampleText] = useState("Aarav");
  const [packagingSearch, setPackagingSearch] = useState("");
  const [suggestedCategoryId, setSuggestedCategoryId] = useState("");
  const [primaryFile, setPrimaryFile] = useState<File | null>(null);
  const [baseFile, setBaseFile] = useState<File | null>(null);
  const [primaryPreview, setPrimaryPreview] = useState("");
  const [basePreview, setBasePreview] = useState("");
  const [uploadedPrimaryUrl, setUploadedPrimaryUrl] = useState("");
  const [publishNow, setPublishNow] = useState(true);
  const [reusePhotoAsBase, setReusePhotoAsBase] = useState(false);
  const [savedProduct, setSavedProduct] = useState<{ id: string; slug: string } | null>(null);
  const [error, setError] = useState("");
  const [saveStatus, setSaveStatus] = useState<StepStatus>("waiting");
  const [uploadStatus, setUploadStatus] = useState<StepStatus>("waiting");
  const [attachStatus, setAttachStatus] = useState<StepStatus>("waiting");
  const [reusingPhoto, setReusingPhoto] = useState(false);
  const [fullDetails, setFullDetails] = useState<FullDetailsProductBase | null>(null);
  const [fullDetailsSaving, setFullDetailsSaving] = useState(false);
  const [detailUploadingSlots, setDetailUploadingSlots] = useState<number[]>([]);
  const [publishedTemplates, setPublishedTemplates] = useState<PublishedVisualizationTemplate[]>([]);

  const previewUrls = useRef(new Set<string>());

  useEffect(() => () => previewUrls.current.forEach((url) => URL.revokeObjectURL(url)), []);
  useEffect(() => {
    if (!skuEdited) setSku(autoSku(name));
  }, [name, skuEdited]);
  const primaryCategories = useMemo(() => {
    const industryCollections = categories.find((category) => category.slug === "industry-collections");
    return categories.filter((category) => (
      category.id !== industryCollections?.id && category.parentId !== industryCollections?.id
    ));
  }, [categories]);
  const filteredPackagingStarters = useMemo(() => {
    const search = packagingSearch.trim().toLocaleLowerCase();
    return search ? packagingStarters.filter((starter) => starter.name.toLocaleLowerCase().includes(search)) : packagingStarters;
  }, [packagingSearch, packagingStarters]);

  useEffect(() => {
    if (categoryId || !categories.length) return;
    const availableCategories = starterMode === "packaging" || starterMode === "ranbazaar" ? primaryCategories : categories;
    setCategoryId(availableCategories[0]?.id ?? categories[0].id);
  }, [categories, categoryId, primaryCategories, starterMode]);

  const primarySurface = draft.printAreas[0];
  const readinessDetails = step === 4 ? fullDetails : null;
  const readiness = checkProductPublishReadiness({
    artworkUpload: readinessDetails?.artworkUpload ?? draft.artworkUpload,
    acceptedArtworkTypes: readinessDetails?.acceptedArtworkTypes ?? draft.acceptedArtworkTypes,
    printAreas: readinessDetails?.printAreas ?? draft.printAreas,
    artworkPolicy: readinessDetails?.artworkPolicy ?? draft.artworkPolicy,
    packagingRequiresVisualization: isEzpacPackagingProductType(readinessDetails?.productType ?? productType),
    hasPublishedVisualization: publishedTemplates.some((template) => readinessDetails?.previewTemplate === `visualization:${template.id}`),
  });
  const essentialsReady = Boolean(name.trim() && price.trim() && Number(price) >= 0 && categoryId && sku.trim());
  const hasPrimaryPhoto = Boolean(primaryFile || uploadedPrimaryUrl);

  function categoryOptionLabel(category: CategoryRecord) {
    if (starterMode !== "packaging" || !category.parentId) return category.name;
    const parent = categories.find((item) => item.id === category.parentId);
    return parent ? `${parent.name} › ${category.name}` : category.name;
  }

  function selectDraft(nextDraft: RanBazaarStarterDraft, mode: Exclude<typeof starterMode, null>, suggestedSlug?: string) {
    const packagingProduct = mode === "packaging" ? getEzpacPackagingProductType(nextDraft.id) : undefined;
    setDraft(nextDraft); setStarterMode(mode); setStep(2); setError("");
    setProductType(packagingProduct?.id ?? "");
    if (packagingProduct) {
      setName(packagingProduct.name);
      setSkuEdited(false);
      setSku(autoSku(packagingProduct.name));
    }
    const categorySlug = suggestedSlug ?? packagingProduct?.primarySubcategoryId;
    const selectableCategories = mode === "blank" ? categories : primaryCategories;
    const matchingCategory = categorySlug ? selectableCategories.find((category) => category.slug === categorySlug) : undefined;
    const nextCategoryId = matchingCategory?.id ?? selectableCategories[0]?.id ?? "";
    setCategoryId(nextCategoryId);
    setSuggestedCategoryId(matchingCategory?.id ?? "");
  }

  function choosePrimary(file: File | undefined) {
    if (!file) return;
    const url = previewFile(file, primaryPreview);
    previewUrls.current.add(url); setPrimaryFile(file); setPrimaryPreview(url); setUploadedPrimaryUrl(""); setReusePhotoAsBase(true);
  }

  function chooseBase(file: File | undefined) {
    if (!file) return;
    const url = previewFile(file, basePreview);
    previewUrls.current.add(url); setBaseFile(file); setBasePreview(url);
  }

  function selectPackagingStarter(productTypeId: string) {
    const next = packagingDraft(productTypeId);
    if (!next) return;
    const starter = packagingStarters.find((item) => item.id === productTypeId);
    setPackagingSearch(starter?.name ?? "");
    selectDraft(next, "packaging");
  }

  function payload(published: boolean, imageUrl: string) {
    return {
      type: "product", name: name.trim(), sku: sku.trim(), categoryId, price: Number(price),
      description: description.trim(), imageUrl, productType: productType || undefined,
      configurationFields: draft.configurationFields.map((field) => ({
        key: field.key, label: field.label, inputType: field.inputType, required: field.required,
        placeholder: field.placeholder || null, helpText: field.helpText || null, defaultValue: field.defaultValue || null,
        minLength: field.minLength, maxLength: field.maxLength, allowedPattern: field.allowedPattern || null,
        minValue: null, maxValue: null, step: null, priceDelta: 0, options: field.options,
        enabled: field.enabled, customerVisible: field.customerVisible, visibleWhen: null, unit: null,
      })),
      printAreas: draft.printAreas, artworkUpload: draft.artworkUpload,
      acceptedArtworkTypes: draft.acceptedArtworkTypes, artworkPolicy: draft.artworkPolicy,
      customizable: draft.configurationFields.length > 0, published, allow2D: true, allow3D: false,
      quantityMin: 1, quantityMax: 100, quantityTiers: [], setupCharge: 0, productionDaysMin: 0, productionDaysMax: 0,
    };
  }

  function makeFullDetails(id: string): FullDetailsProductBase {
    return { id, name: name.trim(), sku: sku.trim(), categoryId, categoryIds: [categoryId], productType, price: Number(price), imageUrl: uploadedPrimaryUrl || primaryPreview || "/api/product-images/pending", material: "", sizes: [], sizeDescription: "", features: [], description: description.trim(), customizable: draft.configurationFields.length > 0, published: publishNow, allow2D: true, allow3D: false, quantityMin: 1, quantityMax: 100, quantityTiers: [], setupCharge: 0, productionDaysMin: 0, productionDaysMax: 0, printAreas: draft.printAreas, previewTemplate: "", productModel: "", artworkUpload: draft.artworkUpload, acceptedArtworkTypes: draft.acceptedArtworkTypes, artworkPolicy: draft.artworkPolicy, templateLinks: [], configurationFields: draft.configurationFields.map((field, index) => ({ ...field, id: `${field.key || "field"}-${index + 1}`, priceDelta: 0, minValue: null, maxValue: null, step: null, unit: "", visibleWhen: null })) };
  }
  function applyEzpacExport(handle: string) {
    const mapping = EZPAC_SHOPIFY_PRODUCT_MAPPING.find((item) => item.shopifyHandle === handle);
    if (!mapping) return;

    const categoryMapping = ezpacMappingCategory(mapping.presetId);
    const primary = categoryMapping?.primarySubcategoryId ? categories.find((item) => item.slug === categoryMapping.primarySubcategoryId) : undefined;
    const collectionIds = (categoryMapping?.collectionIds ?? []).flatMap((collectionId) => {
      const category = categories.find((item) => item.slug === ezpacIndustryCollectionCategorySlug(collectionId));
      return category ? [category.id] : [];
    });
    const structuredDescription = { ...(mapping.prefills.intro ? { intro: mapping.prefills.intro } : {}), ...(mapping.prefills.bestFor?.length ? { bestFor: [...mapping.prefills.bestFor] } : {}), ...(mapping.prefills.featureBullets?.length ? { featureBullets: [...mapping.prefills.featureBullets] } : {}) };
    const imageUrls = mapping.prefills.imageUrls ?? [];
    setFullDetails((current) => current ? { ...current, name: mapping.shopifyTitle, sku: autoSku(mapping.shopifyTitle), price: mapping.prefills.priceRupees, productType: mapping.presetId ?? current.productType, categoryId: primary?.id ?? "", categoryIds: [...new Set([primary?.id, ...collectionIds].filter((id): id is string => Boolean(id)))], material: mapping.prefills.materialHint ?? current.material, structuredDescription, description: formatStructuredDescription(structuredDescription), imageUrl: imageUrls[0] ?? current.imageUrl, extraImages: imageUrls.slice(1, 6).map((url) => ({ url })) } : current);
  }

  function importEzpacUrls(handle: string) {
    const mapping = EZPAC_SHOPIFY_PRODUCT_MAPPING.find((item) => item.shopifyHandle === handle);
    if (!mapping) return;
    const imageUrls = mapping.prefills.imageUrls ?? [];
    setFullDetails((current) => current ? { ...current, imageUrl: imageUrls[0] ?? current.imageUrl, extraImages: imageUrls.slice(1, 6).map((url) => ({ url })) } : current);
  }

  function prefillRanBazaarDetails(starterId: string) {
    const starter = createRanBazaarStarterDraft(starterId);
    if (!starter) return;
    setFullDetails((current) => current ? {
      ...current,
      customizable: starter.configurationFields.length > 0,
      configurationFields: starter.configurationFields.map((field, index) => ({
        ...field,
        id: `${field.key || "field"}-${index + 1}`,
        priceDelta: 0,
        minValue: null,
        maxValue: null,
        step: null,
        unit: "",
        visibleWhen: null,
      })),
      printAreas: starter.printAreas,
      artworkUpload: starter.artworkUpload,
      acceptedArtworkTypes: starter.acceptedArtworkTypes,
      artworkPolicy: starter.artworkPolicy,
    } : current);
  }

  function normalizeFullDetails(product: FullDetailsProductBase): FullDetailsProductBase {
    return {
      ...product,
      categoryIds: product.categoryIds?.length ? product.categoryIds : [product.categoryId].filter(Boolean),
      quantityTiers: (product.quantityTiers ?? []).map((tier, index) => ({ ...tier, id: tier.id || `tier-${index + 1}` })),
      configurationFields: (product.configurationFields ?? []).map((field, index) => ({ ...field, id: field.id || `${field.key || "field"}-${index + 1}` })),
    };
  }

  function continueFullDetails() {
    if (!savedProduct) return;
    setFullDetails((current) => current ? { ...current, id: savedProduct.id } : makeFullDetails(savedProduct.id));
    setStep(4);
    void fetch(`/api/admin/catalog?productId=${encodeURIComponent(savedProduct.id)}`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Could not load the saved product.")))
      .then((data: { data?: { product?: FullDetailsProductBase & { publishedVisualizationTemplates?: PublishedVisualizationTemplate[] } } }) => {
        const product = data.data?.product;
        if (product) setFullDetails(normalizeFullDetails(product));
        setPublishedTemplates(product?.publishedVisualizationTemplates ?? []);
      })
      .catch(() => setPublishedTemplates([]));
  }

  async function uploadFullDetailsSlot(slot: number, file: File) {
    if (!savedProduct || !fullDetails) return;
    setDetailUploadingSlots((current) => [...new Set([...current, slot])]); setError("");
    try {
      const url = await upload(savedProduct.id, slot === 0 ? "primary" : "gallery", file);
      setFullDetails((current) => {
        if (!current) return current;
        if (!slot) return { ...current, imageUrl: url };
        const extraImages = Array.from({ length: 5 }, (_, index) => current.extraImages?.[index] ?? { url: "" });
        extraImages[slot - 1] = { ...extraImages[slot - 1], url };
        return { ...current, extraImages };
      });
      if (!slot) setUploadedPrimaryUrl(url);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The image could not be uploaded."); }
    finally { setDetailUploadingSlots((current) => current.filter((item) => item !== slot)); }
  }

  async function saveFullDetails(published: boolean) {
    if (!savedProduct || !fullDetails) return;
    setFullDetailsSaving(true); setError("");
    try {
      const next = { ...fullDetails, id: savedProduct.id, published, artworkPolicy: fullDetails.artworkPolicy ? clampLayoutElementDefaults(fullDetails.artworkPolicy) : null };
      await request("PATCH", buildFullDetailsPatch(next));
      setFullDetails(next); setAttachStatus("done");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save the full product details."); }
    finally { setFullDetailsSaving(false); }
  }

  async function request(method: "POST" | "PATCH", body: Record<string, unknown>) {
    const response = await fetch("/api/admin/catalog", {
      method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => undefined) as { data?: { id?: string; slug?: string }; error?: { message?: string } } | undefined;
    if (!response.ok) throw new Error(data?.error?.message || "Could not save product.");
    return data?.data;
  }

  async function upload(productId: string, kind: "primary" | "surface-base" | "gallery", file: File, surfaceId?: string) {
    const form = new FormData(); form.set("productId", productId); form.set("kind", kind); form.set("image", file);
    if (surfaceId) form.set("surfaceId", surfaceId);
    const response = await fetch("/api/admin/catalog/images", { method: "POST", body: form });
    const data = await response.json().catch(() => undefined) as { data?: { asset?: { url?: string } }; error?: { message?: string } } | undefined;
    if (!response.ok) throw new Error(data?.error?.message || "The image could not be uploaded.");
    return data?.data?.asset?.url ?? "";
  }

  async function copyPrimaryToBase(productId: string, surfaceId: string) {
    const response = await fetch("/api/admin/catalog/images/from-source", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, surfaceId, source: "primary" }),
    });
    const data = await response.json().catch(() => undefined) as { data?: { asset?: { url?: string } }; error?: { message?: string } } | undefined;
    if (!response.ok) throw new Error(data?.error?.message || "The product photo could not be reused.");
    return data?.data?.asset?.url ?? "";
  }

  async function save() {
    setError("");
    if (!essentialsReady) { setStep(2); setError("Add a name, price and category before saving."); return; }
    if (publishNow && !hasPrimaryPhoto) { setStep(3); setError("Choose a product photo before publishing."); return; }
    if (publishNow && !readiness.canPublish) { setStep(2); setError("Finish the publish readiness items before publishing."); return; }
    let product = savedProduct;
    let imageUrl = uploadedPrimaryUrl;
    let phase: "save" | "upload" | "attach" = "save";
    try {
      if (!product) {
        phase = "save";
        setSaveStatus("working");
        const created = await request("POST", payload(false, "/api/product-images/pending"));
        if (!created?.id || !created.slug) throw new Error("The saved product is missing its ID.");
        product = { id: created.id, slug: created.slug }; setSavedProduct(product); setSaveStatus("done");
      }
      // Keep the source-copy in the same retryable upload phase. A primary image may
      // already have uploaded when its canvas-background copy fails, so a retry must
      // repeat that copy before the final product PATCH can succeed.
      const shouldReusePrimaryAsBase = Boolean(reusePhotoAsBase && primarySurface && (primaryFile || imageUrl));
      if (primaryFile || baseFile || shouldReusePrimaryAsBase) {
        phase = "upload";
        setUploadStatus("working");
        let uploadedPrimaryThisSave = false;
        if (primaryFile) {
          imageUrl = await upload(product.id, "primary", primaryFile);
          uploadedPrimaryThisSave = true;
          setUploadedPrimaryUrl(imageUrl); setPrimaryFile(null);
        }
        if (baseFile && primarySurface && (!reusePhotoAsBase || !primaryFile)) {
          await upload(product.id, "surface-base", baseFile, primarySurface.id);
          setBaseFile(null);
        }
        if (reusePhotoAsBase && primarySurface && (uploadedPrimaryThisSave || imageUrl)) {
          const baseImageUrl = await copyPrimaryToBase(product.id, primarySurface.id);
          if (baseImageUrl) setBasePreview(baseImageUrl);
          setBaseFile(null);
        }
        setUploadStatus("done");
      } else setUploadStatus("skipped");
      phase = "attach";
      setAttachStatus("working");
      await request("PATCH", { ...payload(publishNow, imageUrl || "/api/product-images/pending"), id: product.id });
      setAttachStatus("done");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not save the product.";
      if (phase === "save") setSaveStatus("failed");
      else if (phase === "upload") setUploadStatus("failed");
      else setAttachStatus("failed");
      setError(message); return;
    }
  }

  async function reusePhotoForBase() {
    if (!savedProduct || !primarySurface) return;
    setReusingPhoto(true); setError("");
    try {
      const baseImageUrl = await copyPrimaryToBase(savedProduct.id, primarySurface.id);
      if (baseImageUrl) setBasePreview(baseImageUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The product photo could not be reused.");
    } finally { setReusingPhoto(false); }
  }
  const success = attachStatus === "done" && savedProduct;
  const supportsFullDetails = starterMode === "packaging" || starterMode === "ranbazaar";
  const wizardSteps = supportsFullDetails ? ["Choose a product type", "Essentials", "Images & publish", "Full details"] : ["Choose a product type", "Essentials", "Images & publish"];
  const publishChoice = <fieldset className={styles.quickListPublishChoice}><legend>Save choice</legend><label><input checked={publishNow} name="quick-publish" onChange={() => setPublishNow(true)} type="radio" /> Publish now</label><label><input checked={!publishNow} name="quick-publish" onChange={() => setPublishNow(false)} type="radio" /> Save as draft</label></fieldset>;
  const reusePhotoChoice = <label className={styles.quickListReuseChoice}><input checked={reusePhotoAsBase} onChange={(event) => setReusePhotoAsBase(event.target.checked)} type="checkbox" /> Use the product photo as the 2D canvas background</label>;
  const readinessChecklist = <div className={styles.quickListChecklist}><strong>{publishNow ? "Publish readiness" : "Publishing checks"}</strong>{readiness.items.map((item) => <p key={item.id} className={publishNow ? item.ready ? styles.quickListReady : styles.quickListNotReady : styles.quickListSkipped}><span>{publishNow ? item.ready ? <Check size={13} /> : "×" : "–"}</span><span><strong>{readinessLabels[item.id]}</strong>{publishNow ? !item.ready ? ` — ${item.message}` : !item.blocking ? " (hint)" : "" : " — skipped for drafts"}</span></p>)}</div>;
  return (
    <>
      <button aria-label="Close quick add" className={styles.drawerBackdrop} onClick={onClose} type="button" />
      <aside aria-label="Quick add product" className={`${styles.drawer} ${styles.quickListDrawer}`}>
        <div className={styles.drawerHeader}>
          <div><h3>Quick add product</h3><p>List a personalizable product with the essentials, then manage advanced settings later.</p></div>
          <button aria-label="Close" className={styles.iconButton} onClick={onClose} type="button"><X size={16} /></button>
        </div>
        <div className={styles.quickListRail} aria-label="Quick add progress">
          {wizardSteps.map((label, index) => <button className={step === index + 1 ? styles.quickListStepActive : styles.quickListStep} key={label} onClick={() => { if (index + 1 <= step) setStep(index + 1); }} type="button"><span>{index + 1}</span>{label}</button>)}
        </div>
        <div className={styles.drawerBody}>
          {step === 1 && <div className={styles.quickListContent}>
            <div className={styles.quickListStarterHeading}><h4>Pick the closest match — everything can be changed later.</h4></div>
            {!categories.length && <div className={styles.quickListImportCard}><strong>No categories yet — import the RanBazaar category groups first</strong><p>Imports only missing category records; it never creates products.</p><span><button className={styles.buttonSecondary} onClick={() => void onImportRanBazaar()} type="button">Import RanBazaar groups</button><button className={styles.buttonSecondary} onClick={() => void onImportPackaging()} type="button">Import packaging groups</button></span></div>}
            <div className={styles.quickListStarterGrid}>
              {starters.map((starter) => <button className={styles.configCard} key={starter.id} onClick={() => { const next = createRanBazaarStarterDraft(starter.id); if (next) selectDraft(next, "ranbazaar", categoryByStarter[starter.id]); }} type="button"><strong>{starter.name}</strong><small>{starter.description}</small><span className={styles.quickListChips}><StatusBadge>{starter.fields.length} fields</StatusBadge><StatusBadge>{starter.surfaces.length} surface{starter.surfaces.length === 1 ? "" : "s"}</StatusBadge>{starter.artworkUpload.enabled && <StatusBadge tone="info">Photo upload allowed</StatusBadge>}{starter.fields.find((field) => field.maxLength)?.maxLength && <StatusBadge>max {starter.fields.find((field) => field.maxLength)?.maxLength} chars</StatusBadge>}</span></button>)}
              <button className={styles.configCard} onClick={() => selectDraft(blankDraft(), "blank")} type="button"><Package size={18} /><strong>Simple product</strong><small>No customer customization — list it, price it, publish.</small></button>
              <div className={styles.configCard}><Sparkles size={18} /><strong>Packaging &amp; print (boxes, pouches, bags)</strong><small>Boxes, pouches, paper bags, marketing print. Pick one of 55 types.</small><label className={styles.quickListPackagingSearch}><span>Find a packaging type</span><input className={styles.input} list="quick-list-packaging-types" onChange={(event) => { const value = event.target.value; setPackagingSearch(value); const selected = packagingStarters.find((starter) => starter.name === value); if (selected) selectPackagingStarter(selected.id); }} placeholder="Search 55 types" value={packagingSearch} /></label><datalist id="quick-list-packaging-types">{filteredPackagingStarters.map((starter) => <option key={starter.id} value={starter.name} />)}</datalist><select className={styles.select} onChange={(event) => selectPackagingStarter(event.target.value)} value={productType}><option value="">Choose packaging type</option>{filteredPackagingStarters.map((starter) => <option key={starter.id} value={starter.id}>{starter.name}</option>)}</select></div>
            </div>
            <p className={styles.quickListStarterHint}>Not sure? Pick the closest one — the admin can fine-tune everything in Full details later.</p>
          </div>}
          {step === 2 && <div className={styles.quickListContent}>
            <div className={styles.quickListForm}>
              {publishChoice}
              {reusePhotoChoice}
              <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Name</span><input className={styles.input} onChange={(event) => setName(event.target.value)} required value={name} /></label>
              <div className={styles.fieldGrid}><label className={styles.fieldGroup}><span className={styles.fieldLabel}>Price (₹)</span><input className={styles.input} inputMode="decimal" min="0" onChange={(event) => setPrice(event.target.value)} required type="number" value={price} /></label><label className={styles.fieldGroup}><span className={styles.fieldLabel}>Category</span><select className={styles.select} onChange={(event) => { setCategoryId(event.target.value); setSuggestedCategoryId(""); }} required value={categoryId}><option value="" disabled>Choose a category</option>{categories.map((item) => <option key={item.id} value={item.id}>{categoryOptionLabel(item)}</option>)}</select>{suggestedCategoryId === categoryId && <span className={styles.quickListAutoCategory}>Auto-picked from the starter <button className={styles.buttonGhost} onClick={() => setSuggestedCategoryId("")} type="button">Change</button></span>}</label></div>
              <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Description <small>Optional</small></span><input className={styles.input} onChange={(event) => setDescription(event.target.value)} value={description} /></label>
              <details className={styles.quickListAdvancedDetails}><summary>Advanced details</summary><div className={styles.quickListSku}><span>SKU <strong>{sku}</strong></span><button className={styles.buttonGhost} onClick={() => setSkuEdited((current) => !current)} type="button">{skuEdited ? "Auto" : "Edit"}</button>{skuEdited && <input aria-label="SKU" className={styles.input} onChange={(event) => setSku(event.target.value)} value={sku} />}</div></details>
              <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Sample customer name (shown in the live preview)</span><input className={styles.input} onChange={(event) => setSampleText(event.target.value)} value={sampleText} /><small>This is what the 2D preview on the right shows — change it to check fonts and sizes.</small></label>
              {readinessChecklist}
            </div>
            <SurfaceCustomerPreview baseImageUrl={basePreview} heightMm={primarySurface?.heightMm} productPhotoUrl={primaryPreview} sampleText={sampleText} surfaceLabel={primarySurface?.label ?? "Primary surface"} widthMm={primarySurface?.widthMm} />
          </div>}
          {step === 3 && <div className={styles.quickListContent}>
            <div className={styles.quickListForm}>
              {publishChoice}
              {reusePhotoChoice}
              <div className={styles.assetPicker}><div className={styles.assetPreview}>{primaryPreview ? <img alt="Product photo preview" src={primaryPreview} /> : <FileImage size={20} />}</div><label className={styles.fieldGroup}><span className={styles.fieldLabel}>Product photo</span><input accept="image/jpeg,image/png,image/webp" className={styles.assetFileInput} onChange={(event) => choosePrimary(event.target.files?.[0])} type="file" /><small>{publishNow ? "Required to publish. Used on storefront product listings." : "Optional for drafts. Used on storefront product listings when added."}</small></label></div>
              <div className={styles.assetPicker}><div className={styles.assetPreview}>{basePreview ? <img alt="Base image preview" src={basePreview} /> : <FileImage size={20} />}</div><label className={styles.fieldGroup}><span className={styles.fieldLabel}>Base image for the customer&apos;s 2D canvas</span><input accept="image/jpeg,image/png,image/webp" className={styles.assetFileInput} onChange={(event) => chooseBase(event.target.files?.[0])} type="file" /><small>{reusePhotoAsBase ? "The product photo will be used after upload." : "Optional. Shown underneath customer text and photo layers."}</small></label></div>
              {savedProduct && <button className={styles.buttonSecondary} disabled={reusingPhoto} onClick={() => void reusePhotoForBase()} type="button">{reusingPhoto ? <LoaderCircle className={styles.studioSpin} size={13} /> : <FileImage size={13} />} Use this product&apos;s photo</button>}
              <div className={styles.quickListSequence} aria-live="polite">{[["1", "saving draft", saveStatus], ["2", "uploading images", uploadStatus], ["3", publishNow ? "attaching and publishing" : "attaching", attachStatus]].map(([number, label, status]) => <span className={styles[`quickListSequence${String(status)[0].toUpperCase()}${String(status).slice(1)}` as "quickListSequenceWaiting"]} key={String(number)}>{number}) {label} {status === "done" ? "✓" : status === "working" ? "…" : status === "failed" ? "×" : status === "skipped" ? "skipped" : ""}</span>)}</div>
              {error && <p className={styles.formError} role="alert">{error}</p>}
              {success ? <div className={styles.quickListSuccess}><strong>{publishNow ? "Product published" : "Draft saved"}</strong><p>/products/{savedProduct.slug}</p><span className={styles.quickListSuccessActions}><a className={styles.buttonPrimary} href={`/products/${savedProduct.slug}`} onClick={() => void onSaved(savedProduct.id)} rel="noreferrer" target="_blank">See it live</a><button className={styles.buttonSecondary} onClick={continueFullDetails} type="button">Add description, material &amp; extra images</button><button className={styles.buttonSecondary} onClick={() => void onOpenStudio(savedProduct.id)} type="button">3D preview (optional)</button></span></div> : <button className={styles.buttonPrimary} disabled={saveStatus === "working" || uploadStatus === "working" || attachStatus === "working" || (publishNow && (!hasPrimaryPhoto || !readiness.canPublish))} onClick={() => void save()} type="button">{saveStatus === "working" || uploadStatus === "working" || attachStatus === "working" ? "Saving…" : (saveStatus === "failed" || uploadStatus === "failed" || attachStatus === "failed") ? "Retry failed step" : publishNow ? "Save and publish" : "Save draft"}</button>}
            </div>
            <SurfaceCustomerPreview baseImageUrl={basePreview} heightMm={primarySurface?.heightMm} productPhotoUrl={primaryPreview} sampleText={sampleText} surfaceLabel={primarySurface?.label ?? "Primary surface"} widthMm={primarySurface?.widthMm} />
          </div>}
          {step === 4 && fullDetails && <div className={styles.quickListContent}>
            <div className={styles.quickListForm}>
              <ProductFullDetailsSections
                autoSku={autoSku} categories={categories} exportPresets={starterMode === "packaging" ? exportPresets : undefined}
                onApplyExport={starterMode === "packaging" ? applyEzpacExport : undefined} onChange={(value) => setFullDetails(value)}
                onImportExportUrls={starterMode === "packaging" ? importEzpacUrls : undefined} onPrefillRanBazaar={starterMode === "ranbazaar" ? prefillRanBazaarDetails : undefined}
                onSkuEditedChange={setSkuEdited} onUploadSlot={uploadFullDetailsSlot}
                skuEdited={skuEdited} uploadingSlots={detailUploadingSlots} value={fullDetails}
              />
              <ProductLayoutControls onChange={(value) => setFullDetails(value)} publishedTemplates={publishedTemplates} value={fullDetails} />
              <div className={styles.quickListChecklist}><strong>Publish readiness</strong>{readiness.items.map((item) => {
                const notApplicable = item.id === "packaging-visualization" && !isEzpacPackagingProductType(fullDetails.productType);
                return <p className={notApplicable || item.ready ? styles.quickListReady : styles.quickListNotReady} key={item.id}><span>{notApplicable || item.ready ? <Check size={13} /> : "x"}</span>{notApplicable ? "not applicable" : item.ready ? item.id.replaceAll("-", " ") : item.message}{!notApplicable && !item.blocking && " (hint)"}</p>;
              })}</div>
              {error && <p className={styles.formError} role="alert">{error}</p>}
            </div>
            <SurfaceCustomerPreview productPhotoUrl={fullDetails.imageUrl} sampleText={sampleText} surfaceLabel={fullDetails.printAreas[0]?.label ?? "Primary surface"} />
          </div>}
        </div>

        <div className={styles.drawerFooter}>
          <button className={styles.buttonSecondary} onClick={() => step === 1 ? onClose() : setStep((current) => current - 1)} type="button">{step === 1 ? "Cancel" : <><ChevronLeft size={13} /> Back</>}</button>
          {step < 3 && <button className={styles.buttonPrimary} disabled={step === 1 ? !starterMode : !essentialsReady} onClick={() => setStep((current) => current + 1)} type="button">Continue <ChevronRight size={13} /></button>}
          {step === 4 && <span className={styles.fullDetailsSaveActions}><button className={styles.buttonSecondary} disabled={fullDetailsSaving} onClick={() => void saveFullDetails(false)} type="button">Save draft</button><button className={styles.buttonPrimary} disabled={fullDetailsSaving || !readiness.canPublish} onClick={() => void saveFullDetails(true)} type="button">{fullDetailsSaving ? "Saving..." : "Save and publish"}</button></span>}
        </div>
      </aside>
    </>
  );
}
