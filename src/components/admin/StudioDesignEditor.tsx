"use client";

/**
 * Admin 2D design editor: the product's designs (mockup + customer text boxes +
 * photo slots), edited visually and saved in one go.
 *
 * Text boxes bind to the product's text fields by key, so one "Your name" field
 * can appear on several designs. Everything is drawn with the storefront's own
 * layout code (layoutStudioText, studio fonts) and the preview uses the same
 * renderer as the customer's download, so what the admin sees is what the
 * customer gets.
 */
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  BringToFront,
  Copy,
  Eye,
  ImagePlus,
  Lock,
  LockOpen,
  Plus,
  Redo2,
  Save,
  SendToBack,
  Trash2,
  Type,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";

import { drawStudioDesign, ensureStudioFonts, measureStudioText, studioFontFamily } from "@/components/configurator/studio-canvas";
import {
  DEFAULT_STUDIO_FIELD,
  defaultStudioDesign,
  boundFieldKeys,
  fieldOnlyOnLayer,
  newStudioPhotoSlot,
  newStudioTextLayer,
  rescaleStudioConfig,
  snapToCentre,
  studioCanvasForImage,
  studioKeyFromLabel,
  studioSaveSchema,
  studioTextBoxHeight,
  uniqueStudioKey,
  withOneDefaultDesign,
  type StudioFieldInput,
} from "@/lib/studio-design";
import { STUDIO_FONTS, type StudioFontId } from "@/lib/studio-fonts";
import { DEFAULT_PHOTO_TRANSFORM, studioPhotoLabel } from "@/lib/studio-photo";
import { layoutStudioText, type StudioConfig, type StudioPhotoLayer, type StudioTextLayer } from "@/lib/studio-template";

import styles from "./admin.module.css";
import ui from "./studio-design-editor.module.css";

// ---- types -----------------------------------------------------------------------------------

type LayerKind = "text" | "photo";
interface Selection { kind: LayerKind; index: number }

interface EditorDesign {
  clientId: string;
  templateId?: string;
  name: string;
  isDefault: boolean;
  imported: boolean;
  studio: StudioConfig;
}

interface EditorState {
  designs: EditorDesign[];
  /** Every text field of the product (so a text box can bind to an existing one). */
  fields: StudioFieldInput[];
}

interface LoadedStudio {
  product: { id: string; name: string; published: boolean; imageUrl: string; imageSize: { width: number; height: number } | null };
  designs: Array<{ templateId: string; name: string; isDefault: boolean; imported: boolean; studio: StudioConfig }>;
  fields: StudioFieldInput[];
  reservedKeys: string[];
  editedAt: string | null;
  warnings?: string[];
}

interface Status { tone: "error" | "warning" | "success"; title: string; items?: string[] }

interface Drag {
  kind: LayerKind;
  index: number;
  mode: "move" | "resize";
  startX: number;
  startY: number;
  origin: { x: number; y: number; width: number; height: number };
  snapshot: EditorState;
  moved: boolean;
}

interface ImageChoice { url: string; size: { width: number; height: number } | null }

// ---- small helpers -----------------------------------------------------------------------------

const HISTORY_LIMIT = 50;
const SAMPLE_VALUES = ["Aarav Sharma", "Riya", "Kabir", "Meera", "Ishan", "Tara"];
const FONT_CHOICES = (Object.entries(STUDIO_FONTS) as Array<[StudioFontId, { label: string }]>).map(([id, font]) => ({ id, label: font.label }));
const WEIGHTS = [300, 400, 500, 600, 700, 800, 900];
let clientIds = 0;
const nextClientId = () => `design-${Date.now().toString(36)}-${(clientIds += 1)}`;
const round1 = (value: number) => Math.round(value * 10) / 10;
const numberOr = (value: string, fallback: number) => (value.trim() !== "" && Number.isFinite(Number(value)) ? Number(value) : fallback);

function measureImage(src: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image.naturalWidth && image.naturalHeight ? { width: image.naturalWidth, height: image.naturalHeight } : null);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

let samplePhoto: string | null = null;
/** A neutral stand-in portrait for the customer preview (drawn locally; nothing is fetched). */
function samplePhotoUrl(): string {
  if (samplePhoto) return samplePhoto;
  const canvas = document.createElement("canvas");
  canvas.width = 400;
  canvas.height = 480;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const gradient = ctx.createLinearGradient(0, 0, 0, 480);
  gradient.addColorStop(0, "#d7e8f7");
  gradient.addColorStop(1, "#9cc3e6");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 400, 480);
  ctx.fillStyle = "#2f5d8a";
  ctx.beginPath();
  ctx.ellipse(200, 470, 150, 130, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = "#f1c7a1";
  ctx.beginPath();
  ctx.arc(200, 200, 88, 0, Math.PI * 2);
  ctx.fill();
  samplePhoto = canvas.toDataURL("image/png");
  return samplePhoto;
}

function toEditorState(loaded: LoadedStudio): EditorState {
  const designs = withOneDefaultDesign(loaded.designs.map((design) => ({ ...design, clientId: nextClientId() })));
  return { designs, fields: loaded.fields };
}

/** The payload the API validates: designs in order, and only the fields they show. */
function savePayload(productId: string, state: EditorState) {
  const bound = new Set(boundFieldKeys(state.designs));
  return {
    productId,
    designs: withOneDefaultDesign(state.designs).map((design) => ({
      ...(design.templateId ? { templateId: design.templateId } : {}),
      name: design.name.trim() || "Design",
      isDefault: design.isDefault,
      studio: design.studio,
    })),
    fields: state.fields.filter((field) => bound.has(field.key)).map((field) => ({ ...field, label: field.label.trim(), placeholder: field.placeholder.trim() })),
  };
}

const sameState = (left: EditorState, right: EditorState) => JSON.stringify(left) === JSON.stringify(right);

// ---- the editor ------------------------------------------------------------------------------

export function StudioDesignEditor({ productId, productName, onClose, onSaved }: {
  productId: string;
  productName: string;
  onClose: () => void;
  /** Called after a successful save so the product form can reload its links and fields (awaited). */
  onSaved: () => void | Promise<void>;
}) {
  const [loaded, setLoaded] = useState<LoadedStudio | null>(null);
  const [state, setState] = useState<EditorState>({ designs: [], fields: [] });
  const [baseline, setBaseline] = useState<EditorState>({ designs: [], fields: [] });
  const [past, setPast] = useState<EditorState[]>([]);
  const [future, setFuture] = useState<EditorState[]>([]);
  const [active, setActive] = useState(0);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [locked, setLocked] = useState<Set<string>>(new Set());
  const [guides, setGuides] = useState({ vertical: false, horizontal: false });
  const [status, setStatus] = useState<Status | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState("");
  const [preview, setPreview] = useState(false);
  const [chooser, setChooser] = useState<null | "new" | "replace">(null);
  const [chooserUrl, setChooserUrl] = useState("");
  const [fontsVersion, setFontsVersion] = useState(0);
  const [renderScale, setRenderScale] = useState(1);
  const [localPreviews, setLocalPreviews] = useState<Record<string, string>>({});

  const stateRef = useRef(state);
  stateRef.current = state;
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const design = state.designs[active];
  const canvas = design?.studio.canvas;
  const dirty = !sameState(state, baseline);
  const reservedKeys = useMemo(() => loaded?.reservedKeys ?? [], [loaded]);
  const displayUrl = useCallback((url: string) => localPreviews[url] ?? url, [localPreviews]);

  // ---- loading ----
  const applyLoaded = useCallback((data: LoadedStudio) => {
    const next = toEditorState(data);
    setLoaded(data);
    setState(next);
    setBaseline(next);
    setPast([]);
    setFuture([]);
    setLocked(new Set());
    setSelection(null);
    setActive(Math.max(0, next.designs.findIndex((item) => item.isDefault)));
  }, []);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const response = await fetch(`/api/admin/studio-designs?productId=${encodeURIComponent(productId)}`, { cache: "no-store" });
        const payload = await response.json() as { data?: LoadedStudio; error?: { message?: string } };
        if (!response.ok || !payload.data) throw new Error(payload.error?.message || "Could not load this product's designs.");
        if (live) applyLoaded(payload.data);
      } catch (cause) {
        if (live) setStatus({ tone: "error", title: cause instanceof Error ? cause.message : "Could not load this product's designs." });
      }
    })();
    return () => { live = false; };
  }, [applyLoaded, productId]);

  // Keep the active design and selection valid after undo/redo or removals.
  useEffect(() => {
    if (active >= state.designs.length && state.designs.length) setActive(state.designs.length - 1);
  }, [active, state.designs.length]);
  useEffect(() => {
    if (!selection || !design) return;
    const count = selection.kind === "text" ? design.studio.texts.length : design.studio.photos.length;
    if (selection.index >= count) setSelection(null);
  }, [design, selection]);

  // Draw with the real studio fonts once they are loaded.
  const fontKey = design?.studio.texts.map((layer) => layer.fontId).join(",") ?? "";
  useEffect(() => {
    if (!design) return;
    let live = true;
    void ensureStudioFonts(design.studio).then(() => { if (live) setFontsVersion((version) => version + 1); });
    return () => { live = false; };
    // Fonts only change when the font choices do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontKey]);

  // Screen px ↔ canvas px, for handles that keep their size at any zoom.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !canvas) return;
    const update = () => setRenderScale(svg.getBoundingClientRect().width / canvas.width || 1);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(svg);
    return () => observer.disconnect();
  }, [canvas, preview]);

  useEffect(() => () => { for (const url of Object.values(localPreviews)) URL.revokeObjectURL(url); }, [localPreviews]);

  // ---- history ----
  const commit = useCallback((next: EditorState) => {
    const current = stateRef.current;
    if (next === current) return;
    setPast((items) => [...items.slice(-(HISTORY_LIMIT - 1)), current]);
    setFuture([]);
    setState(next);
  }, []);

  const undo = () => {
    const previous = past.at(-1);
    if (!previous) return;
    setPast(past.slice(0, -1));
    setFuture([stateRef.current, ...future]);
    setState(previous);
  };

  const redo = () => {
    const next = future[0];
    if (!next) return;
    setPast([...past, stateRef.current]);
    setFuture(future.slice(1));
    setState(next);
  };

  // ---- editing primitives ----
  const updateDesign = (index: number, change: (item: EditorDesign) => EditorDesign) => {
    const current = stateRef.current;
    commit({ ...current, designs: current.designs.map((item, position) => (position === index ? change(item) : item)) });
  };
  const updateStudio = (change: (studio: StudioConfig) => StudioConfig) => updateDesign(active, (item) => ({ ...item, studio: change(item.studio) }));
  const updateText = (index: number, patch: Partial<StudioTextLayer>) =>
    updateStudio((studio) => ({ ...studio, texts: studio.texts.map((layer, position) => (position === index ? { ...layer, ...patch } : layer)) }));
  const updatePhoto = (index: number, patch: Partial<StudioPhotoLayer>) =>
    updateStudio((studio) => ({ ...studio, photos: studio.photos.map((slot, position) => (position === index ? { ...slot, ...patch } : slot)) }));

  /** Live edit while dragging: no history entry until the drag ends. */
  const patchLive = (kind: LayerKind, index: number, patch: Partial<StudioTextLayer> & Partial<StudioPhotoLayer>) => {
    setState((current) => ({
      ...current,
      designs: current.designs.map((item, position) => {
        if (position !== active) return item;
        return kind === "text"
          ? { ...item, studio: { ...item.studio, texts: item.studio.texts.map((layer, layerIndex) => (layerIndex === index ? { ...layer, ...patch } : layer)) } }
          : { ...item, studio: { ...item.studio, photos: item.studio.photos.map((slot, slotIndex) => (slotIndex === index ? { ...slot, ...patch } : slot)) } };
      }),
    }));
  };

  const lockKey = (kind: LayerKind, index: number) => `${design?.clientId}:${kind}:${index}`;
  const isLocked = (kind: LayerKind, index: number) => locked.has(lockKey(kind, index));
  const clearLocks = () => setLocked((current) => new Set([...current].filter((key) => !key.startsWith(`${design?.clientId}:`))));

  /** A field's settings apply on every design that shows it; renaming the key rebinds them all. */
  const updateField = (key: string, patch: Partial<StudioFieldInput>) => {
    const current = stateRef.current;
    let nextKey = key;
    if (patch.key !== undefined && patch.key !== key) {
      const candidate = patch.key;
      const taken = new Set([...current.fields.map((field) => field.key).filter((item) => item !== key), ...reservedKeys]);
      if (!/^[a-z][a-z0-9-]{0,79}$/u.test(candidate) || taken.has(candidate)) {
        setStatus({ tone: "error", title: `"${candidate}" can't be used as a key: use lowercase letters, numbers and hyphens, not already taken.` });
        return;
      }
      nextKey = candidate;
    }
    commit({
      fields: current.fields.map((field) => (field.key === key ? { ...field, ...patch, key: nextKey } : field)),
      designs: nextKey === key
        ? current.designs
        : current.designs.map((item) => ({ ...item, studio: { ...item.studio, texts: item.studio.texts.map((layer) => (layer.fieldKey === key ? { ...layer, fieldKey: nextKey } : layer)) } })),
    });
  };

  // ---- adding and removing layers ----
  const addTextField = () => {
    const current = stateRef.current;
    const target = current.designs[active];
    if (!target) return;
    const first = !current.fields.length;
    const label = first ? DEFAULT_STUDIO_FIELD.label : `Text ${current.fields.length + 1}`;
    const key = uniqueStudioKey(studioKeyFromLabel(label, "text"), [...current.fields.map((field) => field.key), ...reservedKeys]);
    const field: StudioFieldInput = { key, label, required: true, maxLength: first ? DEFAULT_STUDIO_FIELD.maxLength : 30, placeholder: label };
    const layer = newStudioTextLayer(target.studio.canvas, key, label);
    commit({
      fields: [...current.fields, field],
      designs: current.designs.map((item, position) => (position === active ? { ...item, studio: { ...item.studio, texts: [...item.studio.texts, layer] } } : item)),
    });
    setSelection({ kind: "text", index: target.studio.texts.length });
  };

  const addPhotoSlot = () => {
    const target = stateRef.current.designs[active];
    if (!target) return;
    const key = uniqueStudioKey("photo", target.studio.photos.map((slot) => slot.fieldKey));
    updateStudio((studio) => ({ ...studio, photos: [...studio.photos, newStudioPhotoSlot(studio.canvas, key)] }));
    setSelection({ kind: "photo", index: target.studio.photos.length });
  };

  const removeSelected = () => {
    if (!selection || !design) return;
    if (selection.kind === "text") {
      const layer = design.studio.texts[selection.index];
      const onlyHere = fieldOnlyOnLayer(state.designs, active, selection.index);
      const field = state.fields.find((item) => item.key === layer?.fieldKey);
      const message = onlyHere
        ? `Remove this text box? No other design shows "${field?.label ?? onlyHere}", so that field is removed from the product when you save.`
        : `Remove this text box? "${field?.label ?? layer?.fieldKey}" stays, because another design still shows it.`;
      if (!window.confirm(message)) return;
      updateStudio((studio) => ({ ...studio, texts: studio.texts.filter((_layer, position) => position !== selection.index) }));
    } else {
      const slot = design.studio.photos[selection.index];
      if (!window.confirm(`Remove the photo slot "${studioPhotoLabel(slot?.fieldKey ?? "photo", slot?.label)}"?`)) return;
      updateStudio((studio) => ({ ...studio, photos: studio.photos.filter((_slot, position) => position !== selection.index) }));
    }
    clearLocks();
    setSelection(null);
  };

  /** Bring forward (+1) / send backward (−1) within the layer's own stack. */
  const reorderSelected = (direction: 1 | -1) => {
    if (!selection || !design) return;
    const list = selection.kind === "text" ? design.studio.texts : design.studio.photos;
    const target = selection.index + direction;
    if (target < 0 || target >= list.length) return;
    const swap = <T,>(items: T[]) => items.map((item, position) => (position === selection.index ? items[target] : position === target ? items[selection.index] : item));
    updateStudio((studio) => (selection.kind === "text" ? { ...studio, texts: swap(studio.texts) } : { ...studio, photos: swap(studio.photos) }));
    clearLocks();
    setSelection({ ...selection, index: target });
  };

  const toggleLock = () => {
    if (!selection) return;
    const key = lockKey(selection.kind, selection.index);
    setLocked((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  /** Point a text box at another field, or at a new one. */
  const bindText = (index: number, value: string) => {
    const current = stateRef.current;
    if (value !== "__new") {
      updateText(index, { fieldKey: value });
      return;
    }
    const label = `Text ${current.fields.length + 1}`;
    const key = uniqueStudioKey(studioKeyFromLabel(label, "text"), [...current.fields.map((field) => field.key), ...reservedKeys]);
    commit({
      fields: [...current.fields, { key, label, required: true, maxLength: 30, placeholder: label }],
      designs: current.designs.map((item, position) => (position === active
        ? { ...item, studio: { ...item.studio, texts: item.studio.texts.map((layer, layerIndex) => (layerIndex === index ? { ...layer, fieldKey: key, placeholder: label } : layer)) } }
        : item)),
    });
  };

  // ---- designs ----
  const moveDesign = (direction: 1 | -1) => {
    const target = active + direction;
    const current = stateRef.current;
    if (target < 0 || target >= current.designs.length) return;
    const designs = [...current.designs];
    [designs[active], designs[target]] = [designs[target], designs[active]];
    commit({ ...current, designs });
    setActive(target);
  };

  const makeFirst = (index: number) => {
    const current = stateRef.current;
    commit({ ...current, designs: current.designs.map((item, position) => ({ ...item, isDefault: position === index })) });
  };

  const duplicateDesign = () => {
    const current = stateRef.current;
    const source = current.designs[active];
    if (!source || current.designs.length >= 12) return;
    const copy: EditorDesign = { ...source, clientId: nextClientId(), templateId: undefined, imported: false, isDefault: false, name: `${source.name} copy`.slice(0, 80) };
    const designs = [...current.designs];
    designs.splice(active + 1, 0, copy);
    commit({ ...current, designs });
    setActive(active + 1);
    setSelection(null);
  };

  const removeDesign = () => {
    const current = stateRef.current;
    const target = current.designs[active];
    if (!target) return;
    if (!window.confirm(`Remove "${target.name}"? Customers will no longer see it after you save. Text fields that only this design shows are removed too.`)) return;
    const designs = withOneDefaultDesign(current.designs.filter((_item, position) => position !== active));
    commit({ ...current, designs });
    setActive(Math.max(0, active - 1));
    setSelection(null);
  };

  /** A new design: the chosen image as the mockup, with the product's first text field already on it. */
  const addDesign = (choice: ImageChoice) => {
    const current = stateRef.current;
    if (current.designs.length >= 12) {
      setStatus({ tone: "error", title: "A product can have up to 12 designs." });
      return;
    }
    let fields = current.fields;
    let field = fields[0];
    if (!field) {
      field = { ...DEFAULT_STUDIO_FIELD, key: uniqueStudioKey(DEFAULT_STUDIO_FIELD.key, reservedKeys) };
      fields = [field];
    }
    const studio = defaultStudioDesign(choice.url, choice.size, field);
    const next: EditorDesign = { clientId: nextClientId(), name: `Design ${current.designs.length + 1}`, isDefault: !current.designs.length, imported: false, studio };
    commit({ fields, designs: [...current.designs, next] });
    setActive(current.designs.length);
    setSelection({ kind: "text", index: 0 });
  };

  const replaceImage = (choice: ImageChoice) => {
    updateStudio((studio) => {
      const canvasForImage = studioCanvasForImage(choice.size);
      const rescaled = canvasForImage.width === studio.canvas.width && canvasForImage.height === studio.canvas.height ? studio : rescaleStudioConfig(studio, canvasForImage);
      return { ...rescaled, background: { ...rescaled.background, url: choice.url } };
    });
  };

  const applyChoice = (choice: ImageChoice) => {
    if (chooser === "new") addDesign(choice);
    else if (chooser === "replace") replaceImage(choice);
    setChooser(null);
    setChooserUrl("");
  };

  const uploadImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy("Uploading image…");
    try {
      const form = new FormData();
      form.set("productId", productId);
      form.set("kind", "gallery");
      form.set("altText", `${productName} design`.slice(0, 240));
      form.set("image", file);
      const response = await fetch("/api/admin/catalog/images", { method: "POST", body: form });
      const payload = await response.json() as { data?: { asset?: { url: string; width?: number; height?: number } }; error?: { message?: string } };
      const asset = payload.data?.asset;
      if (!response.ok || !asset) throw new Error(payload.error?.message || "The image could not be uploaded.");
      setLocalPreviews((current) => ({ ...current, [asset.url]: URL.createObjectURL(file) }));
      applyChoice({ url: asset.url, size: asset.width && asset.height ? { width: asset.width, height: asset.height } : await measureImage(URL.createObjectURL(file)) });
    } catch (cause) {
      setStatus({ tone: "error", title: cause instanceof Error ? cause.message : "The image could not be uploaded." });
    } finally {
      setBusy("");
    }
  };

  const pickProductPhoto = async () => {
    if (!loaded?.product.imageUrl) return;
    setBusy("Reading the product photo…");
    const size = loaded.product.imageSize ?? await measureImage(loaded.product.imageUrl);
    setBusy("");
    applyChoice({ url: loaded.product.imageUrl, size });
  };

  const pickImageUrl = async () => {
    const url = chooserUrl.trim();
    if (!/^https:\/\//u.test(url)) {
      setStatus({ tone: "error", title: "Paste an https image link (or upload the image)." });
      return;
    }
    setBusy("Reading the image…");
    const size = await measureImage(url);
    setBusy("");
    if (!size) setStatus({ tone: "warning", title: "That image could not be opened here; the design uses a square canvas until it loads." });
    applyChoice({ url, size });
  };

  // ---- saving ----
  const save = async () => {
    const payload = savePayload(productId, stateRef.current);
    const check = studioSaveSchema.safeParse(payload);
    if (!check.success) {
      setStatus({ tone: "error", title: "Fix these before saving:", items: [...new Set(check.error.issues.map((issue) => issue.message))] });
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      const response = await fetch("/api/admin/studio-designs", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json() as { data?: LoadedStudio; error?: { message?: string; details?: unknown } };
      if (!response.ok || !result.data) {
        const details = Array.isArray(result.error?.details)
          ? (result.error.details as Array<{ message?: string }>).map((issue) => issue.message).filter((message): message is string => Boolean(message))
          : [];
        throw Object.assign(new Error(result.error?.message || "The designs could not be saved."), { details });
      }
      applyLoaded(result.data);
      await onSaved();
      setStatus(result.data.warnings?.length
        ? { tone: "warning", title: "Saved. Customers see these designs now. Please check:", items: result.data.warnings }
        : { tone: "success", title: "Saved. Customers see these designs now." });
    } catch (cause) {
      const details = (cause as { details?: string[] }).details;
      setStatus({ tone: "error", title: cause instanceof Error ? cause.message : "The designs could not be saved.", items: details?.length ? details : undefined });
    } finally {
      setSaving(false);
    }
  };

  const close = () => {
    if (dirty && !window.confirm("Close without saving? Your changes to the designs will be lost.")) return;
    onClose();
  };

  // ---- canvas interaction ----
  const canvasPoint = (event: ReactPointerEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || !canvas) return { x: 0, y: 0 };
    const scale = rect.width / canvas.width;
    return { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale };
  };

  const beginDrag = (event: ReactPointerEvent, kind: LayerKind, index: number, mode: Drag["mode"]) => {
    event.stopPropagation();
    setSelection({ kind, index });
    if (!design || isLocked(kind, index) || event.button !== 0) return;
    event.preventDefault();
    svgRef.current?.setPointerCapture(event.pointerId);
    svgRef.current?.focus({ preventScroll: true });
    const point = canvasPoint(event);
    const layer = kind === "text" ? design.studio.texts[index] : design.studio.photos[index];
    const height = kind === "text" ? studioTextBoxHeight(layer as StudioTextLayer) : (layer as StudioPhotoLayer).height;
    dragRef.current = { kind, index, mode, startX: point.x, startY: point.y, origin: { x: layer.x, y: layer.y, width: layer.width, height }, snapshot: stateRef.current, moved: false };
  };

  const moveDrag = (event: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!drag || !canvas) return;
    const point = canvasPoint(event);
    const dx = point.x - drag.startX;
    const dy = point.y - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 1) return;
    drag.moved = true;
    if (drag.mode === "move") {
      const threshold = 6 / renderScale;
      const x = snapToCentre(drag.origin.x + dx, drag.origin.width, canvas.width, threshold);
      const y = snapToCentre(drag.origin.y + dy, drag.origin.height, canvas.height, threshold);
      setGuides({ vertical: x.snapped, horizontal: y.snapped });
      patchLive(drag.kind, drag.index, { x: round1(x.value), y: round1(y.value) });
      return;
    }
    const width = Math.max(drag.kind === "text" ? 8 : 12, drag.origin.width + dx);
    if (drag.kind === "text") {
      patchLive("text", drag.index, { width: round1(width) });
    } else {
      const height = event.shiftKey ? width * (drag.origin.height / drag.origin.width) : Math.max(12, drag.origin.height + dy);
      patchLive("photo", drag.index, { width: round1(width), height: round1(height) });
    }
  };

  const endDrag = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    setGuides({ vertical: false, horizontal: false });
    if (drag?.moved && !sameState(drag.snapshot, stateRef.current)) {
      setPast((items) => [...items.slice(-(HISTORY_LIMIT - 1)), drag.snapshot]);
      setFuture([]);
    }
  };

  const nudge = (dx: number, dy: number) => {
    if (!selection || !design || isLocked(selection.kind, selection.index)) return;
    const layer = selection.kind === "text" ? design.studio.texts[selection.index] : design.studio.photos[selection.index];
    if (!layer) return;
    const patch = { x: round1(layer.x + dx), y: round1(layer.y + dy) };
    if (selection.kind === "text") updateText(selection.index, patch); else updatePhoto(selection.index, patch);
  };

  const onCanvasKey = (event: ReactKeyboardEvent<SVGSVGElement>) => {
    const step = event.shiftKey ? 10 : 1;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[event.key]) {
      event.preventDefault();
      nudge(...moves[event.key]);
    } else if ((event.key === "Delete" || event.key === "Backspace") && selection) {
      event.preventDefault();
      removeSelected();
    } else if (event.key === "Escape") {
      setSelection(null);
    }
  };

  const onDialogKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) redo(); else undo();
    } else if (mod && event.key.toLowerCase() === "y") {
      event.preventDefault();
      redo();
    }
  };

  // ---- rendering ----
  const handleSize = 10 / renderScale;
  const selectedText = selection?.kind === "text" && design ? design.studio.texts[selection.index] : undefined;
  const selectedPhoto = selection?.kind === "photo" && design ? design.studio.photos[selection.index] : undefined;
  const selectedField = selectedText ? state.fields.find((field) => field.key === selectedText.fieldKey) : undefined;
  const selectionLocked = selection ? isLocked(selection.kind, selection.index) : false;
  const importedCount = state.designs.filter((item) => item.imported).length;

  const renderPhotoContent = (slot: StudioPhotoLayer, index: number) => {
    if (!slot.sampleUrl) return null;
    const clipId = `studio-editor-clip-${index}`;
    return (
      <g key={`photo-content-${index}`} pointerEvents="none">
        <defs>
          <clipPath id={clipId}>
            {slot.shape === "circle"
              ? <ellipse cx={slot.x + slot.width / 2} cy={slot.y + slot.height / 2} rx={slot.width / 2} ry={slot.height / 2} />
              : <rect x={slot.x} y={slot.y} width={slot.width} height={slot.height} />}
          </clipPath>
        </defs>
        <image href={slot.sampleUrl} x={slot.x} y={slot.y} width={slot.width} height={slot.height} preserveAspectRatio="xMidYMid meet" clipPath={`url(#${clipId})`} />
      </g>
    );
  };

  /** Outline, label and hit area: always on top, so slots under an opaque mockup stay editable. */
  const renderPhotoChrome = (slot: StudioPhotoLayer, index: number) => {
    const selected = selection?.kind === "photo" && selection.index === index;
    const lockedHere = isLocked("photo", index);
    const shapeProps = { fill: slot.sampleUrl ? "transparent" : "rgba(15, 118, 110, 0.12)", stroke: selected ? "#0f766e" : "rgba(15, 118, 110, 0.7)", strokeWidth: selected ? 2 : 1.5, strokeDasharray: selected ? undefined : "6 4", vectorEffect: "non-scaling-stroke" as const };
    return (
      <g key={`photo-chrome-${index}`} className={lockedHere ? ui.layerLocked : ui.layerHit} onPointerDown={(event) => beginDrag(event, "photo", index, "move")}>
        {slot.shape === "circle"
          ? <ellipse cx={slot.x + slot.width / 2} cy={slot.y + slot.height / 2} rx={slot.width / 2} ry={slot.height / 2} {...shapeProps} />
          : <rect x={slot.x} y={slot.y} width={slot.width} height={slot.height} {...shapeProps} />}
        {!slot.sampleUrl && (
          <text x={slot.x + slot.width / 2} y={slot.y + slot.height / 2} textAnchor="middle" dominantBaseline="central" fill="#0f5f59" fontSize={Math.max(10, Math.min(22, slot.width * 0.09))} fontWeight={600} pointerEvents="none">
            {studioPhotoLabel(slot.fieldKey, slot.label)}
          </text>
        )}
        {selected && !lockedHere && (
          <rect className={ui.handle} x={slot.x + slot.width - handleSize / 2} y={slot.y + slot.height - handleSize / 2} width={handleSize} height={handleSize} fill="#fff" stroke="#0f766e" vectorEffect="non-scaling-stroke" onPointerDown={(event) => beginDrag(event, "photo", index, "resize")} />
        )}
      </g>
    );
  };

  const renderText = (layer: StudioTextLayer, index: number) => {
    const layout = layoutStudioText(layer, undefined, measureStudioText);
    const top = layout.pivot.y - layout.boxHeight / 2;
    const selected = selection?.kind === "text" && selection.index === index;
    const lockedHere = isLocked("text", index);
    return (
      <g key={`text-${index}`} transform={`rotate(${layer.rotation} ${layout.pivot.x} ${layout.pivot.y}) translate(${layer.x} ${top})`}>
        {layout.lines.map((line, lineIndex) => (
          <text
            key={lineIndex}
            x={layout.anchorX}
            y={layout.lineCenters[lineIndex]}
            textAnchor={layer.textAlign === "left" ? "start" : layer.textAlign === "right" ? "end" : "middle"}
            dominantBaseline="central"
            fill={layer.color}
            fontSize={layout.fontSize}
            fontWeight={layer.fontWeight}
            letterSpacing={layer.letterSpacing || undefined}
            style={{ fontFamily: studioFontFamily(layer.fontId) }}
            pointerEvents="none"
          >
            {line}
          </text>
        ))}
        <rect
          className={lockedHere ? ui.layerLocked : ui.layerHit}
          x={0}
          y={0}
          width={layer.width}
          height={layout.boxHeight}
          fill="transparent"
          stroke={selected ? "#0f766e" : "rgba(15, 118, 110, 0.55)"}
          strokeWidth={selected ? 2 : 1}
          strokeDasharray={selected ? undefined : "5 4"}
          vectorEffect="non-scaling-stroke"
          onPointerDown={(event) => beginDrag(event, "text", index, "move")}
        />
        {selected && !lockedHere && (
          <rect className={ui.handleEw} x={layer.width - handleSize / 2} y={layout.boxHeight / 2 - handleSize / 2} width={handleSize} height={handleSize} fill="#fff" stroke="#0f766e" vectorEffect="non-scaling-stroke" onPointerDown={(event) => beginDrag(event, "text", index, "resize")} />
        )}
      </g>
    );
  };

  const numberInput = (label: string, value: number | null, onChange: (value: string) => void, options: { step?: number; placeholder?: string; disabled?: boolean } = {}) => (
    <label className={styles.fieldGroup}>
      <span className={styles.fieldLabel}>{label}</span>
      <input className={styles.input} inputMode="decimal" type="number" step={options.step ?? 1} value={value ?? ""} placeholder={options.placeholder} disabled={options.disabled} onChange={(event) => onChange(event.target.value)} />
    </label>
  );

  // A portal keeps the editor out of the product <form>: Enter in an editor field never submits the product.
  return createPortal(
    <div className={ui.overlay} role="dialog" aria-modal="true" aria-label={`2D designs for ${productName}`} onKeyDown={onDialogKey}>
      <header className={ui.header}>
        <div className={ui.title}>
          <strong>2D designs · {productName}</strong>
          <small>
            Place the customer&apos;s text and photos on each design. Customers type into these fields on the product page.
            {importedCount > 0 && " Imported designs you save here are kept even if the catalogue is imported again."}
          </small>
        </div>
        <div className={ui.headerActions}>
          <button className={styles.buttonGhost} type="button" onClick={undo} disabled={!past.length} title="Undo (Ctrl+Z)"><Undo2 size={15} /> Undo</button>
          <button className={styles.buttonGhost} type="button" onClick={redo} disabled={!future.length} title="Redo (Ctrl+Shift+Z)"><Redo2 size={15} /> Redo</button>
          <button className={styles.buttonSecondary} type="button" onClick={() => setPreview((value) => !value)} disabled={!design} aria-pressed={preview}><Eye size={15} /> {preview ? "Back to editing" : "Preview as customer"}</button>
          <button className={styles.buttonPrimary} type="button" onClick={() => void save()} disabled={saving || !dirty || !loaded}><Save size={15} /> {saving ? "Saving…" : "Save designs"}</button>
          <button className={styles.buttonGhost} type="button" onClick={close} aria-label="Close the design editor"><X size={16} /></button>
        </div>
      </header>

      {(status || busy) && (
        <div className={`${ui.status} ${status?.tone === "error" ? ui.statusError : status?.tone === "warning" ? ui.statusWarning : status ? ui.statusSuccess : ""}`} role={status?.tone === "error" ? "alert" : "status"}>
          {busy || status?.title}
          {!busy && status?.items && <ul>{status.items.map((item) => <li key={item}>{item}</li>)}</ul>}
        </div>
      )}
      {!status && !busy && <div />}

      <div className={ui.body}>
        <aside className={ui.rail} aria-label="Designs">
          <p className={ui.railHeading}>Designs</p>
          {state.designs.map((item, index) => (
            <button key={item.clientId} type="button" className={`${ui.designItem} ${index === active ? ui.designItemActive : ""}`} onClick={() => { setActive(index); setSelection(null); }} aria-current={index === active}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className={ui.designThumb} src={displayUrl(item.studio.background.url)} alt="" />
              <span className={ui.designMeta}>
                <strong>{item.name}</strong>
                <small>{item.studio.texts.length} text · {item.studio.photos.length} photo{item.imported ? " · imported" : ""}</small>
                {item.isDefault && <span className={ui.firstBadge}>Shown first</span>}
              </span>
            </button>
          ))}
          {design && (
            <div className={ui.railActions}>
              <button className={styles.buttonGhost} type="button" onClick={() => moveDesign(-1)} disabled={active === 0} aria-label="Move design up"><ArrowUp size={14} /></button>
              <button className={styles.buttonGhost} type="button" onClick={() => moveDesign(1)} disabled={active === state.designs.length - 1} aria-label="Move design down"><ArrowDown size={14} /></button>
              <button className={styles.buttonGhost} type="button" onClick={duplicateDesign} disabled={state.designs.length >= 12} title="Duplicate design"><Copy size={14} /> Duplicate</button>
              <button className={styles.buttonGhost} type="button" onClick={removeDesign} title="Remove design"><Trash2 size={14} /> Remove</button>
            </div>
          )}
          <button className={styles.buttonSecondary} type="button" onClick={() => setChooser(chooser === "new" ? null : "new")} disabled={!loaded || state.designs.length >= 12}><Plus size={14} /> Add design</button>
          {chooser && (
            <div className={ui.chooser}>
              <strong style={{ fontSize: 13 }}>{chooser === "new" ? "New design: choose its mockup" : "Replace the mockup image"}</strong>
              <button className={styles.buttonSecondary} type="button" onClick={() => fileRef.current?.click()} disabled={Boolean(busy)}><Upload size={14} /> Upload image</button>
              {loaded?.product.imageUrl && <button className={styles.buttonSecondary} type="button" onClick={() => void pickProductPhoto()} disabled={Boolean(busy)}><ImagePlus size={14} /> Use product photo</button>}
              <label className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>…or an https image link</span>
                <input className={styles.input} value={chooserUrl} onChange={(event) => setChooserUrl(event.target.value)} placeholder="https://…" />
              </label>
              <button className={styles.buttonGhost} type="button" onClick={() => void pickImageUrl()} disabled={!chooserUrl.trim() || Boolean(busy)}>Use link</button>
              <button className={styles.buttonGhost} type="button" onClick={() => setChooser(null)}>Cancel</button>
              {loaded && !loaded.product.published && <p className={ui.small}>Uploaded images appear on the live site once the product is published.</p>}
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => void uploadImage(event)} />
        </aside>

        <main className={ui.stage}>
          <div className={ui.toolbar} role="toolbar" aria-label="Design tools">
            <button className={styles.buttonSecondary} type="button" onClick={addTextField} disabled={!design || preview}><Type size={14} /> Add text field</button>
            <button className={styles.buttonSecondary} type="button" onClick={addPhotoSlot} disabled={!design || preview || design.studio.photos.length >= 10}><ImagePlus size={14} /> Add photo slot</button>
            <span className={ui.toolbarSpacer} />
            <button className={styles.buttonGhost} type="button" onClick={() => reorderSelected(1)} disabled={!selection || preview} title="Bring forward"><BringToFront size={15} /></button>
            <button className={styles.buttonGhost} type="button" onClick={() => reorderSelected(-1)} disabled={!selection || preview} title="Send backward"><SendToBack size={15} /></button>
            <button className={styles.buttonGhost} type="button" onClick={toggleLock} disabled={!selection || preview} title={selectionLocked ? "Unlock" : "Lock while editing"}>{selectionLocked ? <LockOpen size={15} /> : <Lock size={15} />}</button>
            <button className={styles.buttonGhost} type="button" onClick={removeSelected} disabled={!selection || preview} title="Remove (Delete)"><Trash2 size={15} /></button>
          </div>

          <div className={ui.canvasWrap}>
            {!loaded && !status && <p className={ui.hint}>Loading designs…</p>}
            {loaded && !design && (
              <div className={ui.empty}>
                <strong>No 2D designs yet</strong>
                <p>Start from the product photo, or upload a mockup. A &quot;Your name&quot; box is placed in the middle; drag it where the name should print.</p>
                <div className={ui.railActions} style={{ justifyContent: "center" }}>
                  {loaded.product.imageUrl && <button className={styles.buttonPrimary} type="button" onClick={() => { setChooser("new"); void (async () => { const size = loaded.product.imageSize ?? await measureImage(loaded.product.imageUrl); addDesign({ url: loaded.product.imageUrl, size }); setChooser(null); })(); }}><ImagePlus size={14} /> Use product photo</button>}
                  <button className={styles.buttonSecondary} type="button" onClick={() => { setChooser("new"); fileRef.current?.click(); }}><Upload size={14} /> Upload mockup</button>
                </div>
              </div>
            )}
            {design && canvas && (preview ? (
              <CustomerPreview design={design} fields={state.fields} />
            ) : (
              <div style={{ width: "100%", maxWidth: Math.max(canvas.width, 600) }}>
                <svg
                  ref={svgRef}
                  className={ui.canvas}
                  viewBox={`0 0 ${canvas.width} ${canvas.height}`}
                  role="application"
                  aria-label={`Design canvas: ${design.name}. Arrow keys move the selected item, Delete removes it.`}
                  tabIndex={0}
                  data-fonts-loaded={fontsVersion}
                  onPointerDown={() => setSelection(null)}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  onKeyDown={onCanvasKey}
                >
                  <rect width={canvas.width} height={canvas.height} fill={design.studio.background.color ?? "#ffffff"} />
                  {design.studio.photos.map((slot, index) => (slot.stacking === "under" ? renderPhotoContent(slot, index) : null))}
                  <image href={displayUrl(design.studio.background.url)} width={canvas.width} height={canvas.height} preserveAspectRatio="xMidYMid meet" pointerEvents="none" />
                  {design.studio.photos.map((slot, index) => (slot.stacking === "over" ? renderPhotoContent(slot, index) : null))}
                  {design.studio.photos.map(renderPhotoChrome)}
                  {design.studio.texts.map(renderText)}
                  {guides.vertical && <line x1={canvas.width / 2} x2={canvas.width / 2} y1={0} y2={canvas.height} stroke="#e11d48" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" pointerEvents="none" />}
                  {guides.horizontal && <line x1={0} x2={canvas.width} y1={canvas.height / 2} y2={canvas.height / 2} stroke="#e11d48" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" pointerEvents="none" />}
                </svg>
                <p className={ui.hint}>Drag to move · drag the white square to resize (Shift keeps a photo&apos;s shape) · arrow keys nudge (Shift ×10) · snaps to the centre lines</p>
              </div>
            ))}
          </div>
        </main>

        <aside className={ui.panel} aria-label="Settings">
          {!design && <p className={ui.small}>Add a design to start.</p>}

          {design && !selection && (
            <>
              <p className={ui.panelHeading}>Design</p>
              <div className={ui.section}>
                <label className={styles.fieldGroup}>
                  <span className={styles.fieldLabel}>Name</span>
                  <input className={styles.input} value={design.name} maxLength={80} onChange={(event) => updateDesign(active, (item) => ({ ...item, name: event.target.value }))} />
                </label>
                <label className={styles.compactCheck}><input type="radio" name="studio-first-design" checked={design.isDefault} onChange={() => makeFirst(active)} /> Show this design first</label>
                <div className={styles.fieldGroup}>
                  <span className={styles.fieldLabel}>Background colour (behind a transparent mockup)</span>
                  <div className={ui.colorRow}>
                    <input type="color" value={design.studio.background.color ?? "#ffffff"} onChange={(event) => updateStudio((studio) => ({ ...studio, background: { ...studio.background, color: event.target.value } }))} aria-label="Background colour" />
                    <label className={styles.compactCheck}><input type="checkbox" checked={design.studio.background.color === null} onChange={(event) => updateStudio((studio) => ({ ...studio, background: { ...studio.background, color: event.target.checked ? null : "#ffffff" } }))} /> None</label>
                  </div>
                </div>
                <p className={ui.small}>Canvas {design.studio.canvas.width} × {design.studio.canvas.height} px (the mockup fitted into 600 × 600).</p>
                <button className={styles.buttonSecondary} type="button" onClick={() => setChooser("replace")}><ImagePlus size={14} /> Replace mockup image</button>
              </div>
              <p className={ui.small}>Select a text box or photo slot on the canvas to edit it, or add one from the toolbar.</p>
            </>
          )}

          {design && selectedText && selection && (
            <>
              <p className={ui.panelHeading}>Text box</p>
              <div className={ui.section}>
                <label className={styles.fieldGroup}>
                  <span className={styles.fieldLabel}>Customer field</span>
                  <select className={styles.select} value={selectedText.fieldKey} onChange={(event) => bindText(selection.index, event.target.value)}>
                    {state.fields.map((field) => <option key={field.key} value={field.key}>{field.label} ({field.key})</option>)}
                    <option value="__new">+ New field…</option>
                  </select>
                  <small className={ui.small}>The same field on several designs keeps the customer&apos;s text when they switch designs.</small>
                </label>
              </div>
              {selectedField && (
                <>
                  <p className={ui.panelHeading}>Field (every design that shows it)</p>
                  <div className={ui.section}>
                    <label className={styles.fieldGroup}>
                      <span className={styles.fieldLabel}>Label customers see</span>
                      <input className={styles.input} value={selectedField.label} maxLength={120} onChange={(event) => updateField(selectedField.key, { label: event.target.value })} />
                    </label>
                    <label className={styles.fieldGroup}>
                      <span className={styles.fieldLabel}>Field key</span>
                      <input className={styles.input} defaultValue={selectedField.key} key={selectedField.key} onBlur={(event) => { const value = event.target.value.trim(); if (value && value !== selectedField.key) updateField(selectedField.key, { key: value }); }} />
                    </label>
                    <div className={ui.row2}>
                      {numberInput("Max characters", selectedField.maxLength, (value) => updateField(selectedField.key, { maxLength: value.trim() ? Math.max(1, Math.min(500, Math.round(numberOr(value, 1)))) : null }), { placeholder: "No limit" })}
                      <label className={styles.compactCheck} style={{ alignSelf: "end" }}><input type="checkbox" checked={selectedField.required} onChange={(event) => updateField(selectedField.key, { required: event.target.checked })} /> Required</label>
                    </div>
                    <label className={styles.fieldGroup}>
                      <span className={styles.fieldLabel}>Sample text (shown until the customer types)</span>
                      <input className={styles.input} value={selectedText.placeholder} maxLength={120} onChange={(event) => { updateText(selection.index, { placeholder: event.target.value }); }} onBlur={(event) => updateField(selectedField.key, { placeholder: event.target.value.slice(0, 240) })} />
                    </label>
                  </div>
                </>
              )}
              <p className={ui.panelHeading}>Style</p>
              <div className={ui.section}>
                <label className={styles.fieldGroup}>
                  <span className={styles.fieldLabel}>Font</span>
                  <select className={styles.select} value={selectedText.fontId} onChange={(event) => updateText(selection.index, { fontId: event.target.value as StudioFontId })}>
                    {FONT_CHOICES.map((font) => <option key={font.id} value={font.id}>{font.label}</option>)}
                  </select>
                </label>
                <div className={ui.row2}>
                  {numberInput("Size (px)", selectedText.fontSize, (value) => updateText(selection.index, { fontSize: Math.max(4, Math.min(400, numberOr(value, selectedText.fontSize))) }))}
                  <label className={styles.fieldGroup}>
                    <span className={styles.fieldLabel}>Weight</span>
                    <select className={styles.select} value={selectedText.fontWeight} onChange={(event) => updateText(selection.index, { fontWeight: Number(event.target.value) })}>
                      {WEIGHTS.map((weight) => <option key={weight} value={weight}>{weight}</option>)}
                    </select>
                  </label>
                </div>
                <div className={styles.fieldGroup}>
                  <span className={styles.fieldLabel}>Colour</span>
                  <div className={ui.colorRow}>
                    <input type="color" value={/^#[\da-f]{6}$/iu.test(selectedText.color) ? selectedText.color : "#111418"} onChange={(event) => updateText(selection.index, { color: event.target.value })} aria-label="Text colour" />
                    <input className={styles.input} value={selectedText.color} onChange={(event) => { const value = event.target.value.trim(); if (/^#[\da-f]{3,8}$/iu.test(value)) updateText(selection.index, { color: value }); }} aria-label="Text colour hex" />
                  </div>
                </div>
                <div className={styles.fieldGroup}>
                  <span className={styles.fieldLabel}>Alignment</span>
                  <div className={ui.segmented}>
                    {([["left", AlignLeft], ["center", AlignCenter], ["right", AlignRight]] as const).map(([value, Icon]) => (
                      <button key={value} type="button" aria-pressed={selectedText.textAlign === value} aria-label={`Align ${value}`} onClick={() => updateText(selection.index, { textAlign: value })}><Icon /></button>
                    ))}
                  </div>
                </div>
                <div className={ui.row2}>
                  <label className={styles.fieldGroup}>
                    <span className={styles.fieldLabel}>Letters</span>
                    <select className={styles.select} value={selectedText.textTransform} onChange={(event) => updateText(selection.index, { textTransform: event.target.value as StudioTextLayer["textTransform"] })}>
                      <option value="none">As typed</option>
                      <option value="uppercase">ALL CAPITALS</option>
                      <option value="capitalize">First Letter Capital</option>
                    </select>
                  </label>
                  {numberInput("Letter spacing", selectedText.letterSpacing, (value) => updateText(selection.index, { letterSpacing: Math.max(-50, Math.min(200, numberOr(value, 0))) }), { step: 0.5 })}
                </div>
                <div className={ui.row2}>
                  {numberInput("Rotation (°)", selectedText.rotation, (value) => updateText(selection.index, { rotation: Math.max(-360, Math.min(360, numberOr(value, 0))) }))}
                  <label className={styles.compactCheck} style={{ alignSelf: "end" }}><input type="checkbox" checked={selectedText.autoFit} onChange={(event) => updateText(selection.index, { autoFit: event.target.checked })} /> Shrink long text to fit</label>
                </div>
              </div>
              <p className={ui.panelHeading}>Position (canvas px)</p>
              <div className={ui.row4}>
                {numberInput("X", selectedText.x, (value) => updateText(selection.index, { x: numberOr(value, selectedText.x) }), { disabled: selectionLocked })}
                {numberInput("Y", selectedText.y, (value) => updateText(selection.index, { y: numberOr(value, selectedText.y) }), { disabled: selectionLocked })}
                {numberInput("W", selectedText.width, (value) => updateText(selection.index, { width: Math.max(4, numberOr(value, selectedText.width)) }), { disabled: selectionLocked })}
                {numberInput("H", selectedText.height, (value) => updateText(selection.index, { height: value.trim() ? Math.max(1, numberOr(value, 1)) : null }), { placeholder: "auto", disabled: selectionLocked })}
              </div>
            </>
          )}

          {design && selectedPhoto && selection && (
            <>
              <p className={ui.panelHeading}>Photo slot</p>
              <div className={ui.section}>
                <label className={styles.fieldGroup}>
                  <span className={styles.fieldLabel}>Label customers see</span>
                  <input className={styles.input} value={selectedPhoto.label ?? ""} maxLength={60} placeholder={studioPhotoLabel(selectedPhoto.fieldKey)} onChange={(event) => updatePhoto(selection.index, { label: event.target.value || undefined })} />
                </label>
                <label className={styles.compactCheck}><input type="checkbox" checked={selectedPhoto.required !== false} onChange={(event) => updatePhoto(selection.index, { required: event.target.checked ? undefined : false })} /> Required before add to cart</label>
                <div className={styles.fieldGroup}>
                  <span className={styles.fieldLabel}>Shape</span>
                  <div className={ui.segmented}>
                    <button type="button" aria-pressed={selectedPhoto.shape === "rect"} onClick={() => updatePhoto(selection.index, { shape: "rect" })}>Rectangle</button>
                    <button type="button" aria-pressed={selectedPhoto.shape === "circle"} onClick={() => updatePhoto(selection.index, { shape: "circle" })}>Circle</button>
                  </div>
                </div>
                <div className={styles.fieldGroup}>
                  <span className={styles.fieldLabel}>Photo sits</span>
                  <div className={ui.segmented}>
                    <button type="button" aria-pressed={selectedPhoto.stacking === "over"} onClick={() => updatePhoto(selection.index, { stacking: "over" })}>Over the mockup</button>
                    <button type="button" aria-pressed={selectedPhoto.stacking === "under"} onClick={() => updatePhoto(selection.index, { stacking: "under" })}>Under (through a window)</button>
                  </div>
                  <small className={ui.small}>&quot;Under&quot; only shows where the mockup image is transparent.</small>
                </div>
                <label className={styles.fieldGroup}>
                  <span className={styles.fieldLabel}>Sample photo link (optional)</span>
                  <input className={styles.input} value={selectedPhoto.sampleUrl ?? ""} placeholder="https://…" onChange={(event) => { const value = event.target.value.trim(); updatePhoto(selection.index, { sampleUrl: value || undefined }); }} />
                </label>
              </div>
              <p className={ui.panelHeading}>Position (canvas px)</p>
              <div className={ui.row4}>
                {numberInput("X", selectedPhoto.x, (value) => updatePhoto(selection.index, { x: numberOr(value, selectedPhoto.x) }), { disabled: selectionLocked })}
                {numberInput("Y", selectedPhoto.y, (value) => updatePhoto(selection.index, { y: numberOr(value, selectedPhoto.y) }), { disabled: selectionLocked })}
                {numberInput("W", selectedPhoto.width, (value) => updatePhoto(selection.index, { width: Math.max(8, numberOr(value, selectedPhoto.width)) }), { disabled: selectionLocked })}
                {numberInput("H", selectedPhoto.height, (value) => updatePhoto(selection.index, { height: Math.max(8, numberOr(value, selectedPhoto.height)) }), { disabled: selectionLocked })}
              </div>
            </>
          )}
        </aside>
      </div>
    </div>,
    document.body,
  );
}

// ---- preview as customer -----------------------------------------------------------------------

/** The design drawn by the storefront's own renderer, with sample text and a sample photo. */
function CustomerPreview({ design, fields }: { design: EditorDesign; fields: StudioFieldInput[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState("");
  const shown = useMemo(() => {
    const keys = new Set(design.studio.texts.map((layer) => layer.fieldKey));
    return fields.filter((field) => keys.has(field.key));
  }, [design, fields]);
  const values = useMemo(
    () => Object.fromEntries(shown.map((field, index) => [field.key, SAMPLE_VALUES[index % SAMPLE_VALUES.length].slice(0, field.maxLength ?? undefined)])),
    [shown],
  );

  useEffect(() => {
    let live = true;
    const element = canvasRef.current;
    const ctx = element?.getContext("2d");
    if (!element || !ctx) return;
    const { width, height } = design.studio.canvas;
    element.width = width * 2;
    element.height = height * 2;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    const photo = samplePhotoUrl();
    const photos = Object.fromEntries(design.studio.photos.map((slot) => [slot.fieldKey, { src: photo, transform: { ...DEFAULT_PHOTO_TRANSFORM } }]));
    drawStudioDesign(ctx, design.studio, values, photos).catch(() => { if (live) setError("The preview could not be drawn."); });
    return () => { live = false; };
  }, [design, values]);

  return (
    <div className={ui.preview}>
      <canvas ref={canvasRef} className={ui.previewCanvas} style={{ maxWidth: design.studio.canvas.width }} aria-label={`Customer preview of ${design.name}`} />
      {error && <p className={ui.small}>{error}</p>}
      <div className={ui.previewFields}>
        {shown.map((field) => (
          <div key={field.key}><strong>{field.label}</strong><span>{values[field.key]} · {field.maxLength ? `max ${field.maxLength}` : "no limit"}{field.required ? "" : " · optional"}</span></div>
        ))}
        {design.studio.photos.map((slot) => (
          <div key={slot.fieldKey}><strong>{studioPhotoLabel(slot.fieldKey, slot.label)}</strong><span>sample photo · {slot.required === false ? "optional" : "required"}</span></div>
        ))}
      </div>
      <p className={ui.small}>Sample text and a sample photo, drawn exactly as the customer&apos;s design is rendered.</p>
    </div>
  );
}
