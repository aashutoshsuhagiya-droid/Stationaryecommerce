import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, FileText, RotateCcw, ShieldCheck, Truck } from "lucide-react";
import { Breadcrumbs, PageHero, styles } from "@/components/customer/CustomerUI";

export const metadata: Metadata = {
  title: "Store policies",
  description: "Read Naamly shipping, returns, privacy and terms policies before placing an order.",
};

const policyCards = [
  { href: "/policies/shipping", icon: Truck, title: "Shipping policy", text: "Serviceability, production windows, dispatch, tracking and delivery responsibilities." },
  { href: "/policies/returns", icon: RotateCcw, title: "Returns & refunds", text: "Eligibility for personalised and non-personalised items, reporting issues and resolutions." },
  { href: "/policies/privacy", icon: ShieldCheck, title: "Privacy policy", text: "What information is collected, why it is used, how it is protected and your choices." },
  { href: "/policies/terms", icon: FileText, title: "Terms & conditions", text: "The terms that apply when browsing, personalising products and placing an order." },
];

export default function PoliciesPage() {
  return (
    <div className={styles.page}>
      <PageHero eyebrow="The clear details" title="Store policies, written to be read" description="Personalised products come with a few important conditions. We put them in one place so you can make an informed choice." compact />
      <section className={styles.section}>
        <div className={styles.container}>
          <Breadcrumbs items={[{ label: "Policies" }]} />
          <div className={styles.valueGrid}>
            {policyCards.map(({ href, icon: Icon, title, text }) => <Link className={styles.valueCard} style={{ color: "inherit", textDecoration: "none" }} href={href} key={href}><span><Icon aria-hidden="true" /></span><h3>{title}</h3><p>{text}</p><strong style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 17, color: "var(--teal-dark)", fontSize: 12 }}>Read policy <ArrowRight aria-hidden="true" style={{ width: 15 }} /></strong></Link>)}
          </div>
          <div className={styles.notice} style={{ marginTop: 28 }}><span><FileText aria-hidden="true" /></span><div><strong>Policies can change</strong><p>The version available when you place an order applies to that transaction, subject to applicable law. Material updates should be dated and published here.</p></div></div>
        </div>
      </section>
    </div>
  );
}
