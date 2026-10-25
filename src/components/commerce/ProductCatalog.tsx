"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight, Filter, Search, SlidersHorizontal, X } from "lucide-react";
import { searchCatalog } from "@/lib/catalog";
import { categories, formatPrice, products } from "@/lib/data";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { useScrollReveal } from "@/components/ui/use-scroll-reveal";
import { ProductCard } from "./ProductCard";

type SortOption = "recommended" | "price-low" | "price-high" | "newest";

const sortOptions: SortOption[] = ["recommended", "price-low", "price-high", "newest"];
const catalogPrices = products.map((product) => product.price);
const catalogPriceRange = {
  min: catalogPrices.length ? Math.min(...catalogPrices) : 0,
  max: catalogPrices.length ? Math.max(...catalogPrices) : 0,
};

function isSortOption(value: string | null): value is SortOption {
  return !!value && sortOptions.includes(value as SortOption);
}

export function ProductCatalog({ searchMode = false }: { searchMode?: boolean }) {
  const params = useSearchParams();
  const queryParam = params.get("q") || "";
  const requestedCategory = params.get("category");
  const categoryParam = requestedCategory && categories.some((item) => item.slug === requestedCategory) ? requestedCategory : "all";
  const requestedSort = params.get("sort");
  const sortParam: SortOption = isSortOption(requestedSort) ? requestedSort : "recommended";
  const [query, setQuery] = useState(queryParam);
  const [category, setCategory] = useState(categoryParam);
  const [sort, setSort] = useState<SortOption>(sortParam);
  const [customOnly, setCustomOnly] = useState(false);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [visible, setVisible] = useState(8);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const filterDrawerRef = useRef<HTMLElement>(null);
  const catalogReveal = useScrollReveal<HTMLElement>();

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
    const term = query.trim().toLowerCase();
    const matchingSearchIds = term
      ? new Set(searchCatalog(term, products.length).products.map((product) => product.id))
      : null;
    const list = products.filter((product) => {
      const matchesSearch = !matchingSearchIds || matchingSearchIds.has(product.id);
      const matchesCategory = category === "all" || product.categorySlug === category;
      const matchesCustom = !customOnly || product.customizable;
      const matchesStock = !inStockOnly || product.stockStatus !== "out_of_stock";
      return matchesSearch && matchesCategory && matchesCustom && matchesStock;
    });
    return [...list].sort((a, b) => {
      if (sort === "price-low") return a.price - b.price;
      if (sort === "price-high") return b.price - a.price;
      if (sort === "newest") return Number(b.newArrival) - Number(a.newArrival);
      return Number(b.featured) - Number(a.featured);
    });
  }, [query, category, customOnly, inStockOnly, sort]);

  const selectedCategory = categories.find((item) => item.slug === category);
  const reset = () => { setCategory("all"); setCustomOnly(false); setInStockOnly(false); setQuery(""); setVisible(8); };

  const filters = <>
    <div className="filter-heading"><strong>Filters</strong><button onClick={reset}>Clear all</button></div>
    <div className="filter-group"><h3>Category <ChevronDown /></h3><div className="filter-options"><label><input type="radio" name="category" checked={category === "all"} onChange={() => setCategory("all")} /><span>All products</span><small>{products.length}</small></label>{categories.filter((item) => item.productCount > 0).map((item) => <label key={item.id}><input type="radio" name="category" checked={category === item.slug} onChange={() => { setCategory(item.slug); setVisible(8); }} /><span>{item.shortName}</span><small>{item.productCount}</small></label>)}</div></div>
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
          <div className="catalog-heading"><div><span className="eyebrow">{searchMode ? "Search results" : "The collection"}</span><h1>{searchMode ? (query ? `Results for “${query}”` : "Find something personal") : (selectedCategory?.name || "Thoughtfully made, uniquely yours")}</h1><p>{selectedCategory?.description || "Explore practical personalised products with clear options, transparent pricing and a preview before you order."}</p></div><span className="catalog-count">{results.length} {results.length === 1 ? "product" : "products"}</span></div>
          {searchMode && <div className="catalog-search"><Search /><input aria-label="Search products" value={query} onChange={(event) => { setQuery(event.target.value); setVisible(8); }} placeholder="Search by product, category or SKU" /><button type="button" onClick={() => setQuery("")} aria-label="Clear search"><X /></button></div>}
        </div>
      </section>
      <section className="catalog-section shell">
        <aside className="catalog-sidebar">{filters}</aside>
        <div className="catalog-results">
          <div className="catalog-toolbar">
            <button ref={filterButtonRef} className="mobile-filter" onClick={() => setFiltersOpen(true)}><Filter /> Filters{(category !== "all" || customOnly || inStockOnly) && <span />}</button>
            <div className="active-filters">{category !== "all" && <button onClick={() => setCategory("all")}>{selectedCategory?.shortName} <X /></button>}{customOnly && <button onClick={() => setCustomOnly(false)}>Personalised <X /></button>}{inStockOnly && <button onClick={() => setInStockOnly(false)}>Available <X /></button>}</div>
            <label className="sort-control"><span>Sort by</span><select value={sort} onChange={(event) => setSort(event.target.value as SortOption)}><option value="recommended">Recommended</option><option value="newest">New arrivals</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option></select><ChevronDown /></label>
          </div>
          {results.length > 0 ? <><div className="product-grid catalog-product-grid">{results.slice(0, visible).map((product, index) => <ScrollReveal key={product.id} delayMs={(index % 3) * 60}><ProductCard product={product} /></ScrollReveal>)}</div>{visible < results.length && <div className="load-more"><p>Showing {Math.min(visible, results.length)} of {results.length}</p><span><i style={{ width: `${Math.min(100, visible / results.length * 100)}%` }} /></span><button className="button button-secondary" onClick={() => setVisible((value) => value + 8)}>Load more products</button></div>}</> : <div className="empty-state catalog-empty-state"><Search size={35} /><div role="status" aria-live="polite" aria-atomic="true"><h2>No matches just yet</h2><p>Try a broader phrase or clear a filter. If you have something specific in mind, customer care can help.</p></div><div className="catalog-empty-actions"><button className="button button-primary" onClick={reset}>Clear filters</button><Link className="button button-secondary" href="/contact">Ask customer care</Link></div></div>}
        </div>
      </section>
      {filtersOpen && <div className="filter-drawer-backdrop" onMouseDown={() => setFiltersOpen(false)}><aside ref={filterDrawerRef} className="filter-drawer" role="dialog" aria-modal="true" aria-label="Filter products" onMouseDown={(event) => event.stopPropagation()}><div className="filter-drawer-title"><strong>Filter products</strong><button onClick={() => setFiltersOpen(false)} aria-label="Close filters"><X /></button></div>{filters}<button className="button button-primary button-block" onClick={() => setFiltersOpen(false)}>Show {results.length} products</button></aside></div>}
    </>
  );
}
