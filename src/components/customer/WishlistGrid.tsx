"use client";

import Link from "next/link";
import { ArrowRight, Heart, PackageOpen, Sparkles, Trash2 } from "lucide-react";
import { useStore } from "@/components/store/StoreProvider";
import styles from "./customer.module.css";

export type WishlistProduct = {
  id: string;
  slug: string;
  name: string;
  category: string;
  price: number;
  material: string;
  packSize?: number;
  accent: "mint" | "amber" | "blue";
};

export default function WishlistGrid({ products }: { products: WishlistProduct[] }) {
  const { wishlist, toggleWishlist, isHydrated } = useStore();
  const items = wishlist.map((id) => products.find((product) => product.id === id)).filter((product): product is WishlistProduct => Boolean(product));

  if (!isHydrated) {
    return <div className={styles.emptyState} aria-busy="true"><span><Heart aria-hidden="true" /></span><h2>Loading your saved favourites…</h2></div>;
  }

  if (!items.length) {
    return (
      <div className={styles.emptyState}>
        <span><Heart aria-hidden="true" /></span>
        <h2>Your wishlist is ready for new favourites</h2>
        <p>Tap the heart on a product while you browse. Your saved items will stay on this device for a quicker return.</p>
        <Link className={styles.primaryButton} href="/products">Explore products <ArrowRight aria-hidden="true" /></Link>
      </div>
    );
  }

  return (
    <>
      <div className={styles.wishlistToolbar}><p><strong>{items.length}</strong> saved {items.length === 1 ? "item" : "items"}</p><span>Saved on this device</span></div>
      <div className={styles.wishlistGrid}>
        {items.map((item) => (
          <article className={styles.wishlistCard} key={item.id}>
            <div className={`${styles.wishlistVisual} ${styles[item.accent]}`}>
              <Sparkles aria-hidden="true" />
              <span>{item.name.split(/[·\-]/)[0].trim().slice(0, 14).toUpperCase()}</span>
              <small>made for you</small>
              <button type="button" onClick={() => toggleWishlist(item.id)} aria-label={`Remove ${item.name} from wishlist`}><Trash2 aria-hidden="true" /></button>
            </div>
            <div className={styles.wishlistBody}>
              <p className={styles.productMeta}>{item.category}{item.packSize ? ` · Pack of ${item.packSize}` : ""}</p>
              <h2>{item.name}</h2>
              <div className={styles.productPrice}><strong>{new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(item.price)}</strong><span>{item.material} · Options may affect price</span></div>
              <Link className={styles.cardButton} href={`/products/${item.slug}`}>View & personalise <ArrowRight aria-hidden="true" /></Link>
            </div>
          </article>
        ))}
      </div>
      <div className={styles.wishlistNote}><PackageOpen aria-hidden="true" /><p><strong>Saved isn’t reserved.</strong> Availability and final pricing are confirmed when you add a configured item to your cart.</p></div>
    </>
  );
}
