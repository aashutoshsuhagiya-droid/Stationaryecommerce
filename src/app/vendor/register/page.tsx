import type { Metadata } from "next";
import { BadgeCheck, ClipboardCheck, MapPinned, Settings2 } from "lucide-react";

import VendorRegistrationForm from "@/components/vendor/VendorRegistrationForm";
import styles from "@/components/vendor/vendor-registration.module.css";
import { getVendorCategoryOptions } from "@/lib/runtime-catalog";
import { getVendorRegistrationOptions } from "@/lib/vendor-registration-options";

export const metadata: Metadata = {
  title: "Become a vendor",
  description: "Apply to join Naamly's printing and production partner network.",
};

const applicationSteps = [
  {
    icon: BadgeCheck,
    title: "Verify your mobile",
    text: "We use a one-time code to confirm the primary business contact.",
  },
  {
    icon: Settings2,
    title: "Share your capabilities",
    text: "Tell us what you produce, the equipment you use and where you can serve.",
  },
  {
    icon: ClipboardCheck,
    title: "Submit for review",
    text: "Our team reviews your details and business documents before activation.",
  },
] as const;

export default async function VendorRegisterPage() {
  const categoryOptions = await getVendorCategoryOptions();
  const registrationOptions = await getVendorRegistrationOptions();

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>Naamly production network</p>
            <h1>Make thoughtful products with us.</h1>
            <p>
              Apply as a printing and production partner. We will learn about your
              workshop, capabilities and service area before reviewing the application.
            </p>
          </div>
          <div className={styles.heroBadge} aria-label="Application overview">
            <MapPinned aria-hidden="true" />
            <span><strong>Built for local production</strong><small>Capability and PIN-code based matching</small></span>
          </div>
        </div>
      </section>

      <div className={styles.layout}>
        <aside className={styles.applicationGuide} aria-labelledby="application-guide-title">
          <p className={styles.eyebrow}>How it works</p>
          <h2 id="application-guide-title">A clear application, one step at a time</h2>
          <ol>
            {applicationSteps.map(({ icon: Icon, title, text }, index) => (
              <li key={title}>
                <span className={styles.stepIcon}><Icon aria-hidden="true" /></span>
                <div>
                  <small>Step {index + 1}</small>
                  <strong>{title}</strong>
                  <p>{text}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className={styles.guideNote}>
            <strong>Before you begin</strong>
            <p>Keep your GST details and business documents nearby if they apply to your business.</p>
          </div>
        </aside>

        <VendorRegistrationForm categories={categoryOptions} equipmentOptions={registrationOptions.equipment} serviceOptions={registrationOptions.printingServices} />
      </div>
    </div>
  );
}
