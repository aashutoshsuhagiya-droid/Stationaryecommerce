import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import ts from "typescript";

import { CATEGORY_LISTING_PLAYBOOK, gstNoteFor, PRINT_OPTION_LIBRARY } from "./category-listing-playbook";
import { photoQualityWarnings, missingSummary } from "./listing-wizard";

/**
 * The listing wizard is written for someone who has never used the admin:
 * no internal words ("starter", "recipe", "source rows", "siblings",
 * "template", "print partner") and no raw 3D model ids in anything they read.
 */
const BANNED = [/\bstarters?\b/i, /\brecipes?\b/i, /\bsource rows?\b/i, /\bsiblings?\b/i, /\btemplates?\b/i, /\bprint partner\b/i, /\bcustomi[sz]e fields?\b/i];
const MODEL_IDS = [
  "label-pack", "waterproof-sheet", "school-kit", "bottle-label", "pencil-set", "geometry-box", "gift-ribbon", "keychain-duo",
  "bulk-grid", "rectangular-box", "square-box", "folding-carton", "mailer-box", "paper-bag", "stand-up-pouch", "product-sleeve",
  "rigid-lid-box", "mailer-envelope", "pyramid-box",
];
/** Attributes whose values are code, not copy. */
const CODE_ATTRIBUTES = new Set(["className", "key", "type", "id", "role", "href", "rel", "target", "accept", "capture", "inputMode", "src", "htmlFor", "aria-controls", "aria-labelledby", "aria-describedby", "aria-current", "loading", "name"]);

const ROOT = join(process.cwd(), "src", "components", "admin");
const FILES = [
  join(ROOT, "QuickListProductWizard.tsx"),
  ...readdirSync(join(ROOT, "listing")).filter((file) => file.endsWith(".tsx")).map((file) => join(ROOT, "listing", file)),
];

/** Every piece of text a user can read: JSX text, copy attributes and string literals with words in them. */
function userFacingStrings(file: string): string[] {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    if (ts.isJsxAttribute(node) && CODE_ATTRIBUTES.has(node.name.getText(source))) return;
    if (ts.isJsxText(node)) {
      const text = node.getText(source).replace(/\s+/g, " ").trim();
      if (text) found.push(text);
    } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      const text = node.text.trim();
      const comparedInCode = ts.isBinaryExpression(node.parent) || ts.isCaseClause(node.parent);
      // Copy has spaces between words; selectors, ids and paths do not read as sentences.
      if (/[A-Za-z]{2,}\s+[A-Za-z]/.test(text) && !/^[./@]/.test(text) && !/[[\]=]/.test(text)) found.push(text);
      // A capitalised single word is a label ("Starter"); a bare model id is a leak unless code compares it.
      else if (/^[A-Z][a-z]+$/.test(text) || (!comparedInCode && MODEL_IDS.includes(text))) found.push(text);
    } else if (ts.isJsxExpression(node) && node.parent && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      // Rendering a model id straight into the page is never allowed.
      assert.ok(!/model3D|productModel/.test(node.getText(source)), `${file}: a raw 3D model id is rendered: ${node.getText(source)}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

test("wizard copy has no internal jargon or model ids", () => {
  const offenders: string[] = [];
  for (const file of FILES) {
    for (const text of userFacingStrings(file)) {
      if (BANNED.some((pattern) => pattern.test(text)) || MODEL_IDS.some((id) => text.includes(id))) {
        offenders.push(`${file.slice(ROOT.length + 1)}: "${text}"`);
      }
    }
  }
  assert.deepEqual(offenders, []);
  assert.ok(FILES.length >= 8, "the wizard and its step components are all checked");
});

test("words the wizard shows from the playbook are plain language too", () => {
  const shown = [
    ...CATEGORY_LISTING_PLAYBOOK.flatMap((recipe) => [recipe.displayName, recipe.benefit, recipe.descriptionTemplate, gstNoteFor(recipe)]),
    ...Object.values(PRINT_OPTION_LIBRARY).flatMap((option) => option.choices),
    ...CATEGORY_LISTING_PLAYBOOK.flatMap((recipe) => Object.values(recipe.printOptionDefaults ?? {}).flatMap((option) => option.choices)),
    ...photoQualityWarnings({ width: 100, height: 100, meanLuma: 0, borderBusyness: 1 }),
    missingSummary(["a photo", "what it is", "a name", "a price"]),
  ];
  const offenders = shown.filter((text) => BANNED.some((pattern) => pattern.test(text)) || MODEL_IDS.some((id) => text.includes(id)));
  assert.deepEqual(offenders, []);
});
