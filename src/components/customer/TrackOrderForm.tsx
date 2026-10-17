"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, LoaderCircle, PackageSearch, ShieldCheck } from "lucide-react";
import type { Order } from "@/lib/types";
import styles from "./customer.module.css";

type OrderResponse = { data?: Order; error?: { message?: string } };

const statusLabels: Record<Order["fulfillmentStatus"], string> = {
  order_received: "Order received",
  customization_review: "Personalisation review",
  production_approved: "Production approved",
  in_production: "In production",
  quality_check: "Quality check",
  ready_to_ship: "Ready to ship",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refund_processing: "Refund processing",
  refunded: "Refunded",
};

export default function TrackOrderForm({ initialOrder = "" }: { initialOrder?: string }) {
  const [orderNumber, setOrderNumber] = useState(initialOrder);
  const [email, setEmail] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setOrder(null);
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderNumber.trim())}?email=${encodeURIComponent(email.trim())}`, { cache: "no-store" });
      const payload = await response.json() as OrderResponse;
      if (!response.ok || !payload.data) throw new Error(payload.error?.message || "We couldn’t find a matching order.");
      setOrder(payload.data);
    } catch (lookupError) {
      setError(lookupError instanceof Error ? lookupError.message : "We couldn’t check that order. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.trackPanel}>
      <form onSubmit={submit}>
        <div className={styles.iconHeading}><span><PackageSearch aria-hidden="true" /></span><div><h2>Find your order</h2><p>Use the details from your order confirmation.</p></div></div>
        <div className={styles.field}>
          <label htmlFor="order-number">Order number</label>
          <input id="order-number" name="order" placeholder="For example, NMLY-DEMO-1001" autoComplete="off" value={orderNumber} onChange={(event) => setOrderNumber(event.target.value)} required />
        </div>
        <div className={styles.field}>
          <label htmlFor="track-contact">Order email address</label>
          <input id="track-contact" name="email" type="email" placeholder="Used when placing the order" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          <small className={styles.fieldHint}>We use this only to verify that the order belongs to you.</small>
        </div>
        <button className={styles.submitButton} type="submit" disabled={loading}>{loading ? <><LoaderCircle className={styles.spin} aria-hidden="true" /> Checking securely…</> : <>Track order <ArrowRight aria-hidden="true" /></>}</button>
        <p className={styles.secureCaption}><ShieldCheck aria-hidden="true" /> Your order details aren’t shown until both fields match.</p>
      </form>

      {error && <div className={`${styles.lookupMessage} ${styles.lookupError}`} role="alert"><span>!</span><div><strong>We couldn’t find that order</strong><p>{error} Check both details or <Link href="/contact">contact support</Link>.</p></div></div>}
      {order && (
        <div className={styles.trackingResult} role="status">
          <div className={styles.trackingResultHead}><span><CheckCircle2 aria-hidden="true" /></span><div><small>Latest confirmed status</small><strong>{statusLabels[order.fulfillmentStatus]}</strong></div></div>
          <dl>
            <div><dt>Order</dt><dd>{order.orderNumber}</dd></div>
            <div><dt>Payment</dt><dd>{order.paymentStatus.replaceAll("_", " ")}</dd></div>
            <div><dt>Items</dt><dd>{order.items.length}</dd></div>
            <div><dt>Order total</dt><dd>{new Intl.NumberFormat("en-IN", { style: "currency", currency: order.currency, maximumFractionDigits: 0 }).format(order.totalPaise / 100)}</dd></div>
          </dl>
          <p>Last updated {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(order.updatedAt))}</p>
        </div>
      )}
      {!order && !error && <button className={styles.demoLookup} type="button" onClick={() => { setOrderNumber("NMLY-DEMO-1001"); setEmail("demo@example.com"); }}>Use demo order</button>}
    </div>
  );
}
