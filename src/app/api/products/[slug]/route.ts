import { NextResponse } from "next/server";

import { designTemplates } from "@/lib/data";
import { apiError } from "@/lib/http";
import { getStorefrontCatalog, getStorefrontProduct } from "@/lib/runtime-catalog";

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
  const templates = designTemplates.filter(
    (template) => template.active && product.templateIds.includes(template.id),
  );
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
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    },
  );
}
