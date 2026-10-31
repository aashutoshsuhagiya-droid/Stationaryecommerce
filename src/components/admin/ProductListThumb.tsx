"use client";

import { useState } from "react";

import styles from "./admin.module.css";

export function ProductListThumb({ imageUrl, art, name }: {
  imageUrl?: string;
  art: "labels" | "pencils" | "notebook" | "bottle" | "combo";
  name: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const isPending = Boolean(imageUrl && imageUrl.includes("/api/product-images/pending"));
  if (imageUrl && !isPending && !imageFailed) {
    return <span className={`${styles.productThumb} ${styles.productThumbImage}`}>
      <img alt="" onError={() => setImageFailed(true)} src={imageUrl} />
    </span>;
  }
  return <span aria-label={`${name} placeholder`} className={styles.productThumb} data-art={art} />;
}
