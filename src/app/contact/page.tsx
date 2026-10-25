import type { Metadata } from "next";
import { HelpCircle, Mail, PackageSearch } from "lucide-react";
import { Breadcrumbs, ContactMethods, PageHero, styles } from "@/components/customer/CustomerUI";

export const metadata: Metadata = {
  title: "Contact us",
  description: "Get help with a Naamly product, personalisation or existing order.",
};

export default function ContactPage() {
  return (
    <div className={styles.page}>
      <PageHero eyebrow="Customer care" title="Tell us how we can help" description="Questions about a product, a spelling detail or an existing order? Share the context and our support team can respond more usefully." compact />
      <section className={styles.section}>
        <div className={styles.container}>
          <Breadcrumbs items={[{ label: "Contact us" }]} />
          <div className={styles.contentGrid}>
            <section className={styles.contentCard} id="message" aria-labelledby="contact-form-title">
              <div className={styles.iconHeading}><span><Mail aria-hidden="true" /></span><div><h2 id="contact-form-title">Send us a message</h2><p>Include an order number if your question is about a purchase.</p></div></div>
              <form action="mailto:hello@naamly.in" method="post" encType="text/plain">
                <div className={styles.formGrid}>
                  <div className={styles.field}><label htmlFor="contact-name">Full name</label><input id="contact-name" name="name" autoComplete="name" required /></div>
                  <div className={styles.field}><label htmlFor="contact-email">Email address</label><input id="contact-email" name="email" type="email" autoComplete="email" required /></div>
                  <div className={styles.field}><label htmlFor="contact-mobile">Mobile number <span aria-hidden="true">(optional)</span></label><input id="contact-mobile" name="mobile" type="tel" autoComplete="tel" /></div>
                  <div className={styles.field}><label htmlFor="contact-order">Order number <span aria-hidden="true">(optional)</span></label><input id="contact-order" name="order" placeholder="NM-24081" /></div>
                  <div className={`${styles.field} ${styles.fullSpan}`}><label htmlFor="contact-topic">What can we help with?</label><select id="contact-topic" name="topic" required defaultValue=""><option value="" disabled>Select a topic</option><option>Product or customisation question</option><option>Existing order</option><option>Delivery or tracking</option><option>Damaged or incorrect item</option><option>Bulk order</option><option>Something else</option></select></div>
                  <div className={`${styles.field} ${styles.fullSpan}`}><label htmlFor="contact-message">Message</label><textarea id="contact-message" name="message" placeholder="Share the details that will help us understand your question." required /></div>
                </div>
                <button className={styles.submitButton} type="submit">Open email to send</button>
                <p className={styles.helperText}>This button opens your default email application with the form details. Please review them before sending. Do not include passwords, card details or one-time codes.</p>
              </form>
            </section>
            <aside>
              <ContactMethods />
              <div style={{ marginTop: 18 }} className={styles.notice}><span><PackageSearch aria-hidden="true" /></span><div><strong>Already have an order?</strong><p>Use the <a href="/track-order" style={{ color: "var(--teal-dark)", fontWeight: 750 }}>order tracker</a> for the latest confirmed status before contacting support.</p></div></div>
              <div style={{ marginTop: 12 }} className={styles.notice}><span><HelpCircle aria-hidden="true" /></span><div><strong>Quick product questions</strong><p>Our <a href="/faq" style={{ color: "var(--teal-dark)", fontWeight: 750 }}>FAQ</a> covers previews, materials, production, cancellation and personalised-item returns.</p></div></div>
            </aside>
          </div>
        </div>
      </section>
    </div>
  );
}
