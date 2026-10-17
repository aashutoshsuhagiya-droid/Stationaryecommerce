import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/account", "/cart", "/checkout", "/order-confirmation", "/wishlist", "/api/"] }], sitemap: "https://naamly.example/sitemap.xml" };
}
