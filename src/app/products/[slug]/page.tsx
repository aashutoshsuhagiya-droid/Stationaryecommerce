import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { CustomizationStudio } from "@/components/commerce/CustomizationStudio";
import { ProductEngagement } from "@/components/commerce/ProductEngagement";
import { products } from "@/lib/data";
import { buildProductConfiguration } from "@/lib/product-configuration";
import { getStorefrontCatalog, getStorefrontProduct } from "@/lib/runtime-catalog";

export const dynamic = "force-dynamic";

export function generateStaticParams() { return products.map((product) => ({ slug: product.slug })); }

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const product = await getStorefrontProduct(slug);
  return product ? { title: product.name, description: product.shortDescription } : { title: "Product not found" };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getStorefrontProduct(slug);
  if (!product) notFound();
  const configuration = buildProductConfiguration(product);
  const catalog = await getStorefrontCatalog();
  const relatedProducts = [
    ...catalog.products.filter((candidate) => (
      candidate.id !== product.id && candidate.categorySlug === product.categorySlug
    )),
    ...catalog.products.filter((candidate) => (
      candidate.id !== product.id
      && candidate.categorySlug !== product.categorySlug
      && candidate.featured
    )),
    ...catalog.products.filter((candidate) => candidate.id !== product.id),
  ].filter((candidate, index, list) => (
    list.findIndex((item) => item.id === candidate.id) === index
  )).slice(0, 4);
  return <>
    <div className="product-breadcrumb shell"><div className="breadcrumbs"><Link href="/">Home</Link><ChevronRight /><Link href="/products">Products</Link><ChevronRight /><Link href={`/products?category=${product.categorySlug}`}>{product.category}</Link><ChevronRight /><span>{product.name}</span></div></div>
    <CustomizationStudio product={product} configuration={configuration} />
    <ProductEngagement
      currentProductId={product.id}
      categorySlug={product.categorySlug}
      relatedProducts={relatedProducts}
    />
  </>;
}
