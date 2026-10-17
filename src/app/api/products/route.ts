import { NextResponse } from "next/server";

import { queryProducts } from "@/lib/catalog";
import { validationError } from "@/lib/http";
import { productQuerySchema } from "@/lib/validation";

export function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = productQuerySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) return validationError(parsed.error);

  const result = queryProducts(parsed.data);
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
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    },
  );
}
