"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

import { autoSku, type RanBazaarStarterDraft } from "@/lib/admin-quick-list";
import type { ListingPublishResult, ThreeDOutcome } from "@/lib/listing-publish";
import {
  applyPrintOptions,
  buildCategoryOptions,
  draftFromExistingProduct,
  hasListingInput,
  listingFieldErrors,
  missingForPublish,
  missingSummary,
  newListingId,
  parseListingDraft,
  printOptionsFor,
  quickListProductPayload,
  recipeChangePrompt,
  recipeDraftFor,
  serializeListingDraft,
  sizePresetsFor,
  suggestCategories,
  suggestProductName,
  togglePrintOption,
  WIZARD_DRAFT_STORAGE_KEY,
  writeDescription,
  type CategoryOption,
  type PersistedListingDraft,
  type PrintOptionState,
  type SizeMm,
  type TextPosition,
} from "@/lib/listing-wizard";
import { CategoryPicker } from "./listing/CategoryPicker";
import { EssentialsForm, type EssentialsValues } from "./listing/EssentialsForm";
import { ListingPreviewPanel, type PreviewTab } from "./listing/ListingPreviewPanel";
import { ListingSuccess } from "./listing/ListingSuccess";
import { PhotoDropzone } from "./listing/PhotoDropzone";
import { PublishProgress, type PublishStage } from "./listing/PublishProgress";
import { deleteListingPhoto, MAX_LISTING_PHOTOS, processPhoto, uploadListingPhoto, type ListingPhoto } from "./listing/photo-processing";
import { StudioDesignEditor } from "./StudioDesignEditor";
import styles from "./admin.module.css";

type CategoryRecord = { id: string; slug: string; name: string; parentId: string | null; sortOrder: number; isActive?: boolean };
type Step = 1 | 2 | 3;

const STEPS: Record<Step, string> = { 1: "Photos", 2: "What is it?", 3: "Name & price" };
const HEADINGS: Record<Step, string> = {
  1: "Add photos of your product",
  2: "What are you selling?",
  3: "Name it, price it, publish",
};

const emptyEssentials = (): EssentialsValues => ({
  name: "", price: "", description: "", compareAtPrice: "", sku: autoSku(""), skuEdited: false, gstPercent: null,
  stockOnHand: "", productionDaysMin: "", productionDaysMax: "", quantityMin: "", quantityMax: "", extraCategoryIds: [],
});

const numberOrUndefined = (value: string) => value.trim() === "" || !Number.isFinite(Number(value)) ? undefined : Number(value);
const photoId = () => `p${Math.random().toString(36).slice(2, 10)}`;
const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

async function postListing<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch("/api/admin/listings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => undefined) as { data?: T; error?: { message?: string } } | undefined;
  if (!response.ok || !data?.data) throw new Error(data?.error?.message || "Something went wrong. Please try again.");
  return data.data;
}

/**
 * Add product: photo first, what it is (auto-suggested), name and price, then
 * one Publish that does everything (photos, 2D design, 3D preview). A live
 * preview sits beside every step. Work is autosaved on this device.
 */
export function QuickListProductWizard({
  categories,
  catalogProducts = [],
  duplicateFrom = null,
  onClose,
  onSaved,
  onEditDetails,
  onImportRanBazaar,
  onImportPackaging,
}: {
  categories: CategoryRecord[];
  /** Existing products: the picture on each category card, and the "Similar products" context. */
  catalogProducts?: Array<{ id: string; name: string; categoryId?: string; imageUrl?: string }>;
  /** "Duplicate" from the products list: category, fields, options and price come pre-filled, no photos. */
  duplicateFrom?: { id: string; name: string } | null;
  onClose: () => void;
  /** The product list should refresh (the wizard stays open on its success screen). */
  onSaved: (productId: string) => void | Promise<void>;
  /** Opens the advanced editor for a saved product. */
  onEditDetails: (productId: string) => void | Promise<void>;
  onImportRanBazaar: () => void | Promise<void>;
  onImportPackaging: () => void | Promise<void>;
}) {
  const options = useMemo(() => buildCategoryOptions(categories, catalogProducts.flatMap((product) => product.categoryId ? [{ categoryId: product.categoryId, imageUrl: product.imageUrl }] : [])), [categories, catalogProducts]);
  const optionById = useMemo(() => new Map(options.map((option) => [option.categoryId, option])), [options]);

  const [listingId, setListingId] = useState(() => newListingId());
  const [productId, setProductId] = useState("");
  const [step, setStep] = useState<Step>(1);
  const [photos, setPhotos] = useState<ListingPhoto[]>([]);
  const [photoMessage, setPhotoMessage] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [categoryConfirmed, setCategoryConfirmed] = useState(false);
  const [draft, setDraft] = useState<RanBazaarStarterDraft>(() => recipeDraftFor(undefined));
  const [printOptions, setPrintOptions] = useState<PrintOptionState[]>([]);
  const [values, setValues] = useState<EssentialsValues>(emptyEssentials);
  const [nameEdited, setNameEdited] = useState(false);
  const [sampleText, setSampleText] = useState("Aarav");
  const [textPosition, setTextPosition] = useState<TextPosition>("middle");
  const [sizeMm, setSizeMm] = useState<SizeMm | null>(null);
  const [previewTab, setPreviewTab] = useState<PreviewTab>("card");
  const [pendingCategory, setPendingCategory] = useState<{ option: CategoryOption; message: string } | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [stage, setStage] = useState<PublishStage | null>(null);
  const [savingAsDraft, setSavingAsDraft] = useState(false);
  const [error, setError] = useState("");
  const [allowNoPhoto, setAllowNoPhoto] = useState(false);
  const [result, setResult] = useState<ListingPublishResult | null>(null);
  const [restorePrompt, setRestorePrompt] = useState<PersistedListingDraft | null>(null);
  const [designEditorOpen, setDesignEditorOpen] = useState(false);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const photosRef = useRef(photos);
  const productIdRef = useRef(productId);
  const preparing = useRef<Promise<string> | null>(null);
  const pumping = useRef<Promise<void> | null>(null);
  const objectUrls = useRef(new Set<string>());
  const valuesRef = useRef(values);
  photosRef.current = photos;
  productIdRef.current = productId;
  valuesRef.current = values;

  const selected = categoryId ? optionById.get(categoryId) : undefined;
  const recipe = selected?.recipe;
  const fileNames = useMemo(() => photos.map((photo) => photo.fileName), [photos]);
  const suggestions = useMemo(() => suggestCategories(options, { fileNames, text: values.name }), [options, fileNames, values.name]);
  const sizePresets = useMemo(() => sizePresetsFor(recipe), [recipe]);
  const size = sizeMm ?? sizePresets.find((preset) => preset.id === "medium") ?? null;
  const mainPhoto = photos.find((photo) => photo.status !== "processing" && (photo.previewUrl || photo.assetId));
  const previewPhoto = mainPhoto ? { url: mainPhoto.previewUrl || `/api/product-images/${mainPhoto.assetId}`, width: mainPhoto.width, height: mainPhoto.height } : null;
  const fieldErrors = listingFieldErrors(values);
  const missing = missingForPublish({ photoCount: photos.length, categoryId, name: values.name, price: values.price });
  const busy = stage !== null;
  const extraCategoryChoices = useMemo(() => {
    const slugs = new Set(recipe?.collectionSlugs ?? []);
    return categories.filter((category) => slugs.has(category.slug)).map((category) => ({ id: category.id, name: category.name }));
  }, [categories, recipe]);

  /* ---- lifecycle -------------------------------------------------------- */

  useEffect(() => () => objectUrls.current.forEach((url) => URL.revokeObjectURL(url)), []);
  useEffect(() => { headingRef.current?.focus(); }, [step, result]);
  useEffect(() => { if (!values.skuEdited) setValues((current) => ({ ...current, sku: autoSku(current.name) })); }, [values.name, values.skuEdited]);

  // Offer to continue a saved listing (not when duplicating, which starts from a product).
  useEffect(() => {
    if (duplicateFrom) return;
    const saved = parseListingDraft(window.localStorage.getItem(WIZARD_DRAFT_STORAGE_KEY));
    if (saved && hasListingInput({ ...saved, photoCount: saved.photos.length })) setRestorePrompt(saved);
  }, [duplicateFrom]);

  // Duplicate: copy setup, never identity or photos.
  useEffect(() => {
    if (!duplicateFrom) return;
    let live = true;
    void (async () => {
      try {
        const response = await fetch(`/api/admin/catalog?productId=${encodeURIComponent(duplicateFrom.id)}`, { cache: "no-store" });
        const data = await response.json().catch(() => undefined) as { data?: { product?: Record<string, unknown> } } | undefined;
        const product = data?.data?.product;
        if (!response.ok || !product || !live) throw new Error();
        const copy = draftFromExistingProduct(duplicateFrom.name, product);
        const option = optionById.get(copy.categoryId);
        setDraft(copy.draft);
        setCategoryId(option ? copy.categoryId : "");
        setCategoryConfirmed(Boolean(option));
        setPrintOptions(printOptionsFor(copy.draft, option?.recipe));
        setValues((current) => ({ ...current, price: copy.priceText, description: copy.description.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() }));
      } catch {
        if (live) setError("Couldn't copy that product's setup. You can still list it from scratch.");
      }
    })();
    return () => { live = false; };
  }, [duplicateFrom, optionById]);

  // Autosave to this device (no photo bytes: uploaded photos are kept by id).
  useEffect(() => {
    if (result || restorePrompt) return;
    const timer = window.setTimeout(() => {
      const hasInput = hasListingInput({ ...values, categoryId, photoCount: photos.length });
      if (!hasInput) return;
      window.localStorage.setItem(WIZARD_DRAFT_STORAGE_KEY, serializeListingDraft({
        listingId, step, productId, categoryId, name: values.name, nameEdited, price: values.price, description: values.description,
        compareAtPrice: values.compareAtPrice, sku: values.sku, skuEdited: values.skuEdited, gstPercent: values.gstPercent,
        stockOnHand: values.stockOnHand, productionDaysMin: values.productionDaysMin, productionDaysMax: values.productionDaysMax,
        quantityMin: values.quantityMin, quantityMax: values.quantityMax, extraCategoryIds: values.extraCategoryIds,
        printOptions, sizeMm, textPosition, sampleText,
        photos: photos.flatMap((photo) => photo.assetId ? [{ id: photo.id, fileName: photo.fileName, width: photo.width, height: photo.height, assetId: photo.assetId }] : []),
      }));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [categoryId, listingId, nameEdited, photos, printOptions, productId, restorePrompt, result, sampleText, sizeMm, step, textPosition, values]);

  function restore(saved: PersistedListingDraft) {
    const option = optionById.get(saved.categoryId);
    const nextDraft = recipeDraftFor(option?.recipe);
    setListingId(saved.listingId);
    setProductId(saved.productId);
    setStep(saved.step);
    setCategoryId(option ? saved.categoryId : "");
    setCategoryConfirmed(Boolean(option));
    setDraft(nextDraft);
    setPrintOptions(saved.printOptions.length ? saved.printOptions : printOptionsFor(nextDraft, option?.recipe));
    setValues({
      name: saved.name, price: saved.price, description: saved.description, compareAtPrice: saved.compareAtPrice, sku: saved.sku || autoSku(saved.name),
      skuEdited: saved.skuEdited, gstPercent: saved.gstPercent, stockOnHand: saved.stockOnHand, productionDaysMin: saved.productionDaysMin,
      productionDaysMax: saved.productionDaysMax, quantityMin: saved.quantityMin, quantityMax: saved.quantityMax, extraCategoryIds: saved.extraCategoryIds,
    });
    setNameEdited(saved.nameEdited);
    setSizeMm(saved.sizeMm);
    setTextPosition(saved.textPosition);
    setSampleText(saved.sampleText);
    setPhotos(saved.photos.map((photo) => ({
      id: photo.id, fileName: photo.fileName, previewUrl: `/api/product-images/${photo.assetId}`, width: photo.width, height: photo.height,
      warnings: [], status: "uploaded", progress: 100, assetId: photo.assetId,
    })));
    setRestorePrompt(null);
  }

  async function startOver(saved: PersistedListingDraft) {
    window.localStorage.removeItem(WIZARD_DRAFT_STORAGE_KEY);
    setRestorePrompt(null);
    if (saved.productId) {
      try { await postListing({ phase: "discard", listingId: saved.listingId }); } catch { /* an orphaned draft is harmless */ }
    }
  }

  /* ---- photos ----------------------------------------------------------- */

  const updatePhoto = useCallback((id: string, patch: Partial<ListingPhoto>) => {
    setPhotos((current) => current.map((photo) => photo.id === id ? { ...photo, ...patch } : photo));
  }, []);

  /** The listing's draft product, created on the first photo so uploads can start right away. */
  const ensureProduct = useCallback(async (): Promise<string> => {
    if (productIdRef.current) return productIdRef.current;
    if (!preparing.current) {
      preparing.current = (async () => {
        const top = suggestCategories(options, { fileNames: photosRef.current.map((photo) => photo.fileName) })[0];
        const current = valuesRef.current;
        const fallbackName = suggestProductName(top?.label ?? "Product", photosRef.current.map((photo) => photo.fileName));
        const name = current.name.trim().length >= 2 ? current.name.trim() : fallbackName.length >= 2 ? fallbackName : "New product";
        const chosenCategory = categoryId || top?.categoryId || "";
        if (!chosenCategory) throw new Error("Add a category in the advanced editor first.");
        const prepared = await postListing<{ productId: string }>({
          phase: "prepare",
          listingId,
          product: quickListProductPayload({
            name, sku: current.sku || autoSku(name), categoryId: chosenCategory, price: 0, description: "", productType: "",
            draft: recipeDraftFor(undefined), published: false, imageUrl: "/api/product-images/pending",
          }),
        });
        productIdRef.current = prepared.productId;
        setProductId(prepared.productId);
        return prepared.productId;
      })().finally(() => { preparing.current = null; });
    }
    return preparing.current;
  }, [categoryId, listingId, options]);

  /** Uploads every photo waiting for it, one at a time; failures stay retryable. */
  const pumpUploads = useCallback(async () => {
    if (pumping.current) return pumping.current;
    pumping.current = (async () => {
      try {
        let target = await ensureProduct();
        for (;;) {
          const next = photosRef.current.find((photo) => photo.status === "ready");
          if (!next) break;
          updatePhoto(next.id, { status: "uploading", progress: 1, error: undefined });
          try {
            const uploaded = await uploadListingPhoto(target, next, (progress) => updatePhoto(next.id, { progress }));
            updatePhoto(next.id, { status: "uploaded", progress: 100, assetId: uploaded.assetId });
          } catch (cause) {
            const message = cause instanceof Error ? cause.message : "Upload failed — retry.";
            // The draft vanished (e.g. "Start over" elsewhere): make a new one and try again.
            if (/not found/i.test(message)) { productIdRef.current = ""; setProductId(""); target = await ensureProduct(); updatePhoto(next.id, { status: "ready", progress: 0 }); continue; }
            updatePhoto(next.id, { status: "failed", progress: 0, error: message });
          }
        }
      } catch (cause) {
        setPhotoMessage(cause instanceof Error ? cause.message : "Photos couldn't upload yet. They'll upload when you publish.");
      } finally {
        pumping.current = null;
      }
    })();
    return pumping.current;
  }, [ensureProduct, updatePhoto]);

  useEffect(() => {
    if (photos.some((photo) => photo.status === "ready") && !pumping.current) void pumpUploads();
  }, [photos, pumpUploads]);

  const addFiles = useCallback((files: File[]) => {
    setPhotoMessage("");
    const room = MAX_LISTING_PHOTOS - photosRef.current.length;
    if (room <= 0) { setPhotoMessage("A product can have up to 8 photos. Remove one to add another."); return; }
    if (files.length > room) setPhotoMessage(`Only the first ${room} photo${room === 1 ? "" : "s"} were added — 8 is the most.`);
    for (const file of files.slice(0, room)) {
      const id = photoId();
      setPhotos((current) => [...current, { id, fileName: file.name, previewUrl: "", width: 0, height: 0, warnings: [], status: "processing", progress: 0 }]);
      processPhoto(file)
        .then((processed) => {
          if (processed.previewUrl) objectUrls.current.add(processed.previewUrl);
          updatePhoto(id, { ...processed, status: "ready" });
        })
        .catch((cause) => {
          setPhotos((current) => current.filter((photo) => photo.id !== id));
          setPhotoMessage(cause instanceof Error ? `${file.name}: ${cause.message}` : `${file.name} couldn't be added.`);
        });
    }
  }, [updatePhoto]);

  function removePhoto(id: string) {
    const photo = photos.find((item) => item.id === id);
    if (photo?.assetId && productId) void deleteListingPhoto(productId, photo.assetId);
    if (photo?.previewUrl.startsWith("blob:")) { URL.revokeObjectURL(photo.previewUrl); objectUrls.current.delete(photo.previewUrl); }
    setPhotos((current) => current.filter((item) => item.id !== id));
  }

  function movePhoto(id: string, toIndex: number) {
    setPhotos((current) => {
      const from = current.findIndex((photo) => photo.id === id);
      if (from < 0) return current;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(Math.max(0, Math.min(next.length, toIndex)), 0, moved);
      return next;
    });
  }

  /* ---- category --------------------------------------------------------- */

  function applyCategory(option: CategoryOption, nextDraft = recipeDraftFor(option.recipe)) {
    setCategoryId(option.categoryId);
    setDraft(nextDraft);
    setPrintOptions(printOptionsFor(nextDraft, option.recipe));
    setSizeMm(null);
    setPendingCategory(null);
    const collectionIds = categories.filter((category) => option.recipe?.collectionSlugs?.includes(category.slug)).map((category) => category.id);
    setValues((current) => ({
      ...current,
      gstPercent: null,
      extraCategoryIds: collectionIds,
      ...(!nameEdited ? { name: suggestProductName(option.label, fileNames) } : {}),
    }));
    const hasText = nextDraft.configurationFields.some((field) => field.inputType === "text");
    setPreviewTab(option.has3D && photos.length ? "3d" : hasText ? "2d" : "card");
  }

  function pickCategory(option: CategoryOption) {
    if (option.categoryId === categoryId) return;
    const nextDraft = recipeDraftFor(option.recipe);
    const prompt = categoryConfirmed && categoryId ? recipeChangePrompt({ currentDraft: draft, nextDraft, nextLabel: option.label }) : null;
    if (prompt) { setPendingCategory({ option, message: prompt }); return; }
    applyCategory(option, nextDraft);
  }

  /* ---- navigation -------------------------------------------------------- */

  function goTo(next: Step) {
    setError("");
    if (next === 2 && !categoryId && suggestions[0]) applyCategory(suggestions[0]);
    if (step === 2 && next === 3) setCategoryConfirmed(true);
    setStep(next);
  }

  function continueStep() {
    if (step === 1) {
      if (!photos.length && !allowNoPhoto) { setAllowNoPhoto(true); setPhotoMessage("Add a photo first — customers buy what they can see."); return; }
      goTo(2);
    } else if (step === 2) {
      if (!categoryId) { setError("Pick what you're selling."); return; }
      goTo(3);
    } else {
      void publish(true);
    }
  }

  const hasInput = hasListingInput({ ...values, categoryId, photoCount: photos.length });
  function requestClose() {
    if (busy) return;
    if (!result && hasInput && !window.confirm("Close this listing? It stays saved on this device, so you can continue later.")) return;
    onClose();
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (designEditorOpen) return;
    if (event.key === "Escape") { event.preventDefault(); requestClose(); return; }
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    const target = event.target as HTMLElement;
    if (target.closest("textarea, button, a, select, form, summary, [role='tab'], [draggable='true']")) return;
    if (result || restorePrompt || pendingCategory || busy) return;
    event.preventDefault();
    continueStep();
  }

  /* ---- publish ---------------------------------------------------------- */

  async function waitForPhotos() {
    for (let waited = 0; photosRef.current.some((photo) => photo.status === "processing") && waited < 20_000; waited += 150) await sleep(150);
    await pumpUploads();
    const failed = photosRef.current.filter((photo) => photo.status === "failed" || photo.status === "ready" || photo.status === "uploading");
    if (failed.length) throw new Error(`${failed.length === 1 ? "One photo" : `${failed.length} photos`} didn't upload. Tap Retry on ${failed.length === 1 ? "it" : "them"}, or remove ${failed.length === 1 ? "it" : "them"}.`);
    return photosRef.current.flatMap((photo) => photo.assetId ? [photo.assetId] : []);
  }

  async function publish(live: boolean) {
    setShowErrors(true);
    setError("");
    const blockers = live ? missing : [];
    if (blockers.length) {
      setError(missingSummary(blockers));
      if (blockers.includes("a photo")) setStep(1);
      else if (blockers.includes("what it is")) setStep(2);
      return;
    }
    setSavingAsDraft(!live);
    setStage("photos");
    let threeDTimer = 0;
    try {
      await ensureProduct();
      const assetIds = await waitForPhotos();
      setStage("details");
      if (recipe?.threeDPath === "template" && assetIds.length) threeDTimer = window.setTimeout(() => setStage("3d"), 1500);
      const name = values.name.trim().length >= 2 ? values.name.trim() : suggestProductName(selected?.label ?? "Product", fileNames) || "New product";
      const product = quickListProductPayload({
        name,
        sku: values.sku.trim() || autoSku(name),
        categoryId,
        categoryIds: [categoryId, ...values.extraCategoryIds],
        price: values.price.trim() === "" ? 0 : values.price,
        compareAtPrice: values.compareAtPrice,
        description: values.description,
        productType: "",
        draft,
        published: live,
        imageUrl: "/api/product-images/pending",
        recipe,
        categoryName: selected?.categoryName ?? "",
        printOptions,
        sizeMm: sizeMm ?? null,
        ...(values.gstPercent !== null ? { gstPercent: values.gstPercent } : {}),
        stockOnHand: numberOrUndefined(values.stockOnHand),
        productionDaysMin: numberOrUndefined(values.productionDaysMin),
        productionDaysMax: numberOrUndefined(values.productionDaysMax),
        quantityMin: numberOrUndefined(values.quantityMin),
        quantityMax: numberOrUndefined(values.quantityMax),
      });
      const published = await postListing<ListingPublishResult>({
        phase: "publish", listingId, product, imageAssetIds: assetIds, publish: live, textPosition,
        ...(productIdRef.current ? { productId: productIdRef.current } : {}),
      });
      setStage("finishing");
      window.localStorage.removeItem(WIZARD_DRAFT_STORAGE_KEY);
      setResult(published);
      if (published.threeD.status === "ready" || published.threeD.status === "builtin") setPreviewTab("3d");
      void onSaved(published.productId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't publish. Please try again.");
    } finally {
      window.clearTimeout(threeDTimer);
      setStage(null);
    }
  }

  function addAnother() {
    const keep = selected;
    photos.forEach((photo) => { if (photo.previewUrl.startsWith("blob:")) URL.revokeObjectURL(photo.previewUrl); });
    setListingId(newListingId());
    setProductId("");
    productIdRef.current = "";
    setPhotos([]);
    setValues(emptyEssentials());
    setNameEdited(false);
    setResult(null);
    setShowErrors(false);
    setAllowNoPhoto(false);
    setError("");
    setStep(1);
    if (keep) { applyCategory(keep); setCategoryConfirmed(true); }
  }

  /* ---- render ----------------------------------------------------------- */

  const applyOptions = (next: PrintOptionState[]) => setPrintOptions(next);
  const fieldsForPreview = useMemo(() => applyPrintOptions(draft.configurationFields, printOptions), [draft, printOptions]);
  const threeD: ThreeDOutcome = result?.threeD ?? { status: "none" };

  return (
    <>
      <div aria-hidden className={styles.drawerBackdrop} onClick={requestClose} />
      <aside aria-labelledby="listing-step-heading" aria-modal="true" className={styles.listingWizard} onKeyDown={onKeyDown} role="dialog">
        <header className={styles.listingHeader}>
          <div>
            <h2>Add product</h2>
            {!result && <ol aria-label="Steps" className={styles.listingSteps}>
              {([1, 2, 3] as const).map((item) => (
                <li key={item}>
                  <button
                    aria-current={step === item ? "step" : undefined}
                    aria-label={`Step ${item}: ${STEPS[item]}`}
                    className={step === item ? styles.listingStepActive : item < step ? styles.listingStepDone : styles.listingStep}
                    disabled={item > step || busy}
                    onClick={() => goTo(item)}
                    type="button"
                  ><span aria-hidden>{item}</span><b className={styles.listingStepLabel}>{STEPS[item]}</b></button>
                </li>
              ))}
            </ol>}
          </div>
          <button aria-label="Close add product" className={styles.iconButton} onClick={requestClose} type="button"><X aria-hidden size={18} /></button>
        </header>

        <div className={styles.listingMain}>
          <div className={styles.listingContent}>
            {restorePrompt ? (
              <div className={styles.listingRestore} role="alertdialog" aria-labelledby="listing-step-heading">
                <h3 id="listing-step-heading" ref={headingRef} tabIndex={-1}>Continue where you left off?</h3>
                <p>{restorePrompt.name.trim() || optionById.get(restorePrompt.categoryId)?.label || "A product"}{restorePrompt.photos.length ? ` · ${restorePrompt.photos.length} photo${restorePrompt.photos.length === 1 ? "" : "s"}` : ""}</p>
                <div className={styles.listingSuccessActions}>
                  <button className={styles.buttonPrimary} onClick={() => restore(restorePrompt)} type="button">Continue</button>
                  <button className={styles.buttonSecondary} onClick={() => void startOver(restorePrompt)} type="button">Start over</button>
                </div>
              </div>
            ) : result ? (
              <ListingSuccess
                canAdjustText={result.design2D !== "none"}
                name={values.name.trim() || "Your product"}
                onAddAnother={addAnother}
                onAdjustText={() => setDesignEditorOpen(true)}
                onEditDetails={() => void onEditDetails(result.productId)}
                onTryAnotherPhoto={() => { setResult(null); setStep(1); setPhotoMessage("Add a clearer photo of the front, then tap ★ to make it the main photo."); }}
                photoUrl={previewPhoto?.url ?? ""}
                published={result.published}
                slug={result.slug}
                threeD={threeD}
              />
            ) : (
              <>
                <h3 className={styles.listingStepHeading} id="listing-step-heading" ref={headingRef} tabIndex={-1}>{HEADINGS[step]}</h3>
                {!categories.length && (
                  <div className={styles.listingSuccessWarning}>
                    <p>There are no product types yet. Add the standard ones first.</p>
                    <div className={styles.listingSuccessActions}>
                      <button className={styles.buttonSecondary} onClick={() => void onImportRanBazaar()} type="button">Add personalised types</button>
                      <button className={styles.buttonSecondary} onClick={() => void onImportPackaging()} type="button">Add packaging types</button>
                    </div>
                  </div>
                )}
                {step === 1 && <PhotoDropzone
                  message={photoMessage}
                  onAddFiles={addFiles}
                  onMakeMain={(id) => movePhoto(id, 0)}
                  onMove={movePhoto}
                  onRemove={removePhoto}
                  onRetry={(id) => updatePhoto(id, { status: "ready", progress: 0, error: undefined })}
                  photos={photos}
                />}
                {step === 2 && <CategoryPicker onPick={pickCategory} options={options} selectedId={categoryId} suggestions={suggestions} />}
                {step === 3 && <EssentialsForm
                  errors={fieldErrors}
                  extraCategoryChoices={extraCategoryChoices}
                  onChange={(patch) => {
                    if (patch.name !== undefined) setNameEdited(true);
                    setValues((current) => ({ ...current, ...patch }));
                  }}
                  onTogglePrintOption={(key, value) => applyOptions(togglePrintOption(printOptions, key, value))}
                  onWriteDescription={() => setValues((current) => ({ ...current, description: writeDescription(recipe, current.name, selected?.label) }))}
                  printOptions={printOptions}
                  recipe={recipe}
                  showErrors={showErrors}
                  values={values}
                />}
                {pendingCategory && (
                  <div aria-labelledby="listing-confirm-title" className={styles.listingConfirm} role="alertdialog">
                    <p id="listing-confirm-title">{pendingCategory.message}</p>
                    <div className={styles.listingSuccessActions}>
                      <button autoFocus className={styles.buttonPrimary} onClick={() => applyCategory(pendingCategory.option)} type="button">Replace</button>
                      <button className={styles.buttonSecondary} onClick={() => setPendingCategory(null)} type="button">Keep mine</button>
                    </div>
                  </div>
                )}
                {error && <p className={styles.listingInlineError} role="alert">{error}</p>}
              </>
            )}
          </div>

          <ListingPreviewPanel
            categoryName={selected?.categoryName ?? ""}
            compareAtPrice={values.compareAtPrice}
            fields={fieldsForPreview}
            name={values.name}
            onSampleTextChange={setSampleText}
            onSizeChange={setSizeMm}
            onTabChange={setPreviewTab}
            onTextPositionChange={setTextPosition}
            photo={previewPhoto}
            price={values.price}
            printAreas={draft.printAreas}
            recipe={recipe}
            sampleText={sampleText}
            size={size}
            sizePresets={sizePresets}
            tab={previewTab}
            textPosition={textPosition}
          />
        </div>

        {!result && !restorePrompt && (
          <footer className={styles.listingFooter}>
            {busy ? <PublishProgress draft={savingAsDraft} stage={stage!} total={photos.length} uploaded={photos.filter((photo) => photo.status === "uploaded").length} /> : step === 3 && missing.length > 0 && showErrors ? (
              <p className={styles.listingMissing}>{missingSummary(missing)}</p>
            ) : null}
            <div className={styles.listingFooterActions}>
              <button className={styles.buttonSecondary} disabled={busy} onClick={() => step === 1 ? requestClose() : goTo((step - 1) as Step)} type="button">
                {step === 1 ? "Cancel" : <><ChevronLeft aria-hidden size={15} /> Back</>}
              </button>
              {step === 1 && allowNoPhoto && !photos.length && <button className={styles.buttonGhost} onClick={() => goTo(2)} type="button">Continue without a photo</button>}
              {step < 3 && <button className={styles.buttonPrimary} disabled={busy} onClick={continueStep} type="button">Continue <ChevronRight aria-hidden size={15} /></button>}
              {step === 3 && <>
                <button className={styles.buttonSecondary} disabled={busy} onClick={() => void publish(false)} type="button">Save as draft</button>
                <button className={styles.buttonPrimary} disabled={busy} onClick={() => void publish(true)} type="button">Publish</button>
              </>}
            </div>
          </footer>
        )}
      </aside>
      {designEditorOpen && result && (
        <StudioDesignEditor onClose={() => setDesignEditorOpen(false)} onSaved={() => undefined} productId={result.productId} productName={values.name.trim() || "Product"} />
      )}
    </>
  );
}
