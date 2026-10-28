import { NextResponse } from "next/server";

import { queryProducts } from "@/lib/catalog";
import { getStorefrontCatalog } from "@/lib/runtime-catalog";
import { validationError } from "@/lib/http";
import { productQuerySchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = productQuerySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) return validationError(parsed.error);

  const catalog = await getStorefrontCatalog();
  const result = queryProducts(parsed.data, catalog.products);
  return NextResponse.json(
    {
      data: result.items,
      meta: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        pageCount: result.pageCount,
      },
      filters: result.availableFilters,
      categories: catalog.categories,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
