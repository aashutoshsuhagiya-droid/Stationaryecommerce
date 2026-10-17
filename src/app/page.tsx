import Link from "next/link";
import { ArrowRight, BadgeCheck, Box, ChevronRight, CircleCheck, Headphones, Paintbrush, PackageCheck, ShieldCheck, Sparkles, WandSparkles } from "lucide-react";
import { categories, featuredProducts } from "@/lib/data";
import { ProductCard } from "@/components/commerce/ProductCard";
import { CategoryCard } from "@/components/commerce/CategoryCard";
import { ProductVisual } from "@/components/commerce/ProductVisual";

const process = [
  { number: "01", icon: PackageCheck, title: "Choose your product", text: "Pick the size, pack and material that fits your day." },
  { number: "02", icon: Paintbrush, title: "Make it yours", text: "Add the name, details and a design they’ll genuinely love." },
  { number: "03", icon: WandSparkles, title: "Preview every detail", text: "See the design update live before you commit to ordering." },
  { number: "04", icon: Box, title: "We make it carefully", text: "Your saved design follows the order through production." },
];

const faqs = [
  ["Can I preview the name before ordering?", "Yes. Every customisable product includes a live preview. What you save in the studio stays attached to that specific cart item."],
  ["How long does personalisation take?", "The production window is shown on each product page before checkout. It varies by product and begins after payment and artwork checks are complete."],
  ["Are personalised products returnable?", "Because personalised products are made specifically for you, change-of-mind returns are generally unavailable. If an item arrives damaged or differs from the approved design, contact us with photos so it can be reviewed."],
  ["Can I order labels for a whole class or school?", "Yes. The bulk-order workflow accepts a list of names and validates each row. Larger or unusual projects can be sent for a tailored quote."],
];

export default function HomePage() {
  const featuredCategories = categories.filter((category) => category.featured).slice(0, 4);
  return (
    <>
      <section className="home-hero">
        <div className="hero-orb hero-orb-one" aria-hidden="true" />
        <div className="hero-orb hero-orb-two" aria-hidden="true" />
        <div className="shell hero-grid">
          <div className="hero-copy">
            <span className="hero-kicker"><Sparkles size={14} /> Designed by you. Made with care.</span>
            <h1>Little things feel bigger with <em>their name on it.</em></h1>
            <p>Thoughtfully personalised labels, school essentials and gifts—easy to design, clear to preview, and made for everyday life.</p>
            <div className="hero-actions"><Link className="button button-primary" href="/products">Explore products <ArrowRight size={17} /></Link><Link className="button button-secondary" href="/products/everyday-name-slips-72-pack"><WandSparkles size={17} /> Try the live studio</Link></div>
            <div className="hero-reassurance"><span><CircleCheck /> Preview before ordering</span><span><CircleCheck /> Transparent pricing</span><span><CircleCheck /> Made in India</span></div>
          </div>
          <div className="hero-stage" aria-label="A selection of personalised school products">
            <span className="hero-doodle hero-doodle-one" aria-hidden="true">✦</span><span className="hero-doodle hero-doodle-two" aria-hidden="true">⌁</span>
            <div className="hero-note"><span>Made for</span><strong>everyday adventures</strong></div>
            <div className="hero-product hero-product-main"><ProductVisual artwork="ocean-name-slip" name="Personalised name labels" accent="#28a796" background="#eef9f6" personalisedName="Mira Kapoor" /></div>
            <div className="hero-product hero-product-bottle"><ProductVisual artwork="bottle-label" name="Personalised bottle" accent="#ef8a6e" background="#fff0e8" personalisedName="Arjun" /></div>
            <div className="hero-product hero-product-pencil"><ProductVisual artwork="pencil-bundle" name="Personalised pencils" accent="#f4b942" background="#fff4d6" personalisedName="Zoya" /></div>
            <div className="hero-sticker"><BadgeCheck /><strong>Made to order</strong><small>Your design stays with your item</small></div>
          </div>
        </div>
      </section>

      <section className="trust-strip" aria-label="Service promises">
        <div className="shell trust-grid">
          <div><span className="trust-icon"><WandSparkles /></span><p><strong>See it before we make it</strong><small>Live personalisation preview</small></p></div>
          <div><span className="trust-icon"><ShieldCheck /></span><p><strong>Clear, secure checkout</strong><small>No hidden personalisation fees</small></p></div>
          <div><span className="trust-icon"><PackageCheck /></span><p><strong>Carefully packed</strong><small>Checked before dispatch</small></p></div>
          <div><span className="trust-icon"><Headphones /></span><p><strong>Human customer care</strong><small>Help when you need it</small></p></div>
        </div>
      </section>

      <section className="section category-section">
        <div className="shell">
          <div className="section-header"><div><span className="eyebrow">Find your favourite</span><h2>Made personal, for every day</h2><p>Start with what you need. Every customisable piece opens in a guided studio with a real-time preview.</p></div><Link className="text-link" href="/products">See all categories <ArrowRight size={16} /></Link></div>
          <div className="category-grid">{featuredCategories.map((category, index) => <CategoryCard key={category.id} category={category} index={index} />)}</div>
        </div>
      </section>

      <section className="section bestsellers-section section-soft">
        <div className="shell">
          <div className="section-header"><div><span className="eyebrow">Customer favourites</span><h2>Personal picks, beautifully practical</h2><p>Our most useful formats, ready for your name and chosen design.</p></div><Link className="text-link" href="/products">Shop the collection <ArrowRight size={16} /></Link></div>
          <div className="product-grid">{featuredProducts.slice(0, 4).map((product) => <ProductCard key={product.id} product={product} />)}</div>
        </div>
      </section>

      <section className="section how-section">
        <div className="shell">
          <div className="how-heading"><span className="eyebrow">Simple by design</span><h2>From blank to brilliantly yours</h2><p>Four clear steps. No guesswork, no lost personalisation.</p></div>
          <div className="process-grid">{process.map((step, index) => <article className="process-card" key={step.number}><span className="process-number">{step.number}</span><span className="process-icon"><step.icon /></span><h3>{step.title}</h3><p>{step.text}</p>{index < process.length - 1 && <ChevronRight className="process-arrow" aria-hidden="true" />}</article>)}</div>
          <div className="how-cta"><Link className="button button-teal" href="/products/everyday-name-slips-72-pack">Create your first design <ArrowRight size={17} /></Link></div>
        </div>
      </section>

      <section className="section story-section">
        <div className="shell story-grid">
          <div className="story-visual">
            <div className="story-card one"><ProductVisual artwork="notebook-monogram" background="#f8e9e8" accent="#d96d6f" name="Personalised notebook" personalisedName="My big ideas" /></div>
            <div className="story-card two"><ProductVisual artwork="label-stack" background="#e5f4f2" accent="#4cafa3" name="Name labels" personalisedName="Anaya S." /></div>
            <div className="quality-note"><ShieldCheck /><p><strong>Design-to-order continuity</strong><small>The personalisation saved at checkout is the data used for production.</small></p></div>
          </div>
          <div className="story-copy"><span className="eyebrow">The Naamly standard</span><h2>Personal should never feel uncertain.</h2><p>Custom products ask for a little more trust. That’s why the important details stay visible: what you entered, what it looks like, what it costs, and what happens next.</p><ul><li><CircleCheck /><span><strong>A preview you control</strong>Type, switch themes and review the exact saved details.</span></li><li><CircleCheck /><span><strong>Clear product facts</strong>Pack sizes, materials and production windows are shown upfront.</span></li><li><CircleCheck /><span><strong>Support with context</strong>Your order retains its design choices, so help starts with the right information.</span></li></ul><Link href="/about" className="text-link">Why we built Naamly <ArrowRight size={16} /></Link></div>
        </div>
      </section>

      <section className="section collection-section">
        <div className="shell collection-grid">
          <article className="collection-card collection-school"><span>School-ready collection</span><h2>Small labels.<br />Much calmer mornings.</h2><p>Mixed-size packs for the things that leave home every day.</p><Link href="/products?category=customized-name-slips">Shop name labels <ArrowRight size={16} /></Link><div className="collection-art"><ProductVisual artwork="label-stack" accent="#4cb0a3" background="#e9f7f4" personalisedName="Kabir Rao" /></div></article>
          <article className="collection-card collection-gift"><span>Make gifting meaningful</span><h2>Not just picked.<br />Made for them.</h2><p>Useful, joyful gifts with their name woven into the design.</p><Link href="/products?category=personalized-gifts">Explore gifts <ArrowRight size={16} /></Link><div className="collection-art"><ProductVisual artwork="gift-ribbon" accent="#dd766e" background="#fff0ec" personalisedName="For Tara" /></div></article>
        </div>
      </section>

      <section className="section faq-section section-soft">
        <div className="shell faq-grid">
          <div className="faq-intro"><span className="eyebrow">Good to know</span><h2>Answers before you ask</h2><p>Personalisation has details. We keep the explanations plain.</p><Link href="/faq" className="button button-secondary">View all FAQs</Link></div>
          <div className="faq-list">{faqs.map(([question, answer], index) => <details key={question} open={index === 0}><summary>{question}<span>+</span></summary><p>{answer}</p></details>)}</div>
        </div>
      </section>
    </>
  );
}
