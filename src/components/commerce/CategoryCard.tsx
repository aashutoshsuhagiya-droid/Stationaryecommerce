import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { Category } from "@/lib/types";
import { ProductVisual } from "./ProductVisual";

const accents = ["#55b5a9", "#4d9fce", "#e1a62f", "#856db6", "#d97375", "#3da594"];

export function CategoryCard({ category, index = 0 }: { category: Category; index?: number }) {
  return (
    <Link className="category-card" href={`/products?category=${category.slug}`} style={{ "--cat-bg": category.accent } as React.CSSProperties}>
      <div className="category-art"><ProductVisual artwork={category.artwork} accent={accents[index % accents.length]} background={category.accent} name={category.name} /></div>
      <h3>{category.shortName}</h3>
      <p>{category.productCount} thoughtful options</p>
      <span className="arrow"><ArrowUpRight size={17} /></span>
    </Link>
  );
}
