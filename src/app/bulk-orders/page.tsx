import type { Metadata } from "next";
import { Building2, FileSpreadsheet, ShieldCheck, UsersRound } from "lucide-react";
import { Breadcrumbs, PageHero, SecondaryLink, styles } from "@/components/customer/CustomerUI";

export const metadata: Metadata = {
  title: "Bulk & institutional orders",
  description: "Request a structured personalised-products quote for a school, team, retailer or organisation.",
};

export default function BulkOrdersPage() {
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
              <h2 style={{ margin: "0 0 16px", color: "#17324d", fontSize: 36, lineHeight: 1.15, letterSpacing: "-.04em" }}>Start with a clear brief. Get a considered quote.</h2>
              <p style={{ color: "#64748b", lineHeight: 1.75, marginBottom: 30 }}>Bulk pricing is not assumed or applied automatically. It depends on the product, quantity, personalisation complexity, artwork requirements and delivery plan.</p>
              <div className={styles.bulkBenefits}>
                <div className={styles.bulkBenefit}><span><FileSpreadsheet aria-hidden="true" /></span><div><h3>One row, one person, one clear record</h3><p>For multi-name orders, a structured spreadsheet keeps each person’s text associated with the right item.</p></div></div>
                <div className={styles.bulkBenefit}><span><UsersRound aria-hidden="true" /></span><div><h3>Useful for varied groups</h3><p>Schools, activity groups, corporate teams, events and resellers can request a product-specific review.</p></div></div>
                <div className={styles.bulkBenefit}><span><ShieldCheck aria-hidden="true" /></span><div><h3>Reviewed before production</h3><p>Final quantities, configuration data, price and production plan should be confirmed before payment.</p></div></div>
              </div>
            </div>
            <section className={styles.bulkForm} aria-labelledby="bulk-form-title">
              <h2 id="bulk-form-title">Request a bulk quote</h2>
              <p>Share an estimate now. The team can ask follow-up questions before preparing a quote.</p>
              <form action="mailto:hello@naamly.in" method="post" encType="text/plain">
                <div className={styles.formGrid}>
                  <div className={styles.field}><label htmlFor="bulk-name">Contact name</label><input id="bulk-name" name="name" autoComplete="name" required /></div>
                  <div className={styles.field}><label htmlFor="bulk-org">Organisation</label><input id="bulk-org" name="organisation" autoComplete="organization" required /></div>
                  <div className={styles.field}><label htmlFor="bulk-email">Work email</label><input id="bulk-email" name="email" type="email" autoComplete="email" required /></div>
                  <div className={styles.field}><label htmlFor="bulk-mobile">Mobile number</label><input id="bulk-mobile" name="mobile" type="tel" autoComplete="tel" required /></div>
                  <div className={styles.field}><label htmlFor="bulk-product">Product type</label><select id="bulk-product" name="product" required defaultValue=""><option value="" disabled>Select a product</option><option>Name labels</option><option>School label sets</option><option>Notebooks</option><option>Writing sets</option><option>Gifts or keychains</option><option>Not sure yet</option></select></div>
                  <div className={styles.field}><label htmlFor="bulk-quantity">Estimated quantity</label><input id="bulk-quantity" name="quantity" type="number" min="25" step="1" placeholder="For example, 250" required /></div>
                  <div className={`${styles.field} ${styles.fullSpan}`}><label htmlFor="bulk-need-by">Preferred delivery date <span aria-hidden="true">(optional)</span></label><input id="bulk-need-by" name="preferred-date" type="date" /><small className={styles.fieldHint}>A requested date is not a delivery promise. Feasibility is confirmed in the quote.</small></div>
                  <div className={`${styles.field} ${styles.fullSpan}`}><label htmlFor="bulk-notes">Tell us about the order</label><textarea id="bulk-notes" name="details" placeholder="How many unique names, preferred product, required sizes, delivery locations and any artwork needs." required /></div>
                  <div className={`${styles.field} ${styles.fullSpan}`}><span style={{ color: "#26384a", fontSize: 13, fontWeight: 750 }}>Name list or brief <span aria-hidden="true">(optional)</span></span><label className={styles.fileDrop} htmlFor="bulk-file"><input id="bulk-file" type="file" name="attachment" accept=".csv,.xlsx,.xls,.pdf" /><span><FileSpreadsheet aria-hidden="true" /><strong>Choose a CSV, spreadsheet or PDF</strong>Maximum size and row validation are confirmed before upload.</span></label></div>
                </div>
                <button className={styles.submitButton} type="submit"><Building2 aria-hidden="true" /> Open email request</button>
                <p className={styles.helperText}>Your email app will open so you can review and send the request. File attachments must be added in the email app.</p>
              </form>
            </section>
          </div>
        </div>
      </section>
    </div>
  );
}
