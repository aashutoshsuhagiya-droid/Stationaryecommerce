import type { Metadata } from "next";
import Link from "next/link";
import { StatusPill, styles } from "@/components/customer/CustomerUI";

export const metadata: Metadata = {
  title: "My orders",
  description: "Review your Naamly order history and follow current progress.",
};

const orders = [
  { id: "NMLY-DEMO-1001", date: "12 Oct 2026", total: "₹428", status: "In production", tone: "teal" as const, product: "Everyday Name Slips", detail: "Demo record · Name: Aarav" },
  { id: "NM-23746", date: "28 Sep 2026", total: "₹529", status: "Delivered", tone: "navy" as const, product: "Personalised Study Notebook", detail: "Cover: Deep Sea · Name: Kabir" },
];

export default function OrdersPage() {
  return (
    <section aria-labelledby="orders-title">
      <div className={styles.accountSectionHeader}><div><h2 id="orders-title">Order history</h2><p className={styles.helperText}>Personalisation details are preserved with every order.</p></div></div>
      <div className={styles.orderList}>
        {orders.map((order) => (
          <article className={styles.orderCard} key={order.id}>
            <header className={styles.orderCardHeader}>
              <div>
                <span><span className={styles.orderLabel}>Order</span><span className={styles.orderValue}>{order.id}</span></span>
                <span><span className={styles.orderLabel}>Placed</span><span className={styles.orderValue}>{order.date}</span></span>
                <span><span className={styles.orderLabel}>Total</span><span className={styles.orderValue}>{order.total}</span></span>
              </div>
              <StatusPill tone={order.tone}>{order.status}</StatusPill>
            </header>
            <div className={styles.orderCardBody}>
              <div className={styles.orderThumb}>NAAMLY</div>
              <div className={styles.orderProduct}><h2>{order.product}</h2><p>{order.detail}</p></div>
              <div className={styles.orderActions}><Link className={styles.smallButton} href={`/account/orders/${order.id}`}>View details</Link>{order.id === "NMLY-DEMO-1001" && <Link className={styles.smallButton} href={`/track-order?order=${order.id}`}>Track demo</Link>}</div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
