"use client";

import Image from "next/image";
import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import type { CSSProperties } from "react";

export type CategoryDockItem = {
  slug: string;
  label: string;
  color: string;
  image: string;
  name: string;
};

export function CategoryDock({ categories }: { categories: readonly CategoryDockItem[] }) {
  return (
    <nav className="catDock shell" aria-label="Shop by category">
      <div className="catDockScroller">
        <Link className="catDockItem catDockAll" href="/products">
          <span className="catDockCircle" aria-hidden="true"><LayoutGrid size={23} /></span>
          <span className="catDockLabel">Shop All</span>
        </Link>
        {categories.map((category) => (
          <Link
            className="catDockItem"
            href={"/products?category=" + category.slug}
            key={category.slug}
            style={{ "--cat-dock-color": category.color } as CSSProperties}
          >
            <span className="catDockCircle">
              <Image alt={category.name} fill sizes="64px" src={category.image} />
            </span>
            <span className="catDockLabel">{category.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
