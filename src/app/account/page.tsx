import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Heart, MapPin, Package, Palette, UserRound } from "lucide-react";
import { StatusPill, styles } from "@/components/customer/CustomerUI";

export const metadata: Metadata = {
  title: "My account",
  description: "View orders, saved designs and account details.",
};

export default function AccountPage() {
  return (
    <>
      <div className={styles.accountCards}>
        <div className={styles.accountStat}><span><Package aria-hidden="true" /></span><strong>2</strong><small>Orders placed</small></div>
        <div className={styles.accountStat}><span><Heart aria-hidden="true" /></span><strong>3</strong><small>Saved favourites</small></div>
        <div className={styles.accountStat}><span><Palette aria-hidden="true" /></span><strong>1</strong><small>Saved design</small></div>
      </div>

      <section className={styles.accountSection} aria-labelledby="recent-orders-title">
        <div className={styles.accountSectionHeader}><h2 id="recent-orders-title">Recent orders</h2><Link href="/account/orders">View all orders</Link></div>
        <div className={styles.orderRow}>
          <div><strong>Order NMLY-DEMO-1001</strong><small>Everyday Name Slips · Demo record</small></div>
          <div><strong>12 Oct 2026</strong><small>Order date</small></div>
          <div><StatusPill tone="teal">In production</StatusPill></div>
          <Link href="/account/orders/NMLY-DEMO-1001" aria-label="View demo order NMLY-DEMO-1001"><ChevronRight aria-hidden="true" /></Link>
        </div>
        <div className={styles.orderRow}>
          <div><strong>Order NM-23746</strong><small>Personalised Study Notebook · A5</small></div>
          <div><strong>28 Sep 2026</strong><small>Order date</small></div>
          <div><StatusPill tone="navy">Delivered</StatusPill></div>
          <Link href="/account/orders/NM-23746" aria-label="View order NM-23746"><ChevronRight aria-hidden="true" /></Link>
        </div>
      </section>

      <section className={styles.accountSection} aria-labelledby="quick-links-title">
        <div className={styles.accountSectionHeader}><h2 id="quick-links-title">Quick links</h2></div>
        <div className={styles.quickGrid}>
          <Link href="/wishlist" className={styles.quickCard}><Heart aria-hidden="true" /><strong>Saved favourites</strong><small>Return to products you’ve been considering.</small></Link>
          <Link href="/account/addresses" className={styles.quickCard}><MapPin aria-hidden="true" /><strong>Delivery addresses</strong><small>Keep checkout details accurate and current.</small></Link>
          <Link href="/account/profile" className={styles.quickCard}><UserRound aria-hidden="true" /><strong>Profile & security</strong><small>Review your contact details and password.</small></Link>
        </div>
      </section>
    </>
  );
}
