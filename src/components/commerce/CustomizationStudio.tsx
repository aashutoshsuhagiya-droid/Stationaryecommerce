"use client";

import Link from "next/link";
import {
  Check,
  ChevronDown,
  CircleAlert,
  Clock3,
  Heart,
  LockKeyhole,
  Minus,
  PackageCheck,
  Plus,
  RotateCcw,
  Save,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Truck,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArtworkEditor } from "@/components/configurator/ArtworkEditor";
import {
  createArtworkDocument,
  type ArtworkDocument,
  type PrintableSurfaceDefinition,
} from "@/components/configurator/artwork-types";
import configuratorStyles from "@/components/configurator/configurator.module.css";
import { useStore } from "@/components/store/StoreProvider";
import { formatPrice } from "@/lib/data";
import type { ProductConfigurationSchema } from "@/lib/product-configuration";
import type { PersonalizationTemplate, Product } from "@/lib/types";

type QuoteLine = {
  quantity: number;
  unitPricePaise: number;
  lineTotalPaise: number;
  adjustments: Array<{ label: string; amountPaise: number }>;
};

type QuoteSummary = {
  quoteId: string;
  pricingVersion: string;
  calculatedAt: string;
  subtotalPaise: number;
  items: QuoteLine[];
  requiresCheckoutRevalidation: true;
};

type QuoteState =
  | { status: "idle"; message: string }
  | { status: "loading"; message: string }
  | { status: "error"; message: string }
  | { status: "ready"; message: string; data: QuoteSummary };

type SavedDesign = {
  id: string;
  productId: string;
  title: string;
  variantId: string;
  templateId: string;
  dimensionPresetId: string;
  displayUnit: "mm" | "cm" | "in";
  quantity: number;
  fields: Record<string, string>;
  artwork: ArtworkDocument;
  savedAt: string;
};

const SAVED_DESIGNS_KEY = "naamly-saved-designs-v1";

function uniqueId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function initialFields(configuration: ProductConfigurationSchema) {
  return Object.fromEntries(
    configuration.personalization.fields
      .filter((field) => field.type !== "template")
      .map((field) => [field.id, field.options?.[0]?.value ?? ""]),
  );
}

function surfaceDefinitions(
  configuration: ProductConfigurationSchema,
  preset = configuration.dimensions.presets[0],
): PrintableSurfaceDefinition[] {
  const physicalWidthMm = preset?.dimensionsMm?.width;
  const physicalHeightMm = preset?.dimensionsMm?.height;
  const ratio = physicalWidthMm && physicalHeightMm ? physicalWidthMm / physicalHeightMm : 5 / 3;
  const width = ratio >= 1 ? 600 : Math.max(240, Math.round(600 * ratio));
  const height = ratio >= 1 ? Math.max(180, Math.round(600 / ratio)) : 600;
  return configuration.artwork.surfaces.map((surface) => ({
    id: surface.id,
    label: surface.label,
    width,
    height,
    safeInset: Math.max(18, Math.round(Math.min(width, height) * 0.09)),
    physicalWidthMm,
    physicalHeightMm,
    targetDpi: 300,
  }));
}

function createInitialArtwork(configuration: ProductConfigurationSchema) {
  const definitions = surfaceDefinitions(configuration);
  const document = createArtworkDocument(definitions);
  if (!configuration.personalization.fields.some((field) => field.id === "name")) return document;
  const primary = definitions[0] ?? { width: 600, height: 360 };
  return {
    ...document,
    surfaces: document.surfaces.map((surface, index) =>
      index === 0
        ? {
            ...surface,
            layers: [
              {
                id: "personalization-name",
                type: "text" as const,
                name: "Personalized name",
                x: primary.width * 0.2,
                y: primary.height * 0.4,
                width: primary.width * 0.6,
                height: Math.min(70, primary.height * 0.2),
                rotation: 0,
                opacity: 1,
                text: "Your name",
                color: "#17324d",
                fontSize: 40,
                fontFamily: "rounded" as const,
              },
            ],
          }
        : surface,
    ),
  };
}

function readSavedDesigns(): SavedDesign[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(SAVED_DESIGNS_KEY) || "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is SavedDesign => {
      if (!item || typeof item !== "object") return false;
      const candidate = item as Partial<SavedDesign>;
      return typeof candidate.id === "string" && typeof candidate.productId === "string";
    });
  } catch {
    return [];
  }
}

function displayMeasurement(valueMm: number, unit: "mm" | "cm" | "in") {
  const value = unit === "mm" ? valueMm : unit === "cm" ? valueMm / 10 : valueMm / 25.4;
  const precision = unit === "mm" ? 0 : unit === "cm" ? 1 : 2;
  return `${value.toFixed(precision)} ${unit}`;
}

function validateFields(configuration: ProductConfigurationSchema, fields: Record<string, string>, templateId: string) {
  const errors: Record<string, string> = {};
  for (const field of configuration.personalization.fields) {
    if (field.type === "template") {
      if (field.required && !templateId) errors[field.id] = "Choose a design.";
      continue;
    }
    const value = (fields[field.id] ?? "").trim();
    if (field.required && !value) {
      errors[field.id] = `${field.label} is required.`;
      continue;
    }
    if (!value) continue;
    if (field.minLength && value.length < field.minLength) errors[field.id] = `Use at least ${field.minLength} characters.`;
    if (field.maxLength && value.length > field.maxLength) errors[field.id] = `Use no more than ${field.maxLength} characters.`;
    if (field.allowedPattern) {
      try {
        if (!new RegExp(field.allowedPattern, "u").test(value)) errors[field.id] = "Remove unsupported characters.";
      } catch {
        errors[field.id] = "This field has an invalid catalog validation rule.";
      }
    }
    if (field.options?.length && !field.options.some((option) => option.value === value)) {
      errors[field.id] = "Choose an available option.";
    }
  }
  return errors;
}

export function CustomizationStudio({
  product,
  templates,
  configuration,
}: {
  product: Product;
  templates: PersonalizationTemplate[];
  configuration: ProductConfigurationSchema;
}) {
  const { cart, isHydrated, addItem, removeItem, toggleWishlist, isWishlisted } = useStore();
  const firstVariant = configuration.variants[0];
  const firstTemplate = configuration.personalization.templates[0];
  const [configurationId, setConfigurationId] = useState(uniqueId);
  const [variantId, setVariantId] = useState(firstVariant?.id ?? "");
  const [templateId, setTemplateId] = useState(firstTemplate?.id ?? "");
  const [dimensionPresetId, setDimensionPresetId] = useState(configuration.dimensions.presets[0]?.id ?? "");
  const [displayUnit, setDisplayUnit] = useState<"mm" | "cm" | "in">(configuration.dimensions.supportedDisplayUnits[0] ?? "mm");
  const [quantity, setQuantity] = useState<number>(configuration.quantity.minimum);
  const [fields, setFields] = useState<Record<string, string>>(() => initialFields(configuration));
  const [artwork, setArtwork] = useState<ArtworkDocument>(() => createInitialArtwork(configuration));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [quote, setQuote] = useState<QuoteState>({ status: "idle", message: "Complete the required details for a verified price." });
  const [savedDesigns, setSavedDesigns] = useState<SavedDesign[]>([]);
  const [saveMessage, setSaveMessage] = useState("");
  const [added, setAdded] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const initializedFromStorage = useRef(false);

  const selectedVariant = configuration.variants.find((variant) => variant.id === variantId) ?? firstVariant;
  const selectedTemplate = configuration.personalization.templates.find((template) => template.id === templateId) ?? firstTemplate;
  const selectedPreset = configuration.dimensions.presets.find((preset) => preset.id === dimensionPresetId) ?? configuration.dimensions.presets[0];
  const errors = useMemo(() => validateFields(configuration, fields, templateId), [configuration, fields, templateId]);
  const estimatedUnitPaise = (selectedVariant?.unitPricePaise ?? 0) + (selectedTemplate?.premiumPricePaise ?? 0);
  const quotedLine = quote.status === "ready" ? quote.data.items[0] : undefined;
  const displayUnitPrice = quotedLine?.unitPricePaise ?? estimatedUnitPaise;
  const displaySubtotal = quotedLine?.lineTotalPaise ?? estimatedUnitPaise * quantity;
  const templateBackground = selectedTemplate?.preview.background ?? "#e4f5f2";
  const templateAccent = selectedTemplate?.preview.accent ?? "#168c80";

  useEffect(() => {
    if (!isHydrated || initializedFromStorage.current || typeof window === "undefined") return;
    initializedFromStorage.current = true;
    const stored = readSavedDesigns();
    setSavedDesigns(stored.filter((design) => design.productId === product.id));

    const search = new URLSearchParams(window.location.search);
    const editKey = search.get("edit");
    const designId = search.get("design");
    const cartItem = editKey ? cart.find((item) => item.key === editKey && item.productId === product.id) : undefined;
    const saved = designId ? stored.find((design) => design.id === designId && design.productId === product.id) : undefined;

    if (cartItem?.customization) {
      const custom = cartItem.customization;
      setEditingKey(cartItem.key);
      setConfigurationId(custom.configurationId ?? uniqueId());
      setVariantId(cartItem.variantId ?? firstVariant?.id ?? "");
      setTemplateId(custom.templateId ?? firstTemplate?.id ?? "");
      setDimensionPresetId(custom.dimensionPresetId ?? configuration.dimensions.presets[0]?.id ?? "");
      setDisplayUnit(custom.displayUnit ?? "mm");
      setQuantity(cartItem.quantity);
      setFields(custom.fields ?? {
        ...initialFields(configuration),
        name: custom.name,
        ...(custom.detail ? { "class-details": custom.detail } : {}),
        font: Object.entries({ rounded: "Friendly rounded", clean: "Clean sans", serif: "Classic serif" }).find(([, label]) => label === custom.font)?.[0] ?? custom.font,
      });
      if (custom.artwork) setArtwork(custom.artwork);
    } else if (saved) {
      loadDesign(saved);
    }
  }, [cart, configuration, firstTemplate?.id, firstVariant?.id, isHydrated, product.id]);

  useEffect(() => {
    if (Object.keys(errors).length || !selectedVariant) {
      setQuote({ status: "idle", message: "Complete the required details for a verified price." });
      return;
    }
    const controller = new AbortController();
    setQuote({ status: "loading", message: "Checking the current catalog price..." });
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(configuration.pricing.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            items: [{
              productId: product.id,
              variantId: selectedVariant.id,
              quantity,
              ...(configuration.personalization.supported ? {
                customization: { ...(templateId ? { templateId } : {}), fields, previewVersion: 1 },
              } : {}),
            }],
          }),
        });
        const payload = await response.json() as { data?: QuoteSummary; error?: { message?: string } };
        if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "The current price is unavailable.");
        if (!controller.signal.aborted) setQuote({ status: "ready", message: "Server-verified catalog price", data: payload.data });
      } catch (error) {
        if (!controller.signal.aborted) setQuote({ status: "error", message: error instanceof Error ? error.message : "The current price is unavailable." });
      }
    }, 320);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [configuration.personalization.supported, configuration.pricing.endpoint, errors, fields, product.id, quantity, selectedVariant, templateId]);

  function changeField(fieldId: string, value: string) {
    setFields((current) => ({ ...current, [fieldId]: value }));
    setFieldErrors((current) => ({ ...current, [fieldId]: "" }));
    if (fieldId === "name" || fieldId === "font") {
      setArtwork((current) => ({
        ...current,
        updatedAt: new Date().toISOString(),
        surfaces: current.surfaces.map((surface) => ({
          ...surface,
          layers: surface.layers.map((layer) => layer.id === "personalization-name" ? {
            ...layer,
            ...(fieldId === "name" ? { text: value || "Your name" } : {}),
            ...(fieldId === "font" ? { fontFamily: value === "serif" ? "serif" as const : value === "clean" ? "sans" as const : "rounded" as const } : {}),
          } : layer),
        })),
      }));
    }
  }

  function updateArtwork(next: ArtworkDocument) {
    setArtwork(next);
    const nameLayer = next.surfaces.flatMap((surface) => surface.layers).find((layer) => layer.id === "personalization-name");
    if (nameLayer?.text && nameLayer.text !== "Your name" && nameLayer.text !== fields.name) {
      setFields((current) => ({ ...current, name: nameLayer.text ?? current.name }));
    }
  }

  function loadDesign(design: SavedDesign) {
    setConfigurationId(design.id);
    setVariantId(design.variantId);
    setTemplateId(design.templateId);
    setDimensionPresetId(design.dimensionPresetId);
    setDisplayUnit(design.displayUnit);
    setQuantity(design.quantity);
    setFields(design.fields);
    setArtwork(design.artwork);
    setSaveMessage(`Loaded ${design.title}.`);
  }

  function saveDesign() {
    const currentErrors = validateFields(configuration, fields, templateId);
    setFieldErrors(currentErrors);
    if (Object.keys(currentErrors).length) {
      setSaveMessage("Complete the required product details before saving.");
      return;
    }
    const id = configurationId || uniqueId();
    const title = (fields.name || product.name).trim();
    const saved: SavedDesign = {
      id,
      productId: product.id,
      title,
      variantId,
      templateId,
      dimensionPresetId,
      displayUnit,
      quantity,
      fields,
      artwork,
      savedAt: new Date().toISOString(),
    };
    try {
      const all = readSavedDesigns();
      const next = [...all.filter((design) => design.id !== id), saved].slice(-20);
      localStorage.setItem(SAVED_DESIGNS_KEY, JSON.stringify(next));
      setSavedDesigns(next.filter((design) => design.productId === product.id));
      setConfigurationId(id);
      const url = new URL(window.location.href);
      url.searchParams.set("design", id);
      url.searchParams.delete("edit");
      window.history.replaceState(null, "", url);
      setSaveMessage("Design saved on this device.");
    } catch {
      setSaveMessage("This design is too large for local draft storage. Remove large images and try again.");
    }
  }

  function resetConfiguration() {
    setConfigurationId(uniqueId());
    setVariantId(firstVariant?.id ?? "");
    setTemplateId(firstTemplate?.id ?? "");
    setDimensionPresetId(configuration.dimensions.presets[0]?.id ?? "");
    setDisplayUnit(configuration.dimensions.supportedDisplayUnits[0] ?? "mm");
    setQuantity(configuration.quantity.minimum);
    setFields(initialFields(configuration));
    setArtwork(createInitialArtwork(configuration));
    setFieldErrors({});
    setSaveMessage("");
  }

  function addToCart() {
    const currentErrors = validateFields(configuration, fields, templateId);
    setFieldErrors(currentErrors);
    if (Object.keys(currentErrors).length) return;
    if (!selectedVariant || quote.status !== "ready" || !quotedLine) {
      setSaveMessage("Wait for the server-verified price before adding this configuration.");
      return;
    }
    if (editingKey) removeItem(editingKey);
    const fontValue = fields.font || "rounded";
    const fontLabel = configuration.personalization.fields.find((field) => field.id === "font")?.options?.find((option) => option.value === fontValue)?.label ?? fontValue;
    addItem({
      productId: product.id,
      variantId: selectedVariant.id,
      slug: product.slug,
      name: product.name,
      price: quotedLine.unitPricePaise / 100,
      quantity,
      visual: product.artwork,
      customization: configuration.personalization.supported ? {
        configurationId,
        name: fields.name || product.name,
        detail: fields["class-details"] || fields.subtitle || "",
        fields,
        templateId: selectedTemplate?.id,
        template: selectedTemplate?.label ?? "Product default",
        font: fontLabel,
        textColor: selectedTemplate?.preview.foreground ?? "#17324d",
        backgroundColor: templateBackground,
        pack: selectedVariant.label,
        material: selectedVariant.material,
        dimensionPresetId: selectedPreset?.id,
        dimensionLabel: selectedPreset?.label ?? configuration.dimensions.catalogDescription,
        displayUnit,
        artwork,
        quote: {
          id: quote.data.quoteId,
          pricingVersion: quote.data.pricingVersion,
          calculatedAt: quote.data.calculatedAt,
          unitPricePaise: quotedLine.unitPricePaise,
        },
      } : undefined,
    });
    setEditingKey(null);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 3000);
  }

  const purchasePanel = (
    <div className={configuratorStyles.purchasePanel}>
      <div className={configuratorStyles.priceStatus}>
        <span>{quote.status === "ready" ? <Check /> : quote.status === "error" ? <CircleAlert /> : <Clock3 />} {quote.message}</span>
        <strong>{formatPrice(displaySubtotal / 100)}</strong>
        <small>{formatPrice(displayUnitPrice / 100)} each x {quantity}</small>
      </div>
      {quotedLine?.adjustments.map((adjustment) => (
        <p className={configuratorStyles.adjustment} key={adjustment.label}><span>{adjustment.label}</span><strong>+{formatPrice(adjustment.amountPaise / 100)}</strong></p>
      ))}
      <div className={configuratorStyles.purchaseActions}>
        <button type="button" onClick={saveDesign}><Save /> Save design</button>
        <button type="button" className={configuratorStyles.primaryAction} onClick={addToCart} disabled={quote.status !== "ready"}>
          {added ? <Check /> : <ShoppingBag />} {added ? "Added to cart" : editingKey ? "Update cart item" : "Add to cart"}
        </button>
      </div>
      {saveMessage && <p className={configuratorStyles.saveMessage} role="status">{saveMessage}</p>}
      {quantity >= configuration.quantity.maximum && <Link className={configuratorStyles.quoteLink} href="/bulk-orders">Need a larger run? Request a production quote</Link>}
      <p className={configuratorStyles.revalidation}><ShieldCheck /> Price, availability and personalization are checked again at checkout.</p>
    </div>
  );

  return (
    <>
      <section className={configuratorStyles.configuratorPage}>
        <header className={configuratorStyles.configuratorHeader}>
          <div>
            <span className={configuratorStyles.status}>{product.stockStatus === "out_of_stock" ? "Unavailable" : product.stockStatus === "in_stock" ? "In stock" : "Made to order"}</span>
            <h1>{product.name}</h1>
            <p>{product.shortDescription}</p>
          </div>
          <div className={configuratorStyles.headerActions}>
            <button type="button" onClick={resetConfiguration} title="Reset configuration"><RotateCcw /></button>
            <button type="button" className={isWishlisted(product.id) ? configuratorStyles.wishlisted : ""} onClick={() => toggleWishlist(product.id)} title="Save to wishlist"><Heart /></button>
          </div>
        </header>

        {editingKey && <div className={configuratorStyles.editNotice}>Editing a cart configuration. Adding it again will replace that cart line.</div>}

        <div className={configuratorStyles.workspace}>
          <aside className={configuratorStyles.optionsPanel} aria-label="Product configuration">
            <div className={configuratorStyles.productThumb}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={product.image} alt="" />
              <div><span>SKU {selectedVariant?.sku ?? product.sku}</span><strong>{selectedVariant?.label ?? product.name}</strong></div>
            </div>

            {savedDesigns.length > 0 && (
              <label className={configuratorStyles.savedSelect}>
                <span>Reopen a saved design</span>
                <div><select defaultValue="" onChange={(event) => { const design = savedDesigns.find((item) => item.id === event.target.value); if (design) loadDesign(design); }}><option value="" disabled>Choose saved design</option>{savedDesigns.map((design) => <option key={design.id} value={design.id}>{design.title} - {new Date(design.savedAt).toLocaleDateString("en-IN")}</option>)}</select><ChevronDown /></div>
              </label>
            )}

            <fieldset className={configuratorStyles.optionSection}>
              <legend><span>1</span><div><strong>Format and material</strong><small>Choose a purchasable catalog option</small></div></legend>
              <div className={configuratorStyles.choiceList}>
                {configuration.variants.map((variant) => (
                  <button key={variant.id} type="button" className={variant.id === variantId ? configuratorStyles.selectedChoice : ""} onClick={() => setVariantId(variant.id)} disabled={variant.stockStatus === "out_of_stock"}>
                    <span><strong>{variant.label}</strong><small>{variant.material} - {variant.packSize} pieces</small></span>
                    <b>{formatPrice(variant.unitPricePaise / 100)}</b>
                    {variant.id === variantId && <Check />}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className={configuratorStyles.optionSection}>
              <legend><span>2</span><div><strong>Dimensions</strong><small>Physical size stays fixed when units change</small></div></legend>
              {configuration.dimensions.supportedDisplayUnits.length > 0 && (
                <div className={configuratorStyles.segmented} aria-label="Measurement unit">
                  {configuration.dimensions.supportedDisplayUnits.map((unit) => <button key={unit} type="button" className={displayUnit === unit ? configuratorStyles.active : ""} onClick={() => setDisplayUnit(unit)}>{unit}</button>)}
                </div>
              )}
              <div className={configuratorStyles.sizeChoices}>
                {configuration.dimensions.presets.map((preset) => (
                  <button type="button" key={preset.id} className={preset.id === dimensionPresetId ? configuratorStyles.selectedChoice : ""} onClick={() => setDimensionPresetId(preset.id)}>
                    <strong>{preset.label}</strong>
                    {preset.dimensionsMm && <small>{Object.values(preset.dimensionsMm).map((value) => displayMeasurement(value, displayUnit)).join(" x ")}</small>}
                  </button>
                ))}
              </div>
              <Link className={configuratorStyles.blockedOption} href={configuration.dimensions.custom.quotePath}><LockKeyhole /><span><strong>Custom size - request a quote</strong><small>{configuration.dimensions.custom.reason}</small></span></Link>
            </fieldset>

            {configuration.personalization.supported && (
              <fieldset className={configuratorStyles.optionSection}>
                <legend><span>3</span><div><strong>Personal details</strong><small>These values are validated for this product</small></div></legend>
                <div className={configuratorStyles.fieldList}>
                  {configuration.personalization.fields.filter((field) => field.type !== "template").map((field) => (
                    <label key={field.id}>
                      <span>{field.label}{field.required && <em>*</em>}{field.maxLength && <small>{(fields[field.id] ?? "").length}/{field.maxLength}</small>}</span>
                      {field.type === "select" ? (
                        <select value={fields[field.id] ?? ""} onChange={(event) => changeField(field.id, event.target.value)}>{field.options?.map((option) => <option key={option.id} value={option.value}>{option.label}</option>)}</select>
                      ) : field.type === "color" ? (
                        <input type="color" value={fields[field.id] || "#17324d"} onChange={(event) => changeField(field.id, event.target.value)} />
                      ) : (
                        <input value={fields[field.id] ?? ""} placeholder={field.placeholder} maxLength={field.maxLength} aria-invalid={Boolean(fieldErrors[field.id])} onBlur={() => setFieldErrors(validateFields(configuration, fields, templateId))} onChange={(event) => changeField(field.id, event.target.value)} />
                      )}
                      {field.helpText && <small>{field.helpText}</small>}
                      {fieldErrors[field.id] && <b role="alert">{fieldErrors[field.id]}</b>}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            {configuration.personalization.templates.length > 0 && (
              <fieldset className={configuratorStyles.optionSection}>
                <legend><span>4</span><div><strong>Design theme</strong><small>Premium additions appear in the quote</small></div></legend>
                <div className={configuratorStyles.templateChoices}>
                  {configuration.personalization.templates.map((template) => (
                    <button key={template.id} type="button" className={template.id === templateId ? configuratorStyles.selectedChoice : ""} onClick={() => setTemplateId(template.id)}>
                      <i style={{ background: template.preview.background, borderColor: template.preview.accent, color: template.preview.foreground }}>Aa</i>
                      <span><strong>{template.label}</strong><small>{template.premiumPricePaise ? `+${formatPrice(template.premiumPricePaise / 100)}` : "Included"}</small></span>
                    </button>
                  ))}
                </div>
              </fieldset>
            )}

            <fieldset className={configuratorStyles.optionSection}>
              <legend><span>5</span><div><strong>Quantity</strong><small>{configuration.quantity.minimum}-{configuration.quantity.maximum} per cart line</small></div></legend>
              <div className={configuratorStyles.quantityRow}>
                <button type="button" onClick={() => setQuantity((value) => Math.max(configuration.quantity.minimum, value - configuration.quantity.increment))} disabled={quantity <= configuration.quantity.minimum}><Minus /></button>
                <input type="number" min={configuration.quantity.minimum} max={configuration.quantity.maximum} step={configuration.quantity.increment} value={quantity} onChange={(event) => setQuantity(Math.max(configuration.quantity.minimum, Math.min(configuration.quantity.maximum, Number(event.target.value) || configuration.quantity.minimum)))} />
                <button type="button" onClick={() => setQuantity((value) => Math.min(configuration.quantity.maximum, value + configuration.quantity.increment))} disabled={quantity >= configuration.quantity.maximum}><Plus /></button>
              </div>
            </fieldset>

            <div className={configuratorStyles.productionFacts}>
              <div><span>Material</span><strong>{selectedVariant?.material}</strong></div>
              <div><span>Print area</span><strong>{configuration.artwork.surfaces.map((surface) => surface.label).join(", ") || "Not customizable"}</strong></div>
              <div><span>Production files</span><strong>Preflight required</strong></div>
            </div>
          </aside>

          <main className={configuratorStyles.designArea}>
            <div className={configuratorStyles.designHeading}>
              <div><Sparkles /><span><strong>Live 2D artwork studio</strong><small>Drag elements on the print area. Dashed guides mark the safe zone.</small></span></div>
              <span>Draft preview</span>
            </div>
            {configuration.personalization.supported ? (
              <ArtworkEditor
                document={artwork}
                surfaces={surfaceDefinitions(configuration, selectedPreset)}
                background={templateBackground}
                accent={templateAccent}
                onChange={updateArtwork}
                footer={purchasePanel}
              />
            ) : (
              <div className={configuratorStyles.standardPreview}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={product.image} alt={product.name} />
                {purchasePanel}
              </div>
            )}
            {!configuration.artwork.uploads.supported && (
              <div className={configuratorStyles.capabilityNotice}><CircleAlert /><span><strong>Uploaded images are preview-only in this demo.</strong>{configuration.artwork.uploads.reason} They are not sent to checkout or labelled print-ready.</span></div>
            )}
            <div className={configuratorStyles.readinessGrid}>
              <div><PackageCheck /><span><strong>Manufacturing review</strong><small>Custom dimensions remain unavailable until approved limits and rates are configured.</small></span></div>
              <div><ShieldCheck /><span><strong>Artwork preflight</strong><small>Bleed, resolution, colour and rights must be checked before production.</small></span></div>
              <div><Truck /><span><strong>Checkout revalidation</strong><small>Current catalog price and availability are recalculated on the server.</small></span></div>
            </div>
          </main>
        </div>
      </section>

      <section className="product-information section-soft">
        <div className="shell product-info-grid"><div><span className="eyebrow">The practical details</span><h2>Made for everyday use</h2><p>{product.description}</p><ul>{product.features.map((feature) => <li key={feature}><Check /> {feature}</li>)}</ul></div><dl><div><dt>Material</dt><dd>{selectedVariant?.material || product.material}</dd></div><div><dt>Dimensions</dt><dd>{product.dimensions}</dd></div><div><dt>What is included</dt><dd>{selectedVariant?.packSize || product.packSize} pieces in your selected format</dd></div><div><dt>Production window</dt><dd>{product.productionDays.min}-{product.productionDays.max} working days after design review</dd></div>{product.careInstructions && <div><dt>Care</dt><dd>{product.careInstructions}</dd></div>}</dl></div>
      </section>

      <div className={configuratorStyles.mobileBuyBar}><div><small>{quote.message}</small><strong>{formatPrice(displaySubtotal / 100)}</strong></div><button type="button" onClick={addToCart} disabled={quote.status !== "ready"}>{added ? "Added" : "Add to cart"}</button></div>
    </>
  );
}
