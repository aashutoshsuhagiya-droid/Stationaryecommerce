export type ArtworkLayerType = "text" | "image";

export interface ArtworkLayer {
  id: string;
  type: ArtworkLayerType;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  text?: string;
  src?: string;
  color?: string;
  fontSize?: number;
  fontFamily?: "sans" | "serif" | "rounded";
  sourceWidth?: number;
  sourceHeight?: number;
}

export interface ArtworkSurface {
  id: string;
  label: string;
  layers: ArtworkLayer[];
}

export interface ArtworkDocument {
  version: 1;
  activeSurfaceId: string;
  surfaces: ArtworkSurface[];
  updatedAt: string;
}

export interface PrintableSurfaceDefinition {
  id: string;
  label: string;
  width: number;
  height: number;
  safeInset: number;
  physicalWidthMm?: number;
  physicalHeightMm?: number;
  targetDpi?: number;
}

export function createArtworkDocument(surfaces: PrintableSurfaceDefinition[]): ArtworkDocument {
  const first = surfaces[0] ?? {
    id: "front",
    label: "Front",
    width: 600,
    height: 360,
    safeInset: 32,
  };

  return {
    version: 1,
    activeSurfaceId: first.id,
    surfaces: (surfaces.length ? surfaces : [first]).map((surface) => ({
      id: surface.id,
      label: surface.label,
      layers: [],
    })),
    updatedAt: new Date().toISOString(),
  };
}
