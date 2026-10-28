import { NextResponse } from "next/server";

import { apiError } from "@/lib/http";
import { resolveProductTemplateLinks } from "@/lib/product-template-resolution";
import { getStorefrontCatalog, getStorefrontProduct } from "@/lib/runtime-catalog";

export const dynamic = "force-dynamic";

type ProductRouteContext = {
  params: Promise<{ slug: string }>;
};

export async function GET(_request: Request, context: ProductRouteContext) {
  const { slug } = await context.params;
  const product = await getStorefrontProduct(slug);
  if (!product) {
    return apiError(404, "PRODUCT_NOT_FOUND", "The requested product was not found.");
  }

  const catalog = await getStorefrontCatalog();
  const category = catalog.categories.find((item) => item.slug === product.categorySlug);
  const templates = resolveProductTemplateLinks(product).map(({ template }) => template);
  const relatedProducts = catalog.products
    .filter(
      (candidate) =>
        candidate.id !== product.id && candidate.categorySlug === product.categorySlug,
    )
    .slice(0, 4);

  return NextResponse.json(
    { data: product, category, templates, relatedProducts },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
