import type { Metadata } from "next";
import { FileSpreadsheet, ShieldCheck, UsersRound } from "lucide-react";
import BulkQuoteForm from "@/components/customer/BulkQuoteForm";
import { Breadcrumbs, PageHero, SecondaryLink, styles } from "@/components/customer/CustomerUI";
import { products } from "@/lib/data";
import { bulkRequestPolicy } from "@/lib/bulk-request-validation";

export const metadata: Metadata = {
  title: "Bulk & institutional orders",
  description: "Request a structured personalised-products quote for a school, team, retailer or organisation.",
};

export default async function BulkOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string; customSize?: string }>;
}) {
  const query = await searchParams;
  const productOptions = products
    .filter((product) => product.stockStatus !== "out_of_stock")
    .map(({ id, name, dimensions, material }) => ({ id, name, dimensions, material }));

  return (
    <div className={styles.page}>
      <PageHero eyebrow="For schools, teams & organisations" title="Personalised at scale, without losing the details" description="Tell us what you need and how each item should vary. We’ll review feasibility, production requirements and pricing before any commitment." compact>
        <SecondaryLink href="/contact">Ask a question first</SecondaryLink>
      </PageHero>
      <section className={styles.section}>
        <div className={styles.container}>
          <Breadcrumbs items={[{ label: "Bulk orders" }]} />
          <div className={styles.bulkLayout}>
            <div>
              <p className={styles.eyebrow}>Built for organised ordering</p>
              <h2 style={{ margin: "0 0 16px", color: "#17324d", fontSize: 36, lineHeight: 1.15, letterSpacing: 0 }}>Start with a clear brief. Get a considered quote.</h2>
              <p style={{ color: "#64748b", lineHeight: 1.75, marginBottom: 30 }}>Bulk pricing is not assumed or applied automatically. It depends on the product, quantity, personalisation complexity, artwork requirements and delivery plan.</p>
              <div className={styles.bulkBenefits}>
                <div className={styles.bulkBenefit}><span><FileSpreadsheet aria-hidden="true" /></span><div><h3>One row, one person, one clear record</h3><p>For multi-name orders, a structured spreadsheet keeps each person’s text associated with the right item.</p></div></div>
                <div className={styles.bulkBenefit}><span><UsersRound aria-hidden="true" /></span><div><h3>Useful for varied groups</h3><p>Schools, activity groups, corporate teams, events and resellers can request a product-specific review.</p></div></div>
                <div className={styles.bulkBenefit}><span><ShieldCheck aria-hidden="true" /></span><div><h3>Reviewed before production</h3><p>Final quantities, configuration data, price and production plan should be confirmed before payment.</p></div></div>
              </div>
            </div>
            <BulkQuoteForm
              products={productOptions}
              initialProductId={productOptions.some((product) => product.id === query.product) ? query.product : undefined}
              customSize={query.customSize === "true"}
              minimumQuantity={bulkRequestPolicy.minimumQuantity}
              maximumQuantity={bulkRequestPolicy.maximumQuantity}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
