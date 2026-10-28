import * as THREE from "three";

import { neutralPresentationPalette } from "../../lib/data";
import type { PrintableSurfaceDefinition } from "./artwork-types";
import {
  normalizeProduct3DDimensions,
  type Product3DNormalizedDimensions,
} from "./product-3d-dimensions";
import type { Product3DKind, Product3DTheme } from "./product-3d-profile";
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
}

type ProductGeometryBuilder = (context: ProductGeometryContext) => void;

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

function textureForSurface(
  context: ProductGeometryContext,
  slot: Product3DSurfaceSlot,
): THREE.Texture {
  const surfaceId = resolveProduct3DSurfaceId(context.surfaces, slot);
  return (surfaceId ? context.textures.get(surfaceId) : undefined) ?? context.fallbackTexture;
}

function printedMaterial(
  context: ProductGeometryContext,
  slot: Product3DSurfaceSlot,
  parameters: THREE.MeshPhysicalMaterialParameters = {},
): THREE.MeshPhysicalMaterial {
  return createThemedMaterial(context.theme, {
    color: neutralPresentationPalette.surface,
    map: textureForSurface(context, slot),
    transparent: false,
    opacity: 1,
    depthWrite: true,
    ...parameters,
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
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials);
  mesh.position.set(...position);
  markProductMesh(mesh, true);
  context.group.add(mesh);
  return mesh;
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
  const pencilTexture = textureForSurface(context, "front").clone();
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

function addCartonDetails(context: ProductGeometryContext, folding = false): void {
  const { width, height, depth } = context.dimensions;
  const crease = createThemedMaterial(context.theme, {
    color: context.theme.accentColor,
    roughness: Math.max(context.theme.roughness, 0.62),
    metalness: 0,
  });
  addBox(context, width * 0.92, Math.max(0.012, height * 0.009), depth + 0.012, crease, [0, height * 0.43, 0]);
  if (folding) {
    const flap = addBox(
      context,
      width * 0.82,
      Math.max(0.025, height * 0.018),
      depth * 0.86,
      printedMaterial(context, "top"),
      [0, height / 2 + Math.max(0.015, height * 0.009), -depth * 0.04],
    );
    flap.rotation.x = -0.015;
  }
}

function buildRectangularBox(context: ProductGeometryContext): void {
  const { width, height, depth } = context.dimensions;
  addBox(context, width, height, depth, boxFaceMaterials(context));
  addCartonDetails(context);
}

function buildSquareBox(context: ProductGeometryContext): void {
  buildRectangularBox(context);
}

function buildFoldingCarton(context: ProductGeometryContext): void {
  const { width, height, depth } = context.dimensions;
  addBox(context, width, height, depth, boxFaceMaterials(context));
  addCartonDetails(context, true);
}

function buildMailerBox(context: ProductGeometryContext): void {
  const { width, height, depth } = context.dimensions;
  const bodyHeight = height * 0.72;
  addBox(context, width, bodyHeight, depth, boxFaceMaterials(context), [0, -height * 0.14, 0]);
  addBox(
    context,
    width * 1.015,
    Math.max(0.04, height * 0.14),
    depth * 1.015,
    boxFaceMaterials(context),
    [0, height * 0.29, -depth * 0.015],
  );
  addBox(
    context,
    width * 0.96,
    Math.max(0.018, height * 0.04),
    Math.max(0.025, depth * 0.045),
    createThemedMaterial(context.theme, { color: context.theme.accentColor, roughness: 0.72 }),
    [0, height * 0.22, -depth * 0.51],
  );
}

function buildPaperBag(context: ProductGeometryContext): void {
  const { width, height, depth } = context.dimensions;
  const thickness = Math.max(0.018, Math.min(width, depth) * 0.018);
  addBox(context, width, height, thickness, printedMaterial(context, "front"), [0, 0, depth / 2]);
  addBox(context, width, height, thickness, printedMaterial(context, "back"), [0, 0, -depth / 2]);
  addBox(context, thickness, height, depth, printedMaterial(context, "gusset-left"), [-width / 2, 0, 0]);
  addBox(context, thickness, height, depth, printedMaterial(context, "gusset-right"), [width / 2, 0, 0]);
  addBox(context, width, thickness, depth, printedMaterial(context, "bottom"), [0, -height / 2, 0]);

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
  const seam = createThemedMaterial(context.theme, {
    color: context.theme.accentColor,
    roughness: Math.max(0.25, context.theme.roughness),
    metalness: Math.min(0.08, context.theme.metalness),
  });
  addBox(context, width * 0.94, Math.max(0.025, height * 0.018), depth * 1.03, seam, [0, height * 0.39, 0]);
  addBox(context, width * 0.9, Math.max(0.035, height * 0.035), depth * 1.06, seam, [0, -height * 0.47, 0]);
}

function buildProductSleeve(context: ProductGeometryContext): void {
  const { width, height, depth } = context.dimensions;
  const thickness = Math.max(0.018, Math.min(height, depth) * 0.018);
  addBox(context, width, height, thickness, printedMaterial(context, "front"), [0, 0, depth / 2]);
  addBox(context, width, height, thickness, printedMaterial(context, "back"), [0, 0, -depth / 2]);
  addBox(context, width, thickness, depth, printedMaterial(context, "top"), [0, height / 2, 0]);
  addBox(context, width, thickness, depth, printedMaterial(context, "bottom"), [0, -height / 2, 0]);
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
};

export function buildProductGeometry({
  group,
  kind,
  primaryDef,
  texture,
  theme,
  surfaces = [primaryDef],
  textures,
  dimensionsMm,
}: {
  group: THREE.Group;
  kind: Product3DKind;
  primaryDef: PrintableSurfaceDefinition;
  texture: THREE.Texture;
  theme: Product3DTheme;
  surfaces?: readonly PrintableSurfaceDefinition[];
  textures?: ReadonlyMap<string, THREE.Texture>;
  dimensionsMm?: Readonly<Record<string, number>> | null;
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
  };
  PRODUCT_GEOMETRY_BUILDERS[kind](context);
  return textureVariants;
}
