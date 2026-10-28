import { z } from "zod";

import {
  artworkDocumentSchema,
  type SavedDesignInput,
} from "./validation";

const storedSavedDesignSchema = z.object({
  schemaVersion: z.literal(1),
  title: z.string().trim().min(1).max(180),
  variantId: z.string().trim().min(1).max(128),
  dimensionPresetId: z.string().trim().min(1).max(128),
  displayUnit: z.enum(["mm", "cm", "in"]),
  quantity: z.number().int().min(1).max(1_000),
  fields: z
    .record(z.string().max(80), z.string().max(500))
    .refine((fields) => Object.keys(fields).length <= 20),
  artwork: artworkDocumentSchema,
}).strict();

export type StoredSavedDesign = z.infer<typeof storedSavedDesignSchema>;

type SavedArtwork = SavedDesignInput["artwork"];
type SavedArtworkLayer = SavedArtwork["surfaces"][number]["layers"][number];
type SavedArtworkImageLayer = Extract<SavedArtworkLayer, { type: "image" }>;
export type SavedArtworkAsset = NonNullable<SavedArtworkImageLayer["asset"]>;

/** Removes browser-only previews while retaining private artwork references. */
export function artworkForSavedDesign(
  artwork: SavedArtwork,
): SavedArtwork {
  return {
    ...artwork,
    surfaces: artwork.surfaces.map((surface) => {
      const layers: SavedArtworkLayer[] = [];
      for (const layer of surface.layers) {
        if (layer.type !== "image") {
          layers.push(layer);
          continue;
        }
        if (!layer.asset) continue;
        const { src: _browserPreview, ...persisted } = layer;
        layers.push(persisted);
      }
      return { ...surface, layers };
    }),
  };
}

/** Replaces server-issued artwork claims without changing layer geometry. */
export function replaceSavedDesignArtworkAssets(
  artwork: SavedArtwork,
  replacements: ReadonlyMap<string, SavedArtworkAsset>,
): SavedArtwork {
  if (!replacements.size) return artwork;
  return {
    ...artwork,
    surfaces: artwork.surfaces.map((surface) => ({
      ...surface,
      layers: surface.layers.map((layer) => {
        if (layer.type !== "image" || !layer.asset) return layer;
        const replacement = replacements.get(layer.asset.id);
        return replacement ? { ...layer, asset: replacement } : layer;
      }),
    })),
  };
}

export function newestSavedDesign<T extends { savedAt: string }>(
  local: T,
  remote: T,
): T {
  const localTime = Date.parse(local.savedAt);
  const remoteTime = Date.parse(remote.savedAt);
  if (Number.isFinite(localTime) && Number.isFinite(remoteTime)) {
    return remoteTime >= localTime ? remote : local;
  }
  if (Number.isFinite(localTime)) return local;
  if (Number.isFinite(remoteTime)) return remote;
  return remote.savedAt.localeCompare(local.savedAt) >= 0 ? remote : local;
}

export function savedArtworkReuseAction(
  status: string,
  orderItemId: string | null,
): "renew" | "copy" | "unavailable" {
  if (status === "UPLOADED" && orderItemId === null) return "renew";
  if ((status === "ATTACHED" || status === "APPROVED") && orderItemId) return "copy";
  return "unavailable";
}

export function storedSavedDesignValues(input: SavedDesignInput): StoredSavedDesign {
  return storedSavedDesignSchema.parse({
    schemaVersion: 1,
    title: input.title,
    variantId: input.variantId,
    dimensionPresetId: input.dimensionPresetId,
    displayUnit: input.displayUnit,
    quantity: input.quantity,
    fields: input.fields,
    artwork: artworkForSavedDesign(input.artwork),
  });
}

export function parseStoredSavedDesignValues(value: unknown) {
  return storedSavedDesignSchema.safeParse(value);
}
