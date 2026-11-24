import assert from "node:assert/strict";
import test from "node:test";

import { listing3DScene } from "../components/admin/listing/listing-3d";
import { getCategoryListingRecipe } from "./category-listing-playbook";

const imageLayerCount = (scene: NonNullable<ReturnType<typeof listing3DScene>>) =>
  scene.document.surfaces.flatMap((surface) => surface.layers).filter((layer) => layer.type === "image").length;

test("the wizard's 3D tab is a plain model at the chosen size, with only the sample name on it", () => {
  for (const slug of ["soap-boxes", "d-cut-paper-bags"]) {
    const recipe = getCategoryListingRecipe(slug);
    assert.equal(recipe?.threeDPath, "template", `${slug} is a photo-made shape`);
    const size = { width: 90, height: 140, depth: 40 };

    const plain = listing3DScene({ recipe, size, printAreas: [], sampleText: "", productName: "" });
    assert.ok(plain, `${slug} has a 3D scene without any photo`);
    assert.equal(imageLayerCount(plain), 0, `${slug}: the photo is never on the model`);
    assert.ok(plain.document.surfaces.every((surface) => surface.layers.length === 0), `${slug}: no text field, nothing printed`);
    assert.equal(plain.surfaces[0].id, "front");

    const named = listing3DScene({ recipe, size, printAreas: [], sampleText: "Aarav", productName: "" });
    assert.ok(named);
    assert.equal(imageLayerCount(named), 0);
    const [front, ...others] = named.document.surfaces;
    assert.deepEqual(front.layers.map((layer) => layer.text), ["Aarav"], `${slug}: the sample sits on the front`);
    assert.ok(others.every((surface) => surface.layers.length === 0));
    const sample = front.layers[0];
    const definition = named.surfaces[0];
    assert.ok(sample.x >= 0 && sample.x + sample.width <= definition.width, "the sample fits across the front");
    assert.ok((sample.fontSize ?? 0) * 0.6 * 5 <= sample.width, "a five-letter name fits on one line");
  }
});
