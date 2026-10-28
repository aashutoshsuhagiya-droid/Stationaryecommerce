import assert from "node:assert/strict";
import test from "node:test";

import { buildDefaultAdminArtworkPolicy } from "./admin-artwork-policy";
import { productArtworkPolicySchema } from "./artwork-policy-schema";
import {
  applyRanBazaarCustomizationStarterPolicy,
  getRanBazaarCustomizationStarter,
  listRanBazaarCustomizationStarters,
} from "./ranbazaar-customization-presets";

const EXPECTED_IDS = [
  "name-slips",
  "pen-pencil",
  "notebook",
  "bottle-tiffin",
  "bag-luggage-tag",
  "t-shirt",
  "name-plate",
  "wrapping-paper-vinyl-poster",
] as const;

test("registry exposes eight form-only, price-free starters", () => {
  const starters = listRanBazaarCustomizationStarters();
  assert.deepEqual(starters.map((starter) => starter.id), EXPECTED_IDS);
  assert.equal(new Set(starters.map((starter) => starter.id)).size, starters.length);

  for (const starter of starters) {
    assert.equal("category" in starter, false);
    assert.equal("categoryId" in starter, false);
    assert.equal("productId" in starter, false);
    assert.equal("price" in starter, false);
    assert.equal(new Set(starter.fields.map((field) => field.key)).size, starter.fields.length);
    assert.equal(new Set(starter.surfaces.map((surface) => surface.id)).size, starter.surfaces.length);
    assert.ok(starter.fields.some((field) => field.key === "name"));
    for (const field of starter.fields) {
      assert.equal("priceDelta" in field, false);
      assert.ok(field.options?.every((option) => option.priceDelta === undefined) ?? true);
      if (field.optionSource === "admin_configured") assert.equal(field.options, undefined);
    }
  }
});

test("registry accessors return deep clones", () => {
  const starter = getRanBazaarCustomizationStarter("name-slips");
  assert.ok(starter);
  (starter.fields[0] as { label: string }).label = "Changed";
  (starter.surfaces[0].text.permissions as { move: boolean }).move = false;
  const fontOption = starter.fields.find((field) => field.key === "font")?.options?.[0];
  assert.ok(fontOption);
  (fontOption as { label: string }).label = "Changed font";

  const fresh = getRanBazaarCustomizationStarter("name-slips");
  assert.equal(fresh?.fields[0].label, "Name");
  assert.equal(fresh?.surfaces[0].text.permissions.move, true);
  assert.equal(fresh?.fields.find((field) => field.key === "font")?.options?.[0].label, "Rounded");
});

test("starter policies stay in bounds, preserve the base, and enable usable uploads", () => {
  for (const starter of listRanBazaarCustomizationStarters()) {
    const base = buildDefaultAdminArtworkPolicy(
      starter.surfaces.map((surface) => ({
        id: surface.id,
        label: surface.label,
        widthMm: null,
        heightMm: null,
        safeInsetMm: null,
      })),
      {
        uploadsEnabled: starter.artworkUpload.enabled,
        allowedMimeTypes: starter.artworkUpload.acceptedMimeTypes,
      },
    );
    const before = JSON.stringify(base);
    const policy = applyRanBazaarCustomizationStarterPolicy(base, starter.id);
    assert.equal(JSON.stringify(base), before);
    assert.equal(policy.maximumElements, starter.maximumElements);
    assert.equal(policy.surfaces.length, starter.surfaces.length);
    assert.equal(productArtworkPolicySchema.safeParse(policy).success, true);

    for (const [index, surface] of policy.surfaces.entries()) {
      const preset = starter.surfaces[index];
      assert.equal(surface.id, preset.id);
      assert.ok(Math.abs(
        surface.coordinateSpace.width / surface.coordinateSpace.height - preset.aspectRatio,
      ) < 0.01);
      assert.equal(surface.image.enabled, starter.artworkUpload.enabled && preset.image.enabled);
      assert.equal(surface.image.enabled ? surface.image.maximumBytes > 0 : surface.image.maximumBytes === 0, true);

      for (const geometry of [surface.text.geometry.default, surface.image.geometry.default]) {
        assert.ok(geometry.x >= surface.printableBounds.x);
        assert.ok(geometry.y >= surface.printableBounds.y);
        assert.ok(geometry.x + geometry.width <= surface.printableBounds.x + surface.printableBounds.width);
        assert.ok(geometry.y + geometry.height <= surface.printableBounds.y + surface.printableBounds.height);
      }
    }
  }
});

test("an image starter never inherits a disabled zero-byte upload policy", () => {
  const starter = getRanBazaarCustomizationStarter("notebook");
  assert.ok(starter);
  const disabledBase = buildDefaultAdminArtworkPolicy(
    starter.surfaces.map((surface) => ({
      id: surface.id,
      label: surface.label,
      widthMm: null,
      heightMm: null,
      safeInsetMm: null,
    })),
    { uploadsEnabled: false, allowedMimeTypes: [] },
  );
  const policy = applyRanBazaarCustomizationStarterPolicy(disabledBase, starter.id);
  assert.equal(policy.surfaces[0].image.enabled, true);
  assert.equal(policy.surfaces[0].image.maximumBytes, 2_000_000);
  assert.deepEqual(policy.surfaces[0].image.allowedMimeTypes, starter.artworkUpload.acceptedMimeTypes);
  assert.equal(productArtworkPolicySchema.safeParse(policy).success, true);
});
