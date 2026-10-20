"use client";

import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  BringToFront,
  Copy,
  Hand,
  ImagePlus,
  Layers3,
  Redo2,
  RotateCcw,
  SendToBack,
  Trash2,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type {
  ArtworkDocument,
  ArtworkLayer,
  PrintableSurfaceDefinition,
} from "./artwork-types";
import { getArtworkLayersInRenderOrder, insertArtworkBelowText } from "./artwork-types";
import styles from "./configurator.module.css";

const MAX_FILE_BYTES = 2 * 1024 * 1024;

interface ArtworkEditorProps {
  document: ArtworkDocument;
  surfaces: PrintableSurfaceDefinition[];
  background: string;
  accent: string;
  onChange: (document: ArtworkDocument) => void;
  footer?: React.ReactNode;
}

type DragState = {
  layerId: string;
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

type PanState = {
  pointerId: number;
  startX: number;
  startY: number;
  scrollLeft: number;
  scrollTop: number;
};

const newId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

function cloneDocument(document: ArtworkDocument): ArtworkDocument {
  return {
    ...document,
    surfaces: document.surfaces.map((surface) => ({
      ...surface,
      layers: surface.layers.map((layer) => ({ ...layer })),
    })),
  };
}

function replaceLayers(
  document: ArtworkDocument,
  surfaceId: string,
  update: (layers: ArtworkLayer[]) => ArtworkLayer[],
) {
  return {
    ...document,
    updatedAt: new Date().toISOString(),
    surfaces: document.surfaces.map((surface) =>
      surface.id === surfaceId ? { ...surface, layers: update(surface.layers) } : surface,
    ),
  };
}

function fileSignature(bytes: Uint8Array) {
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.every((value, index) => bytes[index] === value)) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  return undefined;
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("The image could not be read."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

function getImageSize(src: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("The image is damaged or unsupported."));
    image.src = src;
  });
}

export function ArtworkEditor({
  document,
  surfaces,
  background,
  accent,
  onChange,
  footer,
}: ArtworkEditorProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [message, setMessage] = useState("");
  const [panEnabled, setPanEnabled] = useState(false);
  const [undoStack, setUndoStack] = useState<ArtworkDocument[]>([]);
  const [redoStack, setRedoStack] = useState<ArtworkDocument[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const panRef = useRef<PanState | null>(null);

  const activeSurface =
    document.surfaces.find((surface) => surface.id === document.activeSurfaceId) ??
    document.surfaces[0];
  const surfaceDefinition =
    surfaces.find((surface) => surface.id === activeSurface?.id) ?? surfaces[0];
  const selectedLayer = activeSurface?.layers.find((layer) => layer.id === selectedId);
  const canvasWidth = surfaceDefinition?.width ?? 600;
  const canvasHeight = surfaceDefinition?.height ?? 360;
  const safeInset = surfaceDefinition?.safeInset ?? 32;
  const physicalWidthMm = surfaceDefinition?.physicalWidthMm;
  const physicalHeightMm = surfaceDefinition?.physicalHeightMm;
  const targetDpi = surfaceDefinition?.targetDpi ?? 300;

  const warnings = useMemo(() => {
    if (!activeSurface) return [];
    return activeSurface.layers.flatMap((layer) => {
      const issues: string[] = [];
      if (
        layer.x < safeInset ||
        layer.y < safeInset ||
        layer.x + layer.width > canvasWidth - safeInset ||
        layer.y + layer.height > canvasHeight - safeInset
      ) {
        issues.push(`${layer.name} crosses the safe area.`);
      }
      if (layer.type === "image") {
        if (physicalWidthMm && physicalHeightMm) {
          const requiredWidth = Math.ceil((layer.width / canvasWidth) * physicalWidthMm / 25.4 * targetDpi);
          const requiredHeight = Math.ceil((layer.height / canvasHeight) * physicalHeightMm / 25.4 * targetDpi);
          if ((layer.sourceWidth ?? 0) < requiredWidth || (layer.sourceHeight ?? 0) < requiredHeight) {
            issues.push(`${layer.name} needs about ${requiredWidth} x ${requiredHeight} px for ${targetDpi} DPI at this size.`);
          }
        } else {
          issues.push(`${layer.name} resolution cannot be verified until physical print dimensions are configured.`);
        }
      }
      return issues;
    });
  }, [activeSurface, canvasHeight, canvasWidth, physicalHeightMm, physicalWidthMm, safeInset, targetDpi]);

  function apply(next: ArtworkDocument, recordHistory = true) {
    if (recordHistory) {
      setUndoStack((stack) => [...stack.slice(-39), cloneDocument(document)]);
      setRedoStack([]);
    }
    onChange(next);
  }

  function updateLayer(layerId: string, patch: Partial<ArtworkLayer>, recordHistory = true) {
    apply(
      replaceLayers(document, activeSurface.id, (layers) =>
        layers.map((layer) => (layer.id === layerId ? { ...layer, ...patch } : layer)),
      ),
      recordHistory,
    );
  }

  function resizeLayer(layer: ArtworkLayer, axis: "width" | "height", rawValue: number) {
    const value = Math.max(20, rawValue || 20);
    if (layer.type !== "image") {
      updateLayer(layer.id, { [axis]: value });
      return;
    }
    const aspect = layer.width / layer.height || (layer.sourceWidth ?? 1) / (layer.sourceHeight ?? 1);
    updateLayer(layer.id, axis === "width" ? { width: value, height: value / aspect } : { height: value, width: value * aspect });
  }

  function fitTextToBox(layer: ArtworkLayer) {
    const characterCount = Math.max(1, layer.text?.trim().length ?? 1);
    const widthLimitedSize = layer.width / (characterCount * 0.62);
    const heightLimitedSize = layer.height * 0.78;
    updateLayer(layer.id, {
      fontSize: Math.max(8, Math.min(180, Math.floor(Math.min(widthLimitedSize, heightLimitedSize)))),
    });
  }

  function setLayerRotation(layer: ArtworkLayer, rotation: number) {
    updateLayer(layer.id, { rotation: Math.max(-180, Math.min(180, rotation)) });
  }

  function addText() {
    const id = newId();
    apply(
      replaceLayers(document, activeSurface.id, (layers) => [
        ...layers,
        {
          id,
          type: "text",
          name: `Text ${layers.filter((layer) => layer.type === "text").length + 1}`,
          x: canvasWidth * 0.25,
          y: canvasHeight * 0.4,
          width: canvasWidth * 0.5,
          height: 58,
          rotation: 0,
          opacity: 1,
          text: "Your text",
          color: "#17324d",
          fontSize: 34,
          fontFamily: "rounded",
        },
      ]),
    );
    setSelectedId(id);
  }

  async function addImage(file: File | undefined) {
    if (!file) return;
    setMessage("");
    if (file.size > MAX_FILE_BYTES) {
      setMessage("Use a PNG or JPG no larger than 2 MB.");
      return;
    }
    const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const detectedType = fileSignature(bytes);
    if (!detectedType || !["image/png", "image/jpeg"].includes(file.type) || detectedType !== file.type) {
      setMessage("Only genuine PNG and JPG image files are supported in this editor.");
      return;
    }
    try {
      const src = await readAsDataUrl(file);
      const imageSize = await getImageSize(src);
      const id = newId();
      const aspect = imageSize.width / imageSize.height;
      const width = Math.min(canvasWidth * 0.42, imageSize.width);
      const height = width / aspect;
      apply(
        replaceLayers(document, activeSurface.id, (layers) => {
          const imageLayer: ArtworkLayer = {
            id,
            type: "image",
            name: file.name.slice(0, 80),
            x: (canvasWidth - width) / 2,
            y: (canvasHeight - height) / 2,
            width,
            height,
            rotation: 0,
            opacity: 1,
            src,
            sourceWidth: imageSize.width,
            sourceHeight: imageSize.height,
          };
          return insertArtworkBelowText(layers, imageLayer);
        }),
      );
      setSelectedId(id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The image could not be loaded.");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function undo() {
    const previous = undoStack.at(-1);
    if (!previous) return;
    setUndoStack((stack) => stack.slice(0, -1));
    setRedoStack((stack) => [...stack.slice(-39), cloneDocument(document)]);
    onChange(previous);
  }

  function redo() {
    const next = redoStack.at(-1);
    if (!next) return;
    setRedoStack((stack) => stack.slice(0, -1));
    setUndoStack((stack) => [...stack.slice(-39), cloneDocument(document)]);
    onChange(next);
  }

  function duplicateSelected() {
    if (!selectedLayer) return;
    if (selectedLayer.id === "personalization-name") {
      setMessage("The required personalized name cannot be duplicated.");
      return;
    }
    const id = newId();
    apply(
      replaceLayers(document, activeSurface.id, (layers) => [
        ...layers,
        { ...selectedLayer, id, name: `${selectedLayer.name} copy`, x: selectedLayer.x + 18, y: selectedLayer.y + 18 },
      ]),
    );
    setSelectedId(id);
  }

  function deleteSelected() {
    if (!selectedLayer) return;
    if (selectedLayer.id === "personalization-name") {
      setMessage("The required personalized name cannot be deleted.");
      return;
    }
    apply(
      replaceLayers(document, activeSurface.id, (layers) =>
        layers.filter((layer) => layer.id !== selectedLayer.id),
      ),
    );
    setSelectedId(null);
  }

  function reorder(toFront: boolean) {
    if (!selectedLayer) return;
    if (!toFront && selectedLayer.type === "text") {
      setMessage("Text stays on the front of the poster.");
      return;
    }
    apply(
      replaceLayers(document, activeSurface.id, (layers) => {
        const remaining = layers.filter((layer) => layer.id !== selectedLayer.id);
        return toFront ? [...remaining, selectedLayer] : [selectedLayer, ...remaining];
      }),
    );
  }

  function resetSurface() {
    if (!activeSurface.layers.length || !window.confirm("Reset this artwork surface?")) return;
    const hasRequiredName = activeSurface.layers.some((layer) => layer.id === "personalization-name");
    apply(replaceLayers(document, activeSurface.id, (layers) => {
      const requiredName = layers.find((layer) => layer.id === "personalization-name");
      return requiredName ? [{
        ...requiredName,
        x: canvasWidth * 0.2,
        y: canvasHeight * 0.4,
        width: canvasWidth * 0.6,
        height: Math.min(70, canvasHeight * 0.2),
        rotation: 0,
        opacity: 1,
      }] : [];
    }));
    setSelectedId(hasRequiredName ? "personalization-name" : null);
  }

  function pointerPosition(event: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const matrix = svg.getScreenCTM()?.inverse();
    const transformed = matrix ? point.matrixTransform(matrix) : point;
    return { x: transformed.x, y: transformed.y };
  }

  function beginDrag(event: React.PointerEvent<SVGGElement>, layer: ArtworkLayer) {
    event.stopPropagation();
    const svg = svgRef.current;
    if (!svg) return;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const matrix = svg.getScreenCTM()?.inverse();
    const transformed = matrix ? point.matrixTransform(matrix) : point;
    setSelectedId(layer.id);
    setUndoStack((stack) => [...stack.slice(-39), cloneDocument(document)]);
    setRedoStack([]);
    dragRef.current = {
      layerId: layer.id,
      pointerId: event.pointerId,
      startX: transformed.x,
      startY: transformed.y,
      originX: layer.x,
      originY: layer.y,
    };
    svg.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: React.PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const point = pointerPosition(event);
    updateLayer(
      drag.layerId,
      {
        x: Math.round(drag.originX + point.x - drag.startX),
        y: Math.round(drag.originY + point.y - drag.startY),
      },
      false,
    );
  }

  function endDrag(event: React.PointerEvent<SVGSVGElement>) {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function beginPan(event: React.PointerEvent<HTMLDivElement>) {
    if (!panEnabled) return;
    event.preventDefault();
    event.stopPropagation();
    const viewport = viewportRef.current;
    if (!viewport) return;
    panRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    };
    viewport.setPointerCapture(event.pointerId);
  }

  function movePan(event: React.PointerEvent<HTMLDivElement>) {
    const pan = panRef.current;
    const viewport = viewportRef.current;
    if (!pan || !viewport || pan.pointerId !== event.pointerId) return;
    viewport.scrollLeft = pan.scrollLeft - (event.clientX - pan.startX);
    viewport.scrollTop = pan.scrollTop - (event.clientY - pan.startY);
  }

  function endPan(event: React.PointerEvent<HTMLDivElement>) {
    if (panRef.current?.pointerId !== event.pointerId) return;
    panRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function handleCanvasKeyDown(event: React.KeyboardEvent<SVGSVGElement>) {
    if (!selectedLayer) return;
    const step = event.shiftKey ? 10 : 1;
    const movement = {
      ArrowLeft: { x: selectedLayer.x - step },
      ArrowRight: { x: selectedLayer.x + step },
      ArrowUp: { y: selectedLayer.y - step },
      ArrowDown: { y: selectedLayer.y + step },
    }[event.key];
    if (movement) {
      event.preventDefault();
      updateLayer(selectedLayer.id, movement);
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      deleteSelected();
    }
  }

  return (
    <section className={styles.editor} aria-label="Artwork editor">
      <div className={styles.editorToolbar}>
        <button type="button" onClick={addText} title="Add text"><Type /> <span>Add text</span></button>
        <button type="button" onClick={() => fileInput.current?.click()} title="Upload PNG or JPG"><ImagePlus /> <span>Upload</span></button>
        <input
          ref={fileInput}
          className={styles.visuallyHidden}
          type="file"
          accept="image/png,image/jpeg"
          onChange={(event) => void addImage(event.target.files?.[0])}
        />
        <i />
        <button type="button" onClick={undo} disabled={!undoStack.length} title="Undo"><Undo2 /></button>
        <button type="button" onClick={redo} disabled={!redoStack.length} title="Redo"><Redo2 /></button>
        <button type="button" onClick={() => setZoom((value) => Math.max(0.7, value - 0.1))} title="Zoom out"><ZoomOut /></button>
        <span>{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => setZoom((value) => Math.min(1.8, value + 0.1))} title="Zoom in"><ZoomIn /></button>
        <button type="button" className={panEnabled ? styles.activeTool : ""} aria-pressed={panEnabled} onClick={() => setPanEnabled((value) => !value)} title="Pan canvas"><Hand /></button>
        <button type="button" onClick={resetSurface} disabled={!activeSurface?.layers.length} title="Reset surface"><RotateCcw /></button>
      </div>

      <div className={styles.surfaceTabs} role="tablist" aria-label="Printable surface">
        {document.surfaces.map((surface) => (
          <button
            key={surface.id}
            type="button"
            role="tab"
            aria-selected={surface.id === document.activeSurfaceId}
            className={surface.id === document.activeSurfaceId ? styles.active : ""}
            onClick={() => {
              onChange({ ...document, activeSurfaceId: surface.id });
              setSelectedId(null);
            }}
          >
            {surface.label}
            <small>{surface.layers.length}</small>
          </button>
        ))}
      </div>

      <div
        ref={viewportRef}
        className={`${styles.artboardViewport} ${panEnabled ? styles.panning : ""}`}
        onPointerDownCapture={beginPan}
        onPointerMove={movePan}
        onPointerUp={endPan}
        onPointerCancel={endPan}
      >
        <div className={styles.artboardScale} style={{ width: `${zoom * 100}%` }}>
          <svg
            ref={svgRef}
            className={styles.artboard}
            viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
            role="img"
            aria-label={`${activeSurface?.label ?? "Product"} artwork canvas`}
            tabIndex={0}
            onKeyDown={handleCanvasKeyDown}
            onPointerDown={() => setSelectedId(null)}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <rect width={canvasWidth} height={canvasHeight} fill={background} />
            <rect x="0" y="0" width={canvasWidth} height={canvasHeight} fill="none" stroke={accent} strokeWidth="3" />
            <rect
              className={styles.safeArea}
              x={safeInset}
              y={safeInset}
              width={canvasWidth - safeInset * 2}
              height={canvasHeight - safeInset * 2}
              rx="6"
            />
            {getArtworkLayersInRenderOrder(activeSurface?.layers ?? []).map((layer) => (
              <g
                key={layer.id}
                className={styles.artworkObject}
                transform={`translate(${layer.x} ${layer.y}) rotate(${layer.rotation} ${layer.width / 2} ${layer.height / 2})`}
                opacity={layer.opacity}
                onPointerDown={(event) => beginDrag(event, layer)}
              >
                {layer.type === "image" && layer.src ? (
                  <image href={layer.src} width={layer.width} height={layer.height} preserveAspectRatio="xMidYMid meet" />
                ) : (
                  <text
                    x={layer.width / 2}
                    y={layer.height / 2}
                    dominantBaseline="middle"
                    textAnchor="middle"
                    fill={layer.color}
                    fontSize={layer.fontSize}
                    fontFamily={layer.fontFamily === "serif" ? "Georgia, serif" : layer.fontFamily === "sans" ? "Arial, sans-serif" : "Manrope, Arial, sans-serif"}
                    fontWeight="700"
                  >
                    {layer.text}
                  </text>
                )}
                {selectedId === layer.id && (
                  <rect className={styles.selection} width={layer.width} height={layer.height} />
                )}
              </g>
            ))}
          </svg>
        </div>
      </div>

      <p className={styles.guideLegend}><span /> Safe area <i /> Product edge</p>
      {(message || warnings.length > 0) && (
        <div className={styles.artworkWarnings} role="status">
          {message && <p>{message}</p>}
          {warnings.map((warning) => <p key={warning}>{warning}</p>)}
        </div>
      )}

      <aside className={styles.inspector} aria-label="Artwork properties">
        <div className={styles.inspectorTitle}><Layers3 /><div><strong>Artwork layers</strong><small>{activeSurface?.label}</small></div></div>
        <div className={styles.layerList}>
          {getArtworkLayersInRenderOrder(activeSurface?.layers ?? []).reverse().map((layer) => (
            <button
              key={layer.id}
              type="button"
              className={selectedId === layer.id ? styles.selectedLayer : ""}
              onClick={() => setSelectedId(layer.id)}
            >
              {layer.type === "text" ? <Type /> : <ImagePlus />}
              <span>{layer.name}</span>
            </button>
          ))}
          {!activeSurface?.layers.length && <p className={styles.emptyLayers}>Add text or upload a logo to begin.</p>}
        </div>

        {selectedLayer && (
          <div className={styles.properties}>
            <strong>Selected element</strong>
            {selectedLayer.type === "text" && (
              <label>
                <span>Text</span>
                <input
                  value={selectedLayer.text ?? ""}
                  maxLength={80}
                  onChange={(event) => updateLayer(selectedLayer.id, { text: event.target.value })}
                />
              </label>
            )}
            <div className={styles.propertyGrid}>
              <label><span>Position X</span><input type="number" min={-canvasWidth} max={canvasWidth} value={Math.round(selectedLayer.x)} onChange={(event) => updateLayer(selectedLayer.id, { x: Number(event.target.value) || 0 })} /></label>
              <label><span>Position Y</span><input type="number" min={-canvasHeight} max={canvasHeight} value={Math.round(selectedLayer.y)} onChange={(event) => updateLayer(selectedLayer.id, { y: Number(event.target.value) || 0 })} /></label>
              <label><span>Width</span><input type="number" min="20" max={canvasWidth} value={Math.round(selectedLayer.width)} onChange={(event) => resizeLayer(selectedLayer, "width", Number(event.target.value))} /></label>
              <label><span>Height</span><input type="number" min="20" max={canvasHeight} value={Math.round(selectedLayer.height)} onChange={(event) => resizeLayer(selectedLayer, "height", Number(event.target.value))} /></label>
              <label><span>Rotation (degrees)</span><input type="number" min="-180" max="180" value={selectedLayer.rotation} onChange={(event) => setLayerRotation(selectedLayer, Number(event.target.value) || 0)} /></label>
              <label><span>Opacity</span><input type="number" min="10" max="100" value={Math.round(selectedLayer.opacity * 100)} onChange={(event) => updateLayer(selectedLayer.id, { opacity: Math.max(0.1, Math.min(1, Number(event.target.value) / 100)) })} /></label>
            </div>
            <label className={styles.rotationControl}>
              <span>Rotate freely: {Math.round(selectedLayer.rotation)}°</span>
              <input type="range" min="-180" max="180" step="1" value={selectedLayer.rotation} onChange={(event) => setLayerRotation(selectedLayer, Number(event.target.value))} />
            </label>
            <div className={styles.rotationPresets} aria-label="Rotation presets">
              <button type="button" onClick={() => setLayerRotation(selectedLayer, selectedLayer.rotation - 15)}>−15°</button>
              <button type="button" onClick={() => setLayerRotation(selectedLayer, -90)}>−90°</button>
              <button type="button" onClick={() => setLayerRotation(selectedLayer, 0)}>0°</button>
              <button type="button" onClick={() => setLayerRotation(selectedLayer, 90)}>90°</button>
              <button type="button" onClick={() => setLayerRotation(selectedLayer, selectedLayer.rotation + 15)}>+15°</button>
            </div>
            {selectedLayer.type === "text" && (
              <>
                <div className={styles.propertyGrid}>
                  <label><span>Font</span><select value={selectedLayer.fontFamily} onChange={(event) => updateLayer(selectedLayer.id, { fontFamily: event.target.value as ArtworkLayer["fontFamily"] })}><option value="rounded">Rounded</option><option value="sans">Sans</option><option value="serif">Serif</option></select></label>
                  <label><span>Colour</span><input type="color" value={selectedLayer.color} onChange={(event) => updateLayer(selectedLayer.id, { color: event.target.value })} /></label>
                  <label><span>Font size</span><input type="number" min="8" max="180" value={selectedLayer.fontSize ?? 34} onChange={(event) => updateLayer(selectedLayer.id, { fontSize: Math.max(8, Number(event.target.value) || 8) })} /></label>
                </div>
                <button type="button" className={styles.fitTextButton} onClick={() => fitTextToBox(selectedLayer)}>Fit text inside selected area</button>
              </>
            )}
            <div className={styles.iconActions}>
              <button type="button" onClick={() => updateLayer(selectedLayer.id, { x: (canvasWidth - selectedLayer.width) / 2 })} title="Centre horizontally"><AlignCenterHorizontal /></button>
              <button type="button" onClick={() => updateLayer(selectedLayer.id, { y: (canvasHeight - selectedLayer.height) / 2 })} title="Centre vertically"><AlignCenterVertical /></button>
              <button type="button" onClick={() => reorder(true)} title="Bring to front"><BringToFront /></button>
              <button type="button" onClick={() => reorder(false)} disabled={selectedLayer.type === "text"} title={selectedLayer.type === "text" ? "Text stays on the front of the poster" : "Send to back"}><SendToBack /></button>
              <button type="button" onClick={duplicateSelected} disabled={selectedLayer.id === "personalization-name"} title={selectedLayer.id === "personalization-name" ? "Required name cannot be duplicated" : "Duplicate"}><Copy /></button>
              <button type="button" onClick={deleteSelected} disabled={selectedLayer.id === "personalization-name"} title={selectedLayer.id === "personalization-name" ? "Required name cannot be deleted" : "Delete"}><Trash2 /></button>
            </div>
          </div>
        )}
        <p className={styles.productionNote}>{physicalWidthMm && physicalHeightMm ? `Resolution checks use ${physicalWidthMm} x ${physicalHeightMm} mm at ${targetDpi} DPI. ` : "Physical output dimensions are not configured. "}PNG and JPG previews are stored with this draft; production files still require bleed, colour and rights review.</p>
        {footer}
      </aside>
    </section>
  );
}
