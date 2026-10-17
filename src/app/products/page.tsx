import { Suspense } from "react";
import type { Metadata } from "next";
import { ProductCatalog } from "@/components/commerce/ProductCatalog";

export const metadata: Metadata = { title: "All personalised products", description: "Browse personalised labels, school essentials, notebooks and gifts." };

export default function ProductsPage() {
  return <Suspense fallback={<div className="catalog-loading shell">Loading the collection…</div>}><ProductCatalog /></Suspense>;
}
