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
import { listRanBazaarCustomizationStarters } from "@/lib/ranbazaar-customization-presets";
import { StatusBadge } from "./AdminUI";
import { SurfaceCustomerPreview } from "./SurfaceCustomerPreview";
import styles from "./admin.module.css";

type CategoryRecord = { id: string; slug: string; name: string; parentId: string | null; sortOrder: number };
type StepStatus = "waiting" | "working" | "done" | "failed";

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
  onImportRanBazaar,
  onImportPackaging,
}: {
  categories: CategoryRecord[];
  onClose: () => void;
  onSaved: (productId: string) => void | Promise<void>;
  onImportRanBazaar: () => void | Promise<void>;
  onImportPackaging: () => void | Promise<void>;
}) {
  const starters = useMemo(() => listRanBazaarCustomizationStarters(), []);
  const packagingStarters = useMemo(() => listEzpacPackagingProductTypes(), []);
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
  const [primaryFile, setPrimaryFile] = useState<File | null>(null);
  const [baseFile, setBaseFile] = useState<File | null>(null);
  const [primaryPreview, setPrimaryPreview] = useState("");
  const [basePreview, setBasePreview] = useState("");
  const [uploadedPrimaryUrl, setUploadedPrimaryUrl] = useState("");
  const [publishNow, setPublishNow] = useState(true);
  const [savedProduct, setSavedProduct] = useState<{ id: string; slug: string } | null>(null);
  const [error, setError] = useState("");
  const [saveStatus, setSaveStatus] = useState<StepStatus>("waiting");
  const [uploadStatus, setUploadStatus] = useState<StepStatus>("waiting");
  const [attachStatus, setAttachStatus] = useState<StepStatus>("waiting");
  const [reusingPhoto, setReusingPhoto] = useState(false);
  const previewUrls = useRef(new Set<string>());

  useEffect(() => () => previewUrls.current.forEach((url) => URL.revokeObjectURL(url)), []);
  useEffect(() => {
    if (!skuEdited) setSku(autoSku(name));
  }, [name, skuEdited]);
  useEffect(() => {
    if (categoryId || !categories.length) return;
    setCategoryId(categories[0].id);
  }, [categories, categoryId]);

  const primarySurface = draft.printAreas[0];
  const readiness = checkProductPublishReadiness({
    artworkUpload: draft.artworkUpload,
    acceptedArtworkTypes: draft.acceptedArtworkTypes,
    printAreas: draft.printAreas,
    artworkPolicy: draft.artworkPolicy,
    packagingRequiresVisualization: isEzpacPackagingProductType(productType),
    hasPublishedVisualization: false,
  });
  const essentialsReady = Boolean(name.trim() && price.trim() && Number(price) >= 0 && categoryId && sku.trim());

  function selectDraft(nextDraft: RanBazaarStarterDraft, mode: Exclude<typeof starterMode, null>, suggestedSlug?: string) {
    setDraft(nextDraft); setStarterMode(mode); setStep(2); setError("");
    const matchingCategory = suggestedSlug ? categories.find((category) => category.slug === suggestedSlug) : undefined;
    setCategoryId(matchingCategory?.id ?? categories[0]?.id ?? "");
  }

  function choosePrimary(file: File | undefined) {
    if (!file) return;
    const url = previewFile(file, primaryPreview);
    previewUrls.current.add(url); setPrimaryFile(file); setPrimaryPreview(url); setUploadedPrimaryUrl("");
  }

  function chooseBase(file: File | undefined) {
    if (!file) return;
    const url = previewFile(file, basePreview);
    previewUrls.current.add(url); setBaseFile(file); setBasePreview(url);
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

  async function request(method: "POST" | "PATCH", body: Record<string, unknown>) {
    const response = await fetch("/api/admin/catalog", {
      method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => undefined) as { data?: { id?: string; slug?: string }; error?: { message?: string } } | undefined;
    if (!response.ok) throw new Error(data?.error?.message || "Could not save product.");
    return data?.data;
  }

  async function upload(productId: string, kind: "primary" | "surface-base", file: File, surfaceId?: string) {
    const form = new FormData(); form.set("productId", productId); form.set("kind", kind); form.set("image", file);
    if (surfaceId) form.set("surfaceId", surfaceId);
    const response = await fetch("/api/admin/catalog/images", { method: "POST", body: form });
    const data = await response.json().catch(() => undefined) as { data?: { asset?: { url?: string } }; error?: { message?: string } } | undefined;
    if (!response.ok) throw new Error(data?.error?.message || "The image could not be uploaded.");
    return data?.data?.asset?.url ?? "";
  }

  async function save() {
    setError("");
    if (!essentialsReady) { setStep(2); setError("Add a name, price, category and SKU before saving."); return; }
    if (!primaryFile && !savedProduct) { setStep(3); setError("Choose a product photo before saving."); return; }
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
      if (primaryFile || baseFile) {
        phase = "upload";
        setUploadStatus("working");
        if (primaryFile) {
          imageUrl = await upload(product.id, "primary", primaryFile);
          setUploadedPrimaryUrl(imageUrl); setPrimaryFile(null);
        }
        if (baseFile && primarySurface) {
          await upload(product.id, "surface-base", baseFile, primarySurface.id);
          setBaseFile(null);
        }
        setUploadStatus("done");
      } else setUploadStatus("done");
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
      const response = await fetch("/api/admin/catalog/images/from-source", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: savedProduct.id, surfaceId: primarySurface.id, source: "primary" }),
      });
      const data = await response.json().catch(() => undefined) as { data?: { asset?: { url?: string } }; error?: { message?: string } } | undefined;
      if (!response.ok) throw new Error(data?.error?.message || "The product photo could not be reused.");
      if (data?.data?.asset?.url) setBasePreview(data.data.asset.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The product photo could not be reused.");
    } finally { setReusingPhoto(false); }
  }

  const success = attachStatus === "done" && savedProduct;
  return (
    <>
      <button aria-label="Close quick add" className={styles.drawerBackdrop} onClick={onClose} type="button" />
      <aside aria-label="Quick add product" className={`${styles.drawer} ${styles.quickListDrawer}`}>
        <div className={styles.drawerHeader}>
          <div><h3>Quick add product</h3><p>List a personalizable product with the essentials, then manage advanced settings later.</p></div>
          <button aria-label="Close" className={styles.iconButton} onClick={onClose} type="button"><X size={16} /></button>
        </div>
        <div className={styles.quickListRail} aria-label="Quick add progress">
          {["Pick a starter", "Essentials", "Images & publish"].map((label, index) => <button className={step === index + 1 ? styles.quickListStepActive : styles.quickListStep} key={label} onClick={() => { if (index + 1 <= step) setStep(index + 1); }} type="button"><span>{index + 1}</span>{label}</button>)}
        </div>
        <div className={styles.drawerBody}>
          {step === 1 && <div className={styles.quickListContent}>
            {!categories.length && <div className={styles.quickListImportCard}><strong>No categories yet — import the RanBazaar category groups first</strong><p>Imports only missing category records; it never creates products.</p><span><button className={styles.buttonSecondary} onClick={() => void onImportRanBazaar()} type="button">Import RanBazaar groups</button><button className={styles.buttonSecondary} onClick={() => void onImportPackaging()} type="button">Import packaging groups</button></span></div>}
            <div className={styles.quickListStarterGrid}>
              {starters.map((starter) => <button className={styles.configCard} key={starter.id} onClick={() => { const next = createRanBazaarStarterDraft(starter.id); if (next) selectDraft(next, "ranbazaar", categoryByStarter[starter.id]); }} type="button"><strong>{starter.name}</strong><small>{starter.description}</small><span className={styles.quickListChips}><StatusBadge>{starter.fields.length} fields</StatusBadge><StatusBadge>{starter.surfaces.length} surface{starter.surfaces.length === 1 ? "" : "s"}</StatusBadge>{starter.artworkUpload.enabled && <StatusBadge tone="info">Photo upload allowed</StatusBadge>}{starter.fields.find((field) => field.maxLength)?.maxLength && <StatusBadge>max {starter.fields.find((field) => field.maxLength)?.maxLength} chars</StatusBadge>}</span></button>)}
              <button className={styles.configCard} onClick={() => selectDraft(blankDraft(), "blank")} type="button"><Package size={18} /><strong>Blank product</strong><small>No personalization. Add configuration later in the advanced form.</small></button>
              <div className={styles.configCard}><Sparkles size={18} /><strong>Packaging starter</strong><small>Start with existing packaging fields.</small><select className={styles.select} onChange={(event) => { setProductType(event.target.value); const next = packagingDraft(event.target.value); if (next) selectDraft(next, "packaging"); }} value={productType}><option value="">Choose packaging type</option>{packagingStarters.map((starter) => <option key={starter.id} value={starter.id}>{starter.name}</option>)}</select></div>
            </div>
          </div>}
          {step === 2 && <div className={styles.quickListContent}>
            <div className={styles.quickListForm}>
              <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Name</span><input className={styles.input} onChange={(event) => setName(event.target.value)} required value={name} /></label>
              <div className={styles.fieldGrid}><label className={styles.fieldGroup}><span className={styles.fieldLabel}>Price (₹)</span><input className={styles.input} inputMode="decimal" min="0" onChange={(event) => setPrice(event.target.value)} required type="number" value={price} /></label><label className={styles.fieldGroup}><span className={styles.fieldLabel}>Category</span><select className={styles.select} onChange={(event) => setCategoryId(event.target.value)} required value={categoryId}><option value="" disabled>Choose a category</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
              <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Description <small>Optional</small></span><input className={styles.input} onChange={(event) => setDescription(event.target.value)} value={description} /></label>
              <div className={styles.quickListSku}><span>SKU <strong>{sku}</strong></span><button className={styles.buttonGhost} onClick={() => setSkuEdited((current) => !current)} type="button">{skuEdited ? "Auto" : "Edit"}</button>{skuEdited && <input aria-label="SKU" className={styles.input} onChange={(event) => setSku(event.target.value)} value={sku} />}</div>
              <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Preview sample text</span><input className={styles.input} onChange={(event) => setSampleText(event.target.value)} value={sampleText} /></label>
              <div className={styles.quickListChecklist}><strong>Publish readiness</strong>{readiness.items.map((item) => <p key={item.id} className={item.ready ? styles.quickListReady : styles.quickListNotReady}><span>{item.ready ? <Check size={13} /> : "×"}</span>{item.ready ? item.id.replaceAll("-", " ") : item.message}{!item.blocking && " (hint)"}</p>)}</div>
            </div>
            <SurfaceCustomerPreview baseImageUrl={basePreview} heightMm={primarySurface?.heightMm} productPhotoUrl={primaryPreview} sampleText={sampleText} surfaceLabel={primarySurface?.label ?? "Primary surface"} widthMm={primarySurface?.widthMm} />
          </div>}
          {step === 3 && <div className={styles.quickListContent}>
            <div className={styles.quickListForm}>
              <div className={styles.assetPicker}><div className={styles.assetPreview}>{primaryPreview ? <img alt="Product photo preview" src={primaryPreview} /> : <FileImage size={20} />}</div><label className={styles.fieldGroup}><span className={styles.fieldLabel}>Product photo</span><input accept="image/jpeg,image/png,image/webp" className={styles.assetFileInput} onChange={(event) => choosePrimary(event.target.files?.[0])} type="file" /><small>Used on storefront product listings.</small></label></div>
              <div className={styles.assetPicker}><div className={styles.assetPreview}>{basePreview ? <img alt="Base image preview" src={basePreview} /> : <FileImage size={20} />}</div><label className={styles.fieldGroup}><span className={styles.fieldLabel}>Base image for the customer&apos;s 2D canvas</span><input accept="image/jpeg,image/png,image/webp" className={styles.assetFileInput} onChange={(event) => chooseBase(event.target.files?.[0])} type="file" /><small>Optional. Shown underneath customer text and photo layers.</small></label></div>
              {savedProduct && <button className={styles.buttonSecondary} disabled={reusingPhoto} onClick={() => void reusePhotoForBase()} type="button">{reusingPhoto ? <LoaderCircle className={styles.studioSpin} size={13} /> : <FileImage size={13} />} Use this product&apos;s photo</button>}
              <fieldset className={styles.quickListPublishChoice}><legend>Save choice</legend><label><input checked={publishNow} name="quick-publish" onChange={() => setPublishNow(true)} type="radio" /> Publish now</label><label><input checked={!publishNow} name="quick-publish" onChange={() => setPublishNow(false)} type="radio" /> Save as draft</label></fieldset>
              <div className={styles.quickListSequence} aria-live="polite">{[["1", "saving draft", saveStatus], ["2", "uploading images", uploadStatus], ["3", publishNow ? "attaching and publishing" : "attaching", attachStatus]].map(([number, label, status]) => <span className={styles[`quickListSequence${String(status)[0].toUpperCase()}${String(status).slice(1)}` as "quickListSequenceWaiting"]} key={String(number)}>{number}) {label} {status === "done" ? "✓" : status === "working" ? "…" : status === "failed" ? "×" : ""}</span>)}</div>
              {error && <p className={styles.formError} role="alert">{error}</p>}
              {success ? <div className={styles.quickListSuccess}><strong>{publishNow ? "Product published" : "Draft saved"}</strong><p><a href={`/products/${savedProduct.slug}`} target="_blank">/products/{savedProduct.slug}</a></p><button className={styles.buttonPrimary} onClick={() => void onSaved(savedProduct.id)} type="button">Open 3D visualization studio</button></div> : <button className={styles.buttonPrimary} disabled={saveStatus === "working" || uploadStatus === "working" || attachStatus === "working" || (publishNow && !readiness.canPublish)} onClick={() => void save()} type="button">{saveStatus === "working" || uploadStatus === "working" || attachStatus === "working" ? "Saving…" : (saveStatus === "failed" || uploadStatus === "failed" || attachStatus === "failed") ? "Retry failed step" : publishNow ? "Save and publish" : "Save draft"}</button>}
            </div>
            <SurfaceCustomerPreview baseImageUrl={basePreview} heightMm={primarySurface?.heightMm} productPhotoUrl={primaryPreview} sampleText={sampleText} surfaceLabel={primarySurface?.label ?? "Primary surface"} widthMm={primarySurface?.widthMm} />
          </div>}
        </div>
        <div className={styles.drawerFooter}>
          <button className={styles.buttonSecondary} onClick={() => step === 1 ? onClose() : setStep((current) => current - 1)} type="button">{step === 1 ? "Cancel" : <><ChevronLeft size={13} /> Back</>}</button>
          {step < 3 && <button className={styles.buttonPrimary} disabled={step === 1 ? !starterMode : !essentialsReady} onClick={() => setStep((current) => current + 1)} type="button">Continue <ChevronRight size={13} /></button>}
        </div>
      </aside>
    </>
  );
}
