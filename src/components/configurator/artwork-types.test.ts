import assert from "node:assert/strict";
import test from "node:test";

import {
  getArtworkLayersInRenderOrder,
  insertArtworkBelowText,
  keepArtworkLayerInForeground,
  canAddArtworkLayer,
  constrainArtworkLayerToPolicy,
  normalizeArtworkDocumentToPolicy,
  removePreviewImageLayers,
  sniffArtworkImageMime,
  type ArtworkDocument,
  type ArtworkLayer,
} from "./artwork-types";

const nameLayer: ArtworkLayer = {
  id: "personalization-name",
  type: "text",
  name: "Personalized name",
  x: 10,
  y: 10,
  width: 100,
  height: 30,
  rotation: 0,
  opacity: 1,
  text: "Aashutosh",
};

const imageLayer: ArtworkLayer = {
  id: "uploaded-image",
  type: "image",
  name: "Photo",
  x: 0,
  y: 0,
  width: 200,
  height: 100,
  rotation: 0,
  opacity: 1,
  src: "data:image/png;base64,preview",
};

test("uploaded artwork is inserted below text layers", () => {
  const layers = insertArtworkBelowText([nameLayer], imageLayer);
  assert.deepEqual(layers.map((layer) => layer.id), ["uploaded-image", "personalization-name"]);
});

test("client image sniffing recognizes genuine WEBP headers", () => {
  const header = new TextEncoder().encode("RIFF1234WEBP");
  assert.equal(sniffArtworkImageMime(header), "image/webp");
  assert.equal(sniffArtworkImageMime(new TextEncoder().encode("RIFF1234FAKE")), undefined);
});

test("required personalized name is normalized to the foreground", () => {
  const document: ArtworkDocument = {
    version: 1,
    activeSurfaceId: "primary",
    updatedAt: "2026-10-19T00:00:00.000Z",
    surfaces: [{ id: "primary", label: "Primary", layers: [nameLayer, imageLayer] }],
  };
  const normalized = keepArtworkLayerInForeground(document, "personalization-name");
  assert.deepEqual(normalized.surfaces[0].layers.map((layer) => layer.id), ["uploaded-image", "personalization-name"]);
});

test("preview image uploads are removed from the checkout artwork snapshot", () => {
  const document: ArtworkDocument = {
    version: 1,
    activeSurfaceId: "primary",
    updatedAt: "2026-10-19T00:00:00.000Z",
    surfaces: [{ id: "primary", label: "Primary", layers: [imageLayer, nameLayer] }],
  };

  const sanitized = removePreviewImageLayers(document);
  assert.deepEqual(sanitized.surfaces[0].layers.map((layer) => layer.id), ["personalization-name"]);
  assert.equal(document.surfaces[0].layers.length, 2);
});

test("checkout keeps claimed image assets but strips their local preview", () => {
  const claimedImage: ArtworkLayer = {
    ...imageLayer,
    asset: {
      id: "asset-1",
      claimToken: "claim-token-with-at-least-twenty-characters",
      mimeType: "image/png",
      sizeBytes: 128,
      width: 200,
      height: 100,
      hasTransparency: false,
    },
    sourceWidth: 200,
    sourceHeight: 100,
  };
  const document: ArtworkDocument = {
    version: 1,
    activeSurfaceId: "primary",
    updatedAt: "2026-10-19T00:00:00.000Z",
    surfaces: [{ id: "primary", label: "Primary", layers: [claimedImage, nameLayer] }],
  };

  const sanitized = removePreviewImageLayers(document);
  const persisted = sanitized.surfaces[0].layers[0];
  assert.equal(persisted.type, "image");
  assert.equal(persisted.src, undefined);
  assert.equal(persisted.asset?.id, "asset-1");
  assert.equal(claimedImage.src, imageLayer.src);
});

const policy = {
  maximumElements: 2,
  surfaces: [{
    id: "front",
    label: "Front",
    coordinateSpace: { width: 200, height: 100 },
    printableBounds: { x: 20, y: 10, width: 160, height: 80 },
    text: {
      enabled: true,
      maximumElements: 1,
      permissions: { move: true, resize: true, rotate: false, color: false, font: false },
      geometry: {
        default: { x: 40, y: 30, width: 100, height: 30, rotation: 0 },
        minimumWidth: 30,
        maximumWidth: 160,
        minimumHeight: 20,
        maximumHeight: 80,
        minimumRotation: -10,
        maximumRotation: 10,
      },
      defaultColor: "#112233",
      allowedColors: ["#112233"],
      defaultFontFamily: "sans" as const,
      allowedFontFamilies: ["sans" as const],
      defaultFontSize: 24,
      minimumFontSize: 12,
      maximumFontSize: 36,
      defaultTextAlign: "center" as const,
      allowedTextAlignments: ["left" as const, "center" as const],
    },
    image: {
      enabled: false,
      maximumElements: 0,
      permissions: { move: false, resize: false, rotate: false, color: false, font: false },
      geometry: {
        default: { x: 20, y: 10, width: 80, height: 80, rotation: 0 },
        minimumWidth: 20,
        maximumWidth: 160,
        minimumHeight: 20,
        maximumHeight: 80,
        minimumRotation: 0,
        maximumRotation: 0,
      },
      allowedMimeTypes: [] as Array<"image/png">,
      maximumBytes: 0,
      minimumSourceWidth: 1,
      maximumSourceWidth: 1000,
      minimumSourceHeight: 1,
      maximumSourceHeight: 1000,
      allowedAspectRatios: [],
      aspectRatioTolerance: 0.01,
      allowTransparency: false,
      allowCrop: false,
      required: false,
      approvalRequired: false,
      chargePerImagePaise: 0,
    },
  }],
};

test("editor policy clamps geometry and applies locked text choices", () => {
  const constrained = constrainArtworkLayerToPolicy({
    ...nameLayer,
    x: -500,
    y: 500,
    width: 400,
    height: 90,
    rotation: 90,
    color: "#ffffff",
    fontFamily: "serif",
    fontSize: 100,
    textAlign: "right",
  }, policy.surfaces[0]);

  assert.equal(constrained.rotation, 0);
  assert.equal(constrained.color, "#112233");
  assert.equal(constrained.fontFamily, "sans");
  assert.equal(constrained.fontSize, 24);
  assert.equal(constrained.textAlign, "center");
  assert.ok(constrained.x >= 20);
  assert.ok(constrained.y >= 10);
  assert.ok(constrained.x + constrained.width <= 180);
  assert.ok(constrained.y + constrained.height <= 90);
});

test("editor policy removes prohibited surfaces and respects element limits", () => {
  const document: ArtworkDocument = {
    version: 1,
    activeSurfaceId: "back",
    updatedAt: "2026-10-19T00:00:00.000Z",
    surfaces: [
      { id: "front", label: "Front", layers: [nameLayer, { ...nameLayer, id: "extra" }, imageLayer] },
      { id: "back", label: "Back", layers: [] },
    ],
  };

  const normalized = normalizeArtworkDocumentToPolicy(document, policy);
  assert.equal(normalized.activeSurfaceId, "front");
  assert.deepEqual(normalized.surfaces.map((surface) => surface.id), ["front"]);
  assert.deepEqual(normalized.surfaces[0].layers.map((layer) => layer.id), ["personalization-name"]);
  assert.equal(canAddArtworkLayer(normalized, "front", "text", policy), false);
  assert.equal(canAddArtworkLayer(normalized, "front", "image", policy), false);
});

test("text is always rendered in front of poster images", () => {
  const secondImage = { ...imageLayer, id: "second-image" };
  const caption = { ...nameLayer, id: "caption" };
  const layers = getArtworkLayersInRenderOrder([nameLayer, imageLayer, caption, secondImage]);

  assert.deepEqual(layers.map((layer) => layer.id), [
    "uploaded-image",
    "second-image",
    "personalization-name",
    "caption",
  ]);
});
