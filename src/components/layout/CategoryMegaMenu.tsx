"use client";

import Link from "next/link";
import {
  ArrowRight,
  BadgePercent,
  BookOpen,
  Droplets,
  FileSpreadsheet,
  Gift,
  KeyRound,
  Layers3,
  PenLine,
  Ruler,
  School,
  ShieldCheck,
  Sparkles,
  Tag,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { categories as initialCategories } from "@/lib/data";
import type { Category } from "@/lib/types";

type QuickLink = { label: string; href: string; icon: LucideIcon };

// Column 1: everyday labels · Column 2: school & writing · Column 3: gifts & keepsakes · Column 4: bulk
const groupSlugs = [
  ["customized-name-slips", "waterproof-stickers", "bottle-tiffin-labels"],
  ["school-labels", "personalized-notebooks", "personalized-pencils-pens", "school-accessories"],
  ["personalized-gifts", "name-plates-keychains"],
  ["bulk-orders"],
] as const;

const groupTitles = ["Label Essentials", "School & Writing", "Gifts & Keepsakes", "Bulk & Institutional"] as const;
const groupIcons: LucideIcon[] = [Tag, School, Gift, FileSpreadsheet];
const itemIcons: LucideIcon[] = [Tag, ShieldCheck, Droplets, School, BookOpen, PenLine, Sparkles, KeyRound, Ruler, BadgePercent];

export function CategoryMegaMenu() {
  const [open, setOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onPointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onScroll() {
      setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  useEffect(() => {
    fetch("/api/products?limit=1", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => { if (Array.isArray(payload?.categories)) setCategories(payload.categories); })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (open) buttonRef.current?.focus();
  }, [open]);

  const staticGroups = groupSlugs.map((slugs, index) => ({
    title: groupTitles[index],
    Icon: groupIcons[index],
    items: slugs
      .map((slug) => categories.find((category) => category.slug === slug))
      .filter((category): category is (typeof categories)[number] => Boolean(category))
      .map((category, itemIndex) => ({
        categorySlug: category.slug,
        name: category.name,
        productCount: category.productCount,
        Icon: itemIcons[(index * 4 + itemIndex) % itemIcons.length],
      })),
  }));
  const dynamicGroups = categories.filter((category) => !category.parentId).map((parent, index) => {
    const children = categories.filter((category) => category.parentId === parent.id);
    const items = children.length ? children : [parent];
    return { title: parent.name, Icon: groupIcons[index % groupIcons.length], items: items.map((category, itemIndex) => ({ categorySlug: category.slug, name: category.name, productCount: category.productCount, Icon: itemIcons[(index * 4 + itemIndex) % itemIcons.length] })) };
  });
  const groups = categories.some((category) => category.parentId) ? dynamicGroups : staticGroups;

  const quickLinks: QuickLink[] = [
    { label: "New arrivals", href: "/products?sort=newest", icon: Sparkles },
    { label: "Custom size — request a quote", href: "/bulk-orders", icon: Ruler },
    { label: "Bulk Buy", href: "/bulk-orders", icon: FileSpreadsheet },
    { label: "Sell with us", href: "/vendor/register", icon: BadgePercent },
  ];

  return (
    <div className="mega-menu" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="all-products-link"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="grid-dot-icon" aria-hidden="true">⠿</span>
        All products
        <ArrowRight size={15} className="mega-menu-caret" aria-hidden="true" />
      </button>
      {open && (
        <div className="mega-menu-panel" role="region" aria-label="All product categories">
          <div className="mega-menu-grid">
            {groups.map((group) => (
              <div className="mega-menu-col" key={group.title}>
                <h3>
                  <group.Icon aria-hidden="true" />
                  {group.title}
                </h3>
                <ul>
                  {group.items.map((item) => (
                    <li key={item.categorySlug}>
                      <Link href={`/products?category=${item.categorySlug}`} onClick={() => setOpen(false)}>
                        <item.Icon aria-hidden="true" />
                        <span>{item.name}</span>
                        {item.productCount > 0 && <small>{item.productCount}</small>}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <div className="mega-menu-col mega-menu-shortcuts">
              <h3>
                <Layers3 aria-hidden="true" />
                Shortcuts
              </h3>
              <ul className="mega-menu-quick">
                {quickLinks.map((link) => (
                  <li key={`${link.href}-${link.label}`}>
                    <Link href={link.href} onClick={() => setOpen(false)}>
                      <link.icon aria-hidden="true" />
                      <span>{link.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="mega-menu-feature">
                <strong>Preview before you order</strong>
                <p>Customize text, theme and size, then watch your design on the product in 3D.</p>
                <Link href="/products" onClick={() => setOpen(false)} className="mega-menu-feature-link">
                  Browse the collection <ArrowRight size={13} />
                </Link>
              </div>
            </div>
          </div>
          <div className="mega-menu-footer">
            <Link href="/products" onClick={() => setOpen(false)}>
              View all products <ArrowRight size={13} aria-hidden="true" />
            </Link>
            <p>Free artwork preflight check before anything reaches print.</p>
          </div>
        </div>
      )}
    </div>
  );
}
