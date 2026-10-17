import type { Metadata } from "next";
import Link from "next/link";
import { MessageCircleQuestion } from "lucide-react";
import { Breadcrumbs, PageHero, PrimaryLink, SectionHeading, styles } from "@/components/customer/CustomerUI";

export const metadata: Metadata = {
  title: "Frequently asked questions",
  description: "Clear answers about Naamly personalisation, previews, production, delivery, returns, payments and bulk orders.",
};

const groups = [
  {
    id: "personalisation",
    title: "Personalisation & previews",
    items: [
      ["How does personalisation work?", "Choose a product and its available size, pack or material options, then enter the details requested for that item. Products with an interactive preview update as you make selections. Review spelling, layout and every chosen option before adding the configured item to your cart."],
      ["Will my product look exactly like the on-screen preview?", "The preview is designed to represent your selected text, design and colours. Screen colour, product material, print method and scale can create small visual differences. The product page should explain any material-specific variation that matters."],
      ["What if a name is very long or uses a special character?", "Each product has its own character limit and supported-character rules. The preview may scale text within safe bounds. If the supplied text cannot be produced clearly, the form should ask you to revise it before checkout rather than silently changing it."],
      ["Can I use my own photograph or logo?", "Only products that show an upload field support customer artwork. You must have the right to use anything you upload. Files may be reviewed for format, quality, dimensions and suitability before production."],
      ["Can I change personalisation after ordering?", "Contact support immediately with your order number. Changes may be possible before review or production begins, but they cannot be guaranteed once work has started. Never place a second order as a correction without first speaking to support."],
    ],
  },
  {
    id: "production",
    title: "Production, shipping & tracking",
    items: [
      ["How long does a personalised order take to make?", "Production windows vary by product and configuration. The relevant estimate should appear on the product page and again before payment. This is separate from carrier transit time and can change if artwork or customer confirmation is required."],
      ["When will I receive tracking information?", "Tracking becomes available after the parcel is accepted by the configured delivery partner. Use the order tracker with your order number and verified contact information, or sign in to view the latest confirmed update."],
      ["Do you deliver everywhere in India?", "Delivery depends on the PIN code, product and available carrier service. Serviceability and charges should be checked during checkout. A broad delivery claim is not a guarantee for every address."],
      ["What if tracking has not updated?", "Carriers may take time to record the first scan or a later movement. If the displayed status remains unchanged beyond the carrier’s stated timeframe, contact support with your order number so the shipment can be checked."],
    ],
  },
  {
    id: "changes",
    title: "Cancellations, returns & issues",
    items: [
      ["Can a personalised order be cancelled?", "A cancellation request can be reviewed before production begins. Because personalised products are made to supplied details, cancellation may not be possible after review, artwork generation or production has started. Contact support as soon as possible."],
      ["Can I return a correctly made personalised product?", "Items made correctly to the approved configuration generally cannot be returned simply because you changed your mind. Non-personalised items may have different eligibility. Read the returns policy and the conditions shown on the product page before ordering."],
      ["What if my item arrives damaged or incorrectly personalised?", "Keep the product and packaging, take clear photographs and contact support within the reporting window in the returns policy. The team will compare the item with the saved order configuration and explain the available resolution."],
      ["What if I entered the wrong spelling?", "Naamly produces from the details reviewed and submitted at checkout. A customer-entered spelling error is not the same as a production error, though support can still explain any available options."],
    ],
  },
  {
    id: "payments",
    title: "Payments, accounts & bulk orders",
    items: [
      ["Which payment methods can I use?", "Checkout only displays methods enabled through the configured payment provider. Availability can vary by transaction. Naamly never stores raw card details, and an order is marked paid only after server-side verification."],
      ["Do I need an account to order?", "Guest checkout may be available. Creating an account makes it easier to revisit orders, addresses, wishlists and saved configurations, but it should not add unnecessary steps to a one-time purchase."],
      ["How do bulk orders work?", "Submit an estimated quantity, product type and personalisation structure through the bulk-order form. The team reviews production feasibility, data format, pricing and delivery requirements before issuing any quote. A bulk discount is never assumed."],
      ["Can each item in a bulk order have a different name?", "Yes, when the chosen product supports it. A structured spreadsheet is normally used so each row stays associated with the correct item. The accepted columns, file type and validation process are confirmed during the quote."],
    ],
  },
];

export default function FaqPage() {
  return (
    <div className={styles.page}>
      <PageHero eyebrow="Help centre" title="Questions, answered with clarity" description="Everything worth knowing before you personalise, order or ask us for help—without vague promises or hidden conditions." compact />
      <section className={styles.sectionWhite}>
        <div className={styles.container}>
          <Breadcrumbs items={[{ label: "FAQ" }]} />
          <div className={styles.faqLayout}>
            <nav className={styles.faqNav} aria-label="FAQ topics">
              {groups.map((group) => <a href={`#${group.id}`} key={group.id}>{group.title}</a>)}
            </nav>
            <div>
              {groups.map((group) => (
                <section className={styles.faqGroup} id={group.id} key={group.id} aria-labelledby={`${group.id}-title`}>
                  <h2 id={`${group.id}-title`}>{group.title}</h2>
                  {group.items.map(([question, answer]) => <details className={styles.faqItem} key={question}><summary>{question}</summary><p>{answer}</p></details>)}
                </section>
              ))}
            </div>
          </div>
        </div>
      </section>
      <section className={styles.sectionSoft}>
        <div className={styles.narrowContainer} style={{ textAlign: "center" }}>
          <MessageCircleQuestion aria-hidden="true" style={{ width: 34, height: 34, color: "#168c80", marginBottom: 15 }} />
          <SectionHeading title="Still need a hand?" description="Share the product or order context and our support team can give you a more useful answer." align="center" />
          <PrimaryLink href="/contact">Contact customer care</PrimaryLink>
          <p className={styles.helperText}>For a placed order, include the order number—but never send a password, card detail or one-time code.</p>
        </div>
      </section>
    </div>
  );
}
