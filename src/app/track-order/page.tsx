import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs, PageHero, SecondaryLink, styles } from "@/components/customer/CustomerUI";
import TrackOrderForm from "@/components/customer/TrackOrderForm";

export const metadata: Metadata = {
  title: "Track your order",
  description: "Check verified production and shipment updates for a Naamly order.",
};

export default async function TrackOrderPage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const query = await searchParams;
  return (
    <div className={styles.page}>
      <PageHero eyebrow="Order updates" title="Know where your order stands" description="Personalised products move through a few careful stages before dispatch. Enter your order details to see the latest verified update." compact>
        <SecondaryLink href="/account/orders">View orders in your account</SecondaryLink>
      </PageHero>
      <section className={styles.section}>
        <div className={styles.container}>
          <Breadcrumbs items={[{ label: "Track order" }]} />
          <div className={styles.trackLayout}>
            <TrackOrderForm initialOrder={query.order?.slice(0, 64) ?? ""} />
            <div>
              <p className={styles.eyebrow}>What you’ll see</p>
              <h2 style={{ margin: 0, color: "var(--ink)", fontSize: 34, letterSpacing: "-.035em" }}>From personalisation review to your doorstep</h2>
              <div className={styles.processList}>
                <div className={styles.processItem}><span className={styles.processNumber}>1</span><div><h3>Order & artwork review</h3><p>We check the supplied details and make sure the selected layout can be produced as configured.</p></div></div>
                <div className={styles.processItem}><span className={styles.processNumber}>2</span><div><h3>Production & quality check</h3><p>Your order is made to its saved configuration, then reviewed before packing.</p></div></div>
                <div className={styles.processItem}><span className={styles.processNumber}>3</span><div><h3>Carrier tracking</h3><p>A tracking link appears after the parcel is handed to the configured delivery partner.</p></div></div>
              </div>
              <p className={styles.helperText}>Can’t find your confirmation? <Link href="/contact" style={{ color: "var(--teal-dark)", fontWeight: 750 }}>Contact support</Link> using the email or mobile number from checkout.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
