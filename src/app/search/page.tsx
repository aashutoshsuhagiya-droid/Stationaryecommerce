import { Suspense } from "react";
import type { Metadata } from "next";
import { ProductCatalog } from "@/components/commerce/ProductCatalog";

export const metadata: Metadata = { title: "Search products" };

export default function SearchPage() {
  return <Suspense fallback={<div className="catalog-loading shell">Searching…</div>}><ProductCatalog searchMode /></Suspense>;
}
