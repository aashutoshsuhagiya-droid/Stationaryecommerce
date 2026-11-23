import assert from "node:assert/strict";
import test from "node:test";
import { htmlToPlainText, productSummaryText } from "./html-text";

test("htmlToPlainText flattens tags and decodes entities after stripping", () => {
  assert.equal(htmlToPlainText("<p>Gifts&nbsp;come with features &amp; quality.</p>"), "Gifts come with features & quality.");
  assert.equal(htmlToPlainText("<p>&lt;b&gt; stays literal</p>"), "<b> stays literal");
  assert.equal(htmlToPlainText("<p>a<script>alert(1)</script>b</p>"), "a b");
});

test("admin-typed plain short descriptions are kept unchanged", () => {
  assert.equal(productSummaryText("Short.", "<p>Long description that would otherwise be used.</p>"), "Short.");
});

test("imported HTML short descriptions become plain text", () => {
  assert.equal(
    productSummaryText("<p>HD Printing. Name stickers for Gifts&nbsp;come with excellent features &amp; quality.</p>", null),
    "HD Printing. Name stickers for Gifts come with excellent features & quality.",
  );
});

test("a prose tagline is preferred over attribute bullets", () => {
  const description = "<p><strong>Product Description:</strong></p><ul><li><strong>Material:</strong> Crafted from self-adhesive, high-quality, scratch-proof paper</li></ul><p><strong>Transform Your Collection Today with Our Premium Name Stickers!</strong></p>";
  assert.equal(productSummaryText("<p><strong>Product Description:</strong></p>", description), "Transform Your Collection Today with Our Premium Name Stickers!");
});

test("a heading-only paragraph falls back to the first real sentence of the description", () => {
  const description = "<p><strong>Product Description:</strong></p><ul><li><strong>Size:</strong> 3x2.5 inches</li><li><strong>Material:</strong> Crafted from self-adhesive, high-quality, scratch-proof paper</li></ul>";
  assert.equal(
    productSummaryText("<p><strong>Product Description:</strong></p>", description),
    "Material: Crafted from self-adhesive, high-quality, scratch-proof paper",
  );
});

test("attribute rows are skipped and nothing invented when no sentence exists", () => {
  assert.equal(productSummaryText("<p><strong>Color</strong>: Blue</p>", "<p><strong>Color</strong>: Blue</p>"), "");
  assert.equal(productSummaryText(null, null), "");
});

test("long summaries are truncated on a word boundary", () => {
  const summary = productSummaryText(`<p>${"word ".repeat(100)}</p>`, null, 40);
  assert.ok(summary.length <= 40 && summary.endsWith("…") && !summary.includes("wor…"), summary);
});
