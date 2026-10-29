"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Archive,
  ChevronDown,
  ChevronUp,
  Download,
  MoreHorizontal,
  Package,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { products as initialProducts, inr, type AdminProduct } from "./admin-data";
import { Card, PageHeader, StatusBadge, statusTone } from "./AdminUI";
import { ProductArtworkPolicyEditor } from "./ProductArtworkPolicyEditor";
import { ProductListThumb } from "./ProductListThumb";
import { ProductVisualizationStudio } from "./ProductVisualizationStudio";
import { QuickListProductWizard } from "./QuickListProductWizard";
import { createRanBazaarStarterDraft } from "@/lib/admin-quick-list";
import { buildDefaultAdminArtworkPolicy, reconcileAdminArtworkPolicy } from "@/lib/admin-artwork-policy";
import {
  ezpacIndustryCollectionCategorySlug,
  getEzpacPackagingFieldsForProductType,
  getEzpacPackagingProductType,
  isEzpacPackagingProductType,
  listEzpacIndustryCollections,
  listEzpacPackagingCategories,
  listEzpacPackagingProductTypes,
} from "@/lib/ezpac-packaging-presets";
import { listRanBazaarCategoryGroups } from "@/lib/ranbazaar-category-presets";
import {
  listRanBazaarCustomizationStarters,
} from "@/lib/ranbazaar-customization-presets";
import type { ProductArtworkPolicy } from "@/lib/types";
import styles from "./admin.module.css";

type CategoryRecord = { id: string; slug: string; name: string; parentId: string | null; description?: string | null; imageUrl?: string | null; isActive?: boolean; sortOrder: number };
type ConfigurationFieldInput = {
  id: string;
  key: string;
  label: string;
  inputType: "text" | "select" | "color" | "number";
  required: boolean;
  options: string;
  priceDelta: string;
  minLength: string;
  maxLength: string;
  allowedPattern: string;
  minValue: string;
  maxValue: string;
  step: string;
  placeholder: string;
  helpText: string;
  defaultValue: string;
  unit: string;
  enabled: boolean;
  customerVisible: boolean;
  visibleWhenFieldId: string;
  visibleWhenEquals: string;
};
type PrintAreaInput = { id: string; label: string; widthMm: string; heightMm: string; safeInsetMm: string };
type QuantityTierInput = { id: string; minimum: string; priceDelta: string; label: string };
type TemplateOption = { id: string; name: string; slug: string; theme: string; thumbnailUrl: string; premiumPrice: number };
type TemplateLinkInput = { templateId: string; isDefault: boolean; sortOrder?: number };
type ProductBaseImage = { id: string; url: string; altText: string | null };
type CatalogResponse = {
  data?: { products?: AdminProduct[]; categories?: CategoryRecord[]; templates?: TemplateOption[] };
  error?: { message?: string };
};
type EditingProduct = {
  id: string;
  name: string;
  sku: string;
  categoryId: string;
  categoryIds: string[];
  productType: string;
  price: number;
  imageUrl: string;
  hasUploadedPrimaryImage?: boolean;
  baseImages?: Record<string, ProductBaseImage>;
  material: string;
  sizes: string[];
  sizeDescription: string;
  features: string[];
  description: string;
  status: string;
  customizable: boolean;
  published: boolean;
  allow2D: boolean;
  allow3D: boolean;
  quantityMin: number;
  quantityMax: number;
  quantityTiers: Array<{ minimum: number; priceDelta: number; label?: string }>;
  setupCharge: number;
  productionDaysMin: number;
  productionDaysMax: number;
  printAreas: Array<{ id: string; label: string; widthMm: number | null; heightMm: number | null; safeInsetMm: number | null }>;
  previewTemplate: string;
  visualizationJobStatus?: "QUEUED" | "PROCESSING" | "NEEDS_CONFIRMATION" | "";
  productModel: string;
  artworkUpload: boolean;
  acceptedArtworkTypes: string[];
  artworkPolicy: ProductArtworkPolicy | null;
  templateLinks: TemplateLinkInput[];
  configurationFields: Array<{ key: string; label: string; inputType: ConfigurationFieldInput["inputType"]; required: boolean; placeholder: string; helpText: string; defaultValue: string; unit: string; enabled: boolean; customerVisible: boolean; visibleWhen: { fieldId: string; equals: string } | null; options: Array<{ label: string; priceDelta?: number }>; priceDelta: number; minLength: number | null; maxLength: number | null; allowedPattern: string; minValue: number | null; maxValue: number | null; step: number | null }>;
};

const artworkMimeTypes = [
  ["image/png", "PNG"],
  ["image/jpeg", "JPG"],
  ["image/webp", "WEBP"],
] as const;

const defaultPrintAreas: PrintAreaInput[] = [{ id: "primary", label: "Primary print area", widthMm: "", heightMm: "", safeInsetMm: "" }];

const packagingProductModels = [
  ['rectangular-box', 'Rectangular box'],
  ['square-box', 'Square box'],
  ['folding-carton', 'Folding carton'],
  ['mailer-box', 'Mailer box'],
  ['paper-bag', 'Paper bag'],
  ['stand-up-pouch', 'Stand-up pouch'],
  ['product-sleeve', 'Product sleeve'],
] as const;

function policyPrintAreas(areas: PrintAreaInput[]) {
  return areas.map((area, index) => ({
    id: safeKey(area.id, `surface-${index + 1}`),
    label: area.label.trim() || `Surface ${index + 1}`,
    widthMm: optionalNumber(area.widthMm),
    heightMm: optionalNumber(area.heightMm),
    safeInsetMm: optionalNumber(area.safeInsetMm),
  }));
}

function safeKey(value: string, fallback: string) {
  const key = value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return key && /^[a-z]/.test(key) ? key.slice(0, 80) : fallback;
}

function optionalNumber(value: string) {
  const trimmed = value.trim();
  return trimmed ? Number(trimmed) : null;
}

function parseFieldOptions(value: string) {
  return value.split(",").map((entry) => entry.trim()).filter(Boolean).map((entry) => {
    const [rawLabel, rawDelta] = entry.split("|").map((part) => part.trim());
    const priceDelta = rawDelta ? Number(rawDelta) : 0;
    if (!rawLabel || !Number.isFinite(priceDelta)) throw new Error("Select options must use “Option label|price adjustment”, separated by commas.");
    return { label: rawLabel, value: safeKey(rawLabel, "option"), priceDelta };
  });
}

function emptyConfigurationField(id: string, key: string): ConfigurationFieldInput {
  return { id, key, label: "", inputType: "select", required: false, options: "", priceDelta: "0", minLength: "", maxLength: "", allowedPattern: "", minValue: "", maxValue: "", step: "", placeholder: "", helpText: "", defaultValue: "", unit: "", enabled: true, customerVisible: true, visibleWhenFieldId: "", visibleWhenEquals: "" };
}

function categoryPath(category: CategoryRecord, records: CategoryRecord[]) {
  const byId = new Map(records.map((item) => [item.id, item]));
  const names = [category.name];
  const seen = new Set([category.id]);
  let current = category;
  while (current.parentId && !seen.has(current.parentId)) {
    const parent = byId.get(current.parentId);
    if (!parent) break;
    names.unshift(parent.name);
    seen.add(parent.id);
    current = parent;
  }
  return names.join(" · ");
}

export function ProductsPanel() {
  const [catalog, setCatalog] = useState<AdminProduct[]>(initialProducts);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All categories");
  const [adding, setAdding] = useState(false);
  const [quickAdding, setQuickAdding] = useState(false);
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [visualizationOpen, setVisualizationOpen] = useState(false);
  const [categoryRecords, setCategoryRecords] = useState<CategoryRecord[]>([]);
  const [templateOptions, setTemplateOptions] = useState<TemplateOption[]>([]);
  const [productCategoryId, setProductCategoryId] = useState("");
  const [productCategoryIds, setProductCategoryIds] = useState<string[]>([]);
  const [productType, setProductType] = useState("");
  const [customizationStarterId, setCustomizationStarterId] = useState("");
  const [templateLinks, setTemplateLinks] = useState<TemplateLinkInput[]>([]);
  const [configurationFields, setConfigurationFields] = useState<ConfigurationFieldInput[]>([]);
  const [printAreas, setPrintAreas] = useState<PrintAreaInput[]>(defaultPrintAreas);
  const [quantityTiers, setQuantityTiers] = useState<QuantityTierInput[]>([]);
  const [acceptedArtworkTypes, setAcceptedArtworkTypes] = useState<string[]>(["image/png", "image/jpeg"]);
  const [artworkUploadEnabled, setArtworkUploadEnabled] = useState(false);
  const [artworkPolicy, setArtworkPolicy] = useState<ProductArtworkPolicy>(() =>
    buildDefaultAdminArtworkPolicy(policyPrintAreas(defaultPrintAreas), {
      uploadsEnabled: false,
      allowedMimeTypes: ["image/png", "image/jpeg"],
    }));
  const [editingProduct, setEditingProduct] = useState<EditingProduct | null>(null);
  const [productImageUrl, setProductImageUrl] = useState("");
  const [productImagePreview, setProductImagePreview] = useState("");
  const [pendingProductImage, setPendingProductImage] = useState<File | null>(null);
  const [surfaceBaseImages, setSurfaceBaseImages] = useState<Record<string, ProductBaseImage>>({});
  const [surfaceBasePreviews, setSurfaceBasePreviews] = useState<Record<string, string>>({});
  const [pendingSurfaceBaseImages, setPendingSurfaceBaseImages] = useState<Record<string, File>>({});
  const [pendingProductId, setPendingProductId] = useState<string | null>(null);
  const objectUrls = useRef(new Set<string>());
  const [managingCategories, setManagingCategories] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogLoadError, setCatalogLoadError] = useState("");
  const [categoryImportMessage, setCategoryImportMessage] = useState("");
  const packagingCategoryStarters = useMemo(() => listEzpacPackagingCategories(), []);
  const packagingIndustryCollections = useMemo(() => listEzpacIndustryCollections(), []);
  const ranBazaarCategoryStarters = useMemo(() => listRanBazaarCategoryGroups(), []);
  const ranBazaarCustomizationStarters = useMemo(
    () => listRanBazaarCustomizationStarters(),
    [],
  );
  const packagingProductTypeStarters = useMemo(() => listEzpacPackagingProductTypes(), []);
  const packagingProductSelected = isEzpacPackagingProductType(productType);
  const packaging3DActivated = packagingProductSelected && editingProduct?.allow3D === true;
  const packaging3DUnavailable = packagingProductSelected && !packaging3DActivated;

  useEffect(() => () => {
    objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  function previewFile(file: File) {
    const url = URL.createObjectURL(file);
    objectUrls.current.add(url);
    return url;
  }

  function clearImageDrafts() {
    objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrls.current.clear();
    setProductImageUrl("");
    setProductImagePreview("");
    setPendingProductImage(null);
    setSurfaceBaseImages({});
    setSurfaceBasePreviews({});
    setPendingSurfaceBaseImages({});
    setPendingProductId(null);
  }

  async function loadCatalog() {
    setCatalogLoading(true);
    setCatalogLoadError("");
    try {
      const response = await fetch("/api/admin/catalog", { cache: "no-store" });
      const payload = await response.json().catch(() => undefined) as CatalogResponse | undefined;
      if (!response.ok) throw new Error(payload?.error?.message || "Could not load the live catalog.");
      if (!Array.isArray(payload?.data?.products) || !Array.isArray(payload.data.categories)) {
        throw new Error("The live catalog response is incomplete. Please try again.");
      }
      setCatalog(payload.data.products);
      setCategoryRecords(payload.data.categories.map((item) => ({ id: item.id, slug: item.slug, name: item.name, parentId: item.parentId ?? null, description: item.description, imageUrl: item.imageUrl, isActive: item.isActive, sortOrder: item.sortOrder })));
      setTemplateOptions(Array.isArray(payload.data.templates) ? payload.data.templates : []);
    } catch (cause) {
      setCatalog([]);
      setCategoryRecords([]);
      setTemplateOptions([]);
      const message = cause instanceof Error ? cause.message : "Could not load the live catalog.";
      setCatalogLoadError(message);
      throw cause;
    } finally {
      setCatalogLoading(false);
    }
  }

  async function refreshEditingProductPreviewState() {
    const productId = editingProduct?.id;
    if (!productId) return;
    const response = await fetch(`/api/admin/catalog?productId=${encodeURIComponent(productId)}`, { cache: 'no-store' });
    const payload = await response.json() as { data?: { product?: EditingProduct }; error?: { message?: string } };
    const product = payload.data?.product;
    if (!response.ok || !product) throw new Error(payload.error?.message || 'Could not refresh this product preview state.');
    setEditingProduct((current) => current?.id === productId ? {
      ...current,
      allow3D: product.allow3D,
      productModel: product.productModel,
      previewTemplate: product.previewTemplate,
    } : current);
    await loadCatalog();
  }

  useEffect(() => { loadCatalog().catch(() => undefined); }, []);

  useEffect(() => {
    if (!adding) setCustomizationStarterId("");
  }, [adding]);

  useEffect(() => {
    setArtworkPolicy((current) => reconcileAdminArtworkPolicy(
      current,
      policyPrintAreas(printAreas),
      { uploadsEnabled: artworkUploadEnabled, allowedMimeTypes: acceptedArtworkTypes },
    ));
  }, [acceptedArtworkTypes, artworkUploadEnabled, printAreas]);

  async function uploadProductImage(productId: string, kind: "primary" | "surface-base", file: File, surfaceId?: string) {
    const form = new FormData();
    form.set("productId", productId);
    form.set("kind", kind);
    if (surfaceId) form.set("surfaceId", surfaceId);
    form.set("image", file);
    const response = await fetch("/api/admin/catalog/images", { method: "POST", body: form });
    const payload = await response.json().catch(() => null) as {
      data?: { asset?: ProductBaseImage & { url: string } };
      error?: { message?: string };
    } | null;
    const asset = payload?.data?.asset;
    if (!response.ok || !asset) throw new Error(payload?.error?.message || "The image could not be uploaded.");
    return asset;
  }

  async function uploadExistingPrimary(file: File) {
    if (!editingProduct) return;
    setSaving(true);
    setError("");
    try {
      const asset = await uploadProductImage(editingProduct.id, "primary", file);
      setProductImageUrl(asset.url);
      setProductImagePreview((current) => current.startsWith("blob:") ? current : asset.url);
      setPendingProductImage(null);
      await loadCatalog();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The product image could not be uploaded.");
    } finally {
      setSaving(false);
    }
  }

  async function uploadExistingSurfaceBase(surfaceId: string, file: File) {
    if (!editingProduct) return;
    setSaving(true);
    setError("");
    try {
      const asset = await uploadProductImage(editingProduct.id, "surface-base", file, surfaceId);
      setSurfaceBaseImages((current) => ({ ...current, [surfaceId]: asset }));
      setSurfaceBasePreviews((current) => ({
        ...current,
        [surfaceId]: current[surfaceId]?.startsWith("blob:") ? current[surfaceId] : asset.url,
      }));
      setPendingSurfaceBaseImages((current) => {
        const { [surfaceId]: _uploaded, ...remaining } = current;
        return remaining;
      });
      await loadCatalog();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The base image could not be uploaded.");
    } finally {
      setSaving(false);
    }
  }

  async function reuseExistingPrimaryAsBase(surfaceId: string) {
    if (!editingProduct) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/admin/catalog/images/from-source", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: editingProduct.id, surfaceId, source: "primary" }),
      });
      const payload = await response.json().catch(() => null) as { data?: { asset?: ProductBaseImage }; error?: { message?: string } } | null;
      const asset = payload?.data?.asset;
      if (!response.ok || !asset) throw new Error(payload?.error?.message || "The product photo could not be reused.");
      setSurfaceBaseImages((current) => ({ ...current, [surfaceId]: asset }));
      setSurfaceBasePreviews((current) => ({ ...current, [surfaceId]: asset.url }));
      await loadCatalog();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The product photo could not be reused.");
    } finally { setSaving(false); }
  }

  async function removeSurfaceBase(surfaceId: string) {
    const asset = surfaceBaseImages[surfaceId];
    if (!asset) {
      setPendingSurfaceBaseImages((current) => {
        const { [surfaceId]: _removed, ...remaining } = current;
        return remaining;
      });
      setSurfaceBasePreviews((current) => {
        const { [surfaceId]: _removed, ...remaining } = current;
        return remaining;
      });
      return;
    }
    if (!editingProduct) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/admin/catalog/images", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: editingProduct.id, assetId: asset.id }),
      });
      const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      if (!response.ok) throw new Error(payload?.error?.message || "The base image could not be removed.");
      setSurfaceBaseImages((current) => {
        const { [surfaceId]: _removed, ...remaining } = current;
        return remaining;
      });
      setSurfaceBasePreviews((current) => {
        const { [surfaceId]: _removed, ...remaining } = current;
        return remaining;
      });
      await loadCatalog();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The base image could not be removed.");
    } finally {
      setSaving(false);
    }
  }

  function changePrintAreaId(index: number, value: string) {
    const previousId = printAreas[index]?.id ?? "";
    const nextId = safeKey(value, previousId || `surface-${index + 1}`);
    setPrintAreas((current) => current.map((area, areaIndex) =>
      areaIndex === index ? { ...area, id: nextId } : area,
    ));
    if (!previousId || previousId === nextId) return;
    setPendingSurfaceBaseImages((current) => {
      const pending = current[previousId];
      if (!pending) return current;
      const { [previousId]: _moved, ...remaining } = current;
      return { ...remaining, [nextId]: pending };
    });
    setSurfaceBasePreviews((current) => {
      const preview = current[previousId];
      if (!preview) return current;
      const { [previousId]: _moved, ...remaining } = current;
      return { ...remaining, [nextId]: preview };
    });
    // Persisted base-image ownership stays with its original surface. The catalog PATCH
    // drops that old metadata pointer; only a newly selected image may follow a rename.
    setSurfaceBaseImages((current) => {
      const { [previousId]: _removed, ...remaining } = current;
      return remaining;
    });
  }

  function removePrintArea(index: number) {
    const surfaceId = printAreas[index]?.id;
    setPrintAreas((current) => current.filter((_, areaIndex) => areaIndex !== index));
    if (!surfaceId) return;
    setPendingSurfaceBaseImages((current) => {
      const { [surfaceId]: _removed, ...remaining } = current;
      return remaining;
    });
    setSurfaceBasePreviews((current) => {
      const { [surfaceId]: _removed, ...remaining } = current;
      return remaining;
    });
    setSurfaceBaseImages((current) => {
      const { [surfaceId]: _removed, ...remaining } = current;
      return remaining;
    });
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return catalog.filter((product) =>
      (!needle || [product.name, product.category, product.sku].some((value) => value.toLowerCase().includes(needle))) &&
      // The API emits Active, Draft, and Archived; legacy static data can still include Low stock.
      (category === "All categories" || product.category === category) &&
      (statusFilter === "All statuses" || product.status === statusFilter),
    );
  }, [catalog, query, category, statusFilter]);

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSaving(true); setError("");
    try {
      const submittedPrintAreas = policyPrintAreas(printAreas);
      const submittedArtworkPolicy = reconcileAdminArtworkPolicy(artworkPolicy, submittedPrintAreas, {
        uploadsEnabled: artworkUploadEnabled,
        allowedMimeTypes: acceptedArtworkTypes,
      });
      let productId = editingProduct?.id ?? pendingProductId;
      const requestedPublished = data.get("published") === "on";
      const queuedSurfaceImages = Object.entries(pendingSurfaceBaseImages)
        .filter(([surfaceId]) => submittedPrintAreas.some((area) => area.id === surfaceId));
      const hasQueuedImages = Boolean(pendingProductImage || queuedSurfaceImages.length);
      const enteredImageUrl = productImageUrl.trim();
      if (!enteredImageUrl && !pendingProductImage) {
        throw new Error("Choose a product image or enter an image URL.");
      }
      const initialImageUrl = pendingProductImage ? "/api/product-images/pending" : enteredImageUrl;
      const requestBody = {
        type: "product",
        ...(productId ? { id: productId } : {}),
        name: String(data.get("name")),
        sku: String(data.get("sku")),
        categoryId: productCategoryId,
        categoryIds: [productCategoryId, ...productCategoryIds.filter((id) => id !== productCategoryId)],
        productType: productType || undefined,
        price: Number(data.get("price")),
        imageUrl: initialImageUrl,
        material: String(data.get("material") || ""),
        sizes: String(data.get("sizes") || "").split(",").map((value) => value.trim()).filter(Boolean),
        sizeDescription: String(data.get("sizeDescription") || ""),
        features: String(data.get("features") || "").split(",").map((value) => value.trim()).filter(Boolean),
        description: String(data.get("description") || ""),
        configurationFields: configurationFields.map((field, index) => ({ key: safeKey(field.key, `attribute-${index + 1}`), label: field.label.trim(), inputType: field.inputType, required: field.required, placeholder: field.placeholder.trim() || null, helpText: field.helpText.trim() || null, defaultValue: field.defaultValue || null, unit: field.unit.trim() || null, enabled: field.enabled, customerVisible: field.customerVisible, visibleWhen: field.visibleWhenFieldId ? { fieldId: safeKey(field.visibleWhenFieldId, field.visibleWhenFieldId), equals: field.visibleWhenEquals } : null, minLength: optionalNumber(field.minLength), maxLength: optionalNumber(field.maxLength), allowedPattern: field.inputType === "text" ? field.allowedPattern.trim() || null : null, minValue: optionalNumber(field.minValue), maxValue: optionalNumber(field.maxValue), step: optionalNumber(field.step), priceDelta: optionalNumber(field.priceDelta) ?? 0, options: field.inputType === "select" ? parseFieldOptions(field.options) : [] })),
        templateLinks: templateLinks.map(({ templateId, isDefault }) => ({ templateId, isDefault })),
        printAreas: submittedPrintAreas,
        previewTemplate: String(data.get("previewTemplate") || "").trim() || undefined,
        productModel: String(data.get("productModel") || "").trim() || undefined,
        artworkUpload: artworkUploadEnabled,
        acceptedArtworkTypes,
        artworkPolicy: submittedArtworkPolicy,
        customizable: data.get("personalized") === "on",
        published: hasQueuedImages && !editingProduct ? false : requestedPublished,
        allow2D: data.get("allow2D") === "on",
        allow3D: data.get("allow3D") === "on",
        quantityMin: Number(data.get("quantityMin") || 1),
        quantityMax: Number(data.get("quantityMax") || 100),
        quantityTiers: quantityTiers.map((tier) => ({ minimum: Number(tier.minimum), priceDelta: optionalNumber(tier.priceDelta) ?? 0, label: tier.label.trim() || undefined })),
        setupCharge: Number(data.get("setupCharge") || 0),
        productionDaysMin: Number(data.get("productionDaysMin") || 0),
        productionDaysMax: Number(data.get("productionDaysMax") || 0),
      };
      const response = await fetch("/api/admin/catalog", { method: productId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestBody) });
      const responsePayload = await response.json();
      if (!response.ok) throw new Error(responsePayload.error?.message || "Could not save product.");
      productId = productId ?? responsePayload.data?.id;
      if (!productId || typeof productId !== "string") throw new Error("The saved product is missing its ID.");
      setPendingProductId(productId);

      let finalImageUrl = initialImageUrl;
      if (pendingProductImage) {
        const uploaded = await uploadProductImage(productId, "primary", pendingProductImage);
        finalImageUrl = uploaded.url;
        setProductImageUrl(uploaded.url);
        setProductImagePreview((current) => current.startsWith("blob:") ? current : uploaded.url);
        setPendingProductImage(null);
      }
      for (const [surfaceId, file] of queuedSurfaceImages) {
        const uploaded = await uploadProductImage(productId, "surface-base", file, surfaceId);
        setSurfaceBaseImages((current) => ({ ...current, [surfaceId]: uploaded }));
        setSurfaceBasePreviews((current) => ({
          ...current,
          [surfaceId]: current[surfaceId]?.startsWith("blob:") ? current[surfaceId] : uploaded.url,
        }));
        setPendingSurfaceBaseImages((current) => {
          const { [surfaceId]: _uploaded, ...remaining } = current;
          return remaining;
        });
      }
      if (hasQueuedImages) {
        const patchResponse = await fetch("/api/admin/catalog", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...requestBody, id: productId, imageUrl: finalImageUrl, published: requestedPublished }),
        });
        const patchPayload = await patchResponse.json();
        if (!patchResponse.ok) throw new Error(patchPayload.error?.message || "The uploaded images could not be attached.");
      }
      await loadCatalog();
      const shouldOpenVisualization = !editingProduct && data.get("openVisualization") === "on";
      if (shouldOpenVisualization) {
        setVisualizationOpen(true);
        await editProduct(productId);
        return;
      }
      setAdding(false); setEditingProduct(null); setProductCategoryId(""); setProductCategoryIds([]); setProductType(""); setTemplateLinks([]); setConfigurationFields([]); setPrintAreas(defaultPrintAreas); setQuantityTiers([]); setArtworkUploadEnabled(false); setAcceptedArtworkTypes(["image/png", "image/jpeg"]); setArtworkPolicy(buildDefaultAdminArtworkPolicy(policyPrintAreas(defaultPrintAreas), { uploadsEnabled: false, allowedMimeTypes: ["image/png", "image/jpeg"] })); clearImageDrafts();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save product."); } finally { setSaving(false); }
  }

  function applyProductTypeStarter(productTypeId: string) {
    const starter = getEzpacPackagingProductType(productTypeId);
    if (!starter) return;
    const fields = getEzpacPackagingFieldsForProductType(productTypeId);
    setConfigurationFields(fields.map((field, index) => ({
      ...emptyConfigurationField(`starter-${productTypeId}-${index}`, field.key),
      key: field.key,
      label: field.label,
      inputType: field.inputType,
      required: field.required,
      options: field.options?.map((option) => `${option.label}${option.priceDelta ? `|${option.priceDelta}` : ""}`).join(", ") ?? "",
      placeholder: field.placeholder ?? "",
      helpText: field.helpText ?? (field.optionSource === "admin_configured" ? "Configure supported choices, then enable this field for customers." : ""),
      minLength: field.minLength?.toString() ?? "",
      maxLength: field.maxLength?.toString() ?? "",
      minValue: field.minValue?.toString() ?? "",
      maxValue: field.maxValue?.toString() ?? "",
      step: field.step?.toString() ?? "",
      enabled: field.optionSource !== "admin_configured",
      customerVisible: field.optionSource !== "admin_configured",
    })));
    const matchingCategory = categoryRecords.find((category) => category.slug === starter.primarySubcategoryId);
    const missingCollectionNames: string[] = [];
    const matchingCollectionCategoryIds = starter.collectionIds.flatMap((collectionId) => {
      const category = categoryRecords.find(
        (record) => record.slug === ezpacIndustryCollectionCategorySlug(collectionId),
      );
      if (category) return [category.id];
      missingCollectionNames.push(
        packagingIndustryCollections.find((collection) => collection.id === collectionId)?.name
          ?? collectionId,
      );
      return [];
    });
    if (matchingCategory) {
      setProductCategoryId(matchingCategory.id);
      setProductCategoryIds((current) => [
        ...new Set([
          ...current.filter((categoryId) => categoryId !== matchingCategory.id),
          ...matchingCollectionCategoryIds,
        ]),
      ]);
      setError(missingCollectionNames.length
        ? `Starter fields and the primary category were applied. Add the Industry Collections packaging starter to also list this product in: ${missingCollectionNames.join(", ")}.`
        : "");
    } else {
      const missingCollections = missingCollectionNames.length
        ? " and the Industry Collections packaging starter"
        : "";
      setError(`Starter fields were applied. Add the ${starter.primaryCategoryId} packaging starter${missingCollections} first, then this product type will map to all of its suggested categories.`);
    }
  }

  function applyRanBazaarCustomizationStarter(starterId: string) {
    const starter = createRanBazaarStarterDraft(starterId);
    if (!starter) return;
    setConfigurationFields(starter.configurationFields.map((field, index) => ({
      ...emptyConfigurationField(`ranbazaar-${starter.id}-${index}`, field.key),
      key: field.key, label: field.label, inputType: field.inputType, required: field.required,
      options: field.options.map((option) => option.label).join(", "),
      minLength: field.minLength?.toString() ?? "", maxLength: field.maxLength?.toString() ?? "",
      allowedPattern: field.allowedPattern, placeholder: field.placeholder, helpText: field.helpText,
      defaultValue: field.defaultValue, enabled: field.enabled, customerVisible: field.customerVisible,
    })));
    setPrintAreas(starter.printAreas.map((area) => ({
      id: area.id, label: area.label, widthMm: area.widthMm?.toString() ?? "",
      heightMm: area.heightMm?.toString() ?? "", safeInsetMm: area.safeInsetMm?.toString() ?? "",
    })));
    setArtworkUploadEnabled(starter.artworkUpload);
    setAcceptedArtworkTypes(starter.acceptedArtworkTypes);
    setArtworkPolicy(starter.artworkPolicy);
    setError("");
  }

  function moveConfigurationField(fieldId: string, direction: -1 | 1) {
    setConfigurationFields((current) => {
      const index = current.findIndex((field) => field.id === fieldId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function toggleTemplateLink(templateId: string, linked: boolean) {
    setTemplateLinks((current) => {
      if (linked) {
        if (current.some((item) => item.templateId === templateId)) return current;
        return [...current, { templateId, isDefault: current.length === 0 }];
      }
      const next = current.filter((item) => item.templateId !== templateId);
      return next.some((item) => item.isDefault) || !next.length
        ? next
        : next.map((item, index) => ({ ...item, isDefault: index === 0 }));
    });
  }

  function makeDefaultTemplate(templateId: string) {
    setTemplateLinks((current) => current.map((item) => ({ ...item, isDefault: item.templateId === templateId })));
  }

  async function importPackagingCategoryStarters(presetIds: string[], label: string) {
    if (!presetIds.length) return;
    if (!window.confirm(`Add any missing ${label} categories and subcategories? Existing categories, products, prices, and orders will not be changed.`)) return;
    setSaving(true);
    setError("");
    setCategoryImportMessage("");
    try {
      const response = await fetch("/api/admin/catalog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "category-preset-import", source: "ezpac-packaging", presetIds }) });
      const payload = await response.json() as { data?: { created: string[]; reused: string[]; conflicts: string[] }; error?: { message?: string } };
      if (!response.ok || !payload.data) throw new Error(payload.error?.message || "Could not add the packaging categories.");
      const details = [`${payload.data.created.length} added`, `${payload.data.reused.length} already present`];
      if (payload.data.conflicts.length) details.push(`${payload.data.conflicts.length} need review`);
      setCategoryImportMessage(`${label}: ${details.join(" · ")}.`);
      await loadCatalog();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add the packaging categories.");
    } finally {
      setSaving(false);
    }
  }

  async function importRanBazaarCategoryStarters(presetIds: string[], label: string) {
    if (!presetIds.length) return;
    if (!window.confirm(`Map ${label} to existing categories and add only missing category records? No products will be created or duplicated.`)) return;
    setSaving(true);
    setError("");
    setCategoryImportMessage("");
    try {
      const response = await fetch("/api/admin/catalog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "category-preset-import", source: "ranbazaar", presetIds }) });
      const payload = await response.json() as { data?: { created: string[]; reused: string[]; conflicts: string[]; entrypoints: Array<{ name: string; href: string }> }; error?: { message?: string } };
      if (!response.ok || !payload.data) throw new Error(payload.error?.message || "Could not import the RanBazaar categories.");
      const details = [`${payload.data.created.length} added`, `${payload.data.reused.length} mapped`];
      if (payload.data.entrypoints.length) details.push(`${payload.data.entrypoints.length} browsing entrypoint`);
      if (payload.data.conflicts.length) details.push(`${payload.data.conflicts.length} need review`);
      setCategoryImportMessage(`${label}: ${details.join(" · ")}.`);
      await loadCatalog();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not import the RanBazaar categories.");
    } finally {
      setSaving(false);
    }
  }

  async function addCategory(parentRequired = false) {
    const name = window.prompt(parentRequired ? "Subcategory name" : "Top-level category name");
    if (!name?.trim()) return;
    const parentChoices = categoryRecords.filter((category) => !category.parentId);
    const parentName = parentRequired
      ? window.prompt(`Parent category (required). Available: ${parentChoices.map((category) => categoryPath(category, categoryRecords)).join(", ") || "none"}`)?.trim()
      : undefined;
    if (parentRequired && !parentName) { setError("Select a parent category before creating a subcategory."); return; }
    const parentId = parentName ? parentChoices.find((category) => categoryPath(category, categoryRecords).toLowerCase() === parentName.toLowerCase())?.id : undefined;
    if (parentName && !parentId) { setError("Parent category was not found. Create it first or leave the parent blank."); return; }
    const response = await fetch("/api/admin/catalog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "category", name: name.trim(), parentId }) });
    const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    if (response.ok) await loadCatalog(); else setError(payload?.error?.message || "Could not create the category.");
  }

  async function editProduct(productId: string) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/catalog?productId=${encodeURIComponent(productId)}`, { cache: "no-store" });
      const payload = await response.json() as { data?: { product?: EditingProduct }; error?: { message?: string } };
      const product = payload.data?.product;
      if (!response.ok || !product) throw new Error(payload.error?.message || "Could not load this product.");
      clearImageDrafts();
      setEditingProduct(product);
      setProductImageUrl(product.imageUrl);
      setProductImagePreview(product.published ? product.imageUrl : "");
      setPendingProductImage(null);
      setSurfaceBaseImages(product.baseImages ?? {});
      setSurfaceBasePreviews(product.published
        ? Object.fromEntries(Object.entries(product.baseImages ?? {}).map(([surfaceId, asset]) => [surfaceId, asset.url]))
        : {});
      setPendingSurfaceBaseImages({});
      setProductCategoryId(product.categoryId);
      setProductCategoryIds((product.categoryIds ?? [product.categoryId]).filter((categoryId) => categoryId !== product.categoryId));
      setProductType(product.productType ?? "");
      setTemplateLinks(product.templateLinks ?? []);
      setConfigurationFields(product.configurationFields.map((field) => ({ id: `${product.id}-${field.key}`, key: field.key, label: field.label, inputType: field.inputType, required: field.required, options: field.options.map((option) => `${option.label}${option.priceDelta ? `|${option.priceDelta}` : ""}`).join(", "), priceDelta: String(field.priceDelta), minLength: field.minLength?.toString() ?? "", maxLength: field.maxLength?.toString() ?? "", allowedPattern: field.allowedPattern ?? "", minValue: field.minValue?.toString() ?? "", maxValue: field.maxValue?.toString() ?? "", step: field.step?.toString() ?? "", placeholder: field.placeholder ?? "", helpText: field.helpText ?? "", defaultValue: field.defaultValue ?? "", unit: field.unit ?? "", enabled: field.enabled !== false, customerVisible: field.customerVisible !== false, visibleWhenFieldId: field.visibleWhen?.fieldId ?? "", visibleWhenEquals: field.visibleWhen?.equals ?? "" })));
      const loadedPrintAreas = (product.printAreas.length ? product.printAreas : [{ id: "primary", label: "Primary print area", widthMm: null, heightMm: null, safeInsetMm: null }]).map((area) => ({ id: area.id, label: area.label, widthMm: area.widthMm?.toString() ?? "", heightMm: area.heightMm?.toString() ?? "", safeInsetMm: area.safeInsetMm?.toString() ?? "" }));
      setPrintAreas(loadedPrintAreas);
      setQuantityTiers(product.quantityTiers.map((tier, index) => ({ id: `${product.id}-tier-${index}`, minimum: String(tier.minimum), priceDelta: String(tier.priceDelta), label: tier.label ?? "" })));
      const loadedArtworkTypes = product.acceptedArtworkTypes.length ? product.acceptedArtworkTypes : ["image/png", "image/jpeg"];
      setAcceptedArtworkTypes(loadedArtworkTypes);
      setArtworkUploadEnabled(product.artworkUpload);
      setArtworkPolicy(product.artworkPolicy ?? buildDefaultAdminArtworkPolicy(policyPrintAreas(loadedPrintAreas), {
        uploadsEnabled: product.artworkUpload,
        allowedMimeTypes: loadedArtworkTypes,
      }));
      setVisualizationOpen((current) => current || product.previewTemplate.startsWith("visualization:") || Boolean(product.visualizationJobStatus));
      setAdding(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load this product."); } finally { setSaving(false); }
  }

  async function saveCategory(category: CategoryRecord) {
    if (!category.name.trim()) { setError("Category names cannot be empty."); return; }
    if (category.parentId === category.id) { setError("A category cannot be its own parent."); return; }
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/admin/catalog", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "category", id: category.id, name: category.name.trim(), parentId: category.parentId, description: category.description?.trim() || null, imageUrl: category.imageUrl?.trim() || null, isActive: category.isActive !== false, sortOrder: category.sortOrder }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || "Could not update the category.");
      await loadCatalog();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update the category."); } finally { setSaving(false); }
  }

  const categories = Array.from(new Set(catalog.map((product) => product.category)));
  const categoryOptions = categoryRecords.map((record) => ({ id: record.id, label: categoryPath(record, categoryRecords) }));
  const industryCollectionRoot = categoryRecords.find((record) => record.slug === "industry-collections");
  const industryCollectionCategoryIds = new Set(categoryRecords
    .filter((record) => record.id === industryCollectionRoot?.id || record.parentId === industryCollectionRoot?.id)
    .map((record) => record.id));
  const primaryCategoryOptions = categoryOptions.filter((option) => !industryCollectionCategoryIds.has(option.id));
  const crossListingCategoryOptions = categoryOptions.filter((option) => option.id !== industryCollectionRoot?.id);
  const activeCount = catalog.filter((product) => product.status === "Active").length;
  const lowCount = catalog.filter((product) => product.status === "Low stock").length;
  const catalogControlsAvailable = !catalogLoading && !catalogLoadError;

  function exportFilteredProducts() {
    const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = "catalog-products.json";
    document.body.append(link); link.click(); link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHeader
        actions={
          <>
            <button className={styles.buttonSecondary} disabled={!catalogControlsAvailable} onClick={exportFilteredProducts} type="button"><Download size={14} /> Export</button>
            <button className={styles.buttonSecondary} disabled={!catalogControlsAvailable} onClick={() => void addCategory(false)} type="button"><Plus size={14} /> Add category</button>
            <button className={styles.buttonSecondary} disabled={!catalogControlsAvailable} onClick={() => void addCategory(true)} type="button"><Plus size={14} /> Add subcategory</button>
            <button className={styles.buttonSecondary} disabled={!catalogControlsAvailable} onClick={() => { setError(""); setManagingCategories(true); }} type="button"><SlidersHorizontal size={14} /> Manage categories</button>
            <button className={styles.buttonSecondary} disabled={!catalogControlsAvailable} onClick={() => { setError(""); setQuickAdding(true); }} type="button"><Sparkles size={14} /> Quick add</button>
            <button className={styles.buttonPrimary} disabled={!catalogControlsAvailable} onClick={() => { setError(""); setVisualizationOpen(false); setEditingProduct(null); setProductCategoryId(""); setProductCategoryIds([]); setProductType(""); setTemplateLinks([]); setConfigurationFields([]); setPrintAreas(defaultPrintAreas); setQuantityTiers([]); setAcceptedArtworkTypes(["image/png", "image/jpeg"]); setArtworkUploadEnabled(false); setArtworkPolicy(buildDefaultAdminArtworkPolicy(policyPrintAreas(defaultPrintAreas), { uploadsEnabled: false, allowedMimeTypes: ["image/png", "image/jpeg"] })); clearImageDrafts(); setAdding(true); }} type="button"><Plus size={14} /> Add product</button>
          </>
        }
        description="Build a clean catalog, control inventory, and connect each personalized product to the right design experience."
        eyebrow="Catalog"
        title="Products"
      />

      {catalogLoadError && (
        <div className={styles.catalogLoadError} role="alert">
          <span><strong>Live catalog unavailable.</strong> {catalogLoadError}</span>
          <button className={styles.buttonSecondary} disabled={catalogLoading} onClick={() => void loadCatalog().catch(() => undefined)} type="button">
            {catalogLoading ? "Retrying…" : "Retry"}
          </button>
        </div>
      )}

      <Card>
        <div className={styles.catalogSummary}>
          <span className={styles.summaryItem}><strong>{catalog.length}</strong> products</span>
          <span className={styles.summaryItem}><strong>{activeCount}</strong> active</span>
          <span className={styles.summaryItem}><strong>{lowCount}</strong> low stock</span>
          <span className={styles.summaryItem}><strong>{categories.length}</strong> categories</span>
        </div>
        <div className={styles.toolbar}>
          <label className={styles.localSearch}>
            <span className={styles.srOnly}>Search products</span>
            <Search size={14} />
            <input className={styles.input} onChange={(event) => setQuery(event.target.value)} placeholder="Search product or SKU" type="search" value={query} />
          </label>
          <select aria-label="Product category" className={styles.select} onChange={(event) => setCategory(event.target.value)} value={category}>
            <option>All categories</option>
            {categories.map((option) => <option key={option}>{option}</option>)}
          </select>
          <select aria-label="Product status" className={styles.select} onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}><option>All statuses</option><option>Active</option><option>Draft</option><option>Archived</option><option>Low stock</option></select>
          <button className={styles.buttonSecondary} onClick={() => setStatusFilter("All statuses")} type="button"><SlidersHorizontal size={13} /> Filters</button>
          <span className={styles.resultCount}>{filtered.length} products</span>
        </div>

        {filtered.length ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Product</th><th>Status</th><th>Inventory</th><th>Price</th><th>Orders</th><th>Personalization</th><th /></tr></thead>
              <tbody>
                {filtered.map((product) => {
                  const stockWidth = Math.min(100, Math.round((product.stock / 130) * 100));
                  return (
                    <tr key={product.id}>
                      <td>
                        <div className={styles.productNameCell}>
                          <ProductListThumb art={product.art} imageUrl={product.imageUrl} name={product.name} />
                          <span className={styles.cellStack}><strong>{product.name}</strong><span>{product.category} · {product.sku}</span></span>
                        </div>
                      </td>
                      <td><span className={styles.quickListChips}><StatusBadge tone={statusTone(product.status)}>{product.status}</StatusBadge>{product.has3DTemplate && <StatusBadge tone="success">3D ✓</StatusBadge>}</span></td>
                      <td>
                        <span className={styles.cellStack}><strong>{product.stock ? `${product.stock} in stock` : "Not tracked"}</strong>
                          <span className={`${styles.stockMeter} ${product.stock < 20 ? styles.stockLow : ""}`}><span style={{ width: `${stockWidth}%` }} /></span>
                        </span>
                      </td>
                      <td><strong>{inr(product.price)}</strong></td>
                      <td>{product.orders}</td>
                      <td>{product.personalized ? <StatusBadge tone="violet">Enabled</StatusBadge> : <StatusBadge>Standard</StatusBadge>}</td>
                      <td><button aria-label={`Configure ${product.name}`} className={styles.buttonGhost} onClick={() => void editProduct(product.id)} type="button"><MoreHorizontal size={15} /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.emptyState}><div><span className={styles.emptyIcon}><Package size={20} /></span><h3>No matching products</h3><p>Try a broader search or clear your category filter.</p></div></div>
        )}
      </Card>

      {managingCategories && (
        <>
          <button aria-label="Close category manager" className={styles.drawerBackdrop} onClick={() => setManagingCategories(false)} type="button" />
          <aside aria-label="Manage categories" className={styles.drawer}>
            <div className={styles.drawerHeader}><div><h3>Manage categories</h3><p>Rename, move, or hide categories and subcategories. Product IDs and existing orders stay unchanged.</p></div><button aria-label="Close" className={styles.iconButton} onClick={() => setManagingCategories(false)} type="button"><X size={16} /></button></div>
            <div className={styles.drawerBody}>
              <div className={styles.detailSection}>
                <p className={styles.sectionCaption}>RanBazaar category starters</p>
                <p className={styles.configHint}>Reuse known Naamly category names and URLs, then add only missing categories. Bulk Buy remains a browsing entrypoint and no products are copied.</p>
                <button
                  className={styles.buttonSecondary}
                  disabled={saving}
                  onClick={() => void importRanBazaarCategoryStarters(ranBazaarCategoryStarters.map((starter) => starter.id), "all RanBazaar category groups")}
                  type="button"
                >
                  Map / add all missing
                </button>
                <div className={styles.configList}>
                  {ranBazaarCategoryStarters.map((starter) => <div className={styles.configCard} key={starter.id}><div className={styles.configCardHead}><strong>{starter.name}</strong><button className={styles.buttonSecondary} disabled={saving} onClick={() => void importRanBazaarCategoryStarters([starter.id], starter.name)} type="button">Map / add missing</button></div></div>)}
                </div>
              </div>
              <div className={styles.detailSection}>
                <p className={styles.sectionCaption}>Packaging category starters</p>
                <p className={styles.configHint}>Add only the missing two-level packaging groups. This explicit action never creates products, changes existing records, or assigns prices.</p>
                <button
                  className={styles.buttonSecondary}
                  disabled={saving}
                  onClick={() => void importPackagingCategoryStarters(packagingCategoryStarters.map((starter) => starter.id), "all packaging groups")}
                  type="button"
                >
                  Add all missing
                </button>
                <div className={styles.configList}>
                  {packagingCategoryStarters.map((starter) => <div className={styles.configCard} key={starter.id}><div className={styles.configCardHead}><span><strong>{starter.name}</strong><small>{starter.subcategories.map((subcategory) => subcategory.name).join(" · ")}</small></span><button className={styles.buttonSecondary} disabled={saving} onClick={() => void importPackagingCategoryStarters([starter.id], starter.name)} type="button">Add missing</button></div></div>)}
                </div>
                {categoryImportMessage && <p className={styles.configHint} role="status">{categoryImportMessage}</p>}
              </div>
              <div className={styles.configList}>
                {categoryRecords.map((category) => (
                  <div className={styles.configCard} key={category.id}>
                    <div className={styles.configCardHead}><strong>{categoryPath(category, categoryRecords)}</strong><button className={styles.buttonSecondary} disabled={saving} onClick={() => void saveCategory(category)} type="button">Save</button></div>
                    <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Category name</span><input className={styles.input} value={category.name} onChange={(event) => setCategoryRecords((current) => current.map((item) => item.id === category.id ? { ...item, name: event.target.value } : item))} /></label>
                    <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Parent category</span><select className={styles.select} value={category.parentId ?? ""} onChange={(event) => setCategoryRecords((current) => current.map((item) => item.id === category.id ? { ...item, parentId: event.target.value || null } : item))}><option value="">Top-level category</option>{categoryRecords.filter((option) => option.id !== category.id && !option.parentId).map((option) => <option key={option.id} value={option.id}>{categoryPath(option, categoryRecords)}</option>)}</select><small>Use one main category and one subcategory level so every item appears in the storefront menu.</small></label>
                    <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Storefront order</span><input className={styles.input} min="0" type="number" value={category.sortOrder} onChange={(event) => setCategoryRecords((current) => current.map((item) => item.id === category.id ? { ...item, sortOrder: Math.max(0, Number(event.target.value) || 0) } : item))} /><small>Lower numbers appear first in the main category menu.</small></label>
                    <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Customer / vendor description</span><textarea className={styles.textarea} value={category.description ?? ""} onChange={(event) => setCategoryRecords((current) => current.map((item) => item.id === category.id ? { ...item, description: event.target.value } : item))} /></label>
                    <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Category image URL</span><input className={styles.input} placeholder="https://…" type="url" value={category.imageUrl ?? ""} onChange={(event) => setCategoryRecords((current) => current.map((item) => item.id === category.id ? { ...item, imageUrl: event.target.value } : item))} /></label>
                    <label className={styles.compactCheck}><input checked={category.isActive !== false} onChange={(event) => setCategoryRecords((current) => current.map((item) => item.id === category.id ? { ...item, isActive: event.target.checked } : item))} type="checkbox" /> Show this category to customers and vendors</label>
                  </div>
                ))}
              </div>
              {error && <p className={styles.formError} role="alert">{error}</p>}
            </div>
          </aside>
        </>
      )}

      {adding && (
        <>
          <button aria-label="Close product form" className={styles.drawerBackdrop} onClick={() => { setAdding(false); setEditingProduct(null); setVisualizationOpen(false); clearImageDrafts(); }} type="button" />
          <aside aria-label="Add product" className={styles.drawer}>
            <div className={styles.drawerHeader}>
              <div><h3>{editingProduct ? "Configure product" : "Add a new product"}</h3><p>{editingProduct ? "Changes update the live product configuration without changing its product ID or URL." : "Start with the essentials. You can add variants next."}</p></div>
              <button aria-label="Close" className={styles.iconButton} onClick={() => { setAdding(false); setEditingProduct(null); setVisualizationOpen(false); clearImageDrafts(); }} type="button"><X size={16} /></button>
            </div>
            <form className={styles.drawerBody} key={editingProduct?.id ?? "new"} noValidate onSubmit={createProduct}>
              <div className={styles.personalizationCard}>
                <span>{editingProduct ? "Live catalog item" : "New catalog item"}</span><strong>{editingProduct ? "Update its customer options" : "Ready for your details"}</strong><p>{editingProduct ? "Existing orders retain their order-time product snapshots." : "Products are saved as drafts until you publish them."}</p>
              </div>
              <div className={styles.detailSection}>
                <div className={styles.editorFields}>
                  <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Product name</span><input className={styles.input} defaultValue={editingProduct?.name} name="name" placeholder="e.g. Waterproof name labels" required /></label>
                  <div className={styles.fieldGrid}>
                    <label className={styles.fieldGroup}><span className={styles.fieldLabel}>SKU</span><input className={styles.input} defaultValue={editingProduct?.sku} name="sku" placeholder="NL-WP-048" required /></label>
                    <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Price (₹)</span><input className={styles.input} defaultValue={editingProduct?.price} min="0" name="price" placeholder="649" required type="number" /></label>
                  </div>
                  <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Category / subcategory</span>
                    <select className={styles.select} name="category" onChange={(event) => { setProductCategoryId(event.target.value); setProductCategoryIds((current) => current.filter((id) => id !== event.target.value)); }} required value={productCategoryId}><option disabled value="">Choose a category or subcategory</option>{primaryCategoryOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select>
                  </label>
                  <div className={styles.fieldGroup}>
                    <span className={styles.fieldLabel}>Also list in <small>Optional</small></span>
                    <div className={styles.mimeChoices}>
                      {crossListingCategoryOptions.filter((option) => option.id !== productCategoryId).map((option) => <label className={styles.compactCheck} key={option.id}><input checked={productCategoryIds.includes(option.id)} onChange={(event) => setProductCategoryIds((current) => event.target.checked ? [...new Set([...current, option.id])] : current.filter((id) => id !== option.id))} type="checkbox" /> {option.label}</label>)}
                    </div>
                    <small>Cross-list the same product record in multiple categories. SKU, product ID, stock, and orders remain shared.</small>
                  </div>
                  <div className={styles.fieldGrid}>
                    <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Product type starter <small>Optional</small></span><select className={styles.select} value={productType} onChange={(event) => setProductType(event.target.value)}><option value="">Custom / existing configuration</option>{packagingProductTypeStarters.map((starter) => <option key={starter.id} value={starter.id}>{starter.name}</option>)}</select></label>
                    <div className={styles.fieldGroup}><span className={styles.fieldLabel}>Product type fields</span><button className={styles.buttonSecondary} disabled={!productType} onClick={() => applyProductTypeStarter(productType)} type="button">Apply starter fields</button><small>Replaces unsaved fields only. Admin-configured choices stay hidden until you enable them.</small></div>
                  </div>
                  <div className={styles.assetPicker}>
                    <div className={styles.assetPreview}>
                      {productImagePreview ? <img alt="Product image preview" src={productImagePreview} /> : <span>No product image selected</span>}
                    </div>
                    <label className={styles.fieldGroup}>
                      <span className={styles.fieldLabel}>Product image upload</span>
                      <input accept="image/jpeg,image/png,image/webp" className={styles.assetFileInput} disabled={saving} onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (!file) return;
                        setProductImagePreview(previewFile(file));
                        if (editingProduct) {
                          setPendingProductImage(null);
                          void uploadExistingPrimary(file);
                        } else {
                          setPendingProductImage(file);
                        }
                      }} type="file" />
                      <small>{editingProduct ? "Uploads immediately and updates the product image URL." : "A selected file is uploaded after the initial product save, then attached as its primary image."}</small>
                      {editingProduct && editingProduct.status !== "Active" && <small>Draft products&apos; images preview blank — they go live at /api/product-images once published.</small>}
                    </label>
                  </div>
                  <details className={styles.assetUrlFallback}>
                    <summary>Use an image URL instead</summary>
                    <input className={styles.input} inputMode="url" name="imageUrl" onChange={(event) => setProductImageUrl(event.target.value)} placeholder="https://… or /api/product-images/…" type="text" value={productImageUrl} />
                  </details>
                  <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Material</span><input className={styles.input} defaultValue={editingProduct?.material} name="material" placeholder="e.g. Vinyl, cotton, stainless steel" /></label>
                  <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Sizes / formats</span><input className={styles.input} defaultValue={editingProduct?.sizes.join(", ")} name="sizes" placeholder="e.g. A5, A4, 50 × 30 mm" /><small>Separate options with commas.</small></label>
                  <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Size guide shown to customers</span><input className={styles.input} defaultValue={editingProduct?.sizeDescription} name="sizeDescription" placeholder="e.g. 50 × 30 mm per label; fits most lunch boxes" /></label>
                  <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Customer-facing features</span><input className={styles.input} defaultValue={editingProduct?.features.join(", ")} name="features" placeholder="Waterproof, Dishwasher safe" /><small>Separate features with commas.</small></label>
                  <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Description</span><textarea className={styles.textarea} defaultValue={editingProduct?.description} name="description" placeholder="What customers should know about this product" /></label>
                  <div className={styles.fieldGrid}><label className={styles.fieldGroup}><span className={styles.fieldLabel}>Min production days</span><input className={styles.input} defaultValue={editingProduct?.productionDaysMin ?? "0"} min="0" name="productionDaysMin" type="number" /></label><label className={styles.fieldGroup}><span className={styles.fieldLabel}>Max production days</span><input className={styles.input} defaultValue={editingProduct?.productionDaysMax ?? "0"} min="0" name="productionDaysMax" type="number" /></label></div>
                  <label className={styles.toggleRow}>
                    <span className={styles.toggleCopy}><strong>Enable personalization</strong><span>Attach text fields and design templates.</span></span>
                    <input defaultChecked={editingProduct?.customizable ?? true} name="personalized" type="checkbox" />
                  </label>
                  <div className={styles.detailSection}>
                    <p className={styles.sectionCaption}>Customer configurator</p>
                    <div className={styles.fieldGrid}>
                      <label className={styles.fieldGroup}>
                        <span className={styles.fieldLabel}>RanBazaar customisation starter <small>Optional</small></span>
                        <select
                          className={styles.select}
                          onChange={(event) => setCustomizationStarterId(event.target.value)}
                          value={customizationStarterId}
                        >
                          <option value="">Custom / existing personalisation</option>
                          {ranBazaarCustomizationStarters.map((starter) => (
                            <option key={starter.id} value={starter.id}>{starter.name}</option>
                          ))}
                        </select>
                      </label>
                      <div className={styles.fieldGroup}>
                        <span className={styles.fieldLabel}>Starter fields and placement</span>
                        <button
                          className={styles.buttonSecondary}
                          disabled={!customizationStarterId}
                          onClick={() => applyRanBazaarCustomizationStarter(customizationStarterId)}
                          type="button"
                        >
                          Apply customisation starter
                        </button>
                        <small>Replaces only unsaved personalisation fields, surfaces and policy. Category, product details and prices stay unchanged; every applied value remains editable.</small>
                      </div>
                    </div>
                    <label className={styles.toggleRow}><span className={styles.toggleCopy}><strong>Enable 2D layout editor</strong><span>Customers can position content within the configured print surfaces.</span></span><input defaultChecked={editingProduct?.allow2D ?? true} name="allow2D" type="checkbox" /></label>
                    <label className={styles.toggleRow}>
                      <span className={styles.toggleCopy}>
                        <strong>Enable validated 3D preview</strong>
                        <span>{packaging3DUnavailable
                          ? "Publish a confirmed visualization template below to activate packaging 3D. A draft template does not enable storefront previews."
                          : packaging3DActivated
                            ? "A published visualization template activated this packaging preview. You can disable it or choose another validated packaging model."
                            : "Only enable this after choosing an available product model below."}</span>
                      </span>
                      <input
                        defaultChecked={!packaging3DUnavailable && Boolean(editingProduct?.allow3D)}
                        disabled={packaging3DUnavailable}
                        key={`allow3D-${packaging3DUnavailable ? "locked" : editingProduct?.allow3D ? "enabled" : "available"}`}
                        name="allow3D"
                        type="checkbox"
                      />
                    </label>
                    <div className={styles.fieldGrid}>
                      <label className={styles.fieldGroup}>
                        <span className={styles.fieldLabel}>3D product model</span>
                        <select className={styles.select} defaultValue={packaging3DUnavailable ? "" : editingProduct?.productModel ?? ""} disabled={packaging3DUnavailable} key={`productModel-${packaging3DUnavailable ? "locked" : editingProduct?.productModel || "available"}`} name="productModel">
                          <option value="">No 3D model</option>
                          <option value="label-pack">Label pack</option>
                          <option value="waterproof-sheet">Waterproof sheet</option>
                          <option value="school-kit">School kit</option>
                          <option value="notebook">Notebook</option>
                          <option value="bottle-label">Bottle label</option>
                          <option value="pencil-set">Pencil set</option>
                          <option value="tag">Tag</option>
                          <option value="geometry-box">Geometry box</option>
                          <option value="gift-ribbon">Gift box with ribbon</option>
                          <option value="keychain-duo">Keychain pair</option>
                          <option value="bulk-grid">Bulk grid</option>
                          {packagingProductModels.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                        {packaging3DUnavailable && <small>Packaging models unlock only after a confirmed template is published.</small>}
                      </label>
                      <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Preview template / reference</span><input className={styles.input} defaultValue={editingProduct?.previewTemplate} name="previewTemplate" placeholder="e.g. soap-box-v2" /></label>
                    </div>
                    <div className={styles.configSection}>
                      <div className={styles.configSectionHead}><div><strong>Customer design templates</strong><small>Link only the live design templates this product can use. The customer page and server pricing read these links.</small></div></div>
                      {!templateOptions.length && <p className={styles.configHint}>No active personalization templates are available yet. Add or publish a template before linking it to this product.</p>}
                      <div className={styles.configList}>
                        {templateOptions.map((template) => {
                          const link = templateLinks.find((item) => item.templateId === template.id);
                          return <div className={styles.configCard} key={template.id}>
                            <label className={styles.compactCheck}><input checked={Boolean(link)} onChange={(event) => toggleTemplateLink(template.id, event.target.checked)} type="checkbox" /><span><strong>{template.name}</strong><small>{template.theme || "Design template"}{template.premiumPrice ? ` Â· +${inr(template.premiumPrice)}` : " Â· Included"}</small></span></label>
                            {link && <label className={styles.compactCheck}><input checked={link.isDefault} name="default-product-template" onChange={() => makeDefaultTemplate(template.id)} type="radio" /> Use as the default customer design</label>}
                          </div>;
                        })}
                      </div>
                    </div>
                    <div className={styles.fieldGrid}><label className={styles.fieldGroup}><span className={styles.fieldLabel}>Minimum quantity</span><input className={styles.input} defaultValue={editingProduct?.quantityMin ?? "1"} min="1" name="quantityMin" type="number" /></label><label className={styles.fieldGroup}><span className={styles.fieldLabel}>Maximum quantity</span><input className={styles.input} defaultValue={editingProduct?.quantityMax ?? "100"} min="1" name="quantityMax" type="number" /></label><label className={styles.fieldGroup}><span className={styles.fieldLabel}>Setup charge (₹ per line)</span><input className={styles.input} defaultValue={editingProduct?.setupCharge ?? "0"} min="0" name="setupCharge" step="0.01" type="number" /></label></div>

                    <div className={styles.configSection}>
                      <div className={styles.configSectionHead}><div><strong>Quantity price breaks</strong><small>Apply a per-item adjustment when a customer reaches the selected minimum.</small></div><button className={styles.buttonSecondary} onClick={() => setQuantityTiers((current) => [...current, { id: `tier-${Date.now()}-${current.length}`, minimum: "", priceDelta: "0", label: "" }])} type="button"><Plus size={13} /> Add break</button></div>
                      {!quantityTiers.length && <p className={styles.configHint}>No quantity price breaks yet. Use a negative adjustment for a volume discount.</p>}
                      <div className={styles.configList}>{quantityTiers.map((tier, index) => <div className={styles.configCard} key={tier.id}><div className={styles.configCardHead}><strong>Price break {index + 1}</strong><button aria-label={`Remove price break ${index + 1}`} className={styles.buttonGhost} onClick={() => setQuantityTiers((current) => current.filter((item) => item.id !== tier.id))} type="button"><Trash2 size={14} /></button></div><div className={styles.fieldGrid}><label className={styles.fieldGroup}><span className={styles.fieldLabel}>Minimum quantity</span><input className={styles.input} min="1" type="number" value={tier.minimum} onChange={(event) => setQuantityTiers((current) => current.map((item) => item.id === tier.id ? { ...item, minimum: event.target.value } : item))} /></label><label className={styles.fieldGroup}><span className={styles.fieldLabel}>Per-item adjustment (₹)</span><input className={styles.input} step="0.01" type="number" value={tier.priceDelta} onChange={(event) => setQuantityTiers((current) => current.map((item) => item.id === tier.id ? { ...item, priceDelta: event.target.value } : item))} /><small>Use a negative amount for a discount.</small></label><label className={styles.fieldGroup}><span className={styles.fieldLabel}>Customer label</span><input className={styles.input} placeholder="e.g. 250+ units" value={tier.label} onChange={(event) => setQuantityTiers((current) => current.map((item) => item.id === tier.id ? { ...item, label: event.target.value } : item))} /></label></div></div>)}</div>
                    </div>

                    <div className={styles.configSection}>
                      <div className={styles.configSectionHead}><div><strong>Customer option fields</strong><small>Build only the material, finish, size, printing and other choices this product needs.</small></div><button className={styles.buttonSecondary} onClick={() => setConfigurationFields((current) => [...current, emptyConfigurationField(`${Date.now()}-${current.length}`, `attribute-${current.length + 1}`)])} type="button"><Plus size={13} /> Add field</button></div>
                      {!configurationFields.length && <p className={styles.configHint}>No extra fields yet. Add a select for Material, Finish or Printing; add a number for Length, Width, GSM or Thickness.</p>}
                      <div className={styles.configList}>
                        {configurationFields.map((field, index) => (
                          <div className={styles.configCard} key={field.id}>
                            <div className={styles.configCardHead}><strong>Option {index + 1}</strong><span><button aria-label={`Move option ${index + 1} up`} className={styles.buttonGhost} disabled={index === 0} onClick={() => moveConfigurationField(field.id, -1)} type="button"><ChevronUp size={14} /></button><button aria-label={`Move option ${index + 1} down`} className={styles.buttonGhost} disabled={index === configurationFields.length - 1} onClick={() => moveConfigurationField(field.id, 1)} type="button"><ChevronDown size={14} /></button><button aria-label={`Remove option ${index + 1}`} className={styles.buttonGhost} onClick={() => setConfigurationFields((current) => current.filter((item) => item.id !== field.id))} type="button"><Trash2 size={14} /></button></span></div>
                            <div className={styles.fieldGrid}>
                              <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Customer label</span><input className={styles.input} value={field.label} onChange={(event) => setConfigurationFields((current) => current.map((item) => item.id === field.id ? { ...item, label: event.target.value, key: item.key.startsWith("attribute-") ? safeKey(event.target.value, item.key) : item.key } : item))} placeholder="e.g. Paper GSM" /></label>
                              <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Field key</span><input className={styles.input} value={field.key} onChange={(event) => setConfigurationFields((current) => current.map((item) => item.id === field.id ? { ...item, key: safeKey(event.target.value, item.key) } : item))} placeholder="paper-gsm" /></label>
                              <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Input type</span><select className={styles.select} value={field.inputType} onChange={(event) => setConfigurationFields((current) => current.map((item) => item.id === field.id ? { ...item, inputType: event.target.value as ConfigurationFieldInput["inputType"], allowedPattern: event.target.value === "text" ? item.allowedPattern : "" } : item))}><option value="select">Dropdown selection</option><option value="number">Number</option><option value="text">Text</option><option value="color">Colour</option></select></label>
                              <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Base adjustment (₹)</span><input className={styles.input} inputMode="decimal" value={field.priceDelta} onChange={(event) => setConfigurationFields((current) => current.map((item) => item.id === field.id ? { ...item, priceDelta: event.target.value } : item))} /></label>
                            </div>
                            {field.inputType === "select" && <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Choices</span><input className={styles.input} value={field.options} onChange={(event) => setConfigurationFields((current) => current.map((item) => item.id === field.id ? { ...item, options: event.target.value } : item))} placeholder="Matte|0, Glossy|25, Velvet|50" /><small>Separate choices with commas. Add an optional per-choice price after a vertical bar.</small></label>}
                            {field.inputType === "number" ? <div className={styles.fieldGrid}><label className={styles.fieldGroup}><span className={styles.fieldLabel}>Minimum value</span><input className={styles.input} inputMode="decimal" value={field.minValue} onChange={(event) => setConfigurationFields((current) => current.map((item) => item.id === field.id ? { ...item, minValue: event.target.value } : item))} /></label><label className={styles.fieldGroup}><span className={styles.fieldLabel}>Maximum value</span><input className={styles.input} inputMode="decimal" value={field.maxValue} onChange={(event) => setConfigurationFields((current) => current.map((item) => item.id === field.id ? { ...item, maxValue: event.target.value } : item))} /></label><label className={styles.fieldGroup}><span className={styles.fieldLabel}>Step</span><input className={styles.input} inputMode="decimal" value={field.step} onChange={(event) => setConfigurationFields((current) => current.map((item) => item.id === field.id ? { ...item, step: event.target.value } : item))} placeholder="e.g. 10" /></label></div> : <div className={styles.fieldGrid}><label className={styles.fieldGroup}><span className={styles.fieldLabel}>Min. characters</span><input className={styles.input} min="0" type="number" value={field.minLength} onChange={(event) => setConfigurationFields((current) => current.map((item) => item.id === field.id ? { ...item, minLength: event.target.value } : item))} /></label><label className={styles.fieldGroup}><span className={styles.fieldLabel}>Max. characters</span><input className={styles.input} min="1" type="number" value={field.maxLength} onChange={(event) => setConfigurationFields((current) => current.map((item) => item.id === field.id ? { ...item, maxLength: event.target.value } : item))} /></label></div>}
                            {field.inputType === "text" && <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Allowed characters <small>Optional pattern</small></span><input className={styles.input} maxLength={200} value={field.allowedPattern} onChange={(event) => setConfigurationFields((current) => current.map((item) => item.id === field.id ? { ...item, allowedPattern: event.target.value } : item))} placeholder="e.g. ^[\\p{L} .'-]+$" /><small>Unicode regular expression matched against the complete value. Nested repetition is rejected for safety.</small></label>}
                            <div className={styles.fieldGrid}>
                              <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Help text <small>Optional</small></span><input className={styles.input} value={field.helpText} onChange={(event) => setConfigurationFields((current) => current.map((item) => item.id === field.id ? { ...item, helpText: event.target.value } : item))} placeholder="Shown below the field" /></label>
                              <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Unit <small>Optional</small></span><input className={styles.input} value={field.unit} onChange={(event) => setConfigurationFields((current) => current.map((item) => item.id === field.id ? { ...item, unit: event.target.value } : item))} placeholder="e.g. mm, GSM" /></label>
                              <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Default value <small>Optional</small></span><input className={styles.input} value={field.defaultValue} onChange={(event) => setConfigurationFields((current) => current.map((item) => item.id === field.id ? { ...item, defaultValue: event.target.value } : item))} placeholder={field.inputType === "select" ? "Choice value" : "Initial value"} /></label>
                              <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Placeholder <small>Optional</small></span><input className={styles.input} value={field.placeholder} onChange={(event) => setConfigurationFields((current) => current.map((item) => item.id === field.id ? { ...item, placeholder: event.target.value } : item))} placeholder="Prompt for text entry" /></label>
                            </div>
                            <div className={styles.fieldGrid}>
                              <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Show only when <small>Optional</small></span><select className={styles.select} value={field.visibleWhenFieldId} onChange={(event) => setConfigurationFields((current) => current.map((item) => item.id === field.id ? { ...item, visibleWhenFieldId: event.target.value, visibleWhenEquals: event.target.value ? item.visibleWhenEquals : "" } : item))}><option value="">Always show</option>{configurationFields.filter((candidate) => candidate.id !== field.id).map((candidate) => <option key={candidate.id} value={candidate.key}>{candidate.label || candidate.key}</option>)}</select></label>
                              {field.visibleWhenFieldId && <label className={styles.fieldGroup}><span className={styles.fieldLabel}>…has value</span><input className={styles.input} value={field.visibleWhenEquals} onChange={(event) => setConfigurationFields((current) => current.map((item) => item.id === field.id ? { ...item, visibleWhenEquals: event.target.value } : item))} placeholder="Exact dropdown value" /></label>}
                            </div>
                            <div className={styles.mimeChoices}>
                              <label className={styles.compactCheck}><input checked={field.enabled} onChange={(event) => setConfigurationFields((current) => current.map((item) => item.id === field.id ? { ...item, enabled: event.target.checked } : item))} type="checkbox" /> Enabled</label>
                              <label className={styles.compactCheck}><input checked={field.customerVisible} onChange={(event) => setConfigurationFields((current) => current.map((item) => item.id === field.id ? { ...item, customerVisible: event.target.checked } : item))} type="checkbox" /> Show to customer</label>
                              <label className={styles.compactCheck}><input checked={field.required} onChange={(event) => setConfigurationFields((current) => current.map((item) => item.id === field.id ? { ...item, required: event.target.checked } : item))} type="checkbox" /> Required before add to cart</label>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className={styles.configSection}>
                      <div className={styles.configSectionHead}><div><strong>Printable surfaces</strong><small>Define the customer-facing areas used by the 2D editor.</small></div><button className={styles.buttonSecondary} onClick={() => setPrintAreas((current) => [...current, { id: `surface-${current.length + 1}`, label: "", widthMm: "", heightMm: "", safeInsetMm: "" }])} type="button"><Plus size={13} /> Add surface</button></div>
                      <div className={styles.configList}>
                        {printAreas.map((area, index) => (
                          <div className={styles.configCard} key={`${area.id}-${index}`}>
                            <div className={styles.configCardHead}>
                              <strong>Surface {index + 1}</strong>
                              {printAreas.length > 1 && (
                                <button aria-label={`Remove surface ${index + 1}`} className={styles.buttonGhost} onClick={() => removePrintArea(index)} type="button"><Trash2 size={14} /></button>
                              )}
                            </div>
                            <div className={styles.fieldGrid}>
                              <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Label</span><input className={styles.input} value={area.label} onChange={(event) => setPrintAreas((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))} placeholder="Front" /></label>
                              <label className={styles.fieldGroup}><span className={styles.fieldLabel}>ID</span><input className={styles.input} value={area.id} onChange={(event) => changePrintAreaId(index, event.target.value)} placeholder="front" /></label>
                              <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Width (mm)</span><input className={styles.input} inputMode="decimal" value={area.widthMm} onChange={(event) => setPrintAreas((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, widthMm: event.target.value } : item))} /></label>
                              <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Height (mm)</span><input className={styles.input} inputMode="decimal" value={area.heightMm} onChange={(event) => setPrintAreas((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, heightMm: event.target.value } : item))} /></label>
                              <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Safe inset (mm)</span><input className={styles.input} inputMode="decimal" value={area.safeInsetMm} onChange={(event) => setPrintAreas((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, safeInsetMm: event.target.value } : item))} /></label>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className={styles.configSection}>
                      <div className={styles.configSectionHead}><div><strong>Base images</strong><small>Customers see this image behind their design on each configured surface.</small></div></div>
                      {!editingProduct && <p className={styles.configHint}>Selected base images are uploaded after this new product is saved.</p>}
                      <div className={styles.baseImageList}>
                        {printAreas.map((area, index) => {
                          const surfaceId = area.id;
                          const imageUrl = surfaceBasePreviews[surfaceId] ?? (editingProduct?.published ? surfaceBaseImages[surfaceId]?.url : undefined);
                          const canUpload = Boolean(surfaceId && /^[a-z][a-z0-9-]{0,79}$/.test(surfaceId));
                          return <div className={styles.baseImageCard} key={`base-${surfaceId || index}`}>
                            <div className={styles.baseImagePreview}>{imageUrl ? <img alt={`${area.label || `Surface ${index + 1}`} base image`} src={imageUrl} /> : <span>No base image</span>}</div>
                            <div className={styles.baseImageControls}>
                              <strong>{area.label.trim() || `Surface ${index + 1}`}</strong>
                              <small>Customers see this image behind their design on the {area.label.trim() || `surface ${index + 1}`} surface.</small>
                              <input accept="image/jpeg,image/png,image/webp" className={styles.assetFileInput} disabled={saving || !canUpload} onChange={(event) => {
                                const file = event.target.files?.[0];
                                event.target.value = "";
                                if (!file || !canUpload) return;
                                setPendingSurfaceBaseImages((current) => ({ ...current, [surfaceId]: file }));
                                setSurfaceBasePreviews((current) => ({ ...current, [surfaceId]: previewFile(file) }));
                                const isPersistedSurface = Boolean(editingProduct?.printAreas.some((surface) => surface.id === surfaceId));
                                if (isPersistedSurface) void uploadExistingSurfaceBase(surfaceId, file);
                              }} type="file" />
                              {!canUpload && <p className={styles.configHint}>Surface ID must be a-z, digits, '-' (≤80 chars) to upload a base image <button className={styles.buttonGhost} onClick={() => changePrintAreaId(index, safeKey(area.label, `surface-${index + 1}`))} type="button">Auto ID</button></p>}
                              {editingProduct?.hasUploadedPrimaryImage && canUpload && <button className={styles.buttonGhost} disabled={saving} onClick={() => void reuseExistingPrimaryAsBase(surfaceId)} type="button">Use this product&apos;s photo</button>}
                              {(surfaceBaseImages[surfaceId] || pendingSurfaceBaseImages[surfaceId]) && <button className={styles.buttonGhost} disabled={saving} onClick={() => void removeSurfaceBase(surfaceId)} type="button"><Trash2 size={13} /> Remove</button>}
                            </div>
                          </div>;
                        })}
                      </div>
                    </div>

                    <div className={styles.configSection}>
                      <label className={styles.toggleRow}><span className={styles.toggleCopy}><strong>Customer artwork upload</strong><span>Signature-check and privately store approved raster originals until they are atomically attached to an order.</span></span><input checked={artworkUploadEnabled} onChange={(event) => setArtworkUploadEnabled(event.target.checked)} type="checkbox" /></label>
                      <div className={styles.mimeChoices}>{artworkMimeTypes.map(([mime, label]) => <label className={styles.compactCheck} key={mime}><input checked={acceptedArtworkTypes.includes(mime)} disabled={!artworkUploadEnabled} onChange={(event) => setAcceptedArtworkTypes((current) => event.target.checked ? [...new Set([...current, mime])] : current.filter((item) => item !== mime))} type="checkbox" /> {label}</label>)}</div>
                    </div>

                    <div className={styles.configSection}>
                      <div className={styles.configSectionHead}><div><strong>Personalisation placement policy</strong><small>Set printable bounds, text/image limits, locked controls, defaults, source quality, approval and image charges per surface.</small></div></div>
                      <ProductArtworkPolicyEditor value={artworkPolicy} onChange={setArtworkPolicy} />
                    </div>
                  </div>
                  <label className={styles.toggleRow}><span className={styles.toggleCopy}><strong>Publish on storefront</strong><span>Customers can see it immediately after saving.</span></span><input defaultChecked={editingProduct?.published} name="published" type="checkbox" /></label>
                  {!editingProduct && <label className={styles.compactCheck}><input name="openVisualization" type="checkbox" /> Open visualization studio after save</label>}
                  {error && <p className={styles.formError} role="alert">{error}</p>}
                </div>
              </div>
              <div className={styles.drawerFooter}>
                <button className={styles.buttonSecondary} onClick={() => { setAdding(false); setEditingProduct(null); setVisualizationOpen(false); clearImageDrafts(); }} type="button">Cancel</button>
                <button className={styles.buttonPrimary} disabled={saving || !categoryRecords.length} type="submit"><Archive size={13} /> {saving ? "Saving…" : editingProduct ? "Save changes" : "Save product"}</button>
              </div>
            </form>
            {editingProduct && (
              <div className={styles.visualizationDrawerSlot}>
                <details className={styles.visualizationDetails} onToggle={(event) => setVisualizationOpen(event.currentTarget.open)} open={visualizationOpen}>
                  <summary><span>3D visualization studio</span><StatusBadge tone={editingProduct.previewTemplate.startsWith("visualization:") ? "success" : editingProduct.visualizationJobStatus ? "info" : "muted"}>{editingProduct.previewTemplate.startsWith("visualization:") ? "3D published ✓" : editingProduct.visualizationJobStatus === "NEEDS_CONFIRMATION" ? "Job: needs confirmation" : editingProduct.visualizationJobStatus ? "Job: processing" : "No 3D template yet"}</StatusBadge></summary>
                  <ProductVisualizationStudio
                    key={editingProduct.id}
                    hasPrimaryImage={editingProduct.hasUploadedPrimaryImage === true}
                    productId={editingProduct.id}
                    productName={editingProduct.name}
                    productType={productType || editingProduct.productType}
                    surfaces={printAreas.map((area, index) => ({
                      id: area.id || `surface-${index + 1}`,
                      label: area.label.trim() || `Surface ${index + 1}`,
                    }))}
                    onTemplateStatusChange={refreshEditingProductPreviewState}
                  />
                </details>
              </div>
            )}
          </aside>
        </>
      )}

      {quickAdding && <QuickListProductWizard
        categories={categoryRecords}
        onClose={() => setQuickAdding(false)}
        onImportPackaging={() => importPackagingCategoryStarters(packagingCategoryStarters.map((starter) => starter.id), "all packaging groups")}
        onImportRanBazaar={() => importRanBazaarCategoryStarters(ranBazaarCategoryStarters.map((starter) => starter.id), "all RanBazaar category groups")}
        onSaved={async (productId) => {
          setQuickAdding(false);
          setVisualizationOpen(true);
          await editProduct(productId);
        }}
      />}
    </>
  );
}
