import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { CustomizationStudio } from "@/components/commerce/CustomizationStudio";
import { designTemplates, getProductBySlug, products } from "@/lib/data";

export function generateStaticParams() { return products.map((product) => ({ slug: product.slug })); }

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const product = getProductBySlug(slug);
  return product ? { title: product.name, description: product.shortDescription } : { title: "Product not found" };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = getProductBySlug(slug);
  if (!product) notFound();
  const templates = designTemplates.filter((template) => product.templateIds.includes(template.id) && template.active);
  return <>
    <div className="product-breadcrumb shell"><div className="breadcrumbs"><Link href="/">Home</Link><ChevronRight /><Link href="/products">Products</Link><ChevronRight /><Link href={`/products?category=${product.categorySlug}`}>{product.category}</Link><ChevronRight /><span>{product.name}</span></div></div>
    <CustomizationStudio product={product} templates={templates} />
  </>;
}
