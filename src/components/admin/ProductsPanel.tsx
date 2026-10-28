"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
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
import { buildDefaultAdminArtworkPolicy, reconcileAdminArtworkPolicy } from "@/lib/admin-artwork-policy";
import {
  ezpacIndustryCollectionCategorySlug,
  getEzpacPackagingFieldsForProductType,
  getEzpacPackagingProductType,
  listEzpacPackagingCategories,
  listEzpacPackagingProductTypes,
} from "@/lib/ezpac-packaging-presets";
import { listRanBazaarCategoryGroups } from "@/lib/ranbazaar-category-presets";
import {
  applyRanBazaarCustomizationStarterPolicy,
  getRanBazaarCustomizationStarter,
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
type EditingProduct = {
  id: string;
  name: string;
  sku: string;
  categoryId: string;
  categoryIds: string[];
  productType: string;
  price: number;
  imageUrl: string;
  material: string;
  sizes: string[];
  sizeDescription: string;
  features: string[];
  description: string;
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
  const [managingCategories, setManagingCategories] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [categoryImportMessage, setCategoryImportMessage] = useState("");
  const packagingCategoryStarters = useMemo(() => listEzpacPackagingCategories(), []);
  const ranBazaarCategoryStarters = useMemo(() => listRanBazaarCategoryGroups(), []);
  const ranBazaarCustomizationStarters = useMemo(
    () => listRanBazaarCustomizationStarters(),
    [],
  );
  const packagingProductTypeStarters = useMemo(() => listEzpacPackagingProductTypes(), []);

  async function loadCatalog() {
    const response = await fetch("/api/admin/catalog", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message || "Could not load the live catalog.");
    setCatalog(payload.data.products);
    setCategoryRecords(payload.data.categories.map((item: CategoryRecord) => ({ id: item.id, slug: item.slug, name: item.name, parentId: item.parentId ?? null, description: item.description, imageUrl: item.imageUrl, isActive: item.isActive, sortOrder: item.sortOrder })));
    setTemplateOptions(Array.isArray(payload.data.templates) ? payload.data.templates : []);
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

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return catalog.filter((product) =>
      (!needle || [product.name, product.category, product.sku].some((value) => value.toLowerCase().includes(needle))) &&
      (category === "All categories" || product.category === category),
    );
  }, [catalog, query, category]);

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
      const requestBody = { type: "product", ...(editingProduct ? { id: editingProduct.id } : {}), name: String(data.get("name")), sku: String(data.get("sku")), categoryId: productCategoryId, categoryIds: [productCategoryId, ...productCategoryIds.filter((id) => id !== productCategoryId)], productType: productType || undefined, price: Number(data.get("price")), imageUrl: String(data.get("imageUrl")), material: String(data.get("material") || ""), sizes: String(data.get("sizes") || "").split(",").map((value) => value.trim()).filter(Boolean), sizeDescription: String(data.get("sizeDescription") || ""), features: String(data.get("features") || "").split(",").map((value) => value.trim()).filter(Boolean), description: String(data.get("description") || ""), configurationFields: configurationFields.map((field, index) => ({ key: safeKey(field.key, `attribute-${index + 1}`), label: field.label.trim(), inputType: field.inputType, required: field.required, placeholder: field.placeholder.trim() || null, helpText: field.helpText.trim() || null, defaultValue: field.defaultValue || null, unit: field.unit.trim() || null, enabled: field.enabled, customerVisible: field.customerVisible, visibleWhen: field.visibleWhenFieldId ? { fieldId: safeKey(field.visibleWhenFieldId, field.visibleWhenFieldId), equals: field.visibleWhenEquals } : null, minLength: optionalNumber(field.minLength), maxLength: optionalNumber(field.maxLength), allowedPattern: field.inputType === "text" ? field.allowedPattern.trim() || null : null, minValue: optionalNumber(field.minValue), maxValue: optionalNumber(field.maxValue), step: optionalNumber(field.step), priceDelta: optionalNumber(field.priceDelta) ?? 0, options: field.inputType === "select" ? parseFieldOptions(field.options) : [] })), templateLinks: templateLinks.map(({ templateId, isDefault }) => ({ templateId, isDefault })), printAreas: submittedPrintAreas, previewTemplate: String(data.get("previewTemplate") || "").trim() || undefined, productModel: String(data.get("productModel") || "").trim() || undefined, artworkUpload: artworkUploadEnabled, acceptedArtworkTypes, artworkPolicy: submittedArtworkPolicy, customizable: data.get("personalized") === "on", published: data.get("published") === "on", allow2D: data.get("allow2D") === "on", allow3D: data.get("allow3D") === "on", quantityMin: Number(data.get("quantityMin") || 1), quantityMax: Number(data.get("quantityMax") || 100), quantityTiers: quantityTiers.map((tier) => ({ minimum: Number(tier.minimum), priceDelta: optionalNumber(tier.priceDelta) ?? 0, label: tier.label.trim() || undefined })), setupCharge: Number(data.get("setupCharge") || 0), productionDaysMin: Number(data.get("productionDaysMin") || 0), productionDaysMax: Number(data.get("productionDaysMax") || 0) };
      const response = await fetch("/api/admin/catalog", { method: editingProduct ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestBody) });
      const responsePayload = await response.json(); if (!response.ok) throw new Error(responsePayload.error?.message || "Could not save product.");
      await loadCatalog(); setAdding(false); setEditingProduct(null); setProductCategoryId(""); setProductCategoryIds([]); setProductType(""); setTemplateLinks([]); setConfigurationFields([]); setPrintAreas(defaultPrintAreas); setQuantityTiers([]); setArtworkUploadEnabled(false); setAcceptedArtworkTypes(["image/png", "image/jpeg"]); setArtworkPolicy(buildDefaultAdminArtworkPolicy(policyPrintAreas(defaultPrintAreas), { uploadsEnabled: false, allowedMimeTypes: ["image/png", "image/jpeg"] }));
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
    const matchingCollectionCategoryIds = starter.collectionIds.flatMap((collectionId) => {
      const category = categoryRecords.find(
        (record) => record.slug === ezpacIndustryCollectionCategorySlug(collectionId),
      );
      return category ? [category.id] : [];
    });
    if (matchingCategory) {
      setProductCategoryId(matchingCategory.id);
      setProductCategoryIds((current) => [
        ...new Set([
          ...current.filter((categoryId) => categoryId !== matchingCategory.id),
          ...matchingCollectionCategoryIds,
        ]),
      ]);
      setError("");
    } else {
      setError(`Add the ${starter.primaryCategoryId} packaging starter first, then this product type will map to its suggested subcategory.`);
    }
  }

  function applyRanBazaarCustomizationStarter(starterId: string) {
    const starter = getRanBazaarCustomizationStarter(starterId);
    if (!starter) return;
    const nextFields = starter.fields.map((field, index) => ({
      ...emptyConfigurationField(`ranbazaar-${starter.id}-${index}`, field.key),
      key: field.key,
      label: field.label,
      inputType: field.inputType,
      required: field.required,
      options: field.options?.map((option) => option.label).join(", ") ?? "",
      minLength: field.minLength?.toString() ?? "",
      maxLength: field.maxLength?.toString() ?? "",
      allowedPattern: field.allowedPattern ?? "",
      placeholder: field.placeholder ?? "",
      helpText: field.helpText ?? (field.optionSource === "admin_configured"
        ? "Configure supported choices, then enable this field for customers."
        : ""),
      defaultValue: field.defaultValue ?? "",
      enabled: field.optionSource !== "admin_configured",
      customerVisible: field.optionSource !== "admin_configured",
    }));
    const nextPrintAreas = starter.surfaces.map((surface) => ({
      id: surface.id,
      label: surface.label,
      widthMm: "",
      heightMm: "",
      safeInsetMm: "",
    }));
    const nextArtworkTypes = [...starter.artworkUpload.acceptedMimeTypes];
    const basePolicy = buildDefaultAdminArtworkPolicy(policyPrintAreas(nextPrintAreas), {
      uploadsEnabled: starter.artworkUpload.enabled,
      allowedMimeTypes: nextArtworkTypes,
    });
    setConfigurationFields(nextFields);
    setPrintAreas(nextPrintAreas);
    setArtworkUploadEnabled(starter.artworkUpload.enabled);
    setAcceptedArtworkTypes(nextArtworkTypes);
    setArtworkPolicy(applyRanBazaarCustomizationStarterPolicy(basePolicy, starter.id));
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

  async function importPackagingCategoryStarter(presetId: string) {
    const starter = packagingCategoryStarters.find((item) => item.id === presetId);
    if (!starter) return;
    if (!window.confirm(`Add any missing ${starter.name} categories and subcategories? Existing categories, products, prices, and orders will not be changed.`)) return;
    setSaving(true);
    setError("");
    setCategoryImportMessage("");
    try {
      const response = await fetch("/api/admin/catalog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "category-preset-import", presetIds: [presetId] }) });
      const payload = await response.json() as { data?: { created: string[]; reused: string[]; conflicts: string[] }; error?: { message?: string } };
      if (!response.ok || !payload.data) throw new Error(payload.error?.message || "Could not add the packaging categories.");
      const details = [`${payload.data.created.length} added`, `${payload.data.reused.length} already present`];
      if (payload.data.conflicts.length) details.push(`${payload.data.conflicts.length} need review`);
      setCategoryImportMessage(`${starter.name}: ${details.join(" · ")}.`);
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
      setEditingProduct(product);
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

  return (
    <>
      <PageHeader
        actions={
          <>
            <button className={styles.buttonSecondary} type="button"><Download size={14} /> Export</button>
            <button className={styles.buttonSecondary} onClick={() => void addCategory(false)} type="button"><Plus size={14} /> Add category</button>
            <button className={styles.buttonSecondary} onClick={() => void addCategory(true)} type="button"><Plus size={14} /> Add subcategory</button>
            <button className={styles.buttonSecondary} onClick={() => { setError(""); setManagingCategories(true); }} type="button"><SlidersHorizontal size={14} /> Manage categories</button>
            <button className={styles.buttonPrimary} onClick={() => { setError(""); setEditingProduct(null); setProductCategoryId(""); setProductCategoryIds([]); setProductType(""); setTemplateLinks([]); setConfigurationFields([]); setPrintAreas(defaultPrintAreas); setQuantityTiers([]); setAcceptedArtworkTypes(["image/png", "image/jpeg"]); setArtworkUploadEnabled(false); setArtworkPolicy(buildDefaultAdminArtworkPolicy(policyPrintAreas(defaultPrintAreas), { uploadsEnabled: false, allowedMimeTypes: ["image/png", "image/jpeg"] })); setAdding(true); }} type="button"><Plus size={14} /> Add product</button>
          </>
        }
        description="Build a clean catalog, control inventory, and connect each personalized product to the right design experience."
        eyebrow="Catalog"
        title="Products"
      />

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
          <select aria-label="Product status" className={styles.select}><option>All statuses</option><option>Active</option><option>Draft</option><option>Low stock</option></select>
          <button className={styles.buttonSecondary} type="button"><SlidersHorizontal size={13} /> Filters</button>
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
                          <span className={styles.productThumb} data-art={product.art} />
                          <span className={styles.cellStack}><strong>{product.name}</strong><span>{product.category} · {product.sku}</span></span>
                        </div>
                      </td>
                      <td><StatusBadge tone={statusTone(product.status)}>{product.status}</StatusBadge></td>
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
                <div className={styles.configList}>
                  {packagingCategoryStarters.map((starter) => <div className={styles.configCard} key={starter.id}><div className={styles.configCardHead}><span><strong>{starter.name}</strong><small>{starter.subcategories.map((subcategory) => subcategory.name).join(" · ")}</small></span><button className={styles.buttonSecondary} disabled={saving} onClick={() => void importPackagingCategoryStarter(starter.id)} type="button">Add missing</button></div></div>)}
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
          <button aria-label="Close product form" className={styles.drawerBackdrop} onClick={() => { setAdding(false); setEditingProduct(null); }} type="button" />
          <aside aria-label="Add product" className={styles.drawer}>
            <div className={styles.drawerHeader}>
              <div><h3>{editingProduct ? "Configure product" : "Add a new product"}</h3><p>{editingProduct ? "Changes update the live product configuration without changing its product ID or URL." : "Start with the essentials. You can add variants next."}</p></div>
              <button aria-label="Close" className={styles.iconButton} onClick={() => { setAdding(false); setEditingProduct(null); }} type="button"><X size={16} /></button>
            </div>
            <form className={styles.drawerBody} key={editingProduct?.id ?? "new"} onSubmit={createProduct}>
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
                  <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Product image URL</span><input className={styles.input} defaultValue={editingProduct?.imageUrl} name="imageUrl" placeholder="https://…" required type="url" /></label>
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
                    <label className={styles.toggleRow}><span className={styles.toggleCopy}><strong>Enable validated 3D preview</strong><span>Only enable this after choosing an available product model below.</span></span><input defaultChecked={editingProduct?.allow3D} name="allow3D" type="checkbox" /></label>
                    <div className={styles.fieldGrid}>
                      <label className={styles.fieldGroup}><span className={styles.fieldLabel}>3D product model</span><select className={styles.select} defaultValue={editingProduct?.productModel ?? ""} name="productModel"><option value="">No 3D model</option><option value="label-pack">Label pack</option><option value="waterproof-sheet">Waterproof sheet</option><option value="school-kit">School kit</option><option value="notebook">Notebook</option><option value="bottle-label">Bottle label</option><option value="pencil-set">Pencil set</option><option value="tag">Tag</option><option value="geometry-box">Geometry box</option><option value="gift-ribbon">Gift box with ribbon</option><option value="keychain-duo">Keychain pair</option><option value="bulk-grid">Bulk grid</option></select></label>
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
                      <div className={styles.configList}>{printAreas.map((area, index) => <div className={styles.configCard} key={`${area.id}-${index}`}><div className={styles.configCardHead}><strong>Surface {index + 1}</strong>{printAreas.length > 1 && <button aria-label={`Remove surface ${index + 1}`} className={styles.buttonGhost} onClick={() => setPrintAreas((current) => current.filter((_, itemIndex) => itemIndex !== index))} type="button"><Trash2 size={14} /></button>}</div><div className={styles.fieldGrid}><label className={styles.fieldGroup}><span className={styles.fieldLabel}>Label</span><input className={styles.input} value={area.label} onChange={(event) => setPrintAreas((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))} placeholder="Front" /></label><label className={styles.fieldGroup}><span className={styles.fieldLabel}>ID</span><input className={styles.input} value={area.id} onChange={(event) => setPrintAreas((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, id: safeKey(event.target.value, item.id) } : item))} placeholder="front" /></label><label className={styles.fieldGroup}><span className={styles.fieldLabel}>Width (mm)</span><input className={styles.input} inputMode="decimal" value={area.widthMm} onChange={(event) => setPrintAreas((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, widthMm: event.target.value } : item))} /></label><label className={styles.fieldGroup}><span className={styles.fieldLabel}>Height (mm)</span><input className={styles.input} inputMode="decimal" value={area.heightMm} onChange={(event) => setPrintAreas((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, heightMm: event.target.value } : item))} /></label><label className={styles.fieldGroup}><span className={styles.fieldLabel}>Safe inset (mm)</span><input className={styles.input} inputMode="decimal" value={area.safeInsetMm} onChange={(event) => setPrintAreas((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, safeInsetMm: event.target.value } : item))} /></label></div></div>)}</div>
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
                  {error && <p className={styles.formError} role="alert">{error}</p>}
                </div>
              </div>
              <div className={styles.drawerFooter}>
                <button className={styles.buttonSecondary} onClick={() => { setAdding(false); setEditingProduct(null); }} type="button">Cancel</button>
                <button className={styles.buttonPrimary} disabled={saving || !categoryRecords.length} type="submit"><Archive size={13} /> {saving ? "Saving…" : editingProduct ? "Save changes" : "Save product"}</button>
              </div>
            </form>
          </aside>
        </>
      )}
    </>
  );
}
