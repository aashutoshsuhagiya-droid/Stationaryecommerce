import * as THREE from "three";

import { neutralPresentationPalette } from "../../lib/data";
import type { PrintableSurfaceDefinition } from "./artwork-types";
import type {
  Product3DKind,
  Product3DTheme,
} from "./product-3d-profile";

interface ProductGeometryContext {
  group: THREE.Group;
  primaryDef: PrintableSurfaceDefinition;
  texture: THREE.Texture;
  printMaterial: THREE.MeshPhysicalMaterial;
  theme: Product3DTheme;
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

function printedBoxMaterials(
  edgeMaterial: THREE.Material,
  printMaterial: THREE.Material,
  backMaterial: THREE.Material,
): THREE.Material[] {
  // BoxGeometry order: right, left, top, bottom, front (+z), back (-z).
  return [
    edgeMaterial,
    edgeMaterial,
    edgeMaterial,
    edgeMaterial,
    printMaterial,
    backMaterial,
  ];
}

function buildLabelPack({
  group,
  primaryDef,
  printMaterial,
  theme,
}: ProductGeometryContext): void {
  const ratio = primaryDef.width / Math.max(1, primaryDef.height);
  const cardW = ratio >= 1 ? 2.2 : 2.2 * ratio;
  const cardH = ratio >= 1 ? 2.2 / ratio : 2.2;
  const cardD = 0.08;
  const edgeMaterial = createThemedMaterial(theme, {
    color: theme.tintColor,
    roughness: Math.max(theme.roughness, 0.82),
    metalness: 0,
  });
  const backMaterial = createThemedMaterial(theme, { color: theme.baseColor });
  const card = new THREE.Mesh(
    new THREE.BoxGeometry(cardW, cardH, cardD),
    printedBoxMaterials(edgeMaterial, printMaterial, backMaterial),
  );
  markProductMesh(card, true);
  group.add(card);

  const underGeometry = new THREE.BoxGeometry(cardW, cardH, 0.02);
  for (let index = 1; index <= 2; index += 1) {
    const underCard = new THREE.Mesh(underGeometry, edgeMaterial);
    underCard.position.set(0.02 * index, -0.02 * index, -cardD / 2 - 0.015 * index);
    markProductMesh(underCard);
    group.add(underCard);
  }
}

function buildWaterproofSheet({
  group,
  primaryDef,
  printMaterial,
  theme,
}: ProductGeometryContext): void {
  const ratio = Math.max(0.8, Math.min(2.6, primaryDef.width / Math.max(1, primaryDef.height)));
  const sheetW = ratio >= 1 ? 2.45 : 1.85;
  const sheetH = ratio >= 1 ? 1.75 : 2.35;
  const translucent = theme.flags.includes("translucent");
  const backingMaterial = createThemedMaterial(theme, {
    color: theme.baseColor,
    transparent: translucent,
    opacity: translucent ? 0.82 : 0.96,
    depthWrite: !translucent,
    side: THREE.DoubleSide,
  });
  const edgeMaterial = createThemedMaterial(theme, {
    color: theme.tintColor,
    roughness: 0.2,
    metalness: 0.02,
  });
  const backing = new THREE.Mesh(
    new THREE.BoxGeometry(sheetW, sheetH, 0.055),
    backingMaterial,
  );
  markProductMesh(backing, true);
  group.add(backing);

  const stickerW = sheetW * 0.72;
  const stickerH = sheetH * 0.22;
  const stickerGeometry = new THREE.BoxGeometry(stickerW, stickerH, 0.035);
  const stickerMaterials = printedBoxMaterials(edgeMaterial, printMaterial, backingMaterial);
  for (const [index, y] of [-0.52, 0, 0.52].entries()) {
    const sticker = new THREE.Mesh(stickerGeometry, stickerMaterials);
    sticker.position.set(index === 1 ? 0.08 : -0.06, y, 0.055);
    sticker.rotation.z = index === 1 ? -0.035 : 0.025;
    markProductMesh(sticker);
    group.add(sticker);
  }

  const dropletMaterial = createThemedMaterial(theme, {
    color: theme.accentColor,
    roughness: 0.08,
    metalness: 0,
    transmission: 0.35,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
  });
  const dropletGeometry = new THREE.SphereGeometry(0.075, 18, 12);
  for (const [x, y] of [[-0.95, 0.62], [0.94, 0.34], [0.88, -0.66]] as const) {
    const droplet = new THREE.Mesh(dropletGeometry, dropletMaterial);
    droplet.scale.set(0.75, 1.15, 0.35);
    droplet.position.set(x, y, 0.11);
    group.add(droplet);
  }
}

function buildSchoolKit({
  group,
  printMaterial,
  theme,
}: ProductGeometryContext): void {
  const edgeMaterial = createThemedMaterial(theme, {
    color: theme.tintColor,
    roughness: 0.76,
    metalness: 0,
  });
  const backMaterial = createThemedMaterial(theme, { color: theme.baseColor });
  const trayMaterial = createThemedMaterial(theme, {
    color: theme.tintColor,
    roughness: 0.84,
    metalness: 0,
  });
  const tray = new THREE.Mesh(new THREE.BoxGeometry(2.75, 2.05, 0.08), trayMaterial);
  tray.position.z = -0.08;
  markProductMesh(tray, true);
  group.add(tray);

  const formats = [
    { width: 1.82, height: 0.48, x: 0, y: 0.56, rotation: -0.025 },
    { width: 1.25, height: 0.72, x: -0.48, y: -0.34, rotation: 0.035 },
    { width: 0.92, height: 0.92, x: 0.72, y: -0.38, rotation: -0.045 },
  ];
  for (const format of formats) {
    const label = new THREE.Mesh(
      new THREE.BoxGeometry(format.width, format.height, 0.055),
      printedBoxMaterials(edgeMaterial, printMaterial, backMaterial),
    );
    label.position.set(format.x, format.y, 0.015);
    label.rotation.z = format.rotation;
    markProductMesh(label);
    group.add(label);
  }
}

function buildNotebook({
  group,
  printMaterial,
  theme,
}: ProductGeometryContext): void {
  const bookW = 1.5;
  const bookH = 2.1;
  const bookD = 0.16;
  const paperMaterial = createThemedMaterial(theme, {
    color: theme.tintColor,
    roughness: Math.max(theme.roughness, 0.86),
    metalness: 0,
  });
  const spineMaterial = createThemedMaterial(theme, {
    color: theme.baseColor,
    roughness: 0.42,
    metalness: 0.02,
  });
  const backMaterial = createThemedMaterial(theme, { color: theme.baseColor });
  const book = new THREE.Mesh(
    new THREE.BoxGeometry(bookW, bookH, bookD),
    [paperMaterial, spineMaterial, paperMaterial, paperMaterial, printMaterial, backMaterial],
  );
  markProductMesh(book, true);
  group.add(book);

  const band = new THREE.Mesh(
    new THREE.BoxGeometry(bookW * 0.08, bookH + 0.02, bookD + 0.005),
    createThemedMaterial(theme, { color: theme.accentColor, roughness: 0.4 }),
  );
  band.position.set(-bookW * 0.35, 0, 0);
  group.add(band);
}

function buildBottleLabel({
  group,
  printMaterial,
  theme,
}: ProductGeometryContext): void {
  const bottleHeight = 2.4;
  const bottleRadius = 0.55;
  const bottle = new THREE.Mesh(
    new THREE.CylinderGeometry(bottleRadius, bottleRadius, bottleHeight, 48),
    createThemedMaterial(theme, {
      color: theme.baseColor,
      roughness: Math.min(theme.roughness, 0.28),
      metalness: Math.max(theme.metalness, 0.62),
    }),
  );
  markProductMesh(bottle, true);
  group.add(bottle);

  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.4, 0.45, 32),
    createThemedMaterial(theme, {
      color: theme.accentColor,
      roughness: 0.4,
      metalness: 0.2,
    }),
  );
  cap.position.y = bottleHeight / 2 + 0.22;
  group.add(cap);

  const label = new THREE.Mesh(
    new THREE.CylinderGeometry(
      bottleRadius + 0.006,
      bottleRadius + 0.006,
      1,
      48,
      1,
      true,
      -Math.PI * 0.5,
      Math.PI,
    ),
    printMaterial,
  );
  label.position.y = -0.1;
  group.add(label);
}

function buildPencilSet({
  group,
  texture,
  theme,
  textureVariants,
}: ProductGeometryContext): void {
  const pencilLength = 2.8;
  const pencilRadius = 0.14;
  const pencilTexture = texture.clone();
  pencilTexture.center.set(0.5, 0.5);
  pencilTexture.rotation = Math.PI / 2;
  pencilTexture.needsUpdate = true;
  textureVariants.push(pencilTexture);

  const pencilMaterial = createThemedMaterial(theme, {
    color: theme.baseColor,
    roughness: theme.roughness,
    metalness: 0,
  });
  const pencilPrintMaterial = createThemedMaterial(theme, {
    color: neutralPresentationPalette.surface,
    map: pencilTexture,
  });
  const ferruleMaterial = createThemedMaterial(theme, {
    color: theme.accentColor,
    metalness: 0.8,
    roughness: 0.3,
  });
  const eraserMaterial = createThemedMaterial(theme, {
    color: theme.tintColor,
    roughness: 0.9,
    metalness: 0,
  });
  const pencilGeometry = new THREE.CylinderGeometry(pencilRadius, pencilRadius, pencilLength, 6);
  const ferruleGeometry = new THREE.CylinderGeometry(pencilRadius * 1.02, pencilRadius * 1.02, 0.2, 16);
  const eraserGeometry = new THREE.CylinderGeometry(pencilRadius * 0.98, pencilRadius * 0.98, 0.22, 16);

  for (let index = -1; index <= 1; index += 1) {
    const pencil = new THREE.Mesh(pencilGeometry, pencilMaterial);
    pencil.position.x = index * 0.38;
    pencil.rotation.z = index * 0.04;
    markProductMesh(pencil);
    group.add(pencil);

    const ferrule = new THREE.Mesh(ferruleGeometry, ferruleMaterial);
    ferrule.position.y = pencilLength / 2 + 0.1;
    pencil.add(ferrule);

    const eraser = new THREE.Mesh(eraserGeometry, eraserMaterial);
    eraser.position.y = pencilLength / 2 + 0.31;
    pencil.add(eraser);

    if (index === 0) {
      const printStrip = new THREE.Mesh(
        new THREE.PlaneGeometry(0.28, 1.8),
        pencilPrintMaterial,
      );
      printStrip.position.set(0, -0.1, pencilRadius + 0.006);
      pencil.add(printStrip);
    }
  }
}

function buildGeometryBox({
  group,
  printMaterial,
  theme,
}: ProductGeometryContext): void {
  const boxW = 2.7;
  const boxH = 1.05;
  const boxD = 0.34;
  const metal = createThemedMaterial(theme, {
    color: theme.baseColor,
    roughness: theme.roughness,
    metalness: Math.max(theme.metalness, 0.72),
  });
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(boxW, boxH, boxD),
    [metal, metal, metal, metal, printMaterial, metal],
  );
  markProductMesh(box, true);
  group.add(box);

  const seam = new THREE.Mesh(
    new THREE.BoxGeometry(boxW * 1.01, 0.025, boxD * 1.02),
    createThemedMaterial(theme, {
      color: theme.accentColor,
      metalness: 0.7,
      roughness: 0.35,
    }),
  );
  seam.position.y = -boxH * 0.38;
  group.add(seam);
}

function buildGiftRibbon({
  group,
  printMaterial,
  theme,
}: ProductGeometryContext): void {
  const boxW = 1.85;
  const boxH = 1.45;
  const boxD = 0.92;
  const bodyMaterial = createThemedMaterial(theme, { color: theme.baseColor });
  const edgeMaterial = createThemedMaterial(theme, { color: theme.tintColor });
  const ribbonMaterial = createThemedMaterial(theme, {
    color: theme.accentColor,
    roughness: 0.3,
    metalness: 0.12,
  });
  const gift = new THREE.Mesh(
    new THREE.BoxGeometry(boxW, boxH, boxD),
    [bodyMaterial, bodyMaterial, edgeMaterial, edgeMaterial, printMaterial, bodyMaterial],
  );
  markProductMesh(gift, true);
  group.add(gift);

  const verticalRibbon = new THREE.Mesh(
    new THREE.BoxGeometry(boxW * 0.16, boxH + 0.015, boxD + 0.025),
    ribbonMaterial,
  );
  group.add(verticalRibbon);
  const horizontalRibbon = new THREE.Mesh(
    new THREE.BoxGeometry(boxW + 0.015, boxH * 0.16, boxD + 0.03),
    ribbonMaterial,
  );
  group.add(horizontalRibbon);

  const bowGeometry = new THREE.TorusGeometry(0.23, 0.055, 10, 28);
  for (const side of [-1, 1]) {
    const loop = new THREE.Mesh(bowGeometry, ribbonMaterial);
    loop.scale.set(1, 0.58, 1);
    loop.position.set(side * 0.2, boxH / 2 + 0.13, 0);
    loop.rotation.y = side * 0.38;
    group.add(loop);
  }
}

function buildKeychainDuo({
  group,
  printMaterial,
  theme,
}: ProductGeometryContext): void {
  const translucent = theme.flags.includes("translucent");
  const edgeMaterial = createThemedMaterial(theme, {
    color: theme.tintColor,
    transparent: translucent,
    opacity: translucent ? 0.72 : 1,
    depthWrite: !translucent,
  });
  const backMaterial = createThemedMaterial(theme, {
    color: theme.baseColor,
    transparent: translucent,
    opacity: translucent ? 0.78 : 1,
    depthWrite: !translucent,
  });
  const hardwareMaterial = createThemedMaterial(theme, {
    color: theme.accentColor,
    metalness: 0.9,
    roughness: 0.2,
  });
  const tagGeometry = new THREE.BoxGeometry(1.15, 0.78, 0.07);
  const ringGeometry = new THREE.TorusGeometry(0.16, 0.035, 12, 30);
  const tagMaterials = printedBoxMaterials(edgeMaterial, printMaterial, backMaterial);

  for (const side of [-1, 1]) {
    const tag = new THREE.Mesh(tagGeometry, tagMaterials);
    tag.position.set(side * 0.68, side * 0.12, 0);
    tag.rotation.z = side * -0.08;
    markProductMesh(tag);
    group.add(tag);

    const ring = new THREE.Mesh(ringGeometry, hardwareMaterial);
    ring.position.set(side * 1.28, side * 0.12, 0);
    group.add(ring);
  }
}

function buildTag({
  group,
  printMaterial,
  theme,
}: ProductGeometryContext): void {
  const tagW = 1.2;
  const tagH = 2;
  const tagD = 0.06;
  const edgeMaterial = createThemedMaterial(theme, { color: theme.tintColor });
  const backMaterial = createThemedMaterial(theme, { color: theme.baseColor });
  const tag = new THREE.Mesh(
    new THREE.BoxGeometry(tagW, tagH, tagD),
    printedBoxMaterials(edgeMaterial, printMaterial, backMaterial),
  );
  markProductMesh(tag, true);
  group.add(tag);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.12, 0.03, 16, 32),
    createThemedMaterial(theme, {
      color: theme.accentColor,
      metalness: 0.9,
      roughness: 0.2,
    }),
  );
  ring.position.set(0, tagH / 2 + 0.05, 0);
  group.add(ring);
}

function buildBulkGrid({
  group,
  printMaterial,
  theme,
}: ProductGeometryContext): void {
  const trayMaterial = createThemedMaterial(theme, {
    color: theme.baseColor,
    roughness: Math.max(theme.roughness, 0.76),
    metalness: 0,
  });
  const edgeMaterial = createThemedMaterial(theme, {
    color: theme.tintColor,
    roughness: 0.82,
    metalness: 0,
  });
  const tray = new THREE.Mesh(new THREE.BoxGeometry(2.85, 2.08, 0.12), trayMaterial);
  tray.position.z = -0.08;
  markProductMesh(tray, true);
  group.add(tray);

  const labelGeometry = new THREE.BoxGeometry(0.58, 0.28, 0.035);
  const labelMaterials = printedBoxMaterials(edgeMaterial, printMaterial, trayMaterial);
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      const label = new THREE.Mesh(labelGeometry, labelMaterials);
      label.position.set((column - 1) * 0.83, (1.5 - row) * 0.43, 0.005);
      markProductMesh(label);
      group.add(label);
    }
  }
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
};

export function buildProductGeometry({
  group,
  kind,
  primaryDef,
  texture,
  theme,
}: {
  group: THREE.Group;
  kind: Product3DKind;
  primaryDef: PrintableSurfaceDefinition;
  texture: THREE.Texture;
  theme: Product3DTheme;
}): THREE.Texture[] {
  const textureVariants: THREE.Texture[] = [];
  const printMaterial = createThemedMaterial(theme, {
    color: neutralPresentationPalette.surface,
    map: texture,
    transparent: false,
    opacity: 1,
    depthWrite: true,
  });

  PRODUCT_GEOMETRY_BUILDERS[kind]({
    group,
    primaryDef,
    texture,
    printMaterial,
    theme,
    textureVariants,
  });
  return textureVariants;
}
