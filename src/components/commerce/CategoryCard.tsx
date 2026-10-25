import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { Category } from "@/lib/types";
import { ProductVisual } from "./ProductVisual";

export function CategoryCard({ category }: { category: Category; index?: number }) {
  return (
    <Link className="category-card" href={`/products?category=${category.slug}`} style={{ "--cat-bg": "var(--cloud)" } as React.CSSProperties}>
      <div className="category-art"><ProductVisual artwork={category.artwork} accent="var(--teal)" background="var(--cloud)" name={category.name} /></div>
      <h3>{category.shortName}</h3>
      <p>{category.productCount} thoughtful options</p>
      <span className="arrow"><ArrowUpRight size={17} /></span>
    </Link>
  );
}
