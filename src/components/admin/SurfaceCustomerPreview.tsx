"use client";

import styles from "./admin.module.css";

export function SurfaceCustomerPreview({
  baseImageUrl,
  productPhotoUrl,
  sampleText,
  widthMm,
  heightMm,
  surfaceLabel,
}: {
  baseImageUrl?: string;
  productPhotoUrl?: string;
  sampleText: string;
  widthMm?: number | null;
  heightMm?: number | null;
  surfaceLabel: string;
}) {
  const aspectRatio = widthMm && heightMm ? `${widthMm} / ${heightMm}` : "5 / 3";
  return (
    <section className={styles.surfaceCustomerPreview} aria-label="Customer 2D preview">
      <div className={styles.surfacePreviewHeader}>
        <div><span>Customer view</span><strong>{surfaceLabel}</strong></div>
        <small>2D studio</small>
      </div>
      <div className={styles.surfacePreviewCanvas} style={{ aspectRatio }}>
        {baseImageUrl ? <img alt="" className={styles.surfacePreviewBase} src={baseImageUrl} /> : <span className={styles.surfacePreviewEmpty}>No base image</span>}
        <span className={styles.templateSafeArea} style={{ inset: "10%" }} />
        {sampleText && <span className={`${styles.mockLabel} ${styles.surfacePreviewText}`}>{sampleText}</span>}
        {productPhotoUrl && <img alt="Product photo layer" className={styles.surfacePreviewPhoto} src={productPhotoUrl} />}
      </div>
      <p>This is what your customer sees in the 2D studio — presentation only, not part of pricing.</p>
    </section>
  );
}
