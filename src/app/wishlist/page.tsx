import type { Metadata } from "next";
import WishlistGrid from "@/components/customer/WishlistGrid";
import { Breadcrumbs, PageHero, styles } from "@/components/customer/CustomerUI";
import { products } from "@/lib/data";

export const metadata: Metadata = {
  title: "Your wishlist",
  description: "Return to personalised products and designs saved for later.",
};

export default function WishlistPage() {
  const wishlistProducts = products.map((product, index) => ({
    id: product.id,
    slug: product.slug,
    name: product.name,
    category: product.category,
    price: product.price,
    material: product.material,
    packSize: product.packSize,
    accent: (["mint", "amber", "blue"] as const)[index % 3],
  }));

  return (
    <div className={styles.page}>
      <PageHero eyebrow="Saved for later" title="Your thoughtful shortlist" description="Keep the products that caught your eye close by. You can choose names, colours and designs when you’re ready." compact />
      <section className={styles.section}>
        <div className={styles.container}>
          <Breadcrumbs items={[{ label: "Wishlist" }]} />
          <WishlistGrid products={wishlistProducts} />
        </div>
      </section>
    </div>
  );
}
