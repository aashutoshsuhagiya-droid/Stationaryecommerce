import type { Metadata } from "next";
import { Suspense } from "react";

import { ProductCatalog } from "@/components/commerce/ProductCatalog";
import { CatalogSkeleton } from "@/components/ui/StorefrontSkeletons";

export const metadata: Metadata = {
  title: "All personalised products",
  description: "Browse personalised labels, school essentials, notebooks and gifts.",
};

export default function ProductsPage() {
  return <Suspense fallback={<CatalogSkeleton />}><ProductCatalog /></Suspense>;
}
