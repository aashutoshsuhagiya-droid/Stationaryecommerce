"use client";

import { useEffect, useState } from "react";
import { Check, CircleAlert, Mail, ShieldCheck } from "lucide-react";
import { PrimaryLink, SecondaryLink, styles } from "@/components/customer/CustomerUI";
import type { CartItem } from "@/components/store/StoreProvider";
import { formatPrice } from "@/lib/data";

type CheckoutRecord = { orderNumber: string; items: CartItem[]; total: number; payment: string; placedAt: string; customer: Record<string, FormDataEntryValue> };

export function OrderConfirmationView({ orderId }: { orderId: string }) {
  const [record, setRecord] = useState<CheckoutRecord | null | undefined>(undefined);

  useEffect(() => {
    try {
      const value = sessionStorage.getItem(`naamly-order-${orderId}`);
      setRecord(value ? JSON.parse(value) as CheckoutRecord : null);
    } catch { setRecord(null); }
  }, [orderId]);

  const awaitingPayment = record?.payment === "Payment setup required";

  return (
    <div className={styles.page}>
      <header className={styles.confirmationHero}>
        <span className={styles.confirmationMark}>{awaitingPayment ? <CircleAlert aria-hidden="true" /> : <Check aria-hidden="true" />}</span>
        <p className={styles.eyebrow} style={{ color: "#75ded2" }}>Order {orderId}</p>
        <h1>{awaitingPayment ? "Your order details are saved" : record ? "Your order request is received" : "Demo confirmation preview"}</h1>
        <p>{awaitingPayment ? "No payment was collected in this demo. Connect the merchant payment gateway before accepting live online orders." : record ? "We’ve kept the product choices and personalisation reviewed at checkout. Production begins only after the configured order and payment checks." : "This page has no browser checkout record. It is a safe preview and does not represent a placed or paid order."}</p>
      </header>
      <div className={styles.confirmationWrap}>
        <div className={styles.confirmationGrid}>
          <section className={styles.confirmationCard} aria-labelledby="confirmed-items-title">
            <h2 id="confirmed-items-title">{record ? "Saved order summary" : "No live order attached"}</h2>
            {record ? <>
              {record.items.map((item) => <div className={styles.confirmationProduct} key={item.key}><div className={styles.orderThumb}>{item.customization?.name?.slice(0, 10).toUpperCase() || "NAAMLY"}</div><div><h3>{item.name}</h3><p>{item.customization ? `${item.customization.template} · ${item.customization.pack} · ${item.customization.name}` : `Quantity ${item.quantity}`}</p></div><strong>{formatPrice(item.price * item.quantity)}</strong></div>)}
              <div className={styles.summaryList} style={{ marginTop: 18 }}><div className={styles.summaryRow}><span>Shipping estimate</span><strong>{formatPrice(79)}</strong></div><div className={`${styles.summaryRow} ${styles.summaryTotal}`}><span>{awaitingPayment ? "Amount pending" : "Order total"}</span><strong>{formatPrice(record.total)}</strong></div></div>
            </> : <p style={{ color: "#64748b", lineHeight: 1.7, fontSize: 13 }}>Complete the demo checkout in this browser to see its locally saved items here. Live order data belongs in the authenticated database workflow.</p>}
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
