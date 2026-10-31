"use client";

import Link from "next/link";
import Image from "next/image";
import { Heart, Plus } from "lucide-react";
import type { Product } from "@/lib/types";
import { discountPercent, formatPrice } from "@/lib/data";
import { useStore } from "@/components/store/StoreProvider";

export function ProductCard({ product }: { product: Product }) {
  const { toggleWishlist, isWishlisted, addItem } = useStore();
  const saved = isWishlisted(product.id);
  const compareAtPrice = product.compareAtPrice;
  const hasCompareAtPrice = typeof compareAtPrice === "number";
  const off = discountPercent(product);

  return (
    <article className="product-card">
      <Link href={`/products/${product.slug}`} className="product-card-media" aria-label={`View ${product.name}`}>
        <div className="product-card-photo">
          <Image src={product.image} alt={product.name} fill sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" />
        </div>
        {product.badge && <span className="product-badge">{product.badge}</span>}
        {hasCompareAtPrice && <span className="discount-badge">{off}% OFF</span>}
      </Link>
      <button className={`wishlist-button ${saved ? "active" : ""}`} onClick={() => toggleWishlist(product.id)} aria-label={saved ? "Remove from wishlist" : "Add to wishlist"}><Heart /></button>
      <div className="product-card-body">
        <div className="product-meta">
          {product.customizable ? <span className="customisable">Personalise it</span> : <span>{product.category}</span>}
          <span>{product.stockStatus === "made_to_order" ? "Made to order" : product.newArrival ? "New" : "Available"}</span>
        </div>
        <h3><Link href={`/products/${product.slug}`}>{product.name}</Link></h3>
        <div className="product-price-row"><span className="product-price">{formatPrice(product.price)}</span>{hasCompareAtPrice && <span className="compare-price">{formatPrice(compareAtPrice)}</span>}</div>
        <div className="card-actions">
          <Link className="button button-primary" href={`/products/${product.slug}`}>{product.customizable ? "Customise now" : "View product"}</Link>
          {product.customizable ? (
            <Link className="card-quick-add" href={`/products/${product.slug}`} aria-label={`Customise ${product.name}`}><Plus /></Link>
          ) : (
            <button className="card-quick-add" aria-label={`Quick add ${product.name}`} onClick={() => addItem({ productId: product.id, variantId: product.variants[0]?.id, slug: product.slug, name: product.name, price: product.price, quantity: 1, visual: product.artwork })}><Plus /></button>
          )}
        </div>
      </div>
    </article>
  );
}
