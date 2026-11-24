import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

import { neutralPresentationPalette } from "../../lib/data";
import type { PrintableSurfaceDefinition } from "./artwork-types";
import {
  normalizeProduct3DDimensions,
  type Product3DNormalizedDimensions,
} from "./product-3d-dimensions";
import {
  isPackagingProduct3DKind,
  type Product3DKind,
  type Product3DTheme,
} from "./product-3d-profile";
import {
  resolveProduct3DSurfaceId,
  type Product3DSurfaceSlot,
} from "./product-3d-surfaces";

interface ProductGeometryContext {
  group: THREE.Group;
  primaryDef: PrintableSurfaceDefinition;
  surfaces: readonly PrintableSurfaceDefinition[];
  textures: ReadonlyMap<string, THREE.Texture>;
  fallbackTexture: THREE.Texture;
  theme: Product3DTheme;
  dimensions: Product3DNormalizedDimensions;
  textureVariants: THREE.Texture[];
  /** Packaging prints per panel: faces without artwork are plain board. */
  packaging: boolean;
  /** Admin opt-in: the back panel repeats the front design. */
  mirrorBack: boolean;
  /** Openable models register one pose function per hinge set; see `ProductOpenAnimator`. */
  hinges: Array<(openness: number) => void>;
  /** Plain board materials shared by every panel of one build. */
  sharedMaterials: { board?: THREE.MeshPhysicalMaterial; inside?: THREE.MeshPhysicalMaterial };
}

type ProductGeometryBuilder = (context: ProductGeometryContext) => void;

/**
 * Opening packaging in the 3D view.
 *
 * `buildProductGeometry` keeps returning its texture variants; openable models
 * (cartons, boxes, mailers, the pyramid) additionally register an animator for
 * the group they were built into, read back with `getProductOpenAnimator(group)`.
 * `apply(o)` poses every hinge for openness o ∈ [0, 1] — 0 is the closed box
 * (the pose right after a build), 1 is fully open — by turning or sliding
 * pivot groups only, so it is cheap enough to call every frame and never
 * rebuilds geometry. Models that do not open (bags, pouches, sleeves, label
 * and school models) have no animator.
 */
export interface ProductOpenAnimator {
  readonly openable: true;
  /** The openness last applied, 0 closed … 1 open. */
  readonly openness: number;
  apply(openness: number): void;
}

/** Name of the pivot carrying the main opening part: the lid, top flap, envelope flap or pyramid front. */
export const PRODUCT_LID_NAME = "product-lid";

const OPEN_ANIMATORS = new WeakMap<THREE.Object3D, ProductOpenAnimator>();

export function getProductOpenAnimator(group: THREE.Object3D): ProductOpenAnimator | null {
  return OPEN_ANIMATORS.get(group) ?? null;
}

/** Forgets a group's animator, e.g. when its children are disposed. */
export function clearProductOpenAnimator(group: THREE.Object3D): void {
  OPEN_ANIMATORS.delete(group);
}

const OPENABLE_KINDS: ReadonlySet<Product3DKind> = new Set<Product3DKind>([
  "folding-carton", "rectangular-box", "square-box", "mailer-box", "rigid-lid-box",
  "mailer-envelope", "pyramid-box",
]);

/** Whether a model kind opens; the built group's animator is the authority. */
export function isOpenableProduct3DKind(kind: Product3DKind): boolean {
  return OPENABLE_KINDS.has(kind);
}

/** Main lid travel at openness 1. */
const LID_OPEN_ANGLE = THREE.MathUtils.degToRad(120);
/** Dust and minor flaps stand just past upright when open. */
const FLAP_OPEN_ANGLE = THREE.MathUtils.degToRad(100);

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

/** Eased progress of one stage of the opening, so parts move in a believable order. */
function phase(openness: number, start: number, end: number): number {
  const t = clamp01((openness - start) / (end - start));
  return t * t * (3 - 2 * t);
}

function createThemedMaterial(
  theme: Product3DTheme,
  parameters: THREE.MeshPhysicalMaterialParameters = {},
): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: parameters.color ?? theme.baseColor,
    roughness: parameters.roughness ?? theme.roughness,
    metalness: parameters.metalness ?? theme.metalness,
    clearcoat: parameters.clearcoat ?? theme.clearcoat,
    clearcoatRoughness: parameters.clearcoatRoughness ?? theme.clearcoatRoughness,
    iridescence: parameters.iridescence ?? theme.iridescence,
    iridescenceIOR: parameters.iridescenceIOR ?? 1.3,
    ...parameters,
  });
}

function markProductMesh(mesh: THREE.Mesh, receiveShadow = false): void {
  mesh.castShadow = true;
  mesh.receiveShadow = receiveShadow;
}

/**
 * The artwork for a model face, or null when a packaging face has none of its
 * own. Printed label and school models always fall back to the front artwork.
 */
function textureForSurface(
  context: ProductGeometryContext,
  slot: Product3DSurfaceSlot,
): THREE.Texture | null {
  const surfaceId = resolveProduct3DSurfaceId(context.surfaces, slot, {
    packaging: context.packaging,
    mirrorBack: context.mirrorBack,
  });
  const texture = surfaceId ? context.textures.get(surfaceId) : undefined;
  if (texture) return texture;
  return context.packaging ? null : context.fallbackTexture;
}

/** Unprinted board, kraft or film in the packaging's own base colour. */
function boardMaterial(
  context: ProductGeometryContext,
  parameters: THREE.MeshPhysicalMaterialParameters = {},
): THREE.MeshPhysicalMaterial {
  return createThemedMaterial(context.theme, { color: context.theme.baseColor, ...parameters });
}

function printedMaterial(
  context: ProductGeometryContext,
  slot: Product3DSurfaceSlot,
  parameters: THREE.MeshPhysicalMaterialParameters = {},
): THREE.MeshPhysicalMaterial {
  const map = textureForSurface(context, slot);
  if (!map) return boardMaterial(context, parameters);
  return createThemedMaterial(context.theme, {
    color: neutralPresentationPalette.surface,
    map,
    transparent: false,
    opacity: 1,
    depthWrite: true,
    ...parameters,
  });
}

type BoxFace = "right" | "left" | "top" | "bottom" | "front" | "back";

/** BoxGeometry material group order. */
const BOX_FACE_ORDER: readonly BoxFace[] = ["right", "left", "top", "bottom", "front", "back"];

/**
 * A thin wall (a bag panel, a sleeve, a carton lid): only its outside face can
 * carry print. The inside and the cut edges are bare board, so a design never
 * shows through on the inside of a bag or as slivers along its rim.
 */
function panelMaterials(
  context: ProductGeometryContext,
  outside: BoxFace,
  slot: Product3DSurfaceSlot,
): THREE.Material[] {
  const printed = printedMaterial(context, slot);
  const board = boardMaterial(context);
  return BOX_FACE_ORDER.map((face) => (face === outside ? printed : board));
}

const OPPOSITE_FACE: Readonly<Record<BoxFace, BoxFace>> = {
  right: "left",
  left: "right",
  top: "bottom",
  bottom: "top",
  front: "back",
  back: "front",
};

function sharedBoard(context: ProductGeometryContext): THREE.MeshPhysicalMaterial {
  context.sharedMaterials.board ??= boardMaterial(context);
  return context.sharedMaterials.board;
}

/**
 * The unprinted inside of a box: the same board, a shade deeper and drier, so
 * the inside reads as inside once the box is opened. Never carries print.
 */
function sharedInside(context: ProductGeometryContext): THREE.MeshPhysicalMaterial {
  context.sharedMaterials.inside ??= createThemedMaterial(context.theme, {
    color: new THREE.Color(context.theme.baseColor).multiplyScalar(0.94),
    roughness: Math.min(1, Math.max(context.theme.roughness, 0.6) + 0.06),
    clearcoat: 0,
  });
  return context.sharedMaterials.inside;
}

/**
 * One board panel of a hollow box: the outside face keeps the same per-face
 * artwork a solid box had, the inside face is bare board and the cut edges are
 * plain board.
 */
function wallMaterials(
  context: ProductGeometryContext,
  outside: BoxFace,
  slot: Product3DSurfaceSlot | null,
): THREE.Material[] {
  const printed = slot && textureForSurface(context, slot) ? printedMaterial(context, slot) : sharedBoard(context);
  const inside = OPPOSITE_FACE[outside];
  return BOX_FACE_ORDER.map((face) => {
    if (face === outside) return printed;
    return face === inside ? sharedInside(context) : sharedBoard(context);
  });
}

function boxFaceMaterials(
  context: ProductGeometryContext,
  {
    right = "right",
    left = "left",
    top = "top",
    bottom = "bottom",
    front = "front",
    back = "back",
  }: Partial<Record<"right" | "left" | "top" | "bottom" | "front" | "back", Product3DSurfaceSlot>> = {},
): THREE.Material[] {
  // BoxGeometry group order: right, left, top, bottom, front (+z), back (-z).
  return [
    printedMaterial(context, right),
    printedMaterial(context, left),
    printedMaterial(context, top),
    printedMaterial(context, bottom),
    printedMaterial(context, front),
    printedMaterial(context, back),
  ];
}

function addBox(
  context: ProductGeometryContext,
  width: number,
  height: number,
  depth: number,
  materials: THREE.Material | THREE.Material[],
  position: [number, number, number] = [0, 0, 0],
  parent: THREE.Object3D = context.group,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials);
  mesh.position.set(...position);
  markProductMesh(mesh, true);
  parent.add(mesh);
  return mesh;
}

/** A hinge: animation turns or slides this group, never the meshes inside it. */
function addPivot(
  parent: THREE.Object3D,
  position: [number, number, number],
  name?: string,
): THREE.Group {
  const pivot = new THREE.Group();
  pivot.position.set(...position);
  if (name) pivot.name = name;
  parent.add(pivot);
  return pivot;
}

function addMesh(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  materials: THREE.Material | THREE.Material[],
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, materials);
  markProductMesh(mesh, true);
  parent.add(mesh);
  return mesh;
}

/**
 * A board body with slightly rounded edges, so the corners catch light like
 * folded card rather than a CG cube. RoundedBoxGeometry keeps BoxGeometry's
 * six material groups, so per-face artwork still lands on the right panel.
 */
function addBoardBox(
  context: ProductGeometryContext,
  width: number,
  height: number,
  depth: number,
  materials: THREE.Material | THREE.Material[],
  position: [number, number, number] = [0, 0, 0],
): THREE.Mesh {
  const radius = Math.min(Math.max(width, height, depth) * 0.006, Math.min(width, height, depth) * 0.45);
  const geometry = radius > 0.002
    ? new RoundedBoxGeometry(width, height, depth, 2, radius)
    : new THREE.BoxGeometry(width, height, depth);
  const mesh = new THREE.Mesh(geometry, materials);
  mesh.position.set(...position);
  markProductMesh(mesh, true);
  context.group.add(mesh);
  return mesh;
}

/** A barely-there fold line; creases read as shading, never as a dark stripe. */
function creaseMaterial(context: ProductGeometryContext): THREE.MeshPhysicalMaterial {
  const base = new THREE.Color(context.theme.baseColor);
  return createThemedMaterial(context.theme, {
    color: base.clone().multiplyScalar(0.9),
    roughness: Math.max(context.theme.roughness, 0.7),
    clearcoat: 0,
  });
}

function buildLabelPack(context: ProductGeometryContext): void {
  const { width, height, depth } = context.dimensions;
  addBox(context, width, height, depth, boxFaceMaterials(context));
  const backing = createThemedMaterial(context.theme, {
    color: context.theme.tintColor,
    roughness: Math.max(context.theme.roughness, 0.82),
    metalness: 0,
  });
  for (let index = 1; index <= 2; index += 1) {
    addBox(
      context,
      width,
      height,
      Math.max(0.025, depth * 0.34),
      backing,
      [0.02 * index, -0.02 * index, -depth / 2 - 0.018 * index],
    );
  }
}

function buildWaterproofSheet(context: ProductGeometryContext): void {
  const { width, height, depth } = context.dimensions;
  const translucent = context.theme.flags.includes("translucent");
  const backing = createThemedMaterial(context.theme, {
    transparent: translucent,
    opacity: translucent ? 0.82 : 0.96,
    depthWrite: !translucent,
    side: THREE.DoubleSide,
  });
  addBox(context, width, height, Math.max(0.045, depth), backing);

  const stickerGeometry = new THREE.BoxGeometry(width * 0.72, height * 0.21, 0.035);
  const stickerMaterials = boxFaceMaterials(context);
  for (const [index, y] of [-0.28, 0, 0.28].entries()) {
    const sticker = new THREE.Mesh(stickerGeometry, stickerMaterials);
    sticker.position.set(index === 1 ? width * 0.035 : -width * 0.025, y * height, depth / 2 + 0.025);
    sticker.rotation.z = index === 1 ? -0.035 : 0.025;
    markProductMesh(sticker);
    context.group.add(sticker);
  }
}

function buildSchoolKit(context: ProductGeometryContext): void {
  const { width, height, depth } = context.dimensions;
  const tray = createThemedMaterial(context.theme, {
    color: context.theme.tintColor,
    roughness: 0.84,
    metalness: 0,
  });
  addBox(context, width, height, Math.max(0.06, depth), tray, [0, 0, -depth * 0.55]);
  const formats = [
    { width: 0.65, height: 0.23, x: 0, y: 0.28, rotation: -0.025 },
    { width: 0.44, height: 0.34, x: -0.18, y: -0.2, rotation: 0.035 },
    { width: 0.32, height: 0.42, x: 0.26, y: -0.2, rotation: -0.045 },
  ];
  const labelMaterials = boxFaceMaterials(context);
  for (const format of formats) {
    const label = new THREE.Mesh(
      new THREE.BoxGeometry(width * format.width, height * format.height, 0.045),
      labelMaterials,
    );
    label.position.set(width * format.x, height * format.y, 0.02);
    label.rotation.z = format.rotation;
    markProductMesh(label);
    context.group.add(label);
  }
}

function buildNotebook(context: ProductGeometryContext): void {
  const { width, height, depth } = context.dimensions;
  addBox(context, width, height, depth, boxFaceMaterials(context));
  const band = addBox(
    context,
    width * 0.075,
    height + 0.02,
    depth + 0.018,
    createThemedMaterial(context.theme, { color: context.theme.accentColor, roughness: 0.4 }),
  );
  band.position.x = -width * 0.35;
}

function buildBottleLabel(context: ProductGeometryContext): void {
  const { diameter, height, labelHeight, labelWidth } = context.dimensions;
  const radius = diameter / 2;
  const segments = 48;
  const bottle = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, segments),
    createThemedMaterial(context.theme, {
      roughness: Math.min(context.theme.roughness, 0.28),
      metalness: Math.max(context.theme.metalness, 0.18),
    }),
  );
  markProductMesh(bottle, true);
  context.group.add(bottle);

  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.62, radius * 0.68, height * 0.16, 32),
    createThemedMaterial(context.theme, {
      color: context.theme.accentColor,
      roughness: 0.4,
      metalness: 0.2,
    }),
  );
  cap.position.y = height * 0.58;
  markProductMesh(cap);
  context.group.add(cap);

  const arc = Math.min(Math.PI * 2, Math.max(Math.PI * 0.45, labelWidth / radius));
  const label = new THREE.Mesh(
    new THREE.CylinderGeometry(radius + 0.008, radius + 0.008, labelHeight, segments, 1, true, -arc / 2, arc),
    printedMaterial(context, "label", { side: THREE.DoubleSide }),
  );
  label.position.y = -height * 0.04;
  markProductMesh(label);
  context.group.add(label);
}

function buildPencilSet(context: ProductGeometryContext): void {
  const pencilLength = context.dimensions.height;
  const pencilRadius = Math.max(0.07, context.dimensions.width / 9);
  const pencilTexture = (textureForSurface(context, "front") ?? context.fallbackTexture).clone();
  pencilTexture.center.set(0.5, 0.5);
  pencilTexture.rotation = Math.PI / 2;
  pencilTexture.needsUpdate = true;
  context.textureVariants.push(pencilTexture);

  const pencilMaterial = createThemedMaterial(context.theme, { metalness: 0 });
  const pencilPrintMaterial = createThemedMaterial(context.theme, {
    color: neutralPresentationPalette.surface,
    map: pencilTexture,
  });
  const ferruleMaterial = createThemedMaterial(context.theme, {
    color: context.theme.accentColor,
    metalness: 0.8,
    roughness: 0.3,
  });
  const eraserMaterial = createThemedMaterial(context.theme, {
    color: context.theme.tintColor,
    roughness: 0.9,
    metalness: 0,
  });
  const pencilGeometry = new THREE.CylinderGeometry(pencilRadius, pencilRadius, pencilLength, 6);
  for (let index = -1; index <= 1; index += 1) {
    const pencil = new THREE.Mesh(pencilGeometry, pencilMaterial);
    pencil.position.x = index * pencilRadius * 2.7;
    pencil.rotation.z = index * 0.04;
    markProductMesh(pencil);
    context.group.add(pencil);
    const ferrule = new THREE.Mesh(
      new THREE.CylinderGeometry(pencilRadius * 1.02, pencilRadius * 1.02, pencilLength * 0.075, 16),
      ferruleMaterial,
    );
    ferrule.position.y = pencilLength * 0.54;
    pencil.add(ferrule);
    const eraser = new THREE.Mesh(
      new THREE.CylinderGeometry(pencilRadius * 0.98, pencilRadius * 0.98, pencilLength * 0.08, 16),
      eraserMaterial,
    );
    eraser.position.y = pencilLength * 0.615;
    pencil.add(eraser);
    if (index === 0) {
      const strip = new THREE.Mesh(
        new THREE.PlaneGeometry(pencilRadius * 2, pencilLength * 0.64),
        pencilPrintMaterial,
      );
      strip.position.set(0, -pencilLength * 0.04, pencilRadius + 0.006);
      pencil.add(strip);
    }
  }
}

function buildGeometryBox(context: ProductGeometryContext): void {
  const { width, height, depth } = context.dimensions;
  addBox(context, width, height, depth, boxFaceMaterials(context));
  const seam = addBox(
    context,
    width * 1.01,
    Math.max(0.02, height * 0.025),
    depth * 1.02,
    createThemedMaterial(context.theme, {
      color: context.theme.accentColor,
      metalness: 0.7,
      roughness: 0.35,
    }),
  );
  seam.position.y = -height * 0.38;
}

function buildGiftRibbon(context: ProductGeometryContext): void {
  const { width, height, depth } = context.dimensions;
  addBox(context, width, height, depth, boxFaceMaterials(context));
  const ribbon = createThemedMaterial(context.theme, {
    color: context.theme.accentColor,
    roughness: 0.3,
    metalness: 0.12,
  });
  addBox(context, width * 0.16, height + 0.018, depth + 0.03, ribbon);
  addBox(context, width + 0.018, height * 0.16, depth + 0.035, ribbon);
  const bowGeometry = new THREE.TorusGeometry(Math.min(width, depth) * 0.16, 0.045, 10, 28);
  for (const side of [-1, 1]) {
    const loop = new THREE.Mesh(bowGeometry, ribbon);
    loop.scale.set(1, 0.58, 1);
    loop.position.set(side * width * 0.11, height / 2 + 0.12, 0);
    loop.rotation.y = side * 0.38;
    markProductMesh(loop);
    context.group.add(loop);
  }
}

function buildKeychainDuo(context: ProductGeometryContext): void {
  const { width, height, depth } = context.dimensions;
  const translucent = context.theme.flags.includes("translucent");
  const hardware = createThemedMaterial(context.theme, {
    color: context.theme.accentColor,
    metalness: 0.9,
    roughness: 0.2,
  });
  const tagWidth = width * 0.44;
  const materials = boxFaceMaterials(context);
  for (const side of [-1, 1]) {
    const tag = new THREE.Mesh(new THREE.BoxGeometry(tagWidth, height, depth), materials);
    tag.position.set(side * width * 0.29, side * height * 0.09, 0);
    tag.rotation.z = side * -0.08;
    tag.material = Array.isArray(tag.material)
      ? tag.material.map((material) => {
          const physical = material as THREE.MeshPhysicalMaterial;
          physical.transparent = translucent;
          physical.opacity = translucent ? 0.82 : 1;
          return physical;
        })
      : tag.material;
    markProductMesh(tag);
    context.group.add(tag);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(height * 0.18, Math.max(0.02, depth * 0.45), 12, 30),
      hardware,
    );
    ring.position.set(side * width * 0.56, side * height * 0.09, 0);
    markProductMesh(ring);
    context.group.add(ring);
  }
}

function buildTag(context: ProductGeometryContext): void {
  const { width, height, depth } = context.dimensions;
  addBox(context, width, height, depth, boxFaceMaterials(context));
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(width * 0.11, Math.max(0.02, depth * 0.55), 16, 32),
    createThemedMaterial(context.theme, {
      color: context.theme.accentColor,
      metalness: 0.9,
      roughness: 0.2,
    }),
  );
  ring.position.set(0, height / 2 + width * 0.08, 0);
  markProductMesh(ring);
  context.group.add(ring);
}

function buildBulkGrid(context: ProductGeometryContext): void {
  const { width, height, depth } = context.dimensions;
  addBox(
    context,
    width,
    height,
    depth,
    createThemedMaterial(context.theme, {
      color: context.theme.baseColor,
      roughness: Math.max(context.theme.roughness, 0.76),
      metalness: 0,
    }),
    [0, 0, -depth * 0.55],
  );
  const labelGeometry = new THREE.BoxGeometry(width * 0.2, height * 0.13, 0.035);
  const labelMaterials = boxFaceMaterials(context);
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      const label = new THREE.Mesh(labelGeometry, labelMaterials);
      label.position.set((column - 1) * width * 0.29, (1.5 - row) * height * 0.21, 0);
      markProductMesh(label);
      context.group.add(label);
    }
  }
}

/** Board thickness in scene units: thin enough to read as card, never invisible. */
function boardThickness(context: ProductGeometryContext): number {
  const { width, depth } = context.dimensions;
  return Math.max(0.006, Math.min(width, depth) * 0.012);
}

/**
 * Lid materials: the lip band around a lid is plain board — it is not the box's
 * front panel — and the lid top carries artwork only when a top panel exists.
 * The underside is the bare inside of the board.
 */
function lidMaterials(context: ProductGeometryContext): THREE.Material[] {
  return wallMaterials(context, "top", "top");
}

/** Clearance between a tucked flap and the wall it slides behind. */
function tuckGap(thickness: number): number {
  return thickness * 0.3;
}

/**
 * The deepest flap that can hang from the front edge of a lid hinged at the
 * back without its tip swinging out through the front wall while the lid
 * opens: the tip's arc around the back hinge must stay inside the box front.
 */
function safeFrontFlapDepth(depth: number, clearance: number): number {
  const inset = Math.max(0, depth - clearance);
  return Math.sqrt(Math.max(0, depth * depth - inset * inset)) * 0.9;
}

interface OpenBodyOptions {
  width: number;
  depth: number;
  /** Height of the front and back walls. */
  wallHeight: number;
  /** World y of the underside of the box. */
  baseY: number;
  thickness: number;
  /** The side walls stop this much lower (four-flap cartons rest their minor flaps there). */
  sideDrop?: number;
}

/**
 * A hollow box body from thin board: front and back walls the full width,
 * side walls between them and a floor between all four. Each outside face
 * keeps the solid box's artwork mapping; the inside is bare board. Hairline
 * clearances keep touching faces from fighting in the depth buffer.
 */
function addOpenBody(
  context: ProductGeometryContext,
  { width, depth, wallHeight, baseY, thickness: t, sideDrop = 0 }: OpenBodyOptions,
): void {
  const seam = t * 0.04;
  const frontY = baseY + wallHeight / 2;
  addBox(context, width, wallHeight, t, wallMaterials(context, "front", "front"), [0, frontY, depth / 2 - t / 2]);
  addBox(context, width, wallHeight, t, wallMaterials(context, "back", "back"), [0, frontY, -depth / 2 + t / 2]);
  const sideHeight = wallHeight - sideDrop;
  const sideY = baseY + sideHeight / 2;
  const innerDepth = depth - 2 * t - seam * 2;
  addBox(context, t, sideHeight, innerDepth, wallMaterials(context, "left", "left"), [-width / 2 + t / 2, sideY, 0]);
  addBox(context, t, sideHeight, innerDepth, wallMaterials(context, "right", "right"), [width / 2 - t / 2, sideY, 0]);
  addBox(
    context,
    width - 2 * t - seam * 2,
    t,
    innerDepth - seam * 2,
    wallMaterials(context, "bottom", "bottom"),
    [0, baseY + t / 2, 0],
  );
}

/**
 * A flat trapezoid of board (dust flaps, lid ears). Local frame: the hinge runs
 * along z through the origin, the flap reaches out along +x and the board's
 * thickness lies below y = 0.
 */
function trapezoidFlapGeometry(
  hingeLength: number,
  reach: number,
  tipLength: number,
  thickness: number,
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, -hingeLength / 2);
  shape.lineTo(reach, -tipLength / 2);
  shape.lineTo(reach, tipLength / 2);
  shape.lineTo(0, hingeLength / 2);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  // Shape x → x, shape y → z, extrusion → -y.
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

/** Squeezes the +y face's texture rows into [vStart, vEnd], so two flaps share one top print. */
function remapTopFaceRows(geometry: THREE.BoxGeometry, vStart: number, vEnd: number): void {
  const uv = geometry.getAttribute("uv");
  const index = geometry.getIndex();
  const top = geometry.groups[2];
  if (!index || !top) return;
  const vertices = new Set<number>();
  for (let item = top.start; item < top.start + top.count; item += 1) vertices.add(index.getX(item));
  for (const vertex of vertices) uv.setY(vertex, vStart + uv.getY(vertex) * (vEnd - vStart));
  uv.needsUpdate = true;
}

interface TuckTopOptions {
  width: number;
  depth: number;
  /** World y of the wall tops the closure rests on. */
  topY: number;
  thickness: number;
  /** Height of the walls, which bounds how deep the tuck flap may hang. */
  wallHeight: number;
}

/**
 * A tuck-end closure: the top panel is hinged along the back top edge, a tuck
 * flap hinged at its front edge slides down behind the front wall, and two
 * trapezoid dust flaps hinged at the side-wall tops lie folded in beneath it.
 * Opening lifts the panel to 120°, then unfolds the tuck and raises the dust flaps.
 */
function addTuckTopClosure(
  context: ProductGeometryContext,
  { width: w, depth: d, topY, thickness: t, wallHeight }: TuckTopOptions,
): void {
  const gap = tuckGap(t);
  const lid = addPivot(context.group, [0, topY, -d / 2], PRODUCT_LID_NAME);
  addBox(context, w, t, d, lidMaterials(context), [0, t / 2, d / 2], lid);

  // Barely-there fold lines at the hinge and the tuck fold travel with the panel.
  const crease = creaseMaterial(context);
  const lineDepth = Math.max(0.003, d * 0.018);
  addBox(context, w * 0.98, t * 0.35, lineDepth, crease, [0, t, lineDepth], lid);
  addBox(context, w * 0.94, t * 0.35, lineDepth, crease, [0, t, d - lineDepth * 3], lid);

  const tuckDepth = Math.max(t * 2, Math.min(safeFrontFlapDepth(d, t + gap), wallHeight * 0.3));
  const tuck = addPivot(lid, [0, 0, d - t - gap]);
  addBox(context, w - 2 * t - 2 * gap, t, tuckDepth, sharedBoard(context), [0, -t / 2, tuckDepth / 2], tuck);

  const hingeLength = (d - 2 * t) * 0.9;
  const reach = Math.min((w - 2 * t) * 0.45, (d - 2 * t) * 0.75);
  const dustGeometry = trapezoidFlapGeometry(hingeLength, reach, hingeLength * 0.55, t);
  const leftDust = addPivot(context.group, [-w / 2 + t, topY, 0]);
  addMesh(leftDust, dustGeometry, sharedBoard(context));
  const rightDust = addPivot(context.group, [w / 2 - t, topY, 0]);
  addMesh(rightDust, dustGeometry.clone().rotateY(Math.PI), sharedBoard(context));

  context.hinges.push((openness) => {
    lid.rotation.x = -LID_OPEN_ANGLE * phase(openness, 0, 0.7);
    // Folded straight down behind the front wall when closed; nearly in line with the panel when open.
    tuck.rotation.x = Math.PI / 2 - (Math.PI / 2 - 0.22) * phase(openness, 0.25, 0.85);
    const dust = FLAP_OPEN_ANGLE * phase(openness, 0.45, 1);
    leftDust.rotation.z = dust;
    rightDust.rotation.z = -dust;
  });
}

/**
 * A regular slotted carton top: two major flaps hinged at the front and back
 * top edges meet at the centre over two minor flaps hinged at the side tops.
 * A top print is shared across the two major flaps. Corrugated cartons carry
 * packing tape over the seam, split between the flaps so it parts on opening.
 */
function addFourFlapTop(
  context: ProductGeometryContext,
  { width: w, depth: d, topY, thickness: t, height }: { width: number; depth: number; topY: number; thickness: number; height: number },
): void {
  const gap = tuckGap(t);
  const majorReach = d / 2 - gap / 2;
  const majorY = topY - t;
  const minorY = topY - 2 * t;

  const front = addPivot(context.group, [0, majorY, d / 2], PRODUCT_LID_NAME);
  const frontGeometry = new THREE.BoxGeometry(w, t, majorReach);
  remapTopFaceRows(frontGeometry, 0, 0.5);
  addMesh(front, frontGeometry, wallMaterials(context, "top", "top")).position.set(0, t / 2, -majorReach / 2);

  const back = addPivot(context.group, [0, majorY, -d / 2]);
  const backGeometry = new THREE.BoxGeometry(w, t, majorReach);
  remapTopFaceRows(backGeometry, 0.5, 1);
  addMesh(back, backGeometry, wallMaterials(context, "top", "top")).position.set(0, t / 2, majorReach / 2);

  const minorReach = Math.min(d / 2, (w - 2 * t) / 2) * 0.96;
  const minorLength = d - 2 * t - 2 * gap;
  const left = addPivot(context.group, [-w / 2, minorY, 0]);
  addBox(context, minorReach, t, minorLength, wallMaterials(context, "top", null), [minorReach / 2, t / 2, 0], left);
  const right = addPivot(context.group, [w / 2, minorY, 0]);
  addBox(context, minorReach, t, minorLength, wallMaterials(context, "top", null), [-minorReach / 2, t / 2, 0], right);

  if (context.theme.flags.includes("corrugated")) {
    const tapeThickness = Math.max(0.003, t * 0.4);
    const tapeWidth = Math.min(w * 0.2, 0.2);
    const drop = height * 0.2;
    const tape = createThemedMaterial(context.theme, {
      color: "#b98d58",
      roughness: 0.34,
      clearcoat: 0.45,
      clearcoatRoughness: 0.2,
      metalness: 0,
    });
    addBox(context, tapeWidth, tapeThickness, majorReach, tape, [0, t + tapeThickness / 2, -majorReach / 2], front);
    addBox(context, tapeWidth, tapeThickness, majorReach, tape, [0, t + tapeThickness / 2, majorReach / 2], back);
    // Over each flap's folded edge, then down the wall; the wall part stays put when the flaps open.
    addBox(context, tapeWidth, t + tapeThickness, tapeThickness, tape, [0, (t + tapeThickness) / 2, tapeThickness / 2], front);
    addBox(context, tapeWidth, t + tapeThickness, tapeThickness, tape, [0, (t + tapeThickness) / 2, -tapeThickness / 2], back);
    const wallDrop = Math.max(0.001, drop - t);
    for (const side of [1, -1]) {
      addBox(
        context,
        tapeWidth,
        wallDrop,
        tapeThickness,
        tape,
        [0, majorY - wallDrop / 2, side * (d / 2 + tapeThickness / 2)],
      );
    }
  }

  context.hinges.push((openness) => {
    const major = LID_OPEN_ANGLE * phase(openness, 0, 0.65);
    front.rotation.x = major;
    back.rotation.x = -major;
    // The minor flaps wait until the major flaps lean out past upright.
    const minor = FLAP_OPEN_ANGLE * phase(openness, 0.55, 1);
    left.rotation.z = minor;
    right.rotation.z = -minor;
  });
}

/**
 * Shipping cartons are regular slotted cartons (four top flaps, tape over the
 * seam when corrugated); other rectangular boxes close with a tuck-end top.
 */
function buildRectangularBox(context: ProductGeometryContext): void {
  const { width, height, depth } = context.dimensions;
  const thickness = boardThickness(context);
  if (context.theme.flags.includes("corrugated")) {
    addOpenBody(context, { width, depth, wallHeight: height - thickness, baseY: -height / 2, thickness, sideDrop: thickness });
    addFourFlapTop(context, { width, depth, topY: height / 2, thickness, height });
    return;
  }
  buildTuckTopBox(context);
}

/** A tuck-end box whose closure sits inside the model's height. */
function buildTuckTopBox(context: ProductGeometryContext): void {
  const { width, height, depth } = context.dimensions;
  const thickness = boardThickness(context);
  const wallHeight = height - thickness;
  addOpenBody(context, { width, depth, wallHeight, baseY: -height / 2, thickness });
  addTuckTopClosure(context, { width, depth, topY: -height / 2 + wallHeight, thickness, wallHeight });
}

function buildSquareBox(context: ProductGeometryContext): void {
  buildTuckTopBox(context);
}

/**
 * A tuck-end folding carton: a thin top panel hinged at the back edge sits
 * flush on the walls with its tuck flap folded in behind the front, dust flaps
 * folded in beneath it, and the manufacturer's glue flap shows as a faint seam
 * down one side.
 */
function buildFoldingCarton(context: ProductGeometryContext): void {
  const { width, height, depth } = context.dimensions;
  const thickness = boardThickness(context);
  addOpenBody(context, { width, depth, wallHeight: height, baseY: -height / 2, thickness });
  addTuckTopClosure(context, { width, depth, topY: height / 2, thickness, wallHeight: height });

  const crease = creaseMaterial(context);
  const glueFlapWidth = Math.max(0.004, depth * 0.07);
  addBox(
    context,
    Math.max(0.002, thickness * 0.3),
    height * 0.97,
    glueFlapWidth,
    crease,
    [width / 2 + Math.max(0.001, thickness * 0.15), 0, -depth / 2 + glueFlapWidth / 2],
  );
}

/**
 * A roll-end tuck-front mailer: an open tray whose lid is hinged along the back
 * top edge. The lid's front tuck and side ears stay folded down inside the
 * walls, so opening swings the whole lid back to 120°.
 */
function buildMailerBox(context: ProductGeometryContext): void {
  const { width: w, height: h, depth: d } = context.dimensions;
  const t = boardThickness(context);
  const gap = tuckGap(t);
  const wallHeight = h - t;
  addOpenBody(context, { width: w, depth: d, wallHeight, baseY: -h / 2, thickness: t });

  const lid = addPivot(context.group, [0, -h / 2 + wallHeight, -d / 2], PRODUCT_LID_NAME);
  addBox(context, w, t, d, lidMaterials(context), [0, t / 2, d / 2], lid);
  const crease = creaseMaterial(context);
  const creaseDepth = Math.max(0.004, d * 0.02);
  addBox(context, w * 0.98, Math.max(0.003, t * 0.35), creaseDepth, crease, [0, t, creaseDepth / 2], lid);

  const innerHeight = wallHeight - t;
  const tuckDepth = Math.max(t * 2, Math.min(safeFrontFlapDepth(d, t + gap), innerHeight * 0.9));
  const tuck = addPivot(lid, [0, 0, d - t - gap]);
  tuck.rotation.x = Math.PI / 2;
  addBox(context, w - 2 * t - 2 * gap, t, tuckDepth, sharedBoard(context), [0, -t / 2, tuckDepth / 2], tuck);

  const earHinge = (d - 2 * t) * 0.92;
  const earDepth = Math.max(t * 2, Math.min(innerHeight * 0.75, d * 0.5));
  // Built reaching along +x, then turned to hang down with the board on the inner side.
  const earGeometry = trapezoidFlapGeometry(earHinge, earDepth, earHinge * 0.6, t).rotateZ(-Math.PI / 2);
  const leftEar = addPivot(lid, [-(w / 2 - t - gap), 0, d / 2]);
  addMesh(leftEar, earGeometry.clone().translate(t, 0, 0), sharedBoard(context));
  const rightEar = addPivot(lid, [w / 2 - t - gap, 0, d / 2]);
  addMesh(rightEar, earGeometry, sharedBoard(context));

  context.hinges.push((openness) => {
    lid.rotation.x = -LID_OPEN_ANGLE * phase(openness, 0, 1);
  });
}

/**
 * A rigid gift box: an open base with a slightly larger, shallower lid whose
 * skirt steps out over it. The lid band is plain board; the base front carries
 * the print. Opening lifts the lid clear of the base, then tilts it back.
 */
function buildRigidLidBox(context: ProductGeometryContext): void {
  const { width: w, height: h, depth: d } = context.dimensions;
  const lidHeight = h * 0.3;
  // The base only tucks a little way under the lid, so the lid hides as little
  // of the printed front as a real shoulder box would.
  const baseHeight = h - lidHeight + h * 0.04;
  const lip = Math.max(0.008, Math.min(w, d) * 0.014);
  const baseThickness = boardThickness(context) * 1.5;
  const lidThickness = Math.min(lip * 0.8, baseThickness);
  addOpenBody(context, { width: w, depth: d, wallHeight: baseHeight, baseY: -h / 2, thickness: baseThickness });

  const lidWidth = w + lip * 2;
  const lidDepth = d + lip * 2;
  const skirtHeight = lidHeight - lidThickness;
  const lift = addPivot(context.group, [0, 0, 0], PRODUCT_LID_NAME);
  const tilt = addPivot(lift, [0, h / 2 - lidHeight, -lidDepth / 2]);
  addBox(context, lidWidth, lidThickness, lidDepth, lidMaterials(context), [0, lidHeight - lidThickness / 2, lidDepth / 2], tilt);
  addBox(context, lidWidth, skirtHeight, lidThickness, wallMaterials(context, "front", null), [0, skirtHeight / 2, lidDepth - lidThickness / 2], tilt);
  addBox(context, lidWidth, skirtHeight, lidThickness, wallMaterials(context, "back", null), [0, skirtHeight / 2, lidThickness / 2], tilt);
  const skirtDepth = lidDepth - lidThickness * 2 - lidThickness * 0.08;
  for (const side of [-1, 1]) {
    addBox(
      context,
      lidThickness,
      skirtHeight,
      skirtDepth,
      wallMaterials(context, side < 0 ? "left" : "right", null),
      [side * (lidWidth / 2 - lidThickness / 2), skirtHeight / 2, lidDepth / 2],
      tilt,
    );
  }

  // Enough to clear the base's shoulder before the lid starts to tip.
  const liftHeight = h * 0.04 + Math.max(lidHeight * 0.45, 0.05);
  context.hinges.push((openness) => {
    lift.position.y = liftHeight * phase(openness, 0, 0.45);
    tilt.rotation.x = -LID_OPEN_ANGLE * phase(openness, 0.3, 1);
  });
}

/**
 * A flat courier mailer: a thin rounded poly slab, print on the front, and the
 * peel-and-seal flap folded over the top edge onto the front. Opening flips the
 * flap up and over the top edge until it stands just past upright.
 */
function buildMailerEnvelope(context: ProductGeometryContext): void {
  const { width, height, depth } = context.dimensions;
  const slab = Math.max(0.02, depth);
  addBoardBox(context, width, height, slab, boxFaceMaterials(context));
  const flapHeight = height * 0.075;
  const flapThickness = Math.max(0.004, slab * 0.12);
  const flapMaterial = createThemedMaterial(context.theme, {
    color: new THREE.Color(context.theme.baseColor).multiplyScalar(0.94),
    roughness: Math.max(0.3, context.theme.roughness - 0.05),
    clearcoat: context.theme.clearcoat,
  });
  const flap = addPivot(context.group, [0, height / 2, slab / 2], PRODUCT_LID_NAME);
  addBox(context, width * 0.99, flapHeight, flapThickness, flapMaterial, [0, -flapHeight / 2, flapThickness / 2], flap);
  const flipAngle = THREE.MathUtils.degToRad(190);
  context.hinges.push((openness) => {
    flap.rotation.x = -flipAngle * phase(openness, 0, 1);
  });
}

/**
 * One triangular board panel: the outside triangle (corners counter-clockwise
 * seen from outside) carries `materials[0]`, the inside triangle (the matching
 * corners of the shell's inner surface) `materials[1]`, and the three cut edges
 * joining them `materials[2]`.
 */
function triangularPanelGeometry(
  outer: readonly [THREE.Vector3, THREE.Vector3, THREE.Vector3],
  inner: readonly [THREE.Vector3, THREE.Vector3, THREE.Vector3],
  uvs: readonly [[number, number], [number, number], [number, number]],
): THREE.BufferGeometry {
  const [a, b, c] = outer;
  const [ai, bi, ci] = inner;
  const normal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
  const centre = new THREE.Vector3().add(a).add(b).add(c).add(ai).add(bi).add(ci).divideScalar(6);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvValues: number[] = [];
  const push = (point: THREE.Vector3, faceNormal: THREE.Vector3, uv: readonly [number, number] = [0, 0]) => {
    positions.push(point.x, point.y, point.z);
    normals.push(faceNormal.x, faceNormal.y, faceNormal.z);
    uvValues.push(uv[0], uv[1]);
  };
  push(a, normal, uvs[0]);
  push(b, normal, uvs[1]);
  push(c, normal, uvs[2]);
  const back = normal.clone().negate();
  push(ai, back);
  push(ci, back);
  push(bi, back);
  const edges: Array<[THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3]> = [
    [a, b, ai, bi],
    [b, c, bi, ci],
    [c, a, ci, ai],
  ];
  for (const [p, q, pi, qi] of edges) {
    let edgeNormal = new THREE.Vector3().subVectors(pi, p).cross(new THREE.Vector3().subVectors(qi, p)).normalize();
    // Wind each cut edge so it faces away from the panel.
    const outward = edgeNormal.dot(new THREE.Vector3().subVectors(p, centre)) >= 0;
    if (!outward) edgeNormal = edgeNormal.negate();
    const quad = outward ? [p, pi, qi, p, qi, q] : [p, qi, pi, p, q, qi];
    for (const point of quad) push(point, edgeNormal);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvValues, 2));
  geometry.addGroup(0, 3, 0);
  geometry.addGroup(3, 3, 1);
  geometry.addGroup(6, 18, 2);
  return geometry;
}

/**
 * The inside of a tetrahedral shell of board thickness t: moving every face
 * inward by t shrinks the tetrahedron about its incentre by (r − t) / r, so
 * the inner corners never poke out past a neighbouring face.
 */
function tetrahedronInnerCorners(corners: readonly THREE.Vector3[], thickness: number): THREE.Vector3[] {
  const [p0, p1, p2, p3] = corners;
  const area = (x: THREE.Vector3, y: THREE.Vector3, z: THREE.Vector3) =>
    new THREE.Vector3().subVectors(y, x).cross(new THREE.Vector3().subVectors(z, x)).length() / 2;
  // Each corner is weighted by the area of the face opposite it.
  const weights = [area(p1, p2, p3), area(p0, p2, p3), area(p0, p1, p3), area(p0, p1, p2)];
  const surface = weights.reduce((sum, weight) => sum + weight, 0);
  const incentre = new THREE.Vector3();
  corners.forEach((corner, index) => incentre.addScaledVector(corner, weights[index] / surface));
  const volume = Math.abs(
    new THREE.Vector3().subVectors(p1, p0).dot(
      new THREE.Vector3().subVectors(p2, p0).cross(new THREE.Vector3().subVectors(p3, p0)),
    ),
  ) / 6;
  const inradius = (3 * volume) / surface;
  const scale = Math.max(0.05, (inradius - thickness) / inradius);
  return corners.map((corner) => corner.clone().sub(incentre).multiplyScalar(scale).add(incentre));
}

/**
 * A paan-style pyramid: three triangular board faces rising from a triangular
 * base to an apex over the base's centroid. The base's front edge is the
 * width, its other two edges the depth (equal by default) and the apex sits at
 * the height. The front face carries the front artwork from base edge to apex;
 * opening folds it outward and down on its base edge until it lies flat.
 */
function buildPyramidBox(context: ProductGeometryContext): void {
  const { width: edge, height, depth } = context.dimensions;
  const t = boardThickness(context);
  const sideEdge = Math.max(depth, edge * 0.55);
  const baseDepth = Math.sqrt(Math.max(sideEdge * sideEdge - (edge / 2) ** 2, (edge * 0.2) ** 2));
  const frontZ = baseDepth / 3;
  const backZ = -baseDepth * (2 / 3);
  const bottomY = -height / 2;
  const outer = [
    new THREE.Vector3(-edge / 2, bottomY, frontZ),
    new THREE.Vector3(edge / 2, bottomY, frontZ),
    new THREE.Vector3(0, bottomY, backZ),
    new THREE.Vector3(0, height / 2, 0),
  ];
  const inner = tetrahedronInnerCorners(outer, t);
  const FL = 0;
  const FR = 1;
  const BK = 2;
  const AP = 3;
  const panel = (indices: readonly [number, number, number], uvs: readonly [[number, number], [number, number], [number, number]], origin?: THREE.Vector3) => {
    const pick = (points: readonly THREE.Vector3[]) => indices.map((index) => origin ? points[index].clone().sub(origin) : points[index]) as [THREE.Vector3, THREE.Vector3, THREE.Vector3];
    return triangularPanelGeometry(pick(outer), pick(inner), uvs);
  };
  const faceUvs: [[number, number], [number, number], [number, number]] = [[0, 0], [1, 0], [0.5, 1]];
  const faceMaterials = (slot: Product3DSurfaceSlot) => [
    textureForSurface(context, slot) ? printedMaterial(context, slot) : sharedBoard(context),
    sharedInside(context),
    sharedBoard(context),
  ];

  addMesh(context.group, panel([BK, FL, AP], faceUvs), faceMaterials("left"));
  addMesh(context.group, panel([FR, BK, AP], faceUvs), faceMaterials("right"));
  addMesh(context.group, panel([FL, BK, FR], [[0, 1], [0.5, 0], [1, 1]]), faceMaterials("bottom"));

  // The front face is built around its hinge, the base front edge.
  const hinge = new THREE.Vector3(0, bottomY, frontZ);
  const front = addPivot(context.group, [hinge.x, hinge.y, hinge.z], PRODUCT_LID_NAME);
  addMesh(front, panel([FL, FR, AP], faceUvs, hinge), faceMaterials("front"));
  // Leaning back by `lean` when closed, so it lies flat after turning 90° + lean.
  const lean = Math.atan2(frontZ, height);
  const foldAngle = (Math.PI / 2 + lean) * 0.985;
  context.hinges.push((openness) => {
    front.rotation.x = foldAngle * phase(openness, 0, 1);
  });
}

function buildPaperBag(context: ProductGeometryContext): void {
  const { width, height, depth } = context.dimensions;
  const thickness = Math.max(0.018, Math.min(width, depth) * 0.018);
  addBox(context, width, height, thickness, panelMaterials(context, "front", "front"), [0, 0, depth / 2]);
  addBox(context, width, height, thickness, panelMaterials(context, "back", "back"), [0, 0, -depth / 2]);
  addBox(context, thickness, height, depth, panelMaterials(context, "left", "gusset-left"), [-width / 2, 0, 0]);
  addBox(context, thickness, height, depth, panelMaterials(context, "right", "gusset-right"), [width / 2, 0, 0]);
  addBox(context, width, thickness, depth, panelMaterials(context, "bottom", "bottom"), [0, -height / 2, 0]);

  const handleMaterial = createThemedMaterial(context.theme, {
    color: context.theme.accentColor,
    roughness: 0.68,
    metalness: 0,
  });
  const handleRadius = Math.min(width * 0.22, height * 0.12);
  const handleGeometry = new THREE.TorusGeometry(handleRadius, Math.max(0.018, handleRadius * 0.09), 8, 32, Math.PI);
  for (const z of [-depth / 2 - thickness, depth / 2 + thickness]) {
    const handle = new THREE.Mesh(handleGeometry, handleMaterial);
    handle.position.set(0, height / 2 - handleRadius * 0.08, z);
    markProductMesh(handle);
    context.group.add(handle);
  }
}

function buildStandUpPouch(context: ProductGeometryContext): void {
  const { width, height, depth } = context.dimensions;
  addBox(
    context,
    width,
    height,
    depth,
    boxFaceMaterials(context, {
      right: "gusset-right",
      left: "gusset-left",
    }),
  );
  // Zip and heat seals are the film itself, a shade darker — not a dark band.
  const seam = createThemedMaterial(context.theme, {
    color: new THREE.Color(context.theme.baseColor).multiplyScalar(0.9),
    roughness: Math.max(0.25, context.theme.roughness),
    metalness: Math.min(0.08, context.theme.metalness),
  });
  addBox(context, width * 0.94, Math.max(0.025, height * 0.018), depth * 1.03, seam, [0, height * 0.39, 0]);
  addBox(context, width * 0.9, Math.max(0.035, height * 0.035), depth * 1.06, seam, [0, -height * 0.47, 0]);
}

function buildProductSleeve(context: ProductGeometryContext): void {
  const { width, height, depth } = context.dimensions;
  const thickness = Math.max(0.018, Math.min(height, depth) * 0.018);
  addBox(context, width, height, thickness, panelMaterials(context, "front", "front"), [0, 0, depth / 2]);
  addBox(context, width, height, thickness, panelMaterials(context, "back", "back"), [0, 0, -depth / 2]);
  addBox(context, width, thickness, depth, panelMaterials(context, "top", "top"), [0, height / 2, 0]);
  addBox(context, width, thickness, depth, panelMaterials(context, "bottom", "bottom"), [0, -height / 2, 0]);
}

const PRODUCT_GEOMETRY_BUILDERS: Record<Product3DKind, ProductGeometryBuilder> = {
  "label-pack": buildLabelPack,
  "waterproof-sheet": buildWaterproofSheet,
  "school-kit": buildSchoolKit,
  notebook: buildNotebook,
  "bottle-label": buildBottleLabel,
  "pencil-set": buildPencilSet,
  tag: buildTag,
  "geometry-box": buildGeometryBox,
  "gift-ribbon": buildGiftRibbon,
  "keychain-duo": buildKeychainDuo,
  "bulk-grid": buildBulkGrid,
  "rectangular-box": buildRectangularBox,
  "square-box": buildSquareBox,
  "folding-carton": buildFoldingCarton,
  "mailer-box": buildMailerBox,
  "paper-bag": buildPaperBag,
  "stand-up-pouch": buildStandUpPouch,
  "product-sleeve": buildProductSleeve,
  "rigid-lid-box": buildRigidLidBox,
  "mailer-envelope": buildMailerEnvelope,
  "pyramid-box": buildPyramidBox,
};

/**
 * Builds a product model into `group` and returns the texture variants it
 * created (the caller disposes them). Openable packaging also registers a
 * `ProductOpenAnimator` for `group`, posed closed; read it with
 * `getProductOpenAnimator(group)`. Building again replaces it.
 */
export function buildProductGeometry({
  group,
  kind,
  primaryDef,
  texture,
  theme,
  surfaces = [primaryDef],
  textures,
  dimensionsMm,
  mirrorBack = false,
}: {
  group: THREE.Group;
  kind: Product3DKind;
  primaryDef: PrintableSurfaceDefinition;
  texture: THREE.Texture;
  theme: Product3DTheme;
  surfaces?: readonly PrintableSurfaceDefinition[];
  textures?: ReadonlyMap<string, THREE.Texture>;
  dimensionsMm?: Readonly<Record<string, number>> | null;
  mirrorBack?: boolean;
}): THREE.Texture[] {
  const textureVariants: THREE.Texture[] = [];
  const availableTextures = textures ?? new Map([[primaryDef.id, texture]]);
  const context: ProductGeometryContext = {
    group,
    primaryDef,
    surfaces,
    textures: availableTextures,
    fallbackTexture: texture,
    theme,
    dimensions: normalizeProduct3DDimensions(
      kind,
      dimensionsMm,
      primaryDef.width / Math.max(1, primaryDef.height),
    ),
    textureVariants,
    packaging: isPackagingProduct3DKind(kind),
    mirrorBack,
    hinges: [],
    sharedMaterials: {},
  };
  OPEN_ANIMATORS.delete(group);
  PRODUCT_GEOMETRY_BUILDERS[kind](context);
  const { hinges } = context;
  if (hinges.length) {
    let current = 0;
    const animator: ProductOpenAnimator = {
      openable: true,
      get openness() {
        return current;
      },
      apply(openness: number) {
        current = clamp01(openness);
        for (const pose of hinges) pose(current);
      },
    };
    animator.apply(0);
    OPEN_ANIMATORS.set(group, animator);
  }
  return textureVariants;
}
