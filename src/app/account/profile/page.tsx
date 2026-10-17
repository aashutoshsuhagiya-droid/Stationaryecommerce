import type { Metadata } from "next";
import { LockKeyhole } from "lucide-react";
import { Notice, styles } from "@/components/customer/CustomerUI";

export const metadata: Metadata = { title: "Profile & security | Naamly" };

export default function ProfilePage() {
  return (
    <section className={styles.accountSection} style={{ marginTop: 0 }} aria-labelledby="profile-title">
      <div className={styles.accountSectionHeader}><div><h2 id="profile-title">Profile details</h2><p className={styles.helperText}>Used for account updates and order communication.</p></div></div>
      <form className={styles.profileForm}>
        <div className={styles.formGrid}>
          <div className={styles.field}><label htmlFor="profile-name">Full name</label><input id="profile-name" name="name" defaultValue="Aarav Sharma" autoComplete="name" /></div>
          <div className={styles.field}><label htmlFor="profile-mobile">Mobile number</label><input id="profile-mobile" name="mobile" type="tel" defaultValue="+91 98765 43210" autoComplete="tel" /></div>
          <div className={`${styles.field} ${styles.fullSpan}`}><label htmlFor="profile-email">Email address</label><input id="profile-email" name="email" type="email" defaultValue="aarav@example.com" autoComplete="email" /></div>
        </div>
        <button className={styles.submitButton} type="button" disabled>Save changes in live account</button>
        <p className={styles.helperText}>Profile updates are disabled in this demo so example contact data is never submitted.</p>
      </form>
      <div style={{ marginTop: 22 }}><Notice icon={<LockKeyhole aria-hidden="true" />} title="Account security">Changing your email or mobile number may require verification. Naamly support will never ask for your password or one-time code.</Notice></div>
    </section>
  );
}
