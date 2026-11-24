import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import { normalizeProduct3DDimensions } from "./product-3d-dimensions";
import {
  buildProductGeometry,
  getProductOpenAnimator,
  isOpenableProduct3DKind,
  PRODUCT_LID_NAME,
} from "./product-3d-model";
import {
  isPackagingProduct3DKind,
  PRODUCT_3D_MODEL_PROFILES,
  resolveProduct3DProfile,
  type Product3DKind,
} from "./product-3d-profile";

const FRONT = { id: "front", label: "Front", width: 600, height: 400, safeInset: 24 };

function build(kind: Product3DKind, options: { category?: string; textures?: Map<string, THREE.Texture>; dimensionsMm?: Record<string, number> } = {}) {
  const group = new THREE.Group();
  const theme = resolveProduct3DProfile(kind, options.category ?? "").categoryTheme;
  buildProductGeometry({
    group,
    kind,
    primaryDef: FRONT,
    texture: new THREE.Texture(),
    theme,
    surfaces: [FRONT],
    textures: options.textures ?? new Map(),
    dimensionsMm: options.dimensionsMm,
  });
  return { group, dimensions: normalizeProduct3DDimensions(kind, options.dimensionsMm, FRONT.width / FRONT.height) };
}

const bounds = (object: THREE.Object3D) => new THREE.Box3().setFromObject(object, true);

const BOX_KINDS: ReadonlyArray<{ kind: Product3DKind; category?: string }> = [
  { kind: "folding-carton" },
  { kind: "rectangular-box" },
  { kind: "rectangular-box", category: "shipping-boxes" },
  { kind: "square-box" },
  { kind: "mailer-box" },
  { kind: "rigid-lid-box" },
  { kind: "mailer-envelope" },
];

test("closed hollow boxes keep the outer size of the solid models they replace", () => {
  for (const { kind, category } of BOX_KINDS) {
    const { group, dimensions } = build(kind, { category });
    const size = bounds(group).getSize(new THREE.Vector3());
    const expected = new THREE.Vector3(
      dimensions.width,
      dimensions.height,
      kind === "mailer-envelope" ? Math.max(0.02, dimensions.depth) : dimensions.depth,
    );
    const tolerance = 0.03 * Math.max(expected.x, expected.y, expected.z);
    for (const axis of ["x", "y", "z"] as const) {
      assert.ok(
        Math.abs(size[axis] - expected[axis]) <= tolerance,
        `${kind}${category ? ` (${category})` : ""}: ${axis} is ${size[axis].toFixed(3)}, the solid model was ${expected[axis].toFixed(3)}`,
      );
    }
  }
});

test("opening lifts the lid above the walls, and closing puts it back exactly", () => {
  for (const { kind, category } of BOX_KINDS) {
    const { group, dimensions } = build(kind, { category });
    const animator = getProductOpenAnimator(group);
    assert.ok(animator, `${kind} opens`);
    assert.equal(animator.openness, 0, `${kind} is built closed`);
    const lid = group.getObjectByName(PRODUCT_LID_NAME);
    assert.ok(lid, `${kind} names its lid`);
    const closed = bounds(group);
    const closedLid = bounds(lid);

    animator.apply(1);
    assert.equal(animator.openness, 1);
    const openLid = bounds(lid);
    assert.ok(
      openLid.max.y > closed.max.y + dimensions.height * 0.05,
      `${kind}: the open lid (top ${openLid.max.y.toFixed(3)}) rises above the closed box (${closed.max.y.toFixed(3)})`,
    );

    animator.apply(0);
    const reclosed = bounds(lid);
    assert.ok(reclosed.min.distanceTo(closedLid.min) < 1e-9 && reclosed.max.distanceTo(closedLid.max) < 1e-9, `${kind} closes back to its built pose`);
  }
});

test("openness is clamped and the animator never rebuilds the model", () => {
  const { group } = build("folding-carton");
  const animator = getProductOpenAnimator(group)!;
  const meshes = new Set<THREE.Object3D>();
  group.traverse((object) => { if (object instanceof THREE.Mesh) meshes.add(object); });
  animator.apply(7);
  assert.equal(animator.openness, 1);
  animator.apply(-3);
  assert.equal(animator.openness, 0);
  animator.apply(Number.NaN);
  assert.equal(animator.openness, 0);
  const after = new Set<THREE.Object3D>();
  group.traverse((object) => { if (object instanceof THREE.Mesh) after.add(object); });
  assert.deepEqual([...after], [...meshes], "same meshes before and after animating");
});

test("tucked flaps never swing out through the front wall while a lid opens", () => {
  for (const kind of ["folding-carton", "square-box", "mailer-box", "rigid-lid-box"] as const) {
    const { group } = build(kind);
    const animator = getProductOpenAnimator(group)!;
    const front = bounds(group).max.z;
    const lid = group.getObjectByName(PRODUCT_LID_NAME)!;
    for (let step = 0; step <= 50; step += 1) {
      animator.apply(step / 50);
      const reach = bounds(lid).max.z;
      assert.ok(reach <= front + 1e-6, `${kind} at ${step * 2}% open reaches z=${reach.toFixed(4)} past the front at ${front.toFixed(4)}`);
    }
  }
});

test("the outside of each hollow wall keeps its artwork; the inside is bare board", () => {
  const printed = new THREE.Texture();
  const { group, dimensions } = build("folding-carton", { textures: new Map([["front", printed]]) });
  const walls = group.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh && Array.isArray(child.material));
  const frontWall = walls.find((mesh) => mesh.position.z > dimensions.depth / 2 - dimensions.depth * 0.05 && mesh.position.x === 0);
  assert.ok(frontWall, "front wall exists");
  const maps = (frontWall.material as THREE.MeshPhysicalMaterial[]).map((material) => material.map);
  // BoxGeometry order: right, left, top, bottom, front (+z, outside), back (-z, inside).
  assert.deepEqual(maps, [null, null, null, null, printed, null]);
  let printedFaces = 0;
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    printedFaces += materials.filter((material) => (material as THREE.MeshPhysicalMaterial).map === printed).length;
  });
  assert.equal(printedFaces, 1, "only the front wall's outside carries the front artwork");
});

test("bags, pouches, sleeves and label or school models do not open", () => {
  for (const kind of Object.keys(PRODUCT_3D_MODEL_PROFILES) as Product3DKind[]) {
    const { group } = build(kind);
    const animator = getProductOpenAnimator(group);
    assert.equal(Boolean(animator), isOpenableProduct3DKind(kind), `${kind}: built animator matches the openable list`);
  }
  for (const kind of ["paper-bag", "stand-up-pouch", "product-sleeve", "label-pack", "school-kit", "notebook", "bottle-label"] as const) {
    assert.equal(isOpenableProduct3DKind(kind), false, `${kind} is not openable`);
  }
});

test("rebuilding a group as a model that does not open drops the old animator", () => {
  const group = new THREE.Group();
  const theme = resolveProduct3DProfile("folding-carton").categoryTheme;
  buildProductGeometry({ group, kind: "folding-carton", primaryDef: FRONT, texture: new THREE.Texture(), theme });
  assert.ok(getProductOpenAnimator(group));
  group.clear();
  buildProductGeometry({ group, kind: "paper-bag", primaryDef: FRONT, texture: new THREE.Texture(), theme });
  assert.equal(getProductOpenAnimator(group), null);
});

test("a pyramid is sized by its base edge and apex height; a missing depth follows the width", () => {
  assert.equal(isPackagingProduct3DKind("pyramid-box"), true);
  assert.equal(resolveProduct3DProfile("pyramid-box").label, "Pyramid box");
  assert.equal(resolveProduct3DProfile("", "paan-box").kind, "pyramid-box");

  const noDepth = normalizeProduct3DDimensions("pyramid-box", { width: 80, height: 140 });
  assert.equal(noDepth.depth, noDepth.width, "missing depth means an equilateral base");
  assert.ok(Math.abs(noDepth.height / noDepth.width - 140 / 80) < 1e-9);
  const zeroDepth = normalizeProduct3DDimensions("pyramid-box", { width: 80, height: 140, depth: 0 });
  assert.equal(zeroDepth.depth, zeroDepth.width, "a zero depth is treated as missing");
  const measured = normalizeProduct3DDimensions("pyramid-box", { width: 80, height: 140, depth: 100 });
  assert.ok(Math.abs(measured.depth / measured.width - 100 / 80) < 1e-9, "a measured depth is kept");
  const tooShallow = normalizeProduct3DDimensions("pyramid-box", { width: 80, height: 140, depth: 20 });
  assert.ok(tooShallow.depth >= tooShallow.width * 0.55 - 1e-9, "the base's back edges still close a triangle");
});

test("a pyramid builds three faces over a triangular base, and its front folds down flat", () => {
  const printed = new THREE.Texture();
  const { group, dimensions } = build("pyramid-box", { dimensionsMm: { width: 80, height: 140 }, textures: new Map([["front", printed]]) });
  const closed = bounds(group);
  const size = closed.getSize(new THREE.Vector3());
  assert.ok(Math.abs(size.x - dimensions.width) < 1e-5, "base edge is the width");
  assert.ok(Math.abs(size.y - dimensions.height) < 1e-5, "apex height is the height");
  assert.ok(Math.abs(size.z - dimensions.width * (Math.sqrt(3) / 2)) < 1e-5, "an equilateral base is √3/2 deep, and no inner corner pokes out");

  const meshes: THREE.Mesh[] = [];
  group.traverse((object) => { if (object instanceof THREE.Mesh) meshes.push(object); });
  assert.equal(meshes.length, 4, "front, left, right and base");
  const front = group.getObjectByName(PRODUCT_LID_NAME)!;
  const frontMesh = front.children[0] as THREE.Mesh;
  assert.equal((frontMesh.material as THREE.MeshPhysicalMaterial[])[0].map, printed, "the front face carries the front artwork");
  assert.ok(meshes.filter((mesh) => mesh !== frontMesh).every((mesh) => (mesh.material as THREE.MeshPhysicalMaterial[]).every((material) => material.map === null)), "the other faces are plain board");

  const animator = getProductOpenAnimator(group)!;
  const closedFront = bounds(front);
  animator.apply(1);
  const openFront = bounds(front);
  const slant = Math.hypot(dimensions.height, closedFront.max.z);
  assert.ok(openFront.max.z > closedFront.max.z + slant * 0.9, "the front face lies out in front");
  assert.ok(openFront.max.y < closed.min.y + slant * 0.1, "it lies nearly flat");
  assert.ok(openFront.min.y >= closed.min.y - 1e-6, "and never dips below the base");
});
