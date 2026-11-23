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
  getEzpacPackagingFieldPreset,
  getEzpacPackagingFieldsForProductType,
  getEzpacPackagingProductType,
  isEzpacPackagingProductType,
  listEzpacPackagingProductTypes,
  type PackagingFieldPresetId,
} from "@/lib/ezpac-packaging-presets";
import { ezpacIndustryCollectionCategorySlug } from "@/lib/ezpac-packaging-presets";
import { formatStructuredDescription } from "@/lib/admin-structured-description";
import { EZPAC_SHOPIFY_PRODUCT_MAPPING, ezpacMappingCategory } from "@/lib/ezpac-product-mapping";
import { listRanBazaarCustomizationStarters } from "@/lib/ranbazaar-customization-presets";
import {
  buildListingSources,
  draftFromExistingProduct,
  essentialsComplete,
  previewPrice,
  quickListProductPayload,
  recipeForCategorySlug,
  searchListingSources,
  unconfiguredOptionLabels,
  type ListingSource,
} from "@/lib/listing-wizard";
import {
  listableCategories,
  priceBandHint,
  priceBandWarning,
  recipeSummaryChips,
} from "@/lib/category-listing-playbook";
import { StatusBadge } from "./AdminUI";
import { ProductFullDetailsSections, ProductLayoutControls, clampLayoutElementDefaults, type PublishedVisualizationTemplate } from "./ProductFullDetailsSections";
import { SurfaceCustomerPreview } from "./SurfaceCustomerPreview";
import { buildFullDetailsPatch, type FullDetailsProductBase } from "./product-details-payload";
import { defaultDesignPayload } from "@/lib/studio-design";
import styles from "./admin.module.css";

type CategoryRecord = { id: string; slug: string; name: string; parentId: string | null; sortOrder: number };
type StepStatus = "waiting" | "working" | "done" | "failed" | "skipped";

const readinessLabels = {
  "mime-types": "Photo uploads: allowed formats",
  "physical-dimensions": "Photo surface sizes set",
  "linked-templates": "Design template ready",
  "packaging-visualization": "3D preview ready (packaging only)",
} as const;

const sourceKindLabels = { ranbazaar: "Starter", packaging: "Packaging", blank: "Simple", similar: "Copy existing" } as const;

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

/** Packaging spec fields for a shelf whose recipe names a field preset but no product type. */
function packagingDraftFromFieldPreset(presetId: PackagingFieldPresetId): RanBazaarStarterDraft {
  const preset = getEzpacPackagingFieldPreset(presetId);
  const base = blankDraft();
  return {
    ...base,
    id: preset.id,
    name: preset.label,
    configurationFields: preset.fields.map((field) => ({
      key: field.key, label: field.label, inputType: field.inputType, required: field.required,
      placeholder: field.placeholder ?? "",
      helpText: field.helpText ?? (field.optionSource === "admin_configured" ? "Configure supported choices, then enable this field for customers." : ""),
      defaultValue: "", minLength: field.minLength ?? null, maxLength: field.maxLength ?? null,
      allowedPattern: field.allowedPattern ?? "",
      options: field.options?.map((option) => ({ label: option.label, value: option.value, priceDelta: option.priceDelta ?? 0 })) ?? [],
      enabled: field.optionSource !== "admin_configured",
      customerVisible: field.optionSource !== "admin_configured",
    })),
  };
}

function previewFile(file: File | null, previous: string) {
  if (previous) URL.revokeObjectURL(previous);
  return file ? URL.createObjectURL(file) : "";
}

/** Storefront-style live preview: what the admin types is what the customer will see. */
function ListingPreviewCard({
  photoUrl,
  name,
  price,
  categoryName,
  basePreview,
  sampleText,
  surface,
  fieldCount,
}: {
  photoUrl: string;
  name: string;
  price: string;
  categoryName: string;
  basePreview: string;
  sampleText: string;
  surface?: QuickListPrintArea;
  fieldCount: number;
}) {
  return (
    <details className={styles.quickListPreviewWrap} open>
      <summary>Live preview</summary>
      <div className={styles.quickListPreviewPane}>
        <div aria-label="Live customer preview" className={styles.quickListPreviewCard}>
          <div className={styles.quickListPreviewPhoto}>{photoUrl ? <img alt="Product photo preview" src={photoUrl} /> : <FileImage size={22} />}</div>
          <strong>{name.trim() || "Your product"}</strong>
          {categoryName && <span className={styles.quickListPreviewChip}>{categoryName}</span>}
          <em className={styles.quickListPreviewPrice}>{previewPrice(price) || "Set a price"}</em>
        </div>
        {fieldCount > 0 && (
          <SurfaceCustomerPreview
            baseImageUrl={basePreview}
            heightMm={surface?.heightMm}
            productPhotoUrl={photoUrl}
            sampleText={sampleText}
            surfaceLabel={surface?.label ?? "Primary surface"}
            widthMm={surface?.widthMm}
          />
        )}
      </div>
    </details>
  );
}

export function QuickListProductWizard({
  categories,
  catalogProducts = [],
  onClose,
  onSaved,
  onOpenStudio,
  onImportRanBazaar,
  onImportPackaging,
}: {
  categories: CategoryRecord[];
  /** Existing products offered as "copy this setup" sources in step 1. */
  catalogProducts?: Array<{ id: string; name: string }>;
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
  const [starterMode, setStarterMode] = useState<"ranbazaar" | "blank" | "packaging" | "similar" | null>(null);
  const [productType, setProductType] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [sku, setSku] = useState(() => autoSku(""));
  const [skuEdited, setSkuEdited] = useState(false);
  const [sampleText, setSampleText] = useState("Aarav");
  const [searchQuery, setSearchQuery] = useState("");
  const [similarLoadingId, setSimilarLoadingId] = useState("");
  const [compareAtPrice, setCompareAtPrice] = useState("");
  const [enable3D, setEnable3D] = useState(true);
  const [creating3D, setCreating3D] = useState(false);
  const [created3DModel, setCreated3DModel] = useState("");
  const [created3DNote, setCreated3DNote] = useState("");
  const [three3DError, setThree3DError] = useState("");
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
  // Import buckets, the collection tree and test shelves are not sellable shelves.
  const primaryCategories = useMemo(() => listableCategories(categories), [categories]);
  const categoryById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const selectedCategory = categoryId ? categoryById.get(categoryId) : undefined;
  const recipe = recipeForCategorySlug(selectedCategory?.slug);
  const collectionCategories = useMemo(() => (recipe?.collectionSlugs ?? [])
    .flatMap((slug) => categories.filter((category) => category.slug === slug)), [categories, recipe]);
  const pendingOptionLabels = useMemo(() => unconfiguredOptionLabels(draft), [draft]);
  /** Shelves with a recipe, shown as the category-first entry on step 1. */
  const shelfOptions = useMemo(() => primaryCategories.flatMap((category) => {
    const shelfRecipe = recipeForCategorySlug(category.slug);
    if (!shelfRecipe) return [];
    const parent = category.parentId ? categoryById.get(category.parentId) : undefined;
    return [{ category, recipe: shelfRecipe, label: parent ? `${parent.name} › ${category.name}` : category.name }];
  }), [primaryCategories, categoryById]);
  const bandWarning = priceBandWarning(recipe, Number(price));
  const bandHint = priceBandHint(recipe);
  const summaryChips = recipeSummaryChips(recipe, collectionCategories.map((category) => category.name));
  const builtin3DAvailable = recipe?.threeDPath === "builtin" && Boolean(recipe.model3D);
  const listingSources = useMemo(() => buildListingSources({
    starters: starters.map((starter) => ({ id: starter.id, name: starter.name, description: starter.description, fieldCount: starter.fields.length })),
    packagingTypes: packagingStarters.map((starter) => ({ id: starter.id, name: starter.name })),
    products: catalogProducts,
  }), [starters, packagingStarters, catalogProducts]);
  const searchResults = useMemo(() => searchListingSources(listingSources, searchQuery), [listingSources, searchQuery]);

  useEffect(() => {
    if (categoryId || !primaryCategories.length) return;
    setCategoryId(primaryCategories[0].id);
  }, [categoryId, primaryCategories]);

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
  const essentialsReady = essentialsComplete({ name, price, categoryId, sku });
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
    const matchingCategory = categorySlug ? primaryCategories.find((category) => category.slug === categorySlug) : undefined;
    const nextCategoryId = matchingCategory?.id ?? primaryCategories[0]?.id ?? "";
    setCategoryId(nextCategoryId);
    setSuggestedCategoryId(matchingCategory?.id ?? "");
  }

  /** Category-first entry: the shelf's recipe decides the starter, fields and surface. */
  function selectCategory(category: CategoryRecord) {
    const categoryRecipe = recipeForCategorySlug(category.slug);
    const nextDraft = categoryRecipe?.starterId
      ? createRanBazaarStarterDraft(categoryRecipe.starterId)
      : categoryRecipe?.packagingFieldPresetId
        ? packagingDraftFromFieldPreset(categoryRecipe.packagingFieldPresetId)
        : undefined;
    setDraft(nextDraft ?? blankDraft());
    setStarterMode(categoryRecipe?.packagingFieldPresetId ? "packaging" : categoryRecipe?.starterId ? "ranbazaar" : "blank");
    setProductType("");
    setCategoryId(category.id);
    setSuggestedCategoryId("");
    setCompareAtPrice("");
    setEnable3D(true);
    setStep(2);
    setError("");
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
    selectDraft(next, "packaging");
  }

  /** "List similar": copy an existing product's configuration — never its identity. */
  async function selectSimilar(productId: string, sourceName: string) {
    setSimilarLoadingId(productId);
    setError("");
    try {
      const response = await fetch(`/api/admin/catalog?productId=${encodeURIComponent(productId)}`);
      const data = await response.json().catch(() => undefined) as { data?: { product?: Record<string, unknown> } } | undefined;
      const product = data?.data?.product;
      if (!response.ok || !product) throw new Error("Could not load that product's setup. Try another one.");
      const result = draftFromExistingProduct(sourceName, product);
      setDraft(result.draft);
      setStarterMode("similar");
      setStep(2);
      setProductType(result.productType);
      setName("");
      setSkuEdited(false);
      setSku(autoSku(""));
      setPrice(result.priceText);
      setDescription(result.description);
      const matching = categories.find((category) => category.id === result.categoryId);
      setCategoryId(matching?.id ?? categories[0]?.id ?? "");
      setSuggestedCategoryId(matching?.id ?? "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load that product's setup.");
    } finally {
      setSimilarLoadingId("");
    }
  }

  function chooseSource(source: ListingSource) {
    if (source.kind === "ranbazaar") {
      const next = createRanBazaarStarterDraft(source.id);
      if (next) selectDraft(next, "ranbazaar", categoryByStarter[source.id]);
    } else if (source.kind === "packaging") {
      selectPackagingStarter(source.id);
    } else if (source.kind === "blank") {
      selectDraft(blankDraft(), "blank");
    } else {
      void selectSimilar(source.id, source.name);
    }
  }

  function payload(published: boolean, imageUrl: string) {
    return quickListProductPayload({
      name, sku, categoryId, price, description, productType, draft, published, imageUrl,
      recipe,
      categoryName: selectedCategory?.name ?? "",
      categoryIds: collectionCategories.map((category) => category.id),
      compareAtPrice,
      enable3D: builtin3DAvailable && enable3D,
    });
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
      await addDefaultDesign(product.id);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not save the product.";
      if (phase === "save") setSaveStatus("failed");
      else if (phase === "upload") setUploadStatus("failed");
      else setAttachStatus("failed");
      setError(message); return;
    }
  }

  /**
   * A personalised product starts with a 2D design: its photo with the name box in the
   * middle, fine-tuned later in the design editor. Never replaces existing designs, skips
   * packaging (it keeps the free-form artwork editor), and never blocks the listing.
   */
  async function addDefaultDesign(productId: string) {
    if (starterMode === "packaging") return;
    try {
      const response = await fetch(`/api/admin/studio-designs?productId=${encodeURIComponent(productId)}`, { cache: "no-store" });
      const current = await response.json() as { data?: { designs: unknown[]; product: { imageUrl: string; imageSize: { width: number; height: number } | null } } };
      if (!response.ok || !current.data || current.data.designs.length) return;
      const design = defaultDesignPayload({ productId, imageUrl: current.data.product.imageUrl, imageSize: current.data.product.imageSize, fields: draft.configurationFields });
      if (!design) return;
      await fetch("/api/admin/studio-designs", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(design) });
    } catch {
      // The design can still be made in the product's design editor.
    }
  }

  /** Builds and publishes a packaging product's 3D preview from its own photo. */
  async function createQuick3D(productId: string) {
    setCreating3D(true); setThree3DError("");
    try {
      const response = await fetch("/api/admin/visualization-studio/quick-3d", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      const data = await response.json().catch(() => undefined) as { data?: { productModel?: string; alreadyLinked?: boolean; artworkNote?: string }; error?: { message?: string } } | undefined;
      if (!response.ok) throw new Error(data?.error?.message || "The 3D preview could not be created.");
      setCreated3DModel(data?.data?.productModel ?? "linked");
      setCreated3DNote(data?.data?.artworkNote ?? "");
    } catch (cause) {
      setThree3DError(cause instanceof Error ? cause.message : "The 3D preview could not be created.");
    } finally {
      setCreating3D(false);
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
  const supportsFullDetails = starterMode === "packaging" || starterMode === "ranbazaar" || starterMode === "similar";
  const wizardSteps = supportsFullDetails && step === 4 ? ["What are you selling?", "Name, price & photo", "Review & publish", "Full details"] : ["What are you selling?", "Name, price & photo", "Review & publish"];
  const selectedCategoryName = categories.find((category) => category.id === categoryId)?.name ?? "";
  const publishChoice = <fieldset className={styles.quickListPublishChoice}><legend>Save choice</legend><label><input checked={publishNow} name="quick-publish" onChange={() => setPublishNow(true)} type="radio" /> Publish now</label><label><input checked={!publishNow} name="quick-publish" onChange={() => setPublishNow(false)} type="radio" /> Save as draft</label></fieldset>;
  const reusePhotoChoice = <label className={styles.quickListReuseChoice}><input checked={reusePhotoAsBase} onChange={(event) => setReusePhotoAsBase(event.target.checked)} type="checkbox" /> Use the product photo as the 2D canvas background</label>;
  // Only unresolved checks are worth the admin's attention; a ready product gets one calm line.
  const pendingChecks = readiness.items.filter((item) => !item.ready && (item.id !== "packaging-visualization" || isEzpacPackagingProductType(productType)));
  const readinessChecklist = <div className={styles.quickListChecklist}>
    <strong>{publishNow ? "Before it goes live" : "Saving as a draft"}</strong>
    {!publishNow
      ? <p className={styles.quickListSkipped}><span>–</span><span>Publish checks run later, when you publish it.</span></p>
      : !hasPrimaryPhoto
        ? <p className={styles.quickListNotReady}><span>×</span><span><strong>Photo</strong> — go back and add a product photo to publish.</span></p>
        : pendingChecks.length === 0
          ? <p className={styles.quickListReady}><span><Check size={13} /></span><span>Everything&apos;s ready — this goes live as soon as you publish.</span></p>
          : pendingChecks.map((item) => <p className={styles.quickListNotReady} key={item.id}><span>×</span><span><strong>{readinessLabels[item.id]}</strong> — {item.message}{item.blocking ? "" : " (optional)"}</span></p>)}
  </div>;
  return (
    <>
      <button aria-label="Close add product" className={styles.drawerBackdrop} onClick={onClose} type="button" />
      <aside aria-label="Add product" className={`${styles.drawer} ${styles.quickListDrawer}`}>
        <div className={styles.drawerHeader}>
          <div><h3>Add product</h3><p>Five quick decisions and it&apos;s live — advanced settings can wait until after saving.</p></div>
          <button aria-label="Close" className={styles.iconButton} onClick={onClose} type="button"><X size={16} /></button>
        </div>
        <div className={styles.quickListRail} aria-label="Quick add progress">
          {wizardSteps.map((label, index) => <button className={step === index + 1 ? styles.quickListStepActive : styles.quickListStep} key={label} onClick={() => { if (index + 1 <= step) setStep(index + 1); }} type="button"><span>{index + 1}</span>{label}</button>)}
        </div>
        <div className={styles.drawerBody}>
          {step === 1 && <div className={styles.quickListContent}>
            <div className={styles.quickListStarterHeading}><h4>What are you selling? Search, or pick the closest match — everything can be changed later.</h4></div>
            {!categories.length && <div className={styles.quickListImportCard}><strong>No categories yet — import the RanBazaar category groups first</strong><p>Imports only missing category records; it never creates products.</p><span><button className={styles.buttonSecondary} onClick={() => void onImportRanBazaar()} type="button">Import RanBazaar groups</button><button className={styles.buttonSecondary} onClick={() => void onImportPackaging()} type="button">Import packaging groups</button></span></div>}
            <label className={styles.quickListSearch}>
              <span className={styles.fieldLabel}>Search product types, packaging, or your existing products</span>
              <input autoFocus className={styles.input} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Try “name slip”, “soap box”, or an existing product’s name" type="search" value={searchQuery} />
            </label>
            <div className={styles.quickListStarterGrid}>
              {searchResults.map((source) => (
                <button className={styles.configCard} disabled={Boolean(similarLoadingId)} key={`${source.kind}-${source.id}`} onClick={() => chooseSource(source)} type="button">
                  {source.kind === "blank" ? <Package size={18} /> : source.kind === "packaging" ? <Sparkles size={18} /> : null}
                  <strong>{source.name}</strong>
                  <small>{source.hint}</small>
                  <span className={styles.quickListChips}>
                    <StatusBadge tone={source.kind === "similar" ? "info" : undefined}>{similarLoadingId === source.id ? "Loading…" : sourceKindLabels[source.kind]}</StatusBadge>
                    {typeof source.fieldCount === "number" && source.fieldCount > 0 && <StatusBadge>{source.fieldCount} customize field{source.fieldCount === 1 ? "" : "s"}</StatusBadge>}
                  </span>
                </button>
              ))}
            </div>
            {Boolean(searchQuery.trim()) && !searchResults.length && <div className={styles.quickListNoResults}><strong>No matches for “{searchQuery.trim()}”.</strong><p>Try another word, or start from a simple product.</p><button className={styles.buttonSecondary} onClick={() => selectDraft(blankDraft(), "blank")} type="button"><Package size={13} /> Start blank</button></div>}
            {!searchQuery.trim() && shelfOptions.length > 0 && <div className={styles.quickListShelves}>
              <p className={styles.sectionCaption}>Or pick the shelf it goes on — the rest fills itself in</p>
              <div className={styles.quickListShelfGrid}>
                {shelfOptions.map((shelf) => <button className={styles.quickListShelfButton} key={shelf.category.id} onClick={() => selectCategory(shelf.category)} type="button">
                  <strong>{shelf.label}</strong>
                  <small>{shelf.recipe.notes ?? (shelf.recipe.gstPercent > 0 ? `GST ${shelf.recipe.gstPercent}%` : "Quote-priced packaging")}</small>
                </button>)}
              </div>
            </div>}
            <p className={styles.quickListStarterHint}>Tip: type an existing product&apos;s name to copy its whole setup — then just add a new name, price and photo.</p>
          </div>}
          {step === 2 && <div className={styles.quickListContent}>
            <div className={styles.quickListForm}>
              <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Name</span><input autoFocus className={styles.input} onChange={(event) => setName(event.target.value)} placeholder={starterMode === "similar" ? "Give the new product its own name" : undefined} required value={name} /></label>
              <div className={styles.fieldGrid}>
                <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Price (₹)</span><input className={styles.input} inputMode="decimal" min="0" onChange={(event) => setPrice(event.target.value)} required type="number" value={price} />{bandWarning ? <small className={styles.quickListBandWarning}>{bandWarning}</small> : bandHint ? <small>{bandHint}</small> : null}</label>
                <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Category</span><select className={styles.select} onChange={(event) => { setCategoryId(event.target.value); setSuggestedCategoryId(""); }} required value={categoryId}><option value="" disabled>Choose a category</option>{primaryCategories.map((item) => <option key={item.id} value={item.id}>{categoryOptionLabel(item)}</option>)}</select>{suggestedCategoryId === categoryId && <span className={styles.quickListAutoCategory}>Auto-picked for you <button className={styles.buttonGhost} onClick={() => setSuggestedCategoryId("")} type="button">Change</button></span>}</label>
              </div>
              {recipe?.mrpExpected && <label className={styles.fieldGroup}><span className={styles.fieldLabel}>MRP (₹) <small>Optional</small></span><input className={styles.input} inputMode="decimal" min="0" onChange={(event) => setCompareAtPrice(event.target.value)} type="number" value={compareAtPrice} /><small>Shown struck through next to the price. Products on this shelf usually show one.</small></label>}
              {summaryChips.length > 0 && <p className={styles.quickListRecipeChips}>{summaryChips.map((chip) => <StatusBadge key={chip}>{chip}</StatusBadge>)}</p>}
              <div className={styles.assetPicker}><div className={styles.assetPreview}>{primaryPreview ? <img alt="Product photo preview" src={primaryPreview} /> : <FileImage size={20} />}</div><label className={styles.fieldGroup}><span className={styles.fieldLabel}>Photo</span><input accept="image/jpeg,image/png,image/webp" className={styles.assetFileInput} onChange={(event) => choosePrimary(event.target.files?.[0])} type="file" /><small>Needed before publishing — drafts can wait. It shows up in the live preview instantly.</small></label></div>
              <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Description <small>Optional</small></span><input className={styles.input} onChange={(event) => setDescription(event.target.value)} value={description} /></label>
              {draft.configurationFields.length > 0 && <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Sample name for the preview</span><input className={styles.input} onChange={(event) => setSampleText(event.target.value)} value={sampleText} /><small>Only for the live preview — customers type their own.</small></label>}
              <details className={styles.quickListAdvancedDetails}><summary>Advanced details</summary>
                <div className={styles.quickListSku}><span>SKU <strong>{sku}</strong></span><button className={styles.buttonGhost} onClick={() => setSkuEdited((current) => !current)} type="button">{skuEdited ? "Auto" : "Edit"}</button>{skuEdited && <input aria-label="SKU" className={styles.input} onChange={(event) => setSku(event.target.value)} value={sku} />}</div>
                {reusePhotoChoice}
                <div className={styles.assetPicker}><div className={styles.assetPreview}>{basePreview ? <img alt="Base image preview" src={basePreview} /> : <FileImage size={20} />}</div><label className={styles.fieldGroup}><span className={styles.fieldLabel}>Different canvas background <small>Optional</small></span><input accept="image/jpeg,image/png,image/webp" className={styles.assetFileInput} onChange={(event) => chooseBase(event.target.files?.[0])} type="file" /><small>{reusePhotoAsBase ? "The product photo is reused automatically — add one only to override it." : "Shown underneath customer text and photo layers."}</small></label></div>
              </details>
            </div>
            <ListingPreviewCard basePreview={basePreview} categoryName={selectedCategoryName} fieldCount={draft.configurationFields.length} name={name} photoUrl={primaryPreview} price={price} sampleText={sampleText} surface={primarySurface} />
          </div>}
          {step === 3 && <div className={styles.quickListContent}>
            <div className={styles.quickListForm}>
              <div className={styles.quickListSummaryCard}><div className={styles.quickListSummaryPhoto}>{primaryPreview ? <img alt="Product photo" src={primaryPreview} /> : <FileImage size={18} />}</div><div><strong>{name.trim() || "Unnamed product"}</strong><small>{[selectedCategoryName, previewPrice(price) || "no price yet", draft.configurationFields.length ? `${draft.configurationFields.length} customize field${draft.configurationFields.length === 1 ? "" : "s"}` : "", starterMode !== "blank" && draft.name ? draft.name : ""].filter(Boolean).join(" · ")}</small></div></div>
              {publishChoice}
              {builtin3DAvailable && <label className={styles.quickListReuseChoice}><input checked={enable3D} onChange={(event) => setEnable3D(event.target.checked)} type="checkbox" /> Show a 3D preview on the product page</label>}
              {recipe?.threeDPath === "template" && <p className={styles.quickListHintLine}>Packaging gets its 3D preview from a photo — use <strong>Create 3D preview</strong> after saving.</p>}
              {pendingOptionLabels.length > 0 && <p className={styles.quickListHintLine}>Needs your print options once: {pendingOptionLabels.join(", ")}. Add them in the advanced editor — customers won&apos;t see those choices until you do.</p>}
              {readinessChecklist}
              {savedProduct && !success && <button className={styles.buttonSecondary} disabled={reusingPhoto} onClick={() => void reusePhotoForBase()} type="button">{reusingPhoto ? <LoaderCircle className={styles.studioSpin} size={13} /> : <FileImage size={13} />} Use this product&apos;s photo</button>}
              <div className={styles.quickListSequence} aria-live="polite">{[["1", "saving draft", saveStatus], ["2", "uploading images", uploadStatus], ["3", publishNow ? "attaching and publishing" : "attaching", attachStatus]].map(([number, label, status]) => <span className={styles[`quickListSequence${String(status)[0].toUpperCase()}${String(status).slice(1)}` as "quickListSequenceWaiting"]} key={String(number)}>{number}) {label} {status === "done" ? "✓" : status === "working" ? "…" : status === "failed" ? "×" : status === "skipped" ? "skipped" : ""}</span>)}</div>
              {error && <p className={styles.formError} role="alert">{error}</p>}
              {success ? <div className={styles.quickListSuccess}><strong>{publishNow ? "Product published" : "Draft saved"}</strong><p>/products/{savedProduct.slug}</p><span className={styles.quickListSuccessActions}><a className={styles.buttonPrimary} href={`/products/${savedProduct.slug}`} onClick={() => void onSaved(savedProduct.id)} rel="noreferrer" target="_blank">See it live</a><button className={styles.buttonSecondary} onClick={continueFullDetails} type="button">Open advanced editor</button>{recipe?.threeDPath === "template" ? <button className={styles.buttonSecondary} disabled={creating3D || Boolean(created3DModel)} onClick={() => void createQuick3D(savedProduct.id)} type="button">{creating3D ? <LoaderCircle className={styles.studioSpin} size={13} /> : null} {created3DModel ? `3D preview ready (${created3DModel})` : creating3D ? "Creating 3D preview…" : "Create 3D preview"}</button> : <button className={styles.buttonSecondary} onClick={() => void onOpenStudio(savedProduct.id)} type="button">Open 3D studio</button>}</span>{created3DNote && <p className={styles.quickListHintLine}>{created3DNote}</p>}{three3DError && <p className={styles.formError} role="alert">{three3DError}</p>}</div> : <button className={styles.buttonPrimary} disabled={saveStatus === "working" || uploadStatus === "working" || attachStatus === "working" || (publishNow && (!hasPrimaryPhoto || !readiness.canPublish))} onClick={() => void save()} type="button">{saveStatus === "working" || uploadStatus === "working" || attachStatus === "working" ? "Saving…" : (saveStatus === "failed" || uploadStatus === "failed" || attachStatus === "failed") ? "Retry failed step" : publishNow ? "Save and publish" : "Save draft"}</button>}
            </div>
            <ListingPreviewCard basePreview={basePreview} categoryName={selectedCategoryName} fieldCount={draft.configurationFields.length} name={name} photoUrl={primaryPreview} price={price} sampleText={sampleText} surface={primarySurface} />
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
                return <p className={notApplicable || item.ready ? styles.quickListReady : styles.quickListNotReady} key={item.id}><span>{notApplicable || item.ready ? <Check size={13} /> : "×"}</span><span><strong>{readinessLabels[item.id]}</strong>{notApplicable ? " — not applicable" : item.ready ? "" : ` — ${item.message}`}{!notApplicable && !item.blocking && !item.ready ? " (hint)" : ""}</span></p>;
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
