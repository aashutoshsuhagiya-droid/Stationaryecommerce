import type { Metadata } from "next";
import { MapPin, Plus } from "lucide-react";
import { StatusPill, styles } from "@/components/customer/CustomerUI";

export const metadata: Metadata = { title: "Saved addresses | Naamly" };

export default function AddressesPage() {
  return (
    <section className={styles.accountSection} style={{ marginTop: 0 }} aria-labelledby="addresses-title">
      <div className={styles.accountSectionHeader}><div><h2 id="addresses-title">Saved addresses</h2><p className={styles.helperText}>Always review the delivery address before placing an order.</p></div><button className={styles.smallButton} type="button"><Plus aria-hidden="true" /> Add address</button></div>
      <div className={styles.addressCard}>
        <div><div style={{ display: "flex", alignItems: "center", gap: 9 }}><h3>Home</h3><StatusPill tone="teal">Default</StatusPill></div><p>Aarav Sharma<br />18, Green Park Extension<br />New Delhi, Delhi 110016<br />+91 98765 43210</p><div className={styles.orderActions} style={{ marginTop: 14 }}><button className={styles.smallButton} type="button">Edit</button><button className={styles.smallButton} type="button">Remove</button></div></div>
        <MapPin aria-hidden="true" />
      </div>
    </section>
  );
}
