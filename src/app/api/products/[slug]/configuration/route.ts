import { NextResponse } from "next/server";

import { apiError } from "@/lib/http";
import { buildProductConfiguration } from "@/lib/product-configuration";
import { getStorefrontProduct } from "@/lib/runtime-catalog";

export const dynamic = "force-dynamic";

type ConfigurationRouteContext = {
  params: Promise<{ slug: string }>;
};

export async function GET(_request: Request, context: ConfigurationRouteContext) {
  const { slug } = await context.params;
  const product = await getStorefrontProduct(slug);
  if (!product) {
    return apiError(404, "PRODUCT_NOT_FOUND", "The requested product was not found.");
  }
  const configuration = buildProductConfiguration(product);

  return NextResponse.json(
    { data: configuration },
    { headers: { "Cache-Control": "no-store" } },
  );
}
