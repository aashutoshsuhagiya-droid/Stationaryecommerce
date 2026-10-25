import assert from "node:assert/strict";
import test from "node:test";

import {
  getArtworkLayersInRenderOrder,
  insertArtworkBelowText,
  keepArtworkLayerInForeground,
  removePreviewImageLayers,
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
