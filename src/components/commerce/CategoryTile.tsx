import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";

export type CategoryTileItem = {
  slug: string;
  label: string;
  color: string;
  image: string;
  name: string;
};

export function CategoryTile({ category }: { category: CategoryTileItem }) {
  return (
    <Link
      className="categoryTile"
      href={"/products?category=" + category.slug}
      style={{ "--category-tile-color": category.color } as CSSProperties}
    >
      <Image alt={category.name} fill sizes="(max-width: 640px) 50vw, 20vw" src={category.image} />
      <span>{category.label}</span>
    </Link>
  );
}
