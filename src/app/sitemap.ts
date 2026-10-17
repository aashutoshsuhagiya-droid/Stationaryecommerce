import type { MetadataRoute } from "next";
import { categories, products } from "@/lib/data";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://naamly.example";
  const staticPages = ["", "/products", "/bulk-orders", "/about", "/contact", "/faq", "/track-order", "/policies/shipping", "/policies/returns", "/policies/privacy", "/policies/terms"];
  return [
    ...staticPages.map((path) => ({ url: `${base}${path}`, changeFrequency: path === "" ? "weekly" as const : "monthly" as const, priority: path === "" ? 1 : .7 })),
    ...products.map((product) => ({ url: `${base}/products/${product.slug}`, changeFrequency: "weekly" as const, priority: .8 })),
    ...categories.map((category) => ({ url: `${base}/products?category=${category.slug}`, changeFrequency: "weekly" as const, priority: .65 })),
  ];
}
