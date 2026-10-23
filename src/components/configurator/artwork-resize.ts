export type ResizeDirection =
  | "north"
  | "northeast"
  | "east"
  | "southeast"
  | "south"
  | "southwest"
  | "west"
  | "northwest";

export interface ResizeGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

const MIN_LAYER_SIZE = 20;

function includesHorizontal(direction: ResizeDirection) {
  return direction.includes("east") || direction.includes("west");
}

function includesVertical(direction: ResizeDirection) {
  return direction.includes("north") || direction.includes("south");
}

export function resizeArtworkGeometry(
  origin: ResizeGeometry,
  direction: ResizeDirection,
  deltaX: number,
  deltaY: number,
  aspectLocked: boolean,
): ResizeGeometry {
  const radians = (-origin.rotation * Math.PI) / 180;
  const localX = deltaX * Math.cos(radians) - deltaY * Math.sin(radians);
  const localY = deltaX * Math.sin(radians) + deltaY * Math.cos(radians);
  const horizontal = includesHorizontal(direction);
  const vertical = includesVertical(direction);
  const horizontalSign = direction.includes("west") ? -1 : 1;
  const verticalSign = direction.includes("north") ? -1 : 1;

  let width = horizontal
    ? Math.max(MIN_LAYER_SIZE, origin.width + horizontalSign * localX)
    : origin.width;
  let height = vertical
    ? Math.max(MIN_LAYER_SIZE, origin.height + verticalSign * localY)
    : origin.height;

  if (aspectLocked) {
    const aspect = origin.width / origin.height || 1;
    if (horizontal && vertical) {
      const candidateWidth = origin.width + horizontalSign * localX;
      const candidateHeight = origin.height + verticalSign * localY;
      const scale = Math.max(
        MIN_LAYER_SIZE / origin.width,
        MIN_LAYER_SIZE / origin.height,
        (candidateWidth * origin.width + candidateHeight * origin.height)
          / (origin.width ** 2 + origin.height ** 2),
      );
      width = origin.width * scale;
      height = origin.height * scale;
    } else if (horizontal) {
      height = Math.max(MIN_LAYER_SIZE, width / aspect);
      width = height * aspect;
    } else {
      width = Math.max(MIN_LAYER_SIZE, height * aspect);
      height = width / aspect;
    }
  }

  const localCenterShiftX = horizontal
    ? horizontalSign * (width - origin.width) / 2
    : 0;
  const localCenterShiftY = vertical
    ? verticalSign * (height - origin.height) / 2
    : 0;
  const rotation = (origin.rotation * Math.PI) / 180;
  const centerShiftX = localCenterShiftX * Math.cos(rotation) - localCenterShiftY * Math.sin(rotation);
  const centerShiftY = localCenterShiftX * Math.sin(rotation) + localCenterShiftY * Math.cos(rotation);
  const originCenterX = origin.x + origin.width / 2;
  const originCenterY = origin.y + origin.height / 2;

  return {
    x: originCenterX + centerShiftX - width / 2,
    y: originCenterY + centerShiftY - height / 2,
    width,
    height,
    rotation: origin.rotation,
  };
}
