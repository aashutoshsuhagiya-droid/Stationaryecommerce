import Link from "next/link";
import Image from "next/image";
import { ArrowRight, BadgeCheck, Box, ChevronRight, CircleCheck, Headphones, Paintbrush, PackageCheck, ShieldCheck, WandSparkles } from "lucide-react";
import { categories, featuredProducts } from "@/lib/data";
import { ProductCard } from "@/components/commerce/ProductCard";
import { CategoryCard } from "@/components/commerce/CategoryCard";
import { HomePromoCarousel, type CarouselSlide } from "@/components/commerce/HomePromoCarousel";
import { ScrollReveal } from "@/components/ui/ScrollReveal";

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
  const heroProduct = featuredProducts[0]!;
  const heroSecondary = featuredProducts[1] ?? heroProduct;
  const heroTertiary = featuredProducts[2] ?? heroSecondary;
  const nameSlipsCategory = categories.find((category) => category.slug === "customized-name-slips") ?? categories[0]!;
  const giftsCategory = categories.find((category) => category.slug === "personalized-gifts") ?? nameSlipsCategory;
  const schoolCollection = categories.find((category) => category.slug === "school-labels") ?? nameSlipsCategory;
  const giftCollection = giftsCategory;
  const promoSlides: CarouselSlide[] = [
    {
      id: "hero",
      image: heroProduct.image,
      alt: heroProduct.images[0]?.alt ?? heroProduct.name,
      kicker: "Personalised labels & gifts",
      title: "Little things feel bigger with their name on it.",
      description: "Thoughtfully personalised labels, school essentials and gifts—easy to design, clear to preview, and made for everyday life.",
      cta: "Shop the collection",
      href: "/products",
    },
    {
      id: "name-slips",
      image: nameSlipsCategory.image,
      alt: nameSlipsCategory.name,
      kicker: "Made for school mornings",
      title: "Name slips that make the small things easier to find.",
      cta: "Shop name labels",
      href: "/products?category=customized-name-slips",
    },
    {
      id: "gifts",
      image: giftsCategory.image,
      alt: giftsCategory.name,
      kicker: "Thoughtful by default",
      title: "Useful gifts, made unmistakably theirs.",
      cta: "Explore gifts",
      href: "/products?category=personalized-gifts",
    },
    {
      id: "studio-showcase",
      image: heroProduct.images[1]?.src ?? heroProduct.image,
      alt: "A personalised product ready to explore in the Naamly studio",
      kicker: "See the studio in action",
      title: "Choose the detail that makes it feel like theirs.",
      cta: "Try the live studio",
      href: "/products/everyday-name-slips-72-pack",
      hotspots: [
        { x: "12%", y: "25%", w: "32%", label: "Try the live studio", href: "/products/everyday-name-slips-72-pack" },
        { x: "48%", y: "46%", w: "26%", label: "Browse all products", href: "/products" },
        { x: "68%", y: "16%", w: "24%", label: "Gift ideas", href: "/products?category=personalized-gifts" },
      ],
    },
  ];

  return (
    <>
      <ScrollReveal>
        <section className="reassuranceBand" aria-label="Store promises">
          <div className="shell reassuranceBandGrid">
            <article className="reassuranceBandItem"><WandSparkles aria-hidden="true" /><p><strong>Live preview</strong><small>See exactly what we’ll print before you order</small></p></article>
            <article className="reassuranceBandItem"><PackageCheck aria-hidden="true" /><p><strong>Made to order</strong><small>Your design is produced only after you approve it</small></p></article>
            <article className="reassuranceBandItem"><BadgeCheck aria-hidden="true" /><p><strong>Made in India</strong><small>Small batches, checked before dispatch</small></p></article>
            <article className="reassuranceBandItem"><Headphones aria-hidden="true" /><p><strong>Human support</strong><small>Design help with your saved artwork in context</small></p></article>
          </div>
        </section>
      </ScrollReveal>

      <ScrollReveal><HomePromoCarousel slides={promoSlides} /></ScrollReveal>

      <ScrollReveal>
        <section className="section category-section">
          <div className="shell">
            <div className="section-header"><div><span className="eyebrow">Shop by category</span><h2>Made personal, for every day</h2><p>Start with what you need. Every customisable piece opens in a guided studio with a real-time preview.</p></div><Link className="text-link" href="/products">See all categories <ArrowRight size={16} /></Link></div>
            <div className="category-grid category-grid--chips">{featuredCategories.map((category, index) => <CategoryCard key={category.id} category={category} index={index} />)}</div>
          </div>
        </section>
      </ScrollReveal>

      <ScrollReveal>
        <section className="section bestsellers-section section-soft">
          <div className="shell">
            <div className="section-header"><div><span className="eyebrow">Customer favourites</span><h2>Trending now</h2><p>The picks our customers reorder — ready for your name.</p></div><Link className="text-link" href="/products">Shop the collection <ArrowRight size={16} /></Link></div>
            <div className="product-grid trending-product-grid">{featuredProducts.slice(0, 4).map((product) => <ProductCard key={product.id} product={product} />)}</div>
          </div>
        </section>
      </ScrollReveal>

      <ScrollReveal>
        <section className="section collection-section">
          <div className="shell collection-grid">
            <article className="collection-card collection-school"><span>School-ready collection</span><h2>Small labels.<br />Much calmer mornings.</h2><p>Mixed-size packs for the things that leave home every day.</p><Link href="/products?category=customized-name-slips">Shop name labels <ArrowRight size={16} /></Link>{schoolCollection && <div className="collection-art"><Image className="collection-photo" src={schoolCollection.image} alt={schoolCollection.name} fill sizes="(max-width: 780px) 100vw, 260px" /></div>}</article>
            <article className="collection-card collection-gift"><span>Make gifting meaningful</span><h2>Not just picked.<br />Made for them.</h2><p>Useful, joyful gifts with their name woven into the design.</p><Link href="/products?category=personalized-gifts">Explore gifts <ArrowRight size={16} /></Link>{giftCollection && <div className="collection-art"><Image className="collection-photo" src={giftCollection.image} alt={giftCollection.name} fill sizes="(max-width: 780px) 100vw, 260px" /></div>}</article>
          </div>
        </section>
      </ScrollReveal>

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
            {heroSecondary && <div className="story-card one"><Image src={heroSecondary.image} alt={heroSecondary.name} fill sizes="360px" /></div>}
            {heroTertiary && <div className="story-card two"><Image src={heroTertiary.image} alt={heroTertiary.name} fill sizes="260px" /></div>}
            <div className="quality-note"><ShieldCheck /><p><strong>Design-to-order continuity</strong><small>The personalisation saved at checkout is the data used for production.</small></p></div>
          </div>
          <div className="story-copy"><span className="eyebrow">The Naamly standard</span><h2>Personal should never feel uncertain.</h2><p>Custom products ask for a little more trust. That’s why the important details stay visible: what you entered, what it looks like, what it costs, and what happens next.</p><ul><li><CircleCheck /><span><strong>A preview you control</strong>Type, switch themes and review the exact saved details.</span></li><li><CircleCheck /><span><strong>Clear product facts</strong>Pack sizes, materials and production windows are shown upfront.</span></li><li><CircleCheck /><span><strong>Support with context</strong>Your order retains its design choices, so help starts with the right information.</span></li></ul><Link href="/about" className="text-link">Why we built Naamly <ArrowRight size={16} /></Link></div>
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
