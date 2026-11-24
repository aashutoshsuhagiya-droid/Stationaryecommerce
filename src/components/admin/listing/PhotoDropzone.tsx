"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { AlertTriangle, Camera, ImagePlus, LoaderCircle, RotateCcw, Star, X } from "lucide-react";

import { ACCEPTED_PHOTO_TYPES, MAX_LISTING_PHOTOS, type ListingPhoto } from "./photo-processing";
import styles from "../admin.module.css";

/**
 * Step 1: one big drop zone. Drop, click, paste (Ctrl+V) or take a photo.
 * Thumbnails reorder by drag (or the arrow keys), ★ makes the main photo, ✕ removes.
 */
export function PhotoDropzone({
  photos,
  onAddFiles,
  onRemove,
  onMakeMain,
  onMove,
  onRetry,
  message,
}: {
  photos: readonly ListingPhoto[];
  onAddFiles: (files: File[]) => void;
  onRemove: (id: string) => void;
  onMakeMain: (id: string) => void;
  onMove: (id: string, toIndex: number) => void;
  onRetry: (id: string) => void;
  message: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [dragId, setDragId] = useState("");
  const full = photos.length >= MAX_LISTING_PHOTOS;

  // Paste a screenshot or copied photo anywhere in the wizard.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = [...(event.clipboardData?.files ?? [])].filter((file) => file.type.startsWith("image/"));
      if (files.length) { event.preventDefault(); onAddFiles(files); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [onAddFiles]);

  function drop(event: DragEvent) {
    event.preventDefault();
    setDragOver(false);
    if (dragId) return;
    const files = [...event.dataTransfer.files].filter((file) => file.type.startsWith("image/") || /\.(heic|heif)$/i.test(file.name));
    if (files.length) onAddFiles(files);
  }

  return (
    <div className={styles.listingPhotos}>
      <div
        className={`${styles.listingDropzone} ${dragOver ? styles.listingDropzoneActive : ""} ${photos.length ? styles.listingDropzoneCompact : ""}`}
        onDragLeave={() => setDragOver(false)}
        onDragOver={(event) => { event.preventDefault(); if (!dragId) setDragOver(true); }}
        onDrop={drop}
      >
        <ImagePlus aria-hidden size={photos.length ? 22 : 34} />
        <strong>{full ? "That's 8 photos — the most a product can have" : "Drop product photos here"}</strong>
        <span>or click, paste, or take a photo · up to 8</span>
        <div className={styles.listingDropActions}>
          <button className={styles.buttonPrimary} disabled={full} onClick={() => inputRef.current?.click()} type="button"><ImagePlus aria-hidden size={15} /> Choose photos</button>
          <button className={styles.buttonSecondary} disabled={full} onClick={() => cameraRef.current?.click()} type="button"><Camera aria-hidden size={15} /> Take a photo</button>
        </div>
        <input accept={ACCEPTED_PHOTO_TYPES} aria-label="Choose product photos" className={styles.visuallyHiddenInput} multiple onChange={(event) => { onAddFiles([...(event.target.files ?? [])]); event.target.value = ""; }} ref={inputRef} tabIndex={-1} type="file" />
        <input accept="image/*" aria-label="Take a product photo" capture="environment" className={styles.visuallyHiddenInput} onChange={(event) => { onAddFiles([...(event.target.files ?? [])]); event.target.value = ""; }} ref={cameraRef} tabIndex={-1} type="file" />
      </div>
      {message && <p className={styles.listingInlineError} role="alert">{message}</p>}
      {photos.length > 0 && (
        <ol aria-label="Product photos (first is the main photo)" className={styles.listingThumbs}>
          {photos.map((photo, index) => (
            <li
              className={`${styles.listingThumb} ${index === 0 ? styles.listingThumbMain : ""}`}
              draggable
              key={photo.id}
              onDragEnd={() => setDragId("")}
              onDragOver={(event) => event.preventDefault()}
              onDragStart={(event) => { setDragId(photo.id); event.dataTransfer.effectAllowed = "move"; }}
              onDrop={(event) => { event.preventDefault(); if (dragId && dragId !== photo.id) onMove(dragId, index); setDragId(""); }}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft" && index > 0) { event.preventDefault(); onMove(photo.id, index - 1); }
                if (event.key === "ArrowRight" && index < photos.length - 1) { event.preventDefault(); onMove(photo.id, index + 1); }
              }}
              tabIndex={0}
              aria-label={`${index === 0 ? "Main photo" : `Photo ${index + 1}`}: ${photo.fileName}. Use the arrow keys to reorder.`}
            >
              <div className={styles.listingThumbImage}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {photo.previewUrl ? <img alt="" src={photo.previewUrl} /> : <ImagePlus aria-hidden size={20} />}
                {photo.status === "processing" && <span className={styles.listingThumbOverlay}><LoaderCircle aria-hidden className={styles.studioSpin} size={18} /></span>}
              </div>
              {index === 0 ? <span className={styles.listingMainBadge}><Star aria-hidden size={11} /> Main</span> : (
                <button aria-label={`Make photo ${index + 1} the main photo`} className={styles.listingThumbButton} onClick={() => onMakeMain(photo.id)} type="button"><Star aria-hidden size={13} /></button>
              )}
              <button aria-label={`Remove photo ${index + 1}`} className={`${styles.listingThumbButton} ${styles.listingThumbRemove}`} onClick={() => onRemove(photo.id)} type="button"><X aria-hidden size={13} /></button>
              {(photo.status === "uploading" || photo.status === "uploaded") && (
                <progress aria-label={`Upload of photo ${index + 1}`} className={styles.listingProgress} max={100} value={photo.progress} />
              )}
              {photo.status === "failed" && (
                <button className={styles.listingRetry} onClick={() => onRetry(photo.id)} title={photo.error} type="button"><RotateCcw aria-hidden size={12} /> Retry</button>
              )}
              {photo.warnings.length > 0 && (
                <ul className={styles.listingWarnings}>
                  {photo.warnings.map((warning) => <li key={warning}><AlertTriangle aria-hidden size={11} /> {warning}</li>)}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
