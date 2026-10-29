"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight, Filter, Search, SlidersHorizontal, X } from "lucide-react";
import { categories as initialCategories, formatPrice, products as initialProducts } from "@/lib/data";
import type { Category, Product } from "@/lib/types";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { useScrollReveal } from "@/components/ui/use-scroll-reveal";
import { ProductCard } from "./ProductCard";

type SortOption = "recommended" | "price-low" | "price-high" | "newest";

type CatalogMeta = {
  total: number;
  page: number;
  limit: number;
  pageCount: number;
};

type CatalogPayload = {
  data: Product[];
  meta: CatalogMeta;
  categories: Category[];
};

const sortOptions: SortOption[] = ["recommended", "price-low", "price-high", "newest"];
const catalogPageSize = 48;
const apiSort: Record<SortOption, "recommended" | "price-asc" | "price-desc" | "newest"> = {
  recommended: "recommended",
  "price-low": "price-asc",
  "price-high": "price-desc",
  newest: "newest",
};
const catalogPrices = initialProducts.map((product) => product.price);
const catalogPriceRange = {
  min: catalogPrices.length ? Math.min(...catalogPrices) : 0,
  max: catalogPrices.length ? Math.max(...catalogPrices) : 0,
};

function isSortOption(value: string | null): value is SortOption {
  return !!value && sortOptions.includes(value as SortOption);
}

async function fetchCatalogPage(query: string, page: number, signal: AbortSignal): Promise<CatalogPayload> {
  const queryParams = new URLSearchParams(query);
  queryParams.set("page", String(page));
  const response = await fetch(`/api/products?${queryParams.toString()}`, { cache: "no-store", signal });
  const payload = await response.json() as Partial<CatalogPayload>;
  if (!response.ok || !Array.isArray(payload.data) || !Array.isArray(payload.categories) || !payload.meta) {
    throw new Error("Could not load the product catalogue.");
  }
  return payload as CatalogPayload;
}

export function ProductCatalog({ searchMode = false }: { searchMode?: boolean }) {
  const [catalog, setCatalog] = useState<Product[]>(initialProducts);
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const params = useSearchParams();
  const queryParam = params.get("q") || "";
  const requestedCategory = params.get("category");
  const categoryParam = requestedCategory?.trim() || "all";
  const requestedSort = params.get("sort");
  const sortParam: SortOption = isSortOption(requestedSort) ? requestedSort : "recommended";
  const [query, setQuery] = useState(queryParam);
  const [category, setCategory] = useState(categoryParam);
  const [sort, setSort] = useState<SortOption>(sortParam);
  const [customOnly, setCustomOnly] = useState(false);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [visible, setVisible] = useState(8);
  const [catalogMeta, setCatalogMeta] = useState<CatalogMeta>({
    total: initialProducts.length,
    page: 1,
    limit: catalogPageSize,
    pageCount: Math.ceil(initialProducts.length / catalogPageSize),
  });
  const [loadedQuery, setLoadedQuery] = useState("");
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const filterDrawerRef = useRef<HTMLElement>(null);
  const activeQueryRef = useRef("");
  const loadMoreAbortRef = useRef<AbortController | null>(null);
  const catalogReveal = useScrollReveal<HTMLElement>();

  const catalogQuery = useMemo(() => {
    const queryParams = new URLSearchParams({
      limit: String(catalogPageSize),
      sort: apiSort[sort],
    });
    if (category !== "all") queryParams.set("category", category);
    if (query.trim()) queryParams.set("q", query.trim());
    if (customOnly) queryParams.set("customizable", "true");
    if (inStockOnly) queryParams.set("availability", "available");
    return queryParams.toString();
  }, [category, customOnly, inStockOnly, query, sort]);
  activeQueryRef.current = catalogQuery;

  useEffect(() => {
    const controller = new AbortController();
    loadMoreAbortRef.current?.abort();
    setLoadingMore(false);
    setLoadMoreError(null);
    const timeout = window.setTimeout(() => {
      setLoadingCatalog(true);
      setCatalogError(null);
      fetchCatalogPage(catalogQuery, 1, controller.signal)
        .then((payload) => {
          if (activeQueryRef.current !== catalogQuery) return;
          setCatalog(payload.data);
          setCategories(payload.categories);
          setCatalogMeta(payload.meta);
          setLoadedQuery(catalogQuery);
          setCatalogError(null);
          setVisible(8);
        })
        .catch((cause: unknown) => {
          if (cause instanceof DOMException && cause.name === "AbortError") return;
          const message = cause instanceof Error ? cause.message : "Could not load the product catalogue.";
          setCatalogError(message);
          setCatalog([]);
          setCatalogMeta({ total: 0, page: 1, limit: catalogPageSize, pageCount: 0 });
        })
        .finally(() => {
          if (activeQueryRef.current === catalogQuery) setLoadingCatalog(false);
        });
    }, 180);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [catalogQuery]);

  useEffect(() => {
    setQuery(queryParam);
    setCategory(categoryParam);
    setSort(sortParam);
    setVisible(8);
  }, [queryParam, categoryParam, sortParam]);

  useEffect(() => {
    if (!filtersOpen) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const drawer = filterDrawerRef.current;
    const focusable = drawer?.querySelectorAll<HTMLElement>(
      "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])",
    );
    focusable?.[0]?.focus();
    function handleDialogKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setFiltersOpen(false);
        return;
      }
      if (event.key !== "Tab" || !focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleDialogKeydown);
    return () => {
      document.removeEventListener("keydown", handleDialogKeydown);
      (previouslyFocused ?? filterButtonRef.current)?.focus();
    };
  }, [filtersOpen]);

  const results = useMemo(() => {
    return catalog.filter((product) => {
      const categorySlugs = product.categorySlugs?.length ? product.categorySlugs : [product.categorySlug];
      const matchesCategory = category === "all" || categorySlugs.includes(category);
      const matchesCustom = !customOnly || product.customizable;
      const matchesStock = !inStockOnly || product.stockStatus !== "out_of_stock";
      return matchesCategory && matchesCustom && matchesStock;
    });
  }, [category, customOnly, inStockOnly, catalog]);

  const selectedCategory = categories.find((item) => item.slug === category);
  const reset = () => { setCategory("all"); setCustomOnly(false); setInStockOnly(false); setQuery(""); setVisible(8); };
  const queryIsLoaded = loadedQuery === catalogQuery;
  const totalResults = queryIsLoaded ? catalogMeta.total : results.length;

  const loadMoreProducts = useCallback(async () => {
    if (loadingMore) return;
    const nextVisible = visible + 8;
    if (nextVisible <= results.length || !queryIsLoaded || catalogMeta.page >= catalogMeta.pageCount) {
      setVisible(Math.min(nextVisible, results.length));
      return;
    }
    loadMoreAbortRef.current?.abort();
    const controller = new AbortController();
    loadMoreAbortRef.current = controller;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const payload = await fetchCatalogPage(catalogQuery, catalogMeta.page + 1, controller.signal);
      if (activeQueryRef.current !== catalogQuery) return;
      const seen = new Set(catalog.map((product) => product.id));
      const merged = [...catalog, ...payload.data.filter((product) => !seen.has(product.id))];
      setCatalog(merged);
      setCategories(payload.categories);
      setCatalogMeta(payload.meta);
      setVisible(Math.min(nextVisible, merged.length));
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      const message = cause instanceof Error ? cause.message : "Failed to load additional products.";
      setLoadMoreError(message);
    } finally {
      if (activeQueryRef.current === catalogQuery) setLoadingMore(false);
    }
  }, [catalog, catalogMeta.page, catalogMeta.pageCount, catalogQuery, loadingMore, queryIsLoaded, results.length, visible]);
  const shownResults = Math.min(visible, results.length);

  const filters = <>
    <div className="filter-heading"><strong>Filters</strong><button onClick={reset}>Clear all</button></div>
    <div className="filter-group"><h3>Category <ChevronDown /></h3><div className="filter-options"><label><input type="radio" name="category" checked={category === "all"} onChange={() => setCategory("all")} /><span>All products</span><small>{totalResults}</small></label>{categories.filter((item) => item.productCount > 0).map((item) => <label key={item.id}><input type="radio" name="category" checked={category === item.slug} onChange={() => { setCategory(item.slug); setVisible(8); }} /><span>{item.shortName}</span><small>{item.productCount}</small></label>)}</div></div>
    <div className="filter-group"><h3>Shopping options <ChevronDown /></h3><div className="filter-options"><label><input type="checkbox" checked={customOnly} onChange={(event) => setCustomOnly(event.target.checked)} /><span>Personalised only</span></label><label><input type="checkbox" checked={inStockOnly} onChange={(event) => setInStockOnly(event.target.checked)} /><span>Available to order</span></label></div></div>
    <div className="filter-group"><h3>Current price range <ChevronDown /></h3><div className="price-guide"><div><span style={{ width: "100%" }} /></div><p><span>{formatPrice(catalogPriceRange.min)}</span><span>{formatPrice(catalogPriceRange.max)}</span></p></div></div>
    <div className="filter-help"><SlidersHorizontal /><strong>Can’t find the right format?</strong><p>Tell us what you need and we’ll point you in the right direction.</p><Link href="/contact">Ask customer care →</Link></div>
  </>;

  return (
    <>
      <section
        ref={catalogReveal.ref}
        className={`catalog-hero ${catalogReveal.className}`}
        data-scroll-reveal={catalogReveal.state}
      >
        <div className="shell">
          <div className="breadcrumbs"><Link href="/">Home</Link><ChevronRight />{searchMode ? <span>Search</span> : <span>Products</span>}{selectedCategory && <><ChevronRight /><span>{selectedCategory.shortName}</span></>}</div>
          <div className="catalog-heading"><div><span className="eyebrow">{searchMode ? "Search results" : "The collection"}</span><h1>{searchMode ? (query ? `Results for “${query}”` : "Find something personal") : (selectedCategory?.name || "Thoughtfully made, uniquely yours")}</h1><p>{selectedCategory?.description || "Explore practical personalised products with clear options, transparent pricing and a preview before you order."}</p></div><span className="catalog-count">{totalResults} {results.length === 1 ? "product" : "products"}</span></div>
          {searchMode && <div className="catalog-search"><Search /><input aria-label="Search products" value={query} onChange={(event) => { setQuery(event.target.value); setVisible(8); }} placeholder="Search by product, category or SKU" /><button type="button" onClick={() => setQuery("")} aria-label="Clear search"><X /></button></div>}
        </div>
      </section>
      <section className="catalog-section shell">
        <aside className="catalog-sidebar">{filters}</aside>
        <div className="catalog-results" aria-busy={loadingCatalog}>
          <div className="catalog-toolbar">
            <button ref={filterButtonRef} className="mobile-filter" onClick={() => setFiltersOpen(true)}><Filter /> Filters{(category !== "all" || customOnly || inStockOnly) && <span />}</button>
            <div className="active-filters">{category !== "all" && <button onClick={() => setCategory("all")}>{selectedCategory?.shortName} <X /></button>}{customOnly && <button onClick={() => setCustomOnly(false)}>Personalised <X /></button>}{inStockOnly && <button onClick={() => setInStockOnly(false)}>Available <X /></button>}</div>
            <label className="sort-control"><span>Sort by</span><select value={sort} onChange={(event) => setSort(event.target.value as SortOption)}><option value="recommended">Recommended</option><option value="newest">New arrivals</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option></select><ChevronDown /></label>
          </div>
          {catalogError ? (
            <div className="empty-state catalog-empty-state" role="alert">
              <SlidersHorizontal size={35} />
              <div>
                <h2>Could not load products</h2>
                <p>{catalogError}</p>
              </div>
              <div className="catalog-empty-actions">
                <button
                  className="button button-primary"
                  onClick={() => {
                    setCatalogError(null);
                    setLoadingCatalog(true);
                    const controller = new AbortController();
                    fetchCatalogPage(catalogQuery, 1, controller.signal)
                      .then((payload) => {
                        setCatalog(payload.data);
                        setCategories(payload.categories);
                        setCatalogMeta(payload.meta);
                        setLoadedQuery(catalogQuery);
                        setVisible(8);
                      })
                      .catch((cause) => {
                        if (cause instanceof DOMException && cause.name === "AbortError") return;
                        setCatalogError(cause instanceof Error ? cause.message : "Could not load the product catalogue.");
                      })
                      .finally(() => setLoadingCatalog(false));
                  }}
                  type="button"
                >
                  Try again
                </button>
                <Link className="button button-secondary" href="/contact">Ask customer care</Link>
              </div>
            </div>
          ) : results.length > 0 ? (
            <>
              <div className="product-grid catalog-product-grid">
                {results.slice(0, visible).map((product, index) => (
                  <ScrollReveal key={product.id} delayMs={(index % 3) * 60}>
                    <ProductCard product={product} />
                  </ScrollReveal>
                ))}
              </div>
              {shownResults < totalResults && (
                <div className="load-more">
                  <p>Showing {shownResults} of {totalResults}</p>
                  <span><i style={{ width: `${Math.min(100, shownResults / totalResults * 100)}%` }} /></span>
                  <button className="button button-secondary" disabled={loadingMore} onClick={() => void loadMoreProducts()} type="button">
                    {loadingMore ? "Loading…" : "Load more products"}
                  </button>
                  {loadMoreError && (
                    <p style={{ color: "var(--danger, #c42b3f)", fontSize: "13px", marginTop: "8px" }} role="alert">
                      {loadMoreError} — <button style={{ textDecoration: "underline", background: "none", border: "none", cursor: "pointer", color: "inherit", font: "inherit" }} onClick={() => void loadMoreProducts()} type="button">Retry</button>
                    </p>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="empty-state catalog-empty-state">
              <Search size={35} />
              <div role="status" aria-live="polite" aria-atomic="true">
                <h2>No matches just yet</h2>
                <p>Try a broader phrase or clear a filter. If you have something specific in mind, customer care can help.</p>
              </div>
              <div className="catalog-empty-actions">
                <button className="button button-primary" onClick={reset}>Clear filters</button>
                <Link className="button button-secondary" href="/contact">Ask customer care</Link>
              </div>
            </div>
          )}
        </div>
      </section>
      {filtersOpen && <div className="filter-drawer-backdrop" onMouseDown={() => setFiltersOpen(false)}><aside ref={filterDrawerRef} className="filter-drawer" role="dialog" aria-modal="true" aria-label="Filter products" onMouseDown={(event) => event.stopPropagation()}><div className="filter-drawer-title"><strong>Filter products</strong><button onClick={() => setFiltersOpen(false)} aria-label="Close filters"><X /></button></div>{filters}<button className="button button-primary button-block" onClick={() => setFiltersOpen(false)}>Show {totalResults} products</button></aside></div>}
    </>
  );
}
