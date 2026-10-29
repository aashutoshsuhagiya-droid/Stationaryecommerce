"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, FileImage, Plus, Trash2 } from "lucide-react";

import { formatStructuredDescription } from "@/lib/admin-structured-description";
import { DEFAULT_EZPAC_BULLETS, EZPAC_FEATURE_BULLETS, EZPAC_FEATURE_BULLET_LABELS } from "@/lib/ezpac-feature-bullets";
import type { ArtworkGeometry, ArtworkImagePolicy, ArtworkSurfacePolicy, ArtworkTextPolicy, ProductArtworkPolicy } from "@/lib/types";
import { StatusBadge } from "./AdminUI";
import { ProductArtworkPolicyEditor } from "./ProductArtworkPolicyEditor";
import { SurfaceCustomerPreview } from "./SurfaceCustomerPreview";
import {
  numberOr,
  safeDetailsKey,
  type FullDetailsCategory,
  type FullDetailsConfigurationField,
  type FullDetailsImage,
  type FullDetailsProductBase,
  type FullDetailsQuantityTier,
  type FullDetailsStructuredDescription,
} from "./product-details-payload";
import styles from "./admin.module.css";

export interface FullDetailsExportPreset {
  value: string;
  label: string;
  unmapped?: boolean;
}

export interface PublishedVisualizationTemplate {
  id: string;
  version: number;
  productType: string;
  model: string;
}

interface ProductFullDetailsSectionsProps {
  value: FullDetailsProductBase;
  onChange: (value: FullDetailsProductBase) => void;
  categories: FullDetailsCategory[];
  exportPresets?: readonly FullDetailsExportPreset[];
  onApplyExport?: (presetValue: string) => void;
  onPrefillRanBazaar?: () => void;
  onImportExportUrls?: () => void;
  onUploadSlot?: (slot: number, file: File) => void | Promise<void>;
  uploadingSlots?: readonly number[];
  skuEdited?: boolean;
  onSkuEditedChange?: (edited: boolean) => void;
  autoSku?: (name: string) => string;
  includePresetSection?: boolean;
}

function updateAt<T>(items: readonly T[], index: number, value: T) {
  return items.map((item, itemIndex) => itemIndex === index ? value : item);
}

function optionsText(options: FullDetailsConfigurationField["options"]) {
  return options.map((option) => `${option.label}${option.priceDelta ? `|${option.priceDelta}` : ""}`).join(", ");
}

function optionsFromText(value: string) {
  return value.split(",").flatMap((entry, index) => {
    const [rawLabel, rawDelta] = entry.split("|").map((part) => part.trim());
    if (!rawLabel) return [];
    const priceDelta = rawDelta ? Number(rawDelta) : 0;
    return [{ label: rawLabel, value: safeDetailsKey(rawLabel, `option-${index + 1}`), priceDelta: Number.isFinite(priceDelta) ? priceDelta : 0 }];
  });
}

function FullDetailsSection({ index, title, open, children }: { index: number; title: string; open?: boolean; children: ReactNode }) {
  return <details className={styles.fullDetailsSection} open={open}>
    <summary><span><small>{index}</small>{title}</span></summary>
    <div className={styles.fullDetailsSectionBody}>{children}</div>
  </details>;
}

export function ProductFullDetailsSections({
  value, onChange, categories, exportPresets = [], onApplyExport, onPrefillRanBazaar,
  onImportExportUrls, onUploadSlot, uploadingSlots = [], skuEdited, onSkuEditedChange,
  autoSku, includePresetSection = true,
}: ProductFullDetailsSectionsProps) {
  const [selectedExport, setSelectedExport] = useState("");
  const selectedPreset = exportPresets.find((preset) => preset.value === selectedExport);
  const structured = value.structuredDescription ?? {};
  const bullets = structured.featureBullets ?? [];
  const flattened = useMemo(() => formatStructuredDescription(structured as Parameters<typeof formatStructuredDescription>[0]), [structured]);
  const patch = (next: Partial<FullDetailsProductBase>) => onChange({ ...value, ...next });
  const patchDescription = (next: Partial<FullDetailsStructuredDescription>) => patch({ structuredDescription: { ...structured, ...next } });
  const updateField = (index: number, next: FullDetailsConfigurationField) => patch({ configurationFields: updateAt(value.configurationFields, index, next) });
  const updateTier = (index: number, next: FullDetailsQuantityTier) => patch({ quantityTiers: updateAt(value.quantityTiers, index, next) });
  const setImage = (slot: number, url: string) => {
    if (!slot) return patch({ imageUrl: url });
    const images = Array.from({ length: 5 }, (_, index) => value.extraImages?.[index] ?? { url: "" });
    images[slot - 1] = { ...images[slot - 1], url };
    patch({ extraImages: images });
  };
  const markHero = (slot: number) => {
    if (!slot) return;
    const images: FullDetailsImage[] = [{ url: value.imageUrl }, ...Array.from({ length: 5 }, (_, index) => value.extraImages?.[index] ?? { url: "" })];
    [images[0], images[slot]] = [images[slot], images[0]];
    patch({ imageUrl: images[0].url, extraImages: images.slice(1) });
  };

  return <div className={styles.fullDetailsSections}>
    {includePresetSection && <FullDetailsSection index={0} open title="Start from preset / export">
      <div className={styles.fullDetailsPreset}>
        <div><strong>Reuse known product data without creating a product automatically.</strong><p>Every imported value stays editable before you save.</p></div>
        <div className={styles.fullDetailsPresetActions}>
          {onPrefillRanBazaar && <button className={styles.buttonSecondary} onClick={onPrefillRanBazaar} type="button">Prefill from RanBazaar starter</button>}
          {onApplyExport && <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Ezpac export</span><span className={styles.fullDetailsExportChoice}><select className={styles.select} onChange={(event) => setSelectedExport(event.target.value)} value={selectedExport}><option value="">Choose an export row</option>{exportPresets.map((preset) => <option key={preset.value} value={preset.value}>{preset.label}</option>)}</select>{selectedPreset?.unmapped && <StatusBadge tone="warning">Unmapped</StatusBadge>}</span></label>}
          {onApplyExport && <button className={styles.buttonSecondary} disabled={!selectedExport} onClick={() => onApplyExport(selectedExport)} type="button">Prefill from Ezpac export</button>}
          {onImportExportUrls && <button className={styles.buttonGhost} onClick={onImportExportUrls} type="button">Import URLs from export</button>}
        </div>
      </div>
    </FullDetailsSection>}

    <FullDetailsSection index={1} open={!includePresetSection} title="Essentials">
      <div className={styles.quickListForm}>
        <div className={styles.fieldGrid}>
          <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Name</span><input className={styles.input} onChange={(event) => { const name = event.target.value; patch({ name, ...(autoSku && !skuEdited ? { sku: autoSku(name) } : {}) }); }} value={value.name} /></label>
          <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Price (INR)</span><input className={styles.input} min="0" onChange={(event) => patch({ price: numberOr(event.target.value, 0) })} type="number" value={value.price} /></label>
        </div>
        <div className={styles.fieldGrid}>
          <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Primary category</span><select className={styles.select} onChange={(event) => patch({ categoryId: event.target.value, categoryIds: [...new Set([event.target.value, ...value.categoryIds.filter((id) => id !== event.target.value)])] })} value={value.categoryId}><option value="">Choose a category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Material</span><input className={styles.input} onChange={(event) => patch({ material: event.target.value })} value={value.material} /></label>
        </div>
        <div className={styles.quickListSku}><span>SKU <strong>{value.sku}</strong></span>{onSkuEditedChange && <button className={styles.buttonGhost} onClick={() => onSkuEditedChange(!skuEdited)} type="button">{skuEdited ? "Auto" : "Edit"}</button>}{(skuEdited || !onSkuEditedChange) && <input aria-label="SKU" className={styles.input} onChange={(event) => patch({ sku: event.target.value })} value={value.sku} />}</div>
        <fieldset className={styles.fullDetailsCrossList}><legend>Also list in</legend>{categories.filter((category) => category.id !== value.categoryId).map((category) => { const checked = value.categoryIds.includes(category.id); return <label className={styles.compactCheck} key={category.id}><input checked={checked} onChange={(event) => patch({ categoryIds: event.target.checked ? [...new Set([...value.categoryIds, category.id])] : value.categoryIds.filter((id) => id !== category.id) })} type="checkbox" /> {category.name}</label>; })}</fieldset>
      </div>
    </FullDetailsSection>
    <FullDetailsSection index={2} title="Material & spec fields">
      <div className={styles.configList}>
        {!value.configurationFields.length && <p className={styles.configHint}>This product has no additional material or specification fields yet.</p>}
        {value.configurationFields.map((field, index) => {
          const requiresOptions = field.inputType === "select" && !field.options.length;
          return <div className={styles.configCard} key={field.id || `${field.key}-${index}`}>
            <div className={styles.configCardHead}><strong>{field.label || `Field ${index + 1}`}</strong><StatusBadge>{field.inputType}</StatusBadge></div>
            <div className={styles.fieldGrid}><label className={styles.fieldGroup}><span className={styles.fieldLabel}>Customer label</span><input className={styles.input} onChange={(event) => updateField(index, { ...field, label: event.target.value })} value={field.label} /></label><label className={styles.fieldGroup}><span className={styles.fieldLabel}>Field key</span><input className={styles.input} onChange={(event) => updateField(index, { ...field, key: safeDetailsKey(event.target.value, field.key) })} value={field.key} /></label></div>
            {field.inputType === "select" && <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Choices</span><input className={styles.input} onChange={(event) => updateField(index, { ...field, options: optionsFromText(event.target.value) })} placeholder="Matte|0, Glossy|25" value={optionsText(field.options)} /><small>Separate choices with commas. Add an optional per-choice price after a vertical bar.</small></label>}
            {(field.helpText || requiresOptions) && <p className={styles.configHint}>{field.helpText || "Configure supported choices, then enable this field for customers."}</p>}
            <div className={styles.mimeChoices}><label className={styles.compactCheck}><input checked={field.enabled} disabled={requiresOptions} onChange={(event) => updateField(index, { ...field, enabled: event.target.checked })} type="checkbox" /> Enabled</label><label className={styles.compactCheck}><input checked={field.customerVisible} disabled={requiresOptions || !field.enabled} onChange={(event) => updateField(index, { ...field, customerVisible: event.target.checked })} type="checkbox" /> Show to customer</label><label className={styles.compactCheck}><input checked={field.required} disabled={!field.enabled} onChange={(event) => updateField(index, { ...field, required: event.target.checked })} type="checkbox" /> Required</label></div>
          </div>;
        })}
      </div>
    </FullDetailsSection>

    <FullDetailsSection index={3} title="Description (generator)">
      <div className={styles.quickListForm}>
        <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Intro</span><textarea className={styles.textarea} maxLength={2000} onChange={(event) => patchDescription({ intro: event.target.value })} value={structured.intro ?? ""} /></label>
        <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Best for</span><input className={styles.input} onChange={(event) => patchDescription({ bestFor: event.target.value.split(",").map((item) => item.trim().slice(0, 120)).filter(Boolean).slice(0, 12) })} placeholder="Restaurants, cafes, caterers" value={(structured.bestFor ?? []).join(", ")} /></label>
        <div className={styles.fullDetailsBulletGrid}>{EZPAC_FEATURE_BULLETS.map((bullet) => <label className={styles.compactCheck} key={bullet}><input checked={bullets.includes(bullet)} onChange={(event) => patchDescription({ featureBullets: event.target.checked ? [...new Set([...bullets, bullet])] : bullets.filter((item) => item !== bullet) })} type="checkbox" /> {EZPAC_FEATURE_BULLET_LABELS[bullet]}</label>)}</div>
        {!bullets.length && <button className={styles.buttonGhost} onClick={() => patchDescription({ featureBullets: [...DEFAULT_EZPAC_BULLETS] })} type="button">Use suggested benefits</button>}
        <div className={styles.fullDetailsDescriptionPreview}><strong>Customer-facing preview</strong><p>{flattened || "Add an intro, audience or benefit to generate customer-facing copy."}</p></div>
        <button className={styles.buttonSecondary} onClick={() => patch({ description: flattened.slice(0, 10_000) })} type="button">Regenerate plain description</button>
      </div>
    </FullDetailsSection>

    <FullDetailsSection index={4} title="Images grid">
      <div className={styles.fullDetailsImages}>{Array.from({ length: 6 }, (_, slot) => {
        const url = slot === 0 ? value.imageUrl : value.extraImages?.[slot - 1]?.url ?? "";
        const uploading = uploadingSlots.includes(slot);
        return <div className={styles.fullDetailsImageCard} key={slot}><div className={styles.fullDetailsImagePreview}>{url ? <img alt={slot === 0 ? "Hero image preview" : `Gallery image ${slot} preview`} src={url} /> : <FileImage size={18} />}</div><strong>{slot === 0 ? "Hero image" : `Gallery image ${slot}`}</strong><input className={styles.input} onChange={(event) => setImage(slot, event.target.value)} placeholder="https://... or /api/product-images/..." type="url" value={url} />{onUploadSlot && <label className={styles.buttonGhost}><input accept="image/jpeg,image/png,image/webp" className={styles.assetFileInput} disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void onUploadSlot(slot, file); }} type="file" />{uploading ? "Uploading..." : "Choose file"}</label>}{slot > 0 && <button className={styles.buttonGhost} disabled={!url} onClick={() => markHero(slot)} type="button">Mark hero</button>}</div>;
      })}</div>
    </FullDetailsSection>

    <FullDetailsSection index={5} title="Pricing & tiers">
      <div className={styles.quickListForm}>
        <div className={styles.fieldGrid}><label className={styles.fieldGroup}><span className={styles.fieldLabel}>Minimum quantity</span><input className={styles.input} min="1" onChange={(event) => patch({ quantityMin: numberOr(event.target.value, 1) })} type="number" value={value.quantityMin} /></label><label className={styles.fieldGroup}><span className={styles.fieldLabel}>Maximum quantity</span><input className={styles.input} min="1" onChange={(event) => patch({ quantityMax: numberOr(event.target.value, 100) })} type="number" value={value.quantityMax} /></label><label className={styles.fieldGroup}><span className={styles.fieldLabel}>Setup charge (INR)</span><input className={styles.input} min="0" onChange={(event) => patch({ setupCharge: numberOr(event.target.value, 0) })} type="number" value={value.setupCharge} /></label></div>
        <div className={styles.configSectionHead}><div><strong>Quantity breaks</strong><small>Higher quantity means lower price; 1000+ orders go to the bulk inquiry form.</small></div><button className={styles.buttonSecondary} onClick={() => patch({ quantityTiers: [...value.quantityTiers, { id: `tier-${Date.now()}`, minimum: value.quantityMin, priceDelta: 0, label: "" }] })} type="button"><Plus size={13} /> Add price break</button></div>
        <div className={styles.configList}>{value.quantityTiers.map((tier, index) => <TierCard index={index} key={tier.id} onChange={(next) => updateTier(index, next)} onRemove={() => patch({ quantityTiers: value.quantityTiers.filter((item) => item.id !== tier.id) })} tier={tier} />)}</div>
      </div>
    </FullDetailsSection>
  </div>;
}

function TierCard({ tier, index, onChange, onRemove }: { tier: FullDetailsQuantityTier; index: number; onChange: (tier: FullDetailsQuantityTier) => void; onRemove: () => void }) {
  return <div className={styles.configCard}><div className={styles.configCardHead}><strong>Price break {index + 1}</strong><button aria-label={`Remove price break ${index + 1}`} className={styles.buttonGhost} onClick={onRemove} type="button"><Trash2 size={14} /></button></div><div className={styles.fieldGrid}><label className={styles.fieldGroup}><span className={styles.fieldLabel}>Minimum quantity</span><input className={styles.input} min="1" onChange={(event) => onChange({ ...tier, minimum: event.target.value })} type="number" value={tier.minimum} /></label><label className={styles.fieldGroup}><span className={styles.fieldLabel}>Per-item adjustment (INR)</span><input className={styles.input} onChange={(event) => onChange({ ...tier, priceDelta: event.target.value })} type="number" value={tier.priceDelta} /></label><label className={styles.fieldGroup}><span className={styles.fieldLabel}>Customer label</span><input className={styles.input} onChange={(event) => onChange({ ...tier, label: event.target.value })} placeholder="e.g. 250+ units" value={tier.label} /></label></div></div>;
}

type TextLayer = { label: string; sampleText: string; geometry: ArtworkGeometry; color: string; fontSize: number; fontFamily: "rounded" | "sans" | "serif"; fontWeight: number; rotation: number; maxLength?: number };
type ImageLayer = { label: string; geometry: ArtworkGeometry };
type LayeredTextPolicy = Omit<ArtworkTextPolicy, "defaultTextLayers"> & { defaultTextLayers?: TextLayer[] };
type LayeredImagePolicy = Omit<ArtworkImagePolicy, "defaultImageLayers"> & { defaultImageLayers?: ImageLayer[] };
type LayeredSurface = Omit<ArtworkSurfacePolicy, "text" | "image"> & { text: LayeredTextPolicy; image: LayeredImagePolicy };
type LayeredPolicy = Omit<ProductArtworkPolicy, "surfaces"> & { surfaces: LayeredSurface[] };
const asLayered = (policy: ProductArtworkPolicy) => policy as unknown as LayeredPolicy;
const move = <T,>(items: T[], index: number, direction: -1 | 1) => { const target = index + direction; if (target < 0 || target >= items.length) return items; const next = [...items]; [next[index], next[target]] = [next[target], next[index]]; return next; };
const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

function clampGeometry(geometry: ArtworkGeometry, surface: ArtworkSurfacePolicy): ArtworkGeometry {
  const bounds = surface.printableBounds;
  const width = clamp(numberOr(geometry.width, 1), 1, Math.max(1, bounds.width));
  const height = clamp(numberOr(geometry.height, 1), 1, Math.max(1, bounds.height));
  return { x: clamp(numberOr(geometry.x, bounds.x), bounds.x, bounds.x + bounds.width - width), y: clamp(numberOr(geometry.y, bounds.y), bounds.y, bounds.y + bounds.height - height), width, height, rotation: clamp(numberOr(geometry.rotation, 0), -360, 360) };
}

/** Removes UI-only caps and ensures nested default geometry remains in printable bounds. */
export function clampLayoutElementDefaults(policy: ProductArtworkPolicy) {
  const current = asLayered(policy);
  return {
    ...current,
    surfaces: current.surfaces.map((surface) => ({
      ...surface,
      text: { ...surface.text, ...(surface.text.defaultTextLayers ? { defaultTextLayers: surface.text.defaultTextLayers.map((layer) => { const { maxLength: maxLengthValue, ...persisted } = layer; return { ...persisted, sampleText: persisted.sampleText.slice(0, Math.max(1, maxLengthValue ?? 120)), geometry: clampGeometry(persisted.geometry, surface), rotation: clamp(numberOr(persisted.geometry.rotation, persisted.rotation ?? 0), -360, 360) }; }) } : {}) },
      image: { ...surface.image, ...(surface.image.defaultImageLayers ? { defaultImageLayers: surface.image.defaultImageLayers.map((layer) => ({ ...layer, geometry: clampGeometry(layer.geometry, surface) })) } : {}) },
    })),
  } as unknown as ProductArtworkPolicy;
}

function GeometryInputs({ geometry, onChange }: { geometry: ArtworkGeometry; onChange: (geometry: ArtworkGeometry) => void }) {
  return <div className={styles.fieldGrid}>{(["x", "y", "width", "height", "rotation"] as const).map((key) => <label className={styles.fieldGroup} key={key}><span className={styles.fieldLabel}>{key === "rotation" ? "Rotation" : key.toUpperCase()}</span><input className={styles.input} onChange={(event) => onChange({ ...geometry, [key]: numberOr(event.target.value, geometry[key]) })} step="0.1" type="number" value={geometry[key]} /></label>)}</div>;
}

export function ProductLayoutControls({ value, onChange, publishedTemplates = [] }: { value: FullDetailsProductBase; onChange: (value: FullDetailsProductBase) => void; publishedTemplates?: readonly PublishedVisualizationTemplate[] }) {
  const [tab, setTab] = useState<"binding" | "layout">("binding");
  const [surfaceId, setSurfaceId] = useState("");
  const policy = value.artworkPolicy;
  const surfaces = policy ? asLayered(policy).surfaces : [];
  const surface = surfaces.find((item) => item.id === surfaceId) ?? surfaces[0];
  const patch = (next: Partial<FullDetailsProductBase>) => onChange({ ...value, ...next });
  const updateSurface = (update: (current: LayeredSurface) => LayeredSurface) => {
    if (!policy || !surface) return;
    const current = asLayered(policy);
    patch({ artworkPolicy: { ...current, surfaces: current.surfaces.map((item) => item.id === surface.id ? update(item) : item) } as unknown as ProductArtworkPolicy });
  };
  const setTextLayers = (layers: TextLayer[]) => updateSurface((current) => ({ ...current, text: { ...current.text, defaultTextLayers: layers } }));
  const setImageLayers = (layers: ImageLayer[]) => updateSurface((current) => ({ ...current, image: { ...current.image, defaultImageLayers: layers } }));

  return <FullDetailsSection index={6} title="3D & Layout">
    <div className={styles.fullDetailsTabs} role="tablist"><button aria-selected={tab === "binding"} className={tab === "binding" ? styles.fullDetailsTabActive : styles.fullDetailsTab} onClick={() => setTab("binding")} role="tab" type="button">3D binding</button><button aria-selected={tab === "layout"} className={tab === "layout" ? styles.fullDetailsTabActive : styles.fullDetailsTab} onClick={() => setTab("layout")} role="tab" type="button">Layout editor</button></div>
    {tab === "binding" && <div className={styles.quickListForm}><label className={styles.fullDetailsRadio}><input checked={!value.allow3D} name={`3d-${value.id ?? "draft"}`} onChange={() => patch({ allow3D: false, previewTemplate: "" })} type="radio" /> No 3D for now</label>{publishedTemplates.map((template) => <label className={styles.fullDetailsRadio} key={template.id}><input checked={value.allow3D && value.previewTemplate === `visualization:${template.id}`} name={`3d-${value.id ?? "draft"}`} onChange={() => patch({ allow3D: true, previewTemplate: `visualization:${template.id}`, productModel: template.model || value.productModel })} type="radio" /> v{template.version} - {template.model || template.productType || "visualization"}</label>)}<p className={styles.configHint}>Publish a confirmed visualization template in the 3D studio first; a draft does not enable previews. The product model must match the template's resolved model.</p></div>}
    {tab === "layout" && (!policy || !surface ? <p className={styles.configHint}>Save a product with a printable surface before editing layout defaults.</p> : <div className={styles.fullDetailsLayoutGrid}><div className={styles.quickListForm}>
      {surfaces.length > 1 && <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Surface</span><select className={styles.select} onChange={(event) => setSurfaceId(event.target.value)} value={surface.id}>{surfaces.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>}
      <ProductArtworkPolicyEditor value={{ ...policy, surfaces: [surface] } as ProductArtworkPolicy} onChange={(next) => { const selected = next.surfaces[0]; if (selected) updateSurface(() => selected as LayeredSurface); }} />
      <div className={styles.configCard}><div className={styles.configCardHead}><strong>Text elements</strong><button className={styles.buttonSecondary} onClick={() => setTextLayers([...(surface.text.defaultTextLayers ?? []), { label: "Name", sampleText: "Sample", geometry: { x: 50, y: 50, width: 200, height: 50, rotation: 0 }, color: surface.text.allowedColors[0] ?? surface.text.defaultColor, fontSize: surface.text.defaultFontSize ?? 24, fontFamily: surface.text.allowedFontFamilies[0] ?? surface.text.defaultFontFamily, fontWeight: 700, rotation: 0, maxLength: 120 }])} type="button"><Plus size={13} /> Add text</button></div>{(surface.text.defaultTextLayers ?? []).map((layer, index) => <LayerRow key={`${layer.label}-${index}`} label="Text" layer={layer} onChange={(next) => setTextLayers(updateAt(surface.text.defaultTextLayers ?? [], index, next as TextLayer))} onMove={(direction) => setTextLayers(move(surface.text.defaultTextLayers ?? [], index, direction))} onRemove={() => setTextLayers((surface.text.defaultTextLayers ?? []).filter((_, itemIndex) => itemIndex !== index))} index={index} total={surface.text.defaultTextLayers?.length ?? 0} text surface={surface} />)}</div>
      <div className={styles.configCard}><div className={styles.configCardHead}><strong>Image slots</strong><button className={styles.buttonSecondary} onClick={() => setImageLayers([...(surface.image.defaultImageLayers ?? []), { label: "Image", geometry: { x: 50, y: 50, width: 200, height: 200, rotation: 0 } }])} type="button"><Plus size={13} /> Add image slot</button></div>{(surface.image.defaultImageLayers ?? []).map((layer, index) => <LayerRow key={`${layer.label}-${index}`} label="Image" layer={layer} onChange={(next) => setImageLayers(updateAt(surface.image.defaultImageLayers ?? [], index, next as ImageLayer))} onMove={(direction) => setImageLayers(move(surface.image.defaultImageLayers ?? [], index, direction))} onRemove={() => setImageLayers((surface.image.defaultImageLayers ?? []).filter((_, itemIndex) => itemIndex !== index))} index={index} total={surface.image.defaultImageLayers?.length ?? 0} surface={surface} />)}</div>
    </div><SurfaceCustomerPreview productPhotoUrl={value.imageUrl} sampleText={surface.text.defaultTextLayers?.[0]?.sampleText || "Sample"} surfaceLabel={surface.label} /></div>)}
  </FullDetailsSection>;
}

function LayerRow({ label, layer, onChange, onMove, onRemove, index, total, text, surface }: { label: string; layer: TextLayer | ImageLayer; onChange: (layer: TextLayer | ImageLayer) => void; onMove: (direction: -1 | 1) => void; onRemove: () => void; index: number; total: number; text?: boolean; surface: LayeredSurface }) {
  const textLayer = text ? layer as TextLayer : null;
  return <div className={styles.fullDetailsElementRow}><div className={styles.configCardHead}><strong>{label} {index + 1}</strong><span><button aria-label={`Move ${label} up`} className={styles.buttonGhost} disabled={!index} onClick={() => onMove(-1)} type="button"><ChevronUp size={13} /></button><button aria-label={`Move ${label} down`} className={styles.buttonGhost} disabled={index === total - 1} onClick={() => onMove(1)} type="button"><ChevronDown size={13} /></button><button aria-label={`Remove ${label}`} className={styles.buttonGhost} onClick={onRemove} type="button"><Trash2 size={13} /></button></span></div><div className={styles.fieldGrid}><label className={styles.fieldGroup}><span className={styles.fieldLabel}>Name</span><input className={styles.input} onChange={(event) => onChange({ ...layer, label: event.target.value } as TextLayer | ImageLayer)} value={layer.label} /></label>{textLayer && <><label className={styles.fieldGroup}><span className={styles.fieldLabel}>Sample / max length</span><input className={styles.input} maxLength={textLayer.maxLength ?? 120} onChange={(event) => onChange({ ...textLayer, sampleText: event.target.value })} value={textLayer.sampleText} /></label><label className={styles.fieldGroup}><span className={styles.fieldLabel}>Max length</span><input className={styles.input} min="1" onChange={(event) => onChange({ ...textLayer, maxLength: Math.max(1, Math.round(numberOr(event.target.value, textLayer.maxLength ?? 120))) })} type="number" value={textLayer.maxLength ?? 120} /></label><label className={styles.fieldGroup}><span className={styles.fieldLabel}>Color</span><select className={styles.select} onChange={(event) => onChange({ ...textLayer, color: event.target.value })} value={textLayer.color}>{[...new Set([textLayer.color, ...(surface.text.allowedColors.length ? surface.text.allowedColors : [surface.text.defaultColor])])].map((color) => <option key={color} value={color}>{color}</option>)}</select></label></>}</div><GeometryInputs geometry={layer.geometry} onChange={(geometry) => onChange({ ...layer, geometry, ...(textLayer ? { rotation: geometry.rotation } : {}) } as TextLayer | ImageLayer)} />{textLayer && <div className={styles.fieldGrid}><label className={styles.fieldGroup}><span className={styles.fieldLabel}>Font size</span><input className={styles.input} min="1" onChange={(event) => onChange({ ...textLayer, fontSize: numberOr(event.target.value, textLayer.fontSize) })} type="number" value={textLayer.fontSize} /></label><label className={styles.fieldGroup}><span className={styles.fieldLabel}>Font family</span><select className={styles.select} onChange={(event) => onChange({ ...textLayer, fontFamily: event.target.value as TextLayer["fontFamily"] })} value={textLayer.fontFamily}>{[...new Set([...surface.text.allowedFontFamilies, textLayer.fontFamily])].map((family) => <option key={family} value={family}>{family}</option>)}</select></label><label className={styles.fieldGroup}><span className={styles.fieldLabel}>Font weight</span><input className={styles.input} max="900" min="100" onChange={(event) => onChange({ ...textLayer, fontWeight: clamp(Math.round(numberOr(event.target.value, textLayer.fontWeight)), 100, 900) })} step="100" type="number" value={textLayer.fontWeight} /></label></div>}</div>;
}
