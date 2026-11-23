import assert from "node:assert/strict";
import test from "node:test";
import { htmlToDescriptionBlocks, htmlToPlainText, productSummaryText } from "./html-text";

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

test("descriptions split into labelled paragraphs and list items without spacer paragraphs", () => {
  const html = "<p><strong>Adorable Design</strong>: Cute figurine – a delightful addition.</p><p><strong>Dimensions</strong> : 18*14*09 cm</p><p><strong>Decorative &amp; Fun</strong>: Doubles as decor.</p><p><br>&nbsp;</p><p>&nbsp;</p><ul><li><strong>Size:</strong> 3x2.5 inches</li><li>Plain item</li></ul>";
  assert.deepEqual(htmlToDescriptionBlocks(html), [
    { kind: "paragraph", label: "Adorable Design", text: "Cute figurine – a delightful addition." },
    { kind: "paragraph", label: "Dimensions", text: "18*14*09 cm" },
    { kind: "paragraph", label: "Decorative & Fun", text: "Doubles as decor." },
    { kind: "item", label: "Size", text: "3x2.5 inches" },
    { kind: "item", text: "Plain item" },
  ]);
});

test("plain-text descriptions stay paragraphs and markup in text is never treated as HTML", () => {
  assert.deepEqual(htmlToDescriptionBlocks("First line.\n\nSecond line."), [{ kind: "paragraph", text: "First line." }, { kind: "paragraph", text: "Second line." }]);
  assert.deepEqual(htmlToDescriptionBlocks("<p>&lt;script&gt;x&lt;/script&gt;</p>"), [{ kind: "paragraph", text: "<script>x</script>" }]);
  assert.deepEqual(htmlToDescriptionBlocks(null), []);
});

test("all-bold bullets split into a short label and text, and spec tables become rows", () => {
  const html = "<p><strong>About this item</strong></p><ul><li><strong>Great Gift Idea: Carry your sipper bottle with style.</strong></li></ul><figure class=\"table\"><table><tbody><tr><td><strong>Brand</strong></td><td><strong>Ranbazaar</strong></td></tr><tr><td>Capacity</td><td>360 ML</td></tr></tbody></table></figure>";
  assert.deepEqual(htmlToDescriptionBlocks(html), [
    { kind: "paragraph", label: "About this item", text: "" },
    { kind: "item", label: "Great Gift Idea", text: "Carry your sipper bottle with style." },
    { kind: "item", label: "Brand", text: "Ranbazaar" },
    { kind: "item", label: "Capacity", text: "360 ML" },
  ]);
});
