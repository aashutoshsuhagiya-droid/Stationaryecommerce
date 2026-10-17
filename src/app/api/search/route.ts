import { NextResponse } from "next/server";

import { searchCatalog } from "@/lib/catalog";
import { validationError } from "@/lib/http";
import { searchQuerySchema } from "@/lib/validation";

export function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = searchQuerySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) return validationError(parsed.error);

  const result = searchCatalog(parsed.data.q, parsed.data.limit ?? 8);
  return NextResponse.json(
    {
      query: parsed.data.q,
      data: result.products,
      categories: result.categories,
      suggestions: result.suggestions,
      meta: { total: result.total },
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    },
  );
}
