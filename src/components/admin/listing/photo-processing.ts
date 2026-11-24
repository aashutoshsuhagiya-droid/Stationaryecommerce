"use client";

import { downscaledSize, photoQualityWarnings, type PhotoStats } from "@/lib/listing-wizard";

export const ACCEPTED_PHOTO_TYPES = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";
export const MAX_LISTING_PHOTOS = 8;

export type PhotoStatus = "processing" | "ready" | "uploading" | "uploaded" | "failed";

export interface ListingPhoto {
  id: string;
  fileName: string;
  /** Bytes to upload (already shrunk and upright); absent for restored, uploaded photos. */
  blob?: Blob;
  /** Object URL or uploaded image URL; empty when the browser cannot show the file (HEIC on Chrome). */
  previewUrl: string;
  width: number;
  height: number;
  warnings: string[];
  status: PhotoStatus;
  progress: number;
  assetId?: string;
  error?: string;
}

const isHeic = (file: File) => /image\/hei[cf]/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);

function statsFor(source: CanvasImageSource, width: number, height: number): PhotoStats {
  const side = 96;
  const canvas = document.createElement("canvas");
  canvas.width = side;
  canvas.height = side;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return { width, height, meanLuma: 128, borderBusyness: 0 };
  context.drawImage(source, 0, 0, side, side);
  const { data } = context.getImageData(0, 0, side, side);
  const luma = new Float32Array(side * side);
  let total = 0;
  for (let index = 0; index < luma.length; index += 1) {
    const value = 0.2126 * data[index * 4] + 0.7152 * data[index * 4 + 1] + 0.0722 * data[index * 4 + 2];
    luma[index] = value;
    total += value;
  }
  // Contrast between neighbours, only along the outer frame where the backdrop is.
  const frame = Math.round(side * 0.18);
  let contrast = 0;
  let samples = 0;
  for (let y = 0; y < side - 1; y += 1) {
    for (let x = 0; x < side - 1; x += 1) {
      if (x >= frame && x < side - frame && y >= frame && y < side - frame) continue;
      const here = luma[y * side + x];
      contrast += Math.abs(here - luma[y * side + x + 1]) + Math.abs(here - luma[(y + 1) * side + x]);
      samples += 2;
    }
  }
  canvas.width = 1;
  canvas.height = 1;
  return { width, height, meanLuma: total / luma.length, borderBusyness: samples ? contrast / samples / 255 * 4 : 0 };
}

/** True when any pixel of a small copy is noticeably see-through. */
function hasTransparency(source: HTMLCanvasElement): boolean {
  const side = 128;
  const probe = document.createElement("canvas");
  probe.width = side;
  probe.height = side;
  const context = probe.getContext("2d", { willReadFrequently: true });
  if (!context) return false;
  context.drawImage(source, 0, 0, side, side);
  const { data } = context.getImageData(0, 0, side, side);
  probe.width = 1;
  probe.height = 1;
  for (let index = 3; index < data.length; index += 4) if (data[index] < 250) return true;
  return false;
}

/**
 * Makes a phone photo upload-ready in the browser: decoded upright (EXIF
 * orientation applied), shrunk to a 2000 px long edge, re-encoded, and checked
 * for size, darkness and a busy backdrop. HEIC files the browser cannot decode
 * are sent as they are; the server converts them.
 */
export async function processPhoto(file: File): Promise<Omit<ListingPhoto, "id" | "status" | "progress">> {
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    if (isHeic(file)) {
      return { fileName: file.name, blob: file, previewUrl: "", width: 0, height: 0, warnings: ["iPhone photo — it is converted when it uploads"] };
    }
    throw new Error("This file isn't a photo we can open. Use a JPG, PNG or WEBP.");
  }
  try {
    const target = downscaledSize(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot prepare photos.");
    context.drawImage(bitmap, 0, 0, target.width, target.height);
    // PNG only when the picture really is see-through (logos, cut-outs). Opaque PNG photos
    // become JPEG: ~15× smaller, so uploads stay quick on a slow connection.
    const type = file.type !== "image/jpeg" && hasTransparency(canvas) ? "image/png" : "image/jpeg";
    if (type === "image/jpeg") {
      context.globalCompositeOperation = "destination-over";
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, target.width, target.height);
      context.globalCompositeOperation = "source-over";
    }
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (result) => result ? resolve(result) : reject(new Error("The photo could not be prepared.")),
      type,
      0.88,
    ));
    canvas.width = 1;
    canvas.height = 1;
    const warnings = photoQualityWarnings(statsFor(bitmap, bitmap.width, bitmap.height));
    const name = file.name.replace(/\.[a-z0-9]+$/i, "") + (type === "image/png" ? ".png" : ".jpg");
    return { fileName: name, blob, previewUrl: URL.createObjectURL(blob), width: target.width, height: target.height, warnings };
  } finally {
    bitmap.close();
  }
}

/** Uploads one photo to the listing's draft product, reporting progress 0-100. */
export function uploadListingPhoto(
  productId: string,
  photo: Pick<ListingPhoto, "blob" | "fileName">,
  onProgress: (percent: number) => void,
): Promise<{ assetId: string; url: string }> {
  return new Promise((resolve, reject) => {
    if (!photo.blob) {
      reject(new Error("Add this photo again."));
      return;
    }
    const form = new FormData();
    form.set("productId", productId);
    form.set("kind", "primary");
    form.set("image", new File([photo.blob], photo.fileName, { type: photo.blob.type || "image/jpeg" }));
    const request = new XMLHttpRequest();
    request.open("POST", "/api/admin/catalog/images");
    request.responseType = "json";
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    };
    request.onerror = () => reject(new Error("Upload failed — check your connection and retry."));
    request.onload = () => {
      const body = request.response as { data?: { asset?: { id?: string; url?: string } }; error?: { message?: string } } | null;
      if (request.status >= 200 && request.status < 300 && body?.data?.asset?.id) {
        onProgress(100);
        resolve({ assetId: body.data.asset.id, url: body.data.asset.url ?? `/api/product-images/${body.data.asset.id}` });
      } else {
        reject(new Error(body?.error?.message || "Upload failed — retry."));
      }
    };
    request.send(form);
  });
}

/** Best effort: removes an uploaded photo the admin took out of the listing. */
export async function deleteListingPhoto(productId: string, assetId: string) {
  try {
    await fetch("/api/admin/catalog/images", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, assetId }),
    });
  } catch {
    // The orphaned image is harmless; publishing only attaches the listed photos.
  }
}
