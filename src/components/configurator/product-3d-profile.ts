export type Product3DKind =
  | "label-pack"
  | "notebook"
  | "bottle-label"
  | "pencil-set"
  | "tag"
  | "geometry-box"
  | "keychain-duo";

export interface Product3DProfile {
  kind: Product3DKind;
  label: string;
  cameraDistance: number;
}

export function resolveProduct3DProfile(
  structuralDesign = "",
  productType = "",
): Product3DProfile {
  const key = `${structuralDesign} ${productType}`.toLowerCase();

  if (/geometry[- ]box/.test(key)) {
    return { kind: "geometry-box", label: "Metal geometry box", cameraDistance: 3.7 };
  }
  if (/keychain|name[- ]plate/.test(key)) {
    return { kind: "keychain-duo", label: "Acrylic keychain pair", cameraDistance: 3.5 };
  }
  if (/notebook/.test(key)) {
    return { kind: "notebook", label: "Personalized notebook", cameraDistance: 3.8 };
  }
  if (/bottle|tiffin/.test(key)) {
    return { kind: "bottle-label", label: "Bottle label preview", cameraDistance: 4 };
  }
  if (/pencil|pen/.test(key)) {
    return { kind: "pencil-set", label: "Personalized pencil set", cameraDistance: 4 };
  }
  if (/tag|backpack/.test(key)) {
    return { kind: "tag", label: "Bag tag", cameraDistance: 3.5 };
  }
  return { kind: "label-pack", label: "Printed label pack", cameraDistance: 3.4 };
}
