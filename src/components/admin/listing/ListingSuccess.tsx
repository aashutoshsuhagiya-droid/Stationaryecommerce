"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, ImagePlus, Pencil, Plus, Type } from "lucide-react";

import type { ThreeDOutcome } from "@/lib/listing-publish";
import styles from "../admin.module.css";

/**
 * The finish line: what went live, how it looks, and the next things people
 * actually do. Every button says what it does.
 */
export function ListingSuccess({
  name,
  slug,
  published,
  photoUrl,
  threeD,
  canAdjustText,
  preview3D,
  onAddAnother,
  onEditDetails,
  onAdjustText,
  onTryAnotherPhoto,
}: {
  name: string;
  slug: string;
  published: boolean;
  photoUrl: string;
  threeD: ThreeDOutcome;
  canAdjustText: boolean;
  preview3D?: React.ReactNode;
  onAddAnother: () => void;
  onEditDetails: () => void;
  onAdjustText: () => void;
  onTryAnotherPhoto: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const url = `/products/${slug}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(new URL(url, window.location.origin).toString());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section aria-labelledby="listing-success-title" className={styles.listingSuccess}>
      <div className={styles.listingSuccessHero}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {photoUrl ? <img alt="" src={photoUrl} /> : <span className={styles.listingSuccessCheck}><Check aria-hidden size={26} /></span>}
        <div>
          <h3 id="listing-success-title" tabIndex={-1}>{published ? `🎉 ${name} is live` : `${name} is saved as a draft`}</h3>
          <p>{published ? "Customers can find it, personalise it and order it now." : "Only you can see it. Publish it from the products list when you're ready."}</p>
          {threeD.status === "ready" && <p className={styles.listingSuccessNote}><Check aria-hidden size={13} /> 3D preview is on the product page.</p>}
          {threeD.status === "builtin" && <p className={styles.listingSuccessNote}><Check aria-hidden size={13} /> Customers can turn it in 3D.</p>}
        </div>
      </div>
      {preview3D}
      {threeD.status === "failed" && (
        <div className={styles.listingSuccessWarning} role="status">
          <p>3D preview couldn&apos;t be made from this photo. The product is {published ? "live" : "saved"} with the 2D customiser.</p>
          <button className={styles.buttonSecondary} onClick={onTryAnotherPhoto} type="button"><ImagePlus aria-hidden size={14} /> Try another photo</button>
        </div>
      )}
      <div className={styles.listingSuccessActions}>
        <a className={styles.buttonPrimary} href={url} rel="noreferrer" target="_blank"><ExternalLink aria-hidden size={14} /> View on store</a>
        <button className={styles.buttonSecondary} onClick={onAddAnother} type="button"><Plus aria-hidden size={14} /> Add another product</button>
        <button className={styles.buttonSecondary} onClick={onEditDetails} type="button"><Pencil aria-hidden size={14} /> Edit details</button>
        <button className={styles.buttonSecondary} onClick={() => void copyLink()} type="button">{copied ? <Check aria-hidden size={14} /> : <Copy aria-hidden size={14} />} {copied ? "Link copied" : "Copy link"}</button>
        {canAdjustText && <button className={styles.buttonSecondary} onClick={onAdjustText} type="button"><Type aria-hidden size={14} /> Adjust text position</button>}
      </div>
    </section>
  );
}
