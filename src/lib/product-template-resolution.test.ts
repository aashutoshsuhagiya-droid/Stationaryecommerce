import assert from "node:assert/strict";
import test from "node:test";

import { designTemplates, getProductById } from "./data";
import { resolveProductTemplate, resolveProductTemplateLinks } from "./product-template-resolution";

test("explicit live template links override the legacy compatibility list", () => {
  const source = getProductById("prod-everyday-name-slips");
  assert.ok(source);
  const template = {
    ...designTemplates.find((candidate) => candidate.id === "tpl-clean-school")!,
    id: "live-product-template",
    name: "Live product template",
    premiumPrice: 25,
    compatibleProductIds: [source.id],
  };
  const product = {
    ...source,
    templateLinks: [{ template, sortOrder: 3, isDefault: true }],
  };

  const links = resolveProductTemplateLinks(product);
  assert.deepEqual(links.map((link) => link.template.id), ["live-product-template"]);
  assert.equal(resolveProductTemplate(product, "live-product-template")?.premiumPrice, 25);
  assert.equal(resolveProductTemplate(product, "tpl-geo-pop"), undefined);
});

test("an explicit empty live-link list does not silently fall back to demo templates", () => {
  const source = getProductById("prod-everyday-name-slips");
  assert.ok(source);
  assert.deepEqual(resolveProductTemplateLinks({ ...source, templateLinks: [] }), []);
});
