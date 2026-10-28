"use client";

import { useEffect, useState } from "react";
import { Check, CircleAlert, Download, Mail, ShieldCheck } from "lucide-react";
import { PrimaryLink, SecondaryLink, styles } from "@/components/customer/CustomerUI";
import { formatPrice } from "@/lib/data";

type CheckoutRecord = {
  orderNumber: string;
  items: Array<{
    key: string;
    name: string;
    price: number;
    quantity: number;
    lineTotal?: number;
    customization?: {
      name: string;
      template: string;
      pack: string;
      fields?: Record<string, string>;
      artworkImageCount?: number;
      artworkStatus?: string;
      privateArtworkAssets?: Array<{
        id: string;
        claimToken: string;
        mimeType: string;
      }>;
    };
  }>;
  total: number;
  payment: string;
  placedAt: string;
};

function humanizeKey(value: string) {
  return value.replaceAll(/[-_]+/g, " ").replace(/^./, (character) => character.toUpperCase());
}

function readableStatus(value: string | undefined) {
  if (!value) return "Submitted securely";
  return value.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function submittedFields(fields: Record<string, string> | undefined) {
  return Object.entries(fields ?? {})
    .filter(([key, value]) => key !== "name" && typeof value === "string" && value.trim())
    .map(([key, value]) => ({ label: humanizeKey(key), value }));
}

export function OrderConfirmationView({ orderId }: { orderId: string }) {
  const [record, setRecord] = useState<CheckoutRecord | null | undefined>(undefined);
  const [downloadingAssetId, setDownloadingAssetId] = useState<string>();
  const [downloadError, setDownloadError] = useState("");

  useEffect(() => {
    try {
      const value = sessionStorage.getItem(`naamly-order-${orderId}`);
      setRecord(value ? JSON.parse(value) as CheckoutRecord : null);
    } catch { setRecord(null); }
  }, [orderId]);

  async function downloadPrivateArtwork(asset: { id: string; claimToken: string; mimeType: string }, index: number) {
    setDownloadingAssetId(asset.id);
    setDownloadError("");
    try {
      const response = await fetch(`/api/artwork-assets/${encodeURIComponent(asset.id)}`, {
        headers: { "X-Artwork-Claim-Token": asset.claimToken },
        cache: "no-store",
      });
      if (!response.ok) throw new Error("This private download has expired. Contact support with your order number.");
      const blob = await response.blob();
      const extension = asset.mimeType === "image/png" ? "png" : asset.mimeType === "image/webp" ? "webp" : "jpg";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${orderId}-artwork-${index + 1}.${extension}`;
      link.click();
      globalThis.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "The private artwork could not be downloaded.");
    } finally {
      setDownloadingAssetId(undefined);
    }
  }

  const awaitingPayment = record?.payment === "Payment setup required";

  return (
    <div className={styles.page}>
      <header className={styles.confirmationHero}>
        <span className={styles.confirmationMark}>{awaitingPayment ? <CircleAlert aria-hidden="true" /> : <Check aria-hidden="true" />}</span>
        <p className={styles.eyebrow} style={{ color: "var(--grey-200)" }}>Order {orderId}</p>
        <h1>{awaitingPayment ? "Your order details are saved" : record ? "Your order request is received" : "Demo confirmation preview"}</h1>
        <p>{awaitingPayment ? "No payment was collected in this demo. Connect the merchant payment gateway before accepting live online orders." : record ? "We’ve kept the product choices and personalisation reviewed at checkout. Production begins only after the configured order and payment checks." : "This page has no browser checkout record. It is a safe preview and does not represent a placed or paid order."}</p>
      </header>
      <div className={styles.confirmationWrap}>
        <div className={styles.confirmationGrid}>
          <section className={styles.confirmationCard} aria-labelledby="confirmed-items-title">
            <h2 id="confirmed-items-title">{record ? "Saved order summary" : "No live order attached"}</h2>
            {record ? <>
              {record.items.map((item) => {
                const fields = submittedFields(item.customization?.fields);
                const artworkCount = item.customization?.artworkImageCount ?? 0;
                return <div className={styles.confirmationProduct} key={item.key}>
                  <div className={styles.orderThumb}>{item.customization?.name?.slice(0, 10).toUpperCase() || "NAAMLY"}</div>
                  <div>
                    <h3>{item.name}</h3>
                    <p>{item.customization ? `${item.customization.template} · ${item.customization.pack} · ${item.customization.name} · Quantity ${item.quantity}` : `Quantity ${item.quantity}`}</p>
                    {fields.length > 0 && <dl className={styles.confirmationPersonalization}>{fields.map((field) => <div key={field.label}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl>}
                    {artworkCount > 0 && <div className={styles.confirmationArtworkReceipt}><ShieldCheck aria-hidden="true" /><span><b>{artworkCount} private artwork image{artworkCount === 1 ? "" : "s"}</b><small>{readableStatus(item.customization?.artworkStatus)} · Originals are available here for seven days; access credentials stay hidden.</small>{item.customization?.privateArtworkAssets?.map((asset, index) => <button className={styles.confirmationArtworkDownload} disabled={downloadingAssetId === asset.id} key={asset.id} onClick={() => void downloadPrivateArtwork(asset, index)} type="button"><Download aria-hidden="true" /> {downloadingAssetId === asset.id ? "Preparing…" : `Download original ${index + 1}`}</button>)}</span></div>}
                  </div>
                  <strong>{formatPrice(item.lineTotal ?? item.price * item.quantity)}</strong>
                </div>;
              })}
              <div className={styles.summaryList} style={{ marginTop: 18 }}><div className={styles.summaryRow}><span>Shipping estimate</span><strong>{formatPrice(79)}</strong></div><div className={`${styles.summaryRow} ${styles.summaryTotal}`}><span>{awaitingPayment ? "Amount pending" : "Order total"}</span><strong>{formatPrice(record.total)}</strong></div></div>
              {downloadError && <p className={styles.confirmationArtworkError} role="alert">{downloadError}</p>}
            </> : <p style={{ color: "var(--slate)", lineHeight: 1.7, fontSize: 13 }}>Complete the demo checkout in this browser to see its locally saved items here. Live order data belongs in the authenticated database workflow.</p>}
          </section>
          <aside className={styles.confirmationCard}>
            <h2>What happens next?</h2>
            <div className={styles.bulkBenefits}>
              <div className={styles.bulkBenefit}><span><ShieldCheck aria-hidden="true" /></span><div><h3>Payment is verified first</h3><p>A browser response never marks an online order paid; the server and gateway webhook must agree.</p></div></div>
              <div className={styles.bulkBenefit}><span><Mail aria-hidden="true" /></span><div><h3>Then updates go to you</h3><p>Production and shipment messages begin after the transactional provider is configured.</p></div></div>
            </div>
          </aside>
        </div>
        <div className={styles.confirmationActions}>{record && <PrimaryLink href={`/track-order?order=${orderId}`}>Track order</PrimaryLink>}<SecondaryLink href="/products">Continue shopping</SecondaryLink></div>
      </div>
    </div>
  );
}
