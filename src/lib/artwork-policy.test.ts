import assert from "node:assert/strict";
import test from "node:test";

import {
  inspectArtworkImageDataUrl,
  resolveProductArtworkPolicy,
  validateArtworkDocumentPolicy,
} from "./artwork-policy";
import { getProductById } from "./data";
import type {
  ArtworkDocumentSnapshot,
  ArtworkImageAssetReference,
  ArtworkLayerSnapshot,
  ProductArtworkPolicy,
} from "./types";

function policy(): ProductArtworkPolicy {
  return {
    maximumElements: 3,
    surfaces: [{
      id: "front",
      label: "Front",
      coordinateSpace: { width: 500, height: 300 },
      printableBounds: { x: 50, y: 50, width: 400, height: 200 },
      text: {
        enabled: true,
        maximumElements: 2,
        permissions: { move: true, resize: true, rotate: true, color: true, font: true },
        geometry: {
          default: { x: 100, y: 100, width: 120, height: 40, rotation: 0 },
          minimumWidth: 20,
          maximumWidth: 300,
          minimumHeight: 20,
          maximumHeight: 100,
          minimumRotation: -20,
          maximumRotation: 20,
        },
        defaultColor: "#112233",
        allowedColors: ["#112233", "#ffffff"],
        defaultFontFamily: "sans",
        allowedFontFamilies: ["sans", "serif"],
        defaultFontSize: 24,
        minimumFontSize: 12,
        maximumFontSize: 48,
        defaultTextAlign: "center",
        allowedTextAlignments: ["left", "center", "right"],
      },
      image: {
        enabled: true,
        maximumElements: 1,
        permissions: { move: true, resize: true, rotate: true, color: false, font: false },
        geometry: {
          default: { x: 100, y: 75, width: 100, height: 100, rotation: 0 },
          minimumWidth: 20,
          maximumWidth: 300,
          minimumHeight: 20,
          maximumHeight: 180,
          minimumRotation: -15,
          maximumRotation: 15,
        },
        allowedMimeTypes: ["image/png", "image/jpeg"],
        maximumBytes: 1_024,
        minimumSourceWidth: 100,
        maximumSourceWidth: 2_000,
        minimumSourceHeight: 100,
        maximumSourceHeight: 2_000,
        allowedAspectRatios: [1],
        aspectRatioTolerance: 0.02,
        allowTransparency: false,
        allowCrop: false,
        required: false,
        approvalRequired: true,
        chargePerImagePaise: 500,
      },
    }],
  };
}

const textLayer: ArtworkLayerSnapshot = {
  id: "name",
  type: "text",
  name: "Name",
  x: 100,
  y: 100,
  width: 120,
  height: 40,
  rotation: 0,
  opacity: 1,
  text: "Aarav",
  color: "#112233",
  fontSize: 24,
  fontFamily: "sans",
  textAlign: "center",
};

const asset: ArtworkImageAssetReference = {
  id: "asset-1",
  claimToken: "claim-token-at-least-twenty-characters",
  mimeType: "image/png",
  sizeBytes: 512,
  width: 500,
  height: 500,
  hasTransparency: false,
  sha256: "a".repeat(64),
};

const imageLayer: ArtworkLayerSnapshot = {
  id: "photo",
  type: "image",
  name: "Photo",
  x: 100,
  y: 75,
  width: 100,
  height: 100,
  rotation: 0,
  opacity: 1,
  asset,
  sourceWidth: 500,
  sourceHeight: 500,
  imageFit: "contain",
};

function document(layers: ArtworkLayerSnapshot[] = [textLayer]): ArtworkDocumentSnapshot {
  return {
    version: 1,
    activeSurfaceId: "front",
    surfaces: [{ id: "front", label: "Front", layers }],
    updatedAt: "2026-10-27T00:00:00.000Z",
  };
}

test("validates a bounded document and persisted image claim", () => {
  assert.deepEqual(validateArtworkDocumentPolicy(document([textLayer, imageLayer]), policy()), []);
});

test("requires an image only on surfaces configured as mandatory", () => {
  const required = policy();
  required.surfaces[0].image.required = true;
  assert.ok(validateArtworkDocumentPolicy(document([textLayer]), required).some((issue) => issue.code === "REQUIRED_IMAGE_MISSING"));
  assert.equal(validateArtworkDocumentPolicy(document([textLayer, imageLayer]), required).some((issue) => issue.code === "REQUIRED_IMAGE_MISSING"), false);
});

test("enforces allowed surfaces, layer types, and product and surface element limits", () => {
  const invalid = document([
    textLayer,
    { ...textLayer, id: "second" },
    { ...textLayer, id: "third" },
    { ...textLayer, id: "shape", type: "shape" } as unknown as ArtworkLayerSnapshot,
  ]);
  invalid.activeSurfaceId = "back";
  invalid.surfaces.push({ id: "back", label: "Back", layers: [] });
  const codes = validateArtworkDocumentPolicy(invalid, policy()).map((issue) => issue.code);
  assert.ok(codes.includes("ACTIVE_SURFACE_NOT_ALLOWED"));
  assert.ok(codes.includes("SURFACE_NOT_ALLOWED"));
  assert.ok(codes.includes("MAX_ELEMENTS_EXCEEDED"));
  assert.ok(codes.includes("LAYER_TYPE_NOT_ALLOWED"));
});

test("enforces move, resize, rotation, colour, and font locks against defaults", () => {
  const locked = policy();
  locked.surfaces[0].text.permissions = { move: false, resize: false, rotate: false, color: false, font: false };
  const issues = validateArtworkDocumentPolicy(document([{
    ...textLayer,
    x: 101,
    width: 121,
    rotation: 1,
    color: "#ffffff",
    fontFamily: "serif",
  }]), locked);
  assert.deepEqual(
    issues.filter((issue) => issue.code === "LAYER_PROPERTY_LOCKED").map((issue) => issue.property).sort(),
    ["color", "font", "position", "rotation", "size"],
  );
});

test("enforces size, rotation, and rotation-aware printable bounds", () => {
  const issues = validateArtworkDocumentPolicy(document([{
    ...textLayer,
    x: 45,
    width: 10,
    rotation: 30,
  }]), policy());
  const codes = issues.map((issue) => issue.code);
  assert.ok(codes.includes("SIZE_OUT_OF_RANGE"));
  assert.ok(codes.includes("ROTATION_OUT_OF_RANGE"));
  assert.ok(codes.includes("GEOMETRY_OUT_OF_BOUNDS"));
});

test("enforces product-specific font size and alignment policy", () => {
  const issues = validateArtworkDocumentPolicy(document([{
    ...textLayer,
    fontSize: 80,
    textAlign: "right",
  }]), {
    ...policy(),
    surfaces: [{
      ...policy().surfaces[0],
      text: {
        ...policy().surfaces[0].text,
        allowedTextAlignments: ["left", "center"],
      },
    }],
  });
  assert.ok(issues.some((issue) => issue.code === "SIZE_OUT_OF_RANGE" && issue.property === "font"));
  assert.ok(issues.some((issue) => issue.code === "LAYER_PROPERTY_LOCKED" && issue.property === "font"));
});

test("enforces image count, MIME, bytes, dimensions, aspect ratio, transparency, and crop policy", () => {
  const invalidImage: ArtworkLayerSnapshot = {
    ...imageLayer,
    asset: {
      ...asset,
      mimeType: "image/webp",
      sizeBytes: 2_048,
      width: 50,
      height: 200,
      hasTransparency: true,
    },
    imageFit: "cover",
  };
  const issues = validateArtworkDocumentPolicy(document([invalidImage, { ...invalidImage, id: "photo-2" }]), policy());
  const codes = issues.map((issue) => issue.code);
  assert.ok(codes.includes("IMAGE_COUNT_EXCEEDED"));
  assert.ok(codes.includes("IMAGE_MIME_NOT_ALLOWED"));
  assert.ok(codes.includes("IMAGE_BYTES_EXCEEDED"));
  assert.ok(codes.includes("SIZE_OUT_OF_RANGE"));
  assert.ok(codes.includes("LAYER_PROPERTY_LOCKED"));
});

test("recognizes image signatures and measures decoded bytes", () => {
  const dataUrl = (mimeType: string, bytes: number[]) =>
    `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
  const png = inspectArtworkImageDataUrl(dataUrl("image/png", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]));
  const jpeg = inspectArtworkImageDataUrl(dataUrl("image/jpeg", [0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]));
  const webp = inspectArtworkImageDataUrl(dataUrl("image/webp", [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]));
  assert.deepEqual(png, { mimeType: "image/png", bytes: 12 });
  assert.deepEqual(jpeg, { mimeType: "image/jpeg", bytes: 12 });
  assert.deepEqual(webp, { mimeType: "image/webp", bytes: 12 });
  assert.equal(inspectArtworkImageDataUrl(dataUrl("image/png", [0xff, 0xd8, 0xff, 0, 0, 0])), undefined);
});

test("legacy products resolve editable text and blocked order-image defaults", () => {
  const product = getProductById("prod-everyday-name-slips");
  assert.ok(product);
  const resolved = resolveProductArtworkPolicy(product);
  assert.equal(resolved.maximumElements, 100);
  assert.equal(resolved.surfaces[0].text.enabled, true);
  assert.equal(resolved.surfaces[0].text.permissions.move, true);
  assert.equal(resolved.surfaces[0].image.enabled, false);
  assert.equal(resolved.surfaces[0].printableBounds.width > 0, true);
});
