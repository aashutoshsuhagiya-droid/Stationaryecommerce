"use client";

import type { CSSProperties } from "react";

import styles from "./admin.module.css";

type PreviewGeometry = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
};

type PreviewTextLayer = {
  geometry: PreviewGeometry;
  color?: string;
  fontSize?: number;
  fontFamily?: "rounded" | "sans" | "serif";
  fontWeight?: number;
};

type PreviewImageLayer = {
  geometry: PreviewGeometry;
};

type PreviewCoordinateSpace = {
  width: number;
  height: number;
};

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

function placementStyle(geometry: PreviewGeometry | undefined, coordinateSpace: PreviewCoordinateSpace | undefined): CSSProperties | undefined {
  if (!geometry || !coordinateSpace || coordinateSpace.width <= 0 || coordinateSpace.height <= 0) return undefined;
  const percent = (value: number, total: number) => `${clamp((value / total) * 100, 0, 100)}%`;
  return {
    position: "absolute",
    left: percent(geometry.x, coordinateSpace.width),
    top: percent(geometry.y, coordinateSpace.height),
    width: percent(geometry.width, coordinateSpace.width),
    height: percent(geometry.height, coordinateSpace.height),
    transform: `rotate(${clamp(geometry.rotation ?? 0, -360, 360)}deg)`,
    transformOrigin: "center center",
  };
}

function previewFontFamily(family: PreviewTextLayer["fontFamily"]): string | undefined {
  if (family === "rounded") return "ui-rounded, system-ui, sans-serif";
  if (family === "serif") return "ui-serif, Georgia, serif";
  if (family === "sans") return "ui-sans-serif, system-ui, sans-serif";
  return undefined;
}

export function SurfaceCustomerPreview({
  baseImageUrl,
  coordinateSpace,
  imageLayer,
  productPhotoUrl,
  printableBounds,
  sampleText,
  widthMm,
  heightMm,
  surfaceLabel,
  textLayer,
}: {
  baseImageUrl?: string;
  coordinateSpace?: PreviewCoordinateSpace;
  imageLayer?: PreviewImageLayer;
  productPhotoUrl?: string;
  printableBounds?: PreviewGeometry;
  sampleText: string;
  widthMm?: number | null;
  heightMm?: number | null;
  surfaceLabel: string;
  textLayer?: PreviewTextLayer;
}) {
  const aspectRatio = widthMm && heightMm ? `${widthMm} / ${heightMm}` : "5 / 3";
  const safeAreaStyle = placementStyle(printableBounds, coordinateSpace);
  const textPlacement = placementStyle(textLayer?.geometry, coordinateSpace);
  const textStyle: CSSProperties | undefined = textLayer && textPlacement ? {
    ...textPlacement,
    color: textLayer.color,
    display: "grid",
    placeItems: "center",
    overflow: "hidden",
    textAlign: "center",
    whiteSpace: "pre-wrap",
    fontFamily: previewFontFamily(textLayer.fontFamily),
    fontSize: `${clamp(textLayer.fontSize ?? 24, 8, 72)}px`,
    fontWeight: clamp(textLayer.fontWeight ?? 400, 100, 900),
  } : undefined;
  const imagePlacement = placementStyle(imageLayer?.geometry, coordinateSpace);
  const imageStyle: CSSProperties | undefined = imagePlacement ? { ...imagePlacement, right: "auto", bottom: "auto", maxHeight: "none", objectFit: "contain" } : undefined;
  return (
    <section className={styles.surfaceCustomerPreview} aria-label="Customer 2D preview">
      <div className={styles.surfacePreviewHeader}>
        <div><span>Customer view</span><strong>{surfaceLabel}</strong></div>
        <small>2D studio</small>
      </div>
      <div className={styles.surfacePreviewCanvas} style={{ aspectRatio }}>
        {baseImageUrl ? <img alt="" className={styles.surfacePreviewBase} src={baseImageUrl} /> : <span className={styles.surfacePreviewEmpty}>No base image</span>}
        <span aria-hidden className={styles.templateSafeArea} style={safeAreaStyle ? { ...safeAreaStyle, right: "auto", bottom: "auto" } : { inset: "10%" }} />
        {sampleText && <span className={`${styles.mockLabel} ${styles.surfacePreviewText}`} style={textStyle}>{sampleText}</span>}
        {productPhotoUrl && <img alt="Product photo layer" className={styles.surfacePreviewPhoto} src={productPhotoUrl} style={imageStyle} />}
      </div>
      <p>This is what your customer sees in the 2D studio — presentation only, not part of pricing.</p>
    </section>
  );
}
