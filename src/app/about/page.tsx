import type { Metadata } from "next";
import { Eye, HandHeart, PackageCheck, ShieldCheck, Sparkles } from "lucide-react";
import { AssuranceStrip, Breadcrumbs, PageHero, PrimaryLink, SectionHeading, styles } from "@/components/customer/CustomerUI";

export const metadata: Metadata = {
  title: "About us",
  description: "Meet Naamly, a thoughtful personalised-products store built around clarity, careful production and useful design.",
};

export default function AboutPage() {
  const values = [
    { icon: Eye, title: "Clarity before checkout", text: "Materials, sizes, pack counts, pricing and personalisation requirements should be easy to understand." },
    { icon: Sparkles, title: "Personal, not complicated", text: "Good customisation gives you meaningful choices without making a simple purchase feel like work." },
    { icon: PackageCheck, title: "Careful production", text: "Saved order details help the production team make and review each item against the chosen configuration." },
    { icon: HandHeart, title: "Fair support", text: "When something goes wrong, we believe the next steps and the limits of personalised-item returns should be explained plainly." },
  ];

  return (
    <div className={styles.page}>
      <PageHero eyebrow="Our story" title="Small details. A real sense of belonging." description="Naamly creates personalised labels, everyday school essentials and thoughtful gifts designed to make the things you use feel unmistakably yours." compact>
        <PrimaryLink href="/products">Discover the collection</PrimaryLink>
      </PageHero>
      <AssuranceStrip />
      <section className={styles.sectionWhite}>
        <div className={styles.container}>
          <Breadcrumbs items={[{ label: "About us" }]} />
          <div className={styles.aboutIntro}>
            <div>
              <p className={styles.eyebrow}>Why Naamly exists</p>
              <h2>Personalisation should feel joyful—and stay dependable.</h2>
              <p>We started with a simple observation: everyday things are easier to recognise, return and enjoy when they carry a name. But ordering personalised products often comes with uncertainty about size, spelling, materials or what will actually arrive.</p>
              <p>Naamly is designed to make that experience clearer. You can choose from practical products, enter only the details that matter and review the configuration before placing an order. Our goal is not to offer endless options; it is to offer thoughtful ones, explained well.</p>
            </div>
            <div className={styles.aboutVisual} aria-label="A playful arrangement of personalised Naamly labels">
              <Sparkles aria-hidden="true" />
              <div className={`${styles.aboutCard} ${styles.aboutCardOne}`}><span>AARAV</span><small>made for everyday</small></div>
              <div className={`${styles.aboutCard} ${styles.aboutCardTwo}`}><span>MIRA</span><small>made unmistakable</small></div>
            </div>
          </div>
        </div>
      </section>
      <section className={styles.sectionSoft}>
        <div className={styles.container}>
          <SectionHeading eyebrow="What guides us" title="Thoughtfulness you can see" description="These principles shape the experience we’re building, from the first product detail to post-order support." align="center" />
          <div className={styles.valueGrid}>
            {values.map(({ icon: Icon, title, text }) => <article className={styles.valueCard} key={title}><span><Icon aria-hidden="true" /></span><h3>{title}</h3><p>{text}</p></article>)}
          </div>
        </div>
      </section>
      <section className={styles.sectionWhite}>
        <div className={styles.narrowContainer}>
          <SectionHeading eyebrow="Trust through transparency" title="No made-up milestones or mystery promises" description="Production and delivery information should come from the actual order and configured partners. Reviews should come from real customers, prices should be visible before payment and customised-item conditions should never be hidden in tiny print." />
          <div className={styles.notice}><span><ShieldCheck aria-hidden="true" /></span><div><strong>A growing Indian brand</strong><p>Naamly is built for customers across serviceable Indian PIN codes. Product availability, production windows and support channels are shown only where they are configured for the store.</p></div></div>
        </div>
      </section>
    </div>
  );
}
