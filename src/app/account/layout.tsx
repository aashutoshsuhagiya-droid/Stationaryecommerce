import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import AccountNav from "@/components/customer/AccountNav";
import { Breadcrumbs, styles } from "@/components/customer/CustomerUI";

export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.page}>
      <div className={styles.accountWrap}>
        <Breadcrumbs items={[{ label: "My account" }]} />
        <div className={styles.accountWelcome}>
          <div>
            <p className={styles.eyebrow}>Customer account</p>
            <h1>Your Naamly space</h1>
            <p>Orders, saved details and personal favourites—all together.</p>
          </div>
        </div>
        <div className={styles.notice}><span><CircleAlert aria-hidden="true" /></span><div><strong>Demo account preview</strong><p>The orders, profile and addresses below are seeded examples. Connect authentication and the database before treating them as customer records.</p></div></div>
        <div className={styles.accountLayout}>
          <AccountNav />
          <section className={styles.accountMain} aria-label="Account content">{children}</section>
        </div>
      </div>
    </div>
  );
}
