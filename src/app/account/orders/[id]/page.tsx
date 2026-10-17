import type { Metadata } from "next";
import Link from "next/link";
import { Check, Circle, Headphones, MapPin, PackageCheck } from "lucide-react";
import { Notice, StatusPill, styles } from "@/components/customer/CustomerUI";

export const metadata: Metadata = {
  title: "Order details",
  description: "View personalisation, payment and shipment information for your Naamly order.",
};

export default async function OrderDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const orderId = decodeURIComponent(id).toUpperCase();

  return (
    <>
      <div className={styles.accountSectionHeader}>
        <div><p className={styles.eyebrow}>Order details</p><h2>{orderId}</h2><p className={styles.helperText}>Placed 12 October 2026 · Payment confirmed</p></div>
        <StatusPill tone="teal">In production</StatusPill>
      </div>

      <div className={styles.detailGrid}>
        <section className={styles.accountSection} style={{ marginTop: 0 }} aria-labelledby="order-progress-title">
          <div className={styles.accountSectionHeader}><h2 id="order-progress-title">Order progress</h2></div>
          <div className={styles.timeline}>
            <div className={`${styles.timelineItem} ${styles.timelineDone}`}><span className={styles.timelineDot}><Check aria-hidden="true" /></span><div><h3>Order received</h3><p>12 Oct, 10:42 am · Your order details were saved.</p></div></div>
            <div className={`${styles.timelineItem} ${styles.timelineDone}`}><span className={styles.timelineDot}><Check aria-hidden="true" /></span><div><h3>Personalisation reviewed</h3><p>12 Oct, 3:18 pm · The supplied name and selected design passed review.</p></div></div>
            <div className={`${styles.timelineItem} ${styles.timelineCurrent}`}><span className={styles.timelineDot}><PackageCheck aria-hidden="true" /></span><div><h3>In production</h3><p>Your personalised labels are currently being prepared.</p></div></div>
            <div className={styles.timelineItem}><span className={styles.timelineDot}><Circle aria-hidden="true" /></span><div><h3>Ready to ship</h3><p>Tracking becomes available after the carrier accepts the parcel.</p></div></div>
          </div>
          <Notice icon={<Headphones aria-hidden="true" />} title="Need to correct something?">Personalised items move quickly into production. Contact support as soon as possible and quote {orderId}; changes cannot be guaranteed after production begins.</Notice>
        </section>

        <div>
          <section className={styles.accountSection} style={{ marginTop: 0 }} aria-labelledby="delivery-title">
            <div className={styles.accountSectionHeader}><h2 id="delivery-title">Delivery</h2></div>
            <div className={styles.addressCard} style={{ padding: 0, border: 0 }}>
              <div><h3>Aarav Sharma</h3><p>18, Green Park Extension<br />New Delhi, Delhi 110016<br />+91 ••••• 43210</p></div><MapPin aria-hidden="true" />
            </div>
          </section>
          <section className={styles.accountSection} aria-labelledby="payment-title">
            <div className={styles.accountSectionHeader}><h2 id="payment-title">Payment summary</h2></div>
            <div className={styles.summaryList}>
              <div className={styles.summaryRow}><span>Items</span><strong>₹349</strong></div>
              <div className={styles.summaryRow}><span>Shipping</span><strong>₹79</strong></div>
              <div className={`${styles.summaryRow} ${styles.summaryTotal}`}><span>Total paid</span><strong>₹428</strong></div>
            </div>
          </section>
        </div>
      </div>

      <section className={styles.accountSection} aria-labelledby="items-title">
        <div className={styles.accountSectionHeader}><h2 id="items-title">Personalised item</h2><Link href="/contact">Get order help</Link></div>
        <div className={styles.orderCardBody} style={{ padding: 0 }}>
          <div className={styles.orderThumb}>AARAV</div>
          <div className={styles.orderProduct}><h2>Little Explorer Name Labels</h2><p>Forest Friends · Pack of 48 · Name: AARAV · Rounded rectangle</p></div>
          <strong>₹349</strong>
        </div>
      </section>
    </>
  );
}
