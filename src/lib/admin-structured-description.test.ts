import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  formatStructuredDescription,
  parseEzpacBodyHtml,
} from "./admin-structured-description";

interface EzpacExportProduct {
  handle: string;
  body_html: string;
}

const products = (JSON.parse(
  readFileSync(join(process.cwd(), "docs", "research", "ezpac", "products.json"), "utf8"),
) as { products: EzpacExportProduct[] }).products;
const foodTrayHtml = products.find((product) => product.handle === "food-tray")?.body_html;

if (!foodTrayHtml) {
  throw new Error("Expected the Food Tray export fixture.");
}

test("parses the Food Tray export into structured copy", () => {
  assert.deepEqual(parseEzpacBodyHtml(foodTrayHtml), {
    intro: "Custom branded food trays for restaurants, fast food counters, cloud kitchens, and food court businesses. Sturdy, food-safe trays with full-colour custom printing \u2014 your brand logo and design on every tray that reaches your customer. Design in our free 3D studio with live preview. MOQ starts at just 10 pieces with doorstep delivery across India.",
    bestFor: [
      "Fast food restaurants",
      "food courts",
      "cloud kitchens",
      "canteens",
      "stadium food counters",
      "food festival stalls",
    ],
    featureBullets: [
      "food-safe",
      "custom-branding",
      "free-3d-studio",
      "moq-10",
      "doorstep-delivery",
      "shark-tank",
    ],
  });
});

test("returns an empty structured description for empty export copy", () => {
  assert.deepEqual(parseEzpacBodyHtml(""), {});
});

test("formats parsed Food Tray copy back to a plain storefront description", () => {
  const parsed = parseEzpacBodyHtml(foodTrayHtml);
  const formatted = formatStructuredDescription(parsed);

  assert.ok(formatted.startsWith(parsed.intro ?? ""));
  assert.match(formatted, /Best for:/);
});
