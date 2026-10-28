"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { Card, CardHeader, PageHeader, StatusBadge, statusTone } from "./AdminUI";
import styles from "./admin.module.css";

type SurfaceId = string;

type TemplateSurface = {
  id: SurfaceId;
  label: string;
  baseImageUrl: string;
  sampleText: string;
  background: string;
  foreground: string;
  accent: string;
  safeArea: { x: number; y: number; width: number; height: number };
  widthPx: number;
  heightPx: number;
  dpi: number;
};

type ManagedTemplate = {
  id: string;
  name: string;
  slug: string;
  theme: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  description: string;
  thumbnailUrl: string;
  premiumPrice: number;
  rightsReference: string;
  surfaces: TemplateSurface[];
  productCount: number;
  uses: number;
  updatedAt: string;
};

type TemplateDraft = Pick<ManagedTemplate, "name" | "theme" | "description" | "thumbnailUrl" | "premiumPrice" | "rightsReference" | "surfaces">;
type ImageOwnerProduct = { id: string; name: string; sku: string; status: string; published: boolean };

const newSurface = (id: SurfaceId, label = id === "front" ? "Front" : "Back"): TemplateSurface => ({
  id,
  label,
  baseImageUrl: "",
  sampleText: "Your name",
  background: "#ffffff",
  foreground: "#111418",
  accent: "#3a3d42",
  safeArea: { x: 10, y: 15, width: 80, height: 70 },
  widthPx: 1772,
  heightPx: 591,
  dpi: 300,
});

const newTemplate: TemplateDraft = {
  name: "Untitled template",
  theme: "",
  description: "",
  thumbnailUrl: "",
  premiumPrice: 0,
  rightsReference: "",
  surfaces: [newSurface("front")],
};

const cloneDraft = (template: TemplateDraft): TemplateDraft => JSON.parse(JSON.stringify(template)) as TemplateDraft;

function responseMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const error = (payload as { error?: unknown }).error;
  if (!error || typeof error !== "object") return fallback;
  const message = (error as { message?: unknown }).message;
  const details = (error as { details?: unknown }).details;
  if (Array.isArray(details)) {
    const issue = details.find((item) => item && typeof item === "object" && typeof (item as { message?: unknown }).message === "string");
    if (issue) return `${typeof message === "string" ? message : fallback} ${(issue as { message: string }).message}`;
  }
  return typeof message === "string" ? message : fallback;
}

function statusLabel(status: ManagedTemplate["status"]) {
  if (status === "ACTIVE") return "Published";
  if (status === "ARCHIVED") return "Archived";
  return "Draft";
}

export function TemplateManager() {
  const [templates, setTemplates] = useState<ManagedTemplate[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<TemplateDraft | null>(null);
  const [surfaceId, setSurfaceId] = useState<SurfaceId>("front");
  const [newSurfaceLabel, setNewSurfaceLabel] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [imageOwners, setImageOwners] = useState<ImageOwnerProduct[]>([]);
  const [imageOwnerProductId, setImageOwnerProductId] = useState("");
  const [uploadingBaseImage, setUploadingBaseImage] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/admin/templates", { cache: "no-store", signal: controller.signal });
        const payload = await response.json() as { data?: { templates?: ManagedTemplate[] } };
        if (!response.ok) throw new Error(responseMessage(payload, "Templates could not be loaded."));
        const records = Array.isArray(payload.data?.templates) ? payload.data.templates : [];
        setTemplates(records);
        if (records[0]) selectTemplate(records[0]);
      } catch (caught) {
        if ((caught as { name?: string }).name !== "AbortError") setError(caught instanceof Error ? caught.message : "Templates could not be loaded.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/admin/catalog", { cache: "no-store", signal: controller.signal });
        const payload = await response.json() as { data?: { products?: ImageOwnerProduct[] } };
        if (!response.ok || controller.signal.aborted) return;
        setImageOwners((payload.data?.products ?? []).filter((product) => product.status === "ACTIVE" && product.published));
      } catch {
        // The URL fallback remains available when the catalog owner list cannot load.
      }
    })();
    return () => controller.abort();
  }, []);

  const selected = templates.find((template) => template.id === selectedId) ?? null;
  const activeSurface = draft?.surfaces.find((surface) => surface.id === surfaceId) ?? draft?.surfaces[0] ?? null;
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return templates.filter((template) => {
      const matchesStatus = statusFilter === "ALL" || template.status === statusFilter;
      const matchesQuery = !needle || template.name.toLowerCase().includes(needle) || template.theme.toLowerCase().includes(needle);
      return matchesStatus && matchesQuery;
    });
  }, [query, statusFilter, templates]);

  function selectTemplate(template: ManagedTemplate) {
    setSelectedId(template.id);
    setDraft(cloneDraft(template));
    setSurfaceId(template.surfaces.some((surface) => surface.id === "front") ? "front" : template.surfaces[0]?.id ?? "front");
    setImageOwnerProductId("");
    setError("");
    setMessage("");
  }

  function replaceTemplate(template: ManagedTemplate) {
    setTemplates((current) => [template, ...current.filter((candidate) => candidate.id !== template.id)]);
    selectTemplate(template);
  }

  async function send(url: string, method: "POST" | "PATCH", body: unknown) {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json() as { data?: { template?: ManagedTemplate } };
      if (!response.ok) throw new Error(responseMessage(payload, "The template could not be saved."));
      if (!payload.data?.template) throw new Error("The server returned an incomplete template response.");
      replaceTemplate(payload.data.template);
      return payload.data.template;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The template could not be saved.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function createTemplate() {
    const created = await send("/api/admin/templates", "POST", { action: "create", template: newTemplate });
    if (created) setMessage("Draft template created.");
  }

  async function duplicateTemplate() {
    if (!selected) return;
    const copy = await send("/api/admin/templates", "POST", { action: "duplicate", id: selected.id });
    if (copy) setMessage("A draft copy was created.");
  }

  async function save(action: "save-draft" | "publish") {
    if (!selected || !draft) return;
    const updated = await send("/api/admin/templates", "PATCH", { action, id: selected.id, template: draft });
    if (updated) setMessage(action === "publish" ? "Template published." : "Template saved as a draft.");
  }

  async function uploadTemplateBaseImage(file: File) {
    const productId = imageOwnerProductId;
    if (!productId) {
      setError("Choose an active product to own this first-party image before uploading it.");
      return;
    }
    setUploadingBaseImage(true);
    setError("");
    try {
      const form = new FormData();
      form.set("productId", productId);
      form.set("kind", "gallery");
      form.set("image", file);
      const response = await fetch("/api/admin/catalog/images", { method: "POST", body: form });
      const payload = await response.json().catch(() => null) as {
        data?: { asset?: { url?: string } };
        error?: { message?: string };
      } | null;
      const url = payload?.data?.asset?.url;
      if (!response.ok || !url) throw new Error(payload?.error?.message || "The template base image could not be uploaded.");
      updateSurface({ baseImageUrl: url });
      setMessage("Base image uploaded. Save this template to use it.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The template base image could not be uploaded.");
    } finally {
      setUploadingBaseImage(false);
    }
  }

  function updateDraft<K extends keyof TemplateDraft>(key: K, value: TemplateDraft[K]) {
    setDraft((current) => current ? { ...current, [key]: value } : current);
  }

  function updateSurface(changes: Partial<TemplateSurface>) {
    setDraft((current) => current ? {
      ...current,
      surfaces: current.surfaces.map((surface) => surface.id === surfaceId ? { ...surface, ...changes } : surface),
    } : current);
  }

  function updateSafeArea(key: keyof TemplateSurface["safeArea"], value: number) {
    if (!activeSurface) return;
    updateSurface({ safeArea: { ...activeSurface.safeArea, [key]: value } });
  }

  function addSurface() {
    if (!draft || draft.surfaces.length >= 8) return;
    const label = newSurfaceLabel.trim();
    const slug = label.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const id = (slug && /^[a-z]/.test(slug) ? slug : `surface-${slug}`).slice(0, 80);
    if (!label || !slug) {
      setError("Enter a surface name such as Back, Left side, Gusset or Inside.");
      return;
    }
    if (draft.surfaces.some((surface) => surface.id === id)) {
      setError("That surface is already configured on this template.");
      return;
    }
    updateDraft("surfaces", [...draft.surfaces, newSurface(id, label)]);
    setSurfaceId(id);
    setNewSurfaceLabel("");
    setError("");
  }

  function removeSurface() {
    if (!draft || surfaceId === "front") return;
    const remaining = draft.surfaces.filter((surface) => surface.id !== surfaceId);
    updateDraft("surfaces", remaining);
    setSurfaceId(remaining.find((surface) => surface.id === "front")?.id ?? remaining[0]?.id ?? "front");
  }

  return (
    <>
      <PageHeader
        actions={<button className={styles.buttonPrimary} disabled={saving} onClick={() => void createTemplate()} type="button"><Plus size={14} /> New template</button>}
        description="Control exactly how names, artwork, and production rules come together across every personalized product."
        eyebrow="Personalization studio"
        title="Design templates"
      />

      {(error || message) && <p className={`${styles.templatePanelMessage} ${error ? styles.templatePanelError : ""}`} role={error ? "alert" : "status"}>{error || message}</p>}

      <div className={styles.templateLayout}>
        <Card>
          <div className={styles.toolbar}>
            <label className={styles.localSearch}>
              <span className={styles.srOnly}>Search templates</span>
              <Search size={14} />
              <input className={styles.input} onChange={(event) => setQuery(event.target.value)} placeholder="Search templates or collections" type="search" value={query} />
            </label>
            <select aria-label="Template status" className={styles.select} onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
              <option value="ALL">All statuses</option>
              <option value="ACTIVE">Published</option>
              <option value="DRAFT">Draft</option>
              <option value="ARCHIVED">Archived</option>
            </select>
            <span className={styles.resultCount}>{visible.length} templates</span>
          </div>

          {loading ? <div className={styles.templateEmpty}>Loading templates…</div> : visible.length === 0 ? (
            <div className={styles.templateEmpty}>No templates match this view.</div>
          ) : (
            <div className={styles.templateGrid}>
              {visible.map((template) => {
                const preview = template.surfaces.find((surface) => surface.id === "front") ?? template.surfaces[0];
                return (
                  <article
                    className={`${styles.templateCard} ${selectedId === template.id ? styles.templateSelected : ""}`}
                    key={template.id}
                    onClick={() => selectTemplate(template)}
                    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") selectTemplate(template); }}
                    role="button"
                    tabIndex={0}
                  >
                    <div className={styles.designPreview} style={{ backgroundColor: preview?.background, backgroundImage: preview?.baseImageUrl ? `url("${preview.baseImageUrl}")` : undefined }}>
                      <span className={styles.mockLabel} style={{ borderColor: preview?.accent, color: preview?.foreground }}>{preview?.sampleText || template.name}</span>
                    </div>
                    <div className={styles.templateInfo}>
                      <div className={styles.templateInfoTop}><h3>{template.name}</h3><StatusBadge tone={statusTone(statusLabel(template.status))}>{statusLabel(template.status)}</StatusBadge></div>
                      <p>{template.theme || "Uncollected"} · {template.productCount} products · {template.uses} uses</p>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </Card>

        <Card className={styles.editorPanel}>
          {selected && draft && activeSurface ? (
            <>
              <CardHeader
                action={<button aria-label="Duplicate template" className={styles.iconButton} disabled={saving} onClick={() => void duplicateTemplate()} type="button"><Copy size={14} /></button>}
                caption={`${statusLabel(selected.status)} · ${selected.slug}`}
                title={draft.name}
              />
              <div className={styles.editorPreview}>
                <div className={styles.designPreview} style={{ backgroundColor: activeSurface.background, backgroundImage: activeSurface.baseImageUrl ? `url("${activeSurface.baseImageUrl}")` : undefined }}>
                  <span className={styles.templateSafeArea} style={{ borderColor: activeSurface.accent, height: `${activeSurface.safeArea.height}%`, left: `${activeSurface.safeArea.x}%`, top: `${activeSurface.safeArea.y}%`, width: `${activeSurface.safeArea.width}%` }} />
                  <span className={styles.mockLabel} style={{ borderColor: activeSurface.accent, color: activeSurface.foreground }}>{activeSurface.sampleText || "Your name"}</span>
                </div>
              </div>
              <div className={styles.editorFields}>
                <div className={styles.templateSurfaceTabs}>
                  {draft.surfaces.map((surface) => <button className={surface.id === surfaceId ? styles.templateSurfaceTabActive : ""} key={surface.id} onClick={() => setSurfaceId(surface.id)} type="button">{surface.label}</button>)}
                </div>
                {draft.surfaces.length < 8 && <div className={styles.fieldGrid}>
                  <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Add print surface</span><input className={styles.input} maxLength={60} onChange={(event) => setNewSurfaceLabel(event.target.value)} placeholder="Back, side, gusset, sleeve or inside" value={newSurfaceLabel} /></label>
                  <div className={styles.fieldGroup}><span className={styles.fieldLabel}>Surface limit</span><button className={styles.buttonSecondary} disabled={!newSurfaceLabel.trim()} onClick={addSurface} type="button"><Plus size={12} /> Add surface</button><small>{draft.surfaces.length}/8 surfaces configured</small></div>
                </div>}

                <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Template name</span><input className={styles.input} maxLength={140} onChange={(event) => updateDraft("name", event.target.value)} value={draft.name} /></label>
                <div className={styles.fieldGrid}>
                  <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Collection</span><input className={styles.input} maxLength={100} onChange={(event) => updateDraft("theme", event.target.value)} value={draft.theme} /></label>
                  <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Premium price (₹)</span><input className={styles.input} min="0" onChange={(event) => updateDraft("premiumPrice", Number(event.target.value) || 0)} step="0.01" type="number" value={draft.premiumPrice} /></label>
                </div>
                <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Description</span><textarea className={styles.textarea} maxLength={2000} onChange={(event) => updateDraft("description", event.target.value)} value={draft.description} /></label>
                <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Thumbnail URL</span><input className={styles.input} onChange={(event) => updateDraft("thumbnailUrl", event.target.value)} placeholder="Optional; defaults to the front base image" value={draft.thumbnailUrl} /></label>

                <div className={styles.templateSectionHeading}><strong>{activeSurface.label} surface</strong>{activeSurface.id !== "front" && <button className={styles.buttonGhost} onClick={removeSurface} type="button"><Trash2 size={12} /> Remove</button>}</div>
                <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Surface label</span><input className={styles.input} maxLength={60} onChange={(event) => updateSurface({ label: event.target.value })} value={activeSurface.label} /></label>
                <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Sample text <span className={styles.fieldHint}>{activeSurface.sampleText.length}/120</span></span><input className={styles.input} maxLength={120} onChange={(event) => updateSurface({ sampleText: event.target.value })} value={activeSurface.sampleText} /></label>
                <label className={styles.fieldGroup}>
                  <span className={styles.fieldLabel}>Image owner product</span>
                  <select className={styles.select} onChange={(event) => setImageOwnerProductId(event.target.value)} value={imageOwnerProductId}>
                    <option value="">Choose an active product</option>
                    {imageOwners.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.sku}</option>)}
                  </select>
                  <small>The selected active product owns this first-party file; the template stores its public image reference.</small>
                </label>
                <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Base image upload</span><input accept="image/jpeg,image/png,image/webp" className={styles.assetFileInput} disabled={saving || uploadingBaseImage || !imageOwnerProductId} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void uploadTemplateBaseImage(file); }} type="file" /><small>{uploadingBaseImage ? "Uploading image…" : "JPG, PNG, or WEBP. Save the template to apply the uploaded image."}</small></label>
                <details className={styles.assetUrlFallback}><summary>Use an image URL instead</summary><input className={styles.input} inputMode="url" onChange={(event) => updateSurface({ baseImageUrl: event.target.value })} placeholder="https://… or /api/product-images/…" type="text" value={activeSurface.baseImageUrl} /></details>
                <div className={styles.templateColorGrid}>
                  {(["background", "foreground", "accent"] as const).map((key) => <label className={styles.fieldGroup} key={key}><span className={styles.fieldLabel}>{key[0].toUpperCase() + key.slice(1)}</span><input aria-label={`${key} colour`} className={styles.templateColorInput} onChange={(event) => updateSurface({ [key]: event.target.value })} type="color" value={activeSurface[key]} /></label>)}
                </div>
                <div className={styles.templateSectionHeading}><strong>Production geometry</strong><span>Required to publish</span></div>
                <div className={styles.templateNumberGrid}>
                  <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Width px</span><input className={styles.input} min="0" onChange={(event) => updateSurface({ widthPx: Number(event.target.value) || 0 })} type="number" value={activeSurface.widthPx} /></label>
                  <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Height px</span><input className={styles.input} min="0" onChange={(event) => updateSurface({ heightPx: Number(event.target.value) || 0 })} type="number" value={activeSurface.heightPx} /></label>
                  <label className={styles.fieldGroup}><span className={styles.fieldLabel}>DPI</span><input className={styles.input} min="0" onChange={(event) => updateSurface({ dpi: Number(event.target.value) || 0 })} type="number" value={activeSurface.dpi} /></label>
                </div>
                <div className={styles.templateSectionHeading}><strong>Safe area (%)</strong><span>Must stay inside the surface</span></div>
                <div className={styles.templateNumberGrid}>
                  {(["x", "y", "width", "height"] as const).map((key) => <label className={styles.fieldGroup} key={key}><span className={styles.fieldLabel}>{key.toUpperCase()}</span><input className={styles.input} max="100" min="0" onChange={(event) => updateSafeArea(key, Number(event.target.value) || 0)} type="number" value={activeSurface.safeArea[key]} /></label>)}
                </div>
                <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Artwork rights reference</span><input className={styles.input} maxLength={300} onChange={(event) => updateDraft("rightsReference", event.target.value)} value={draft.rightsReference} /></label>
                <div className={styles.templateEditorActions}>
                  <button className={styles.buttonSecondary} disabled={saving} onClick={() => void save("save-draft")} type="button">Save draft</button>
                  <button className={styles.buttonPrimary} disabled={saving} onClick={() => void save("publish")} type="button"><Sparkles size={13} /> {selected.status === "ACTIVE" ? "Save published" : "Publish"}</button>
                </div>
              </div>
            </>
          ) : <div className={styles.templateEmpty}>{loading ? "Loading editor…" : "Create or select a template to edit it."}</div>}
        </Card>
      </div>
    </>
  );
}
