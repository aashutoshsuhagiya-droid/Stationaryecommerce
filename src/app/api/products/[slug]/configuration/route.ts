import { NextResponse } from "next/server";

import { apiError } from "@/lib/http";
import { getProductConfigurationBySlug } from "@/lib/product-configuration";

type ConfigurationRouteContext = {
  params: Promise<{ slug: string }>;
};

export async function GET(_request: Request, context: ConfigurationRouteContext) {
  const { slug } = await context.params;
  const configuration = getProductConfigurationBySlug(slug);
  if (!configuration) {
    return apiError(404, "PRODUCT_NOT_FOUND", "The requested product was not found.");
  }

  return NextResponse.json(
    { data: configuration },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
  );
}
