import { categories, products } from "./data";
import type { Category, Product } from "./types";

export type ProductSort =
  | "recommended"
  | "bestselling"
  | "price-asc"
  | "price-desc"
  | "newest"
  | "rating";

export interface ProductQuery {
  category?: string;
  q?: string;
  minPrice?: number;
  maxPrice?: number;
  material?: string;
  size?: string;
  theme?: string;
  customizable?: boolean;
  availability?: "available" | "all";
  sort?: ProductSort;
  page?: number;
  limit?: number;
}

export interface ProductQueryResult {
  items: Product[];
  total: number;
  page: number;
  limit: number;
  pageCount: number;
  availableFilters: {
    materials: string[];
    sizes: string[];
    themes: string[];
    price: { min: number; max: number };
  };
}

const normalize = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-IN")
    .trim();

const searchableProductText = (product: Product) =>
  normalize(
    [
      product.name,
      product.sku,
      product.category,
      product.categorySlug,
      product.shortDescription,
      product.material,
      ...product.tags,
      ...(product.themes ?? []),
    ].join(" "),
  );

const uniqueSorted = (values: string[]) =>
  [...new Set(values)].sort((a, b) => a.localeCompare(b, "en-IN"));

export function queryProducts(query: ProductQuery = {}): ProductQueryResult {
  const q = query.q ? normalize(query.q) : "";
  const material = query.material ? normalize(query.material) : "";
  const size = query.size ? normalize(query.size) : "";
  const theme = query.theme ? normalize(query.theme) : "";

  let filtered = products.filter((product) => {
    if (query.category && product.categorySlug !== query.category) return false;
    if (q && !searchableProductText(product).includes(q)) return false;
    if (typeof query.minPrice === "number" && product.price < query.minPrice) return false;
    if (typeof query.maxPrice === "number" && product.price > query.maxPrice) return false;
    if (material && !normalize(product.material).includes(material)) return false;
    if (size && !(product.sizes ?? []).some((value) => normalize(value) === size)) return false;
    if (theme && !(product.themes ?? []).some((value) => normalize(value) === theme)) return false;
    if (typeof query.customizable === "boolean" && product.customizable !== query.customizable) {
      return false;
    }
    if (
      query.availability === "available" &&
      product.stockStatus === "out_of_stock"
    ) {
      return false;
    }
    return true;
  });

  const sort = query.sort ?? "recommended";
  filtered = [...filtered].sort((a, b) => {
    switch (sort) {
      case "price-asc":
        return a.price - b.price;
      case "price-desc":
        return b.price - a.price;
      case "newest":
        return Number(b.newArrival) - Number(a.newArrival) || a.name.localeCompare(b.name);
      case "rating":
        return (b.rating ?? -1) - (a.rating ?? -1) || (b.reviewCount ?? 0) - (a.reviewCount ?? 0);
      case "bestselling":
        // Replace with aggregated paid-order quantity in the database implementation.
        return Number(b.featured) - Number(a.featured) || a.name.localeCompare(b.name);
      case "recommended":
      default:
        return Number(b.featured) - Number(a.featured) || a.name.localeCompare(b.name);
    }
  });

  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(48, Math.max(1, query.limit ?? 12));
  const total = filtered.length;
  const pageCount = total === 0 ? 0 : Math.ceil(total / limit);
  const start = (page - 1) * limit;
  const allPrices = products.map((product) => product.price);

  return {
    items: filtered.slice(start, start + limit),
    total,
    page,
    limit,
    pageCount,
    availableFilters: {
      materials: uniqueSorted(products.map((product) => product.material)),
      sizes: uniqueSorted(products.flatMap((product) => product.sizes ?? [])),
      themes: uniqueSorted(products.flatMap((product) => product.themes ?? [])),
      price: {
        min: Math.min(...allPrices),
        max: Math.max(...allPrices),
      },
    },
  };
}

function editDistance(left: string, right: string) {
  const rows = left.length + 1;
  const columns = right.length + 1;
  const matrix = Array.from({ length: rows }, () => Array<number>(columns).fill(0));

  for (let row = 0; row < rows; row += 1) matrix[row][0] = row;
  for (let column = 0; column < columns; column += 1) matrix[0][column] = column;

  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + cost,
      );
    }
  }
  return matrix[rows - 1][columns - 1];
}

const productSearchScore = (product: Product, query: string) => {
  const normalizedName = normalize(product.name);
  const searchable = searchableProductText(product);
  if (normalizedName === query) return 100;
  if (normalizedName.startsWith(query)) return 80;
  if (normalizedName.includes(query)) return 60;
  if (searchable.includes(query)) return 40;

  const queryWords = query.split(/\s+/).filter(Boolean);
  const candidateWords = searchable.split(/\s+/).filter(Boolean);
  const fuzzyMatches = queryWords.filter((queryWord) =>
    candidateWords.some(
      (candidate) =>
        queryWord.length >= 4 &&
        Math.abs(candidate.length - queryWord.length) <= 2 &&
        editDistance(candidate, queryWord) <= 2,
    ),
  ).length;
  return fuzzyMatches * 15;
};

export interface SearchResult {
  products: Product[];
  categories: Category[];
  suggestions: string[];
  total: number;
}

export function searchCatalog(rawQuery: string, limit = 8): SearchResult {
  const query = normalize(rawQuery);
  if (!query) {
    return {
      products: [],
      categories: categories.filter((category) => category.featured).slice(0, limit),
      suggestions: ["name slips", "waterproof labels", "school label set"],
      total: 0,
    };
  }

  const scoredProducts = products
    .map((product) => ({ product, score: productSearchScore(product, query) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name));

  const matchingProducts = scoredProducts
    .slice(0, limit)
    .map(({ product }) => product);

  const matchingCategories = categories
    .filter((category) =>
      normalize(`${category.name} ${category.description} ${category.slug}`).includes(query),
    )
    .slice(0, Math.min(4, limit));

  const suggestions = matchingProducts
    .flatMap((product) => [product.name, product.category])
    .filter((value, index, values) => values.indexOf(value) === index)
    .slice(0, 5);

  return {
    products: matchingProducts,
    categories: matchingCategories,
    suggestions,
    total: scoredProducts.length,
  };
}
