import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import type { Category } from "@/lib/types";

export function CategoryCard({ category }: { category: Category; index?: number }) {
  return (
    <Link className="category-card" href={`/products?category=${category.slug}`} style={{ "--cat-bg": "var(--cloud)" } as React.CSSProperties}>
      <div className="category-art category-photo"><Image src={category.image} alt={category.name} fill sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" /></div>
      <h3>{category.shortName}</h3>
      <p>{category.productCount} thoughtful options</p>
      <span className="arrow"><ArrowUpRight size={17} /></span>
    </Link>
  );
}
