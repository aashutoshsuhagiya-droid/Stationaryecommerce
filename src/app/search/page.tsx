import { Suspense } from "react";
import type { Metadata } from "next";
import { ProductCatalog } from "@/components/commerce/ProductCatalog";
import { CatalogSkeleton } from "@/components/ui/StorefrontSkeletons";

export const metadata: Metadata = { title: "Search products" };

export default function SearchPage() {
  return <Suspense fallback={<CatalogSkeleton />}><ProductCatalog searchMode /></Suspense>;
}
