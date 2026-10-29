import assert from "node:assert/strict";
import test from "node:test";

import {
  isFirstPartyProductImageUrl,
  isCurrentPublicProductImageAsset,
  isProductImageAssetKind,
  productImageAssetEtag,
  productImageAssetUrl,
} from "./product-image-assets";

test("first-party product image references are narrow and deterministic", () => {
  assert.equal(productImageAssetUrl("asset_123"), "/api/product-images/asset_123");
  assert.equal(isFirstPartyProductImageUrl("/api/product-images/asset_123"), true);
  assert.equal(isFirstPartyProductImageUrl("/api/other-assets/asset_123"), false);
  assert.equal(isFirstPartyProductImageUrl("/product-images/asset_123"), false);
  assert.equal(isFirstPartyProductImageUrl("https://example.test/api/product-images/asset_123"), false);
});

test("product image kinds and entity tags are stable", () => {
  assert.equal(isProductImageAssetKind("primary"), true);
  assert.equal(isProductImageAssetKind("surface-base"), true);
  assert.equal(isProductImageAssetKind("source-image"), false);

  const input = { id: "asset_123", sha256: "a".repeat(64), updatedAt: "2026-10-28T00:00:00.000Z" };
  assert.equal(productImageAssetEtag(input), productImageAssetEtag(input));
  assert.notEqual(productImageAssetEtag(input), productImageAssetEtag({ ...input, id: "asset_456" }));
});

test("a primary asset remains public when it is retained as an ordered gallery image", () => {
  const primaryAsset = {
    id: "asset_primary",
    kind: "primary",
    product: {
      images: [
        { url: "/api/product-images/asset_gallery" },
        { url: "/api/product-images/asset_primary" },
      ],
    },
  };

  assert.equal(isCurrentPublicProductImageAsset(primaryAsset), true);
  assert.equal(isCurrentPublicProductImageAsset({ ...primaryAsset, product: { images: [] } }), false);
});
