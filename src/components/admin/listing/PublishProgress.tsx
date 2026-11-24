"use client";

import { LoaderCircle } from "lucide-react";

import styles from "../admin.module.css";

export type PublishStage = "photos" | "details" | "3d" | "finishing";

const LABELS: Record<PublishStage, string> = {
  photos: "Uploading photos…",
  details: "Publishing…",
  "3d": "Creating 3D preview…",
  finishing: "Almost done…",
};

/** One friendly line while Publish runs; photo bars live on the thumbnails. */
export function PublishProgress({ stage, uploaded, total, draft }: { stage: PublishStage; uploaded: number; total: number; draft: boolean }) {
  const label = draft && stage === "details" ? "Saving draft…" : LABELS[stage];
  return (
    <div aria-live="polite" className={styles.listingPublishing} role="status">
      <LoaderCircle aria-hidden className={styles.studioSpin} size={18} />
      <span>{label}{stage === "photos" && total > 0 ? ` ${uploaded} of ${total}` : ""}</span>
    </div>
  );
}
