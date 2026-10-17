import type { ReactNode } from "react";
import Link from "next/link";
import { Breadcrumbs, styles } from "./CustomerUI";

const policies = [
  { href: "/policies/shipping", label: "Shipping policy" },
  { href: "/policies/returns", label: "Returns & refunds" },
  { href: "/policies/privacy", label: "Privacy policy" },
  { href: "/policies/terms", label: "Terms & conditions" },
];

export default function PolicyPage({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <Breadcrumbs items={[{ label: "Policies", href: "/policies" }, { label: title }]} />
        <div className={styles.policyLayout}>
          <nav className={styles.policyNav} aria-label="Store policies">
            {policies.map((policy) => <Link href={policy.href} key={policy.href}>{policy.label}</Link>)}
          </nav>
          <article className={styles.policyArticle}>
            <h1>{title}</h1>
            <p className={styles.updated}>Last updated: 17 October 2026</p>
            <p className={styles.policyLead}>{lead}</p>
            {children}
          </article>
        </div>
      </div>
      <div style={{ height: 80 }} />
    </div>
  );
}
