import Image from "next/image";
import Link from "next/link";
import { discountPercent, formatPrice } from "@/lib/data";
import type { Product } from "@/lib/types";

export function TrendingCard({ product }: { product: Product }) {
  const compareAtPrice = product.compareAtPrice;
  const hasCompareAtPrice = typeof compareAtPrice === "number";
  const off = discountPercent(product);

  return (
    <article className="trendingCard">
      <Link className="trendingCardLink" href={"/products/" + product.slug}>
        <div className="trendingCardMedia">
          <Image alt={product.name} fill sizes="(max-width: 640px) 210px, 210px" src={product.image} />
          {hasCompareAtPrice && <span className="trendingDiscount">{off + "% OFF"}</span>}
        </div>
        <div className="trendingCardCopy">
          <h3>{product.name}</h3>
          <div className="trendingPriceRow">
            <span>{formatPrice(product.price)}</span>
            {hasCompareAtPrice && <s>{formatPrice(compareAtPrice)}</s>}
            {hasCompareAtPrice && <em>{off + "% off"}</em>}
          </div>
        </div>
      </Link>
    </article>
  );
}
