export const CAROUSEL_AUTOPLAY_INTERVAL_MS = 6_000;

export type CarouselHotspot = {
  x: string;
  y: string;
  w: string;
  label: string;
  href: string;
};

export type HotspotStyle = {
  left: string;
  top: string;
  width: string;
};

const percentagePattern = /^(?:0|[1-9]\d?|100)(?:\.\d+)?%$/;

export function isValidCarouselHotspot(hotspot: CarouselHotspot) {
  return (
    percentagePattern.test(hotspot.x)
    && percentagePattern.test(hotspot.y)
    && percentagePattern.test(hotspot.w)
    && hotspot.label.trim().length > 0
    && hotspot.href.startsWith("/")
  );
}

export function hotspotStyle(hotspot: Pick<CarouselHotspot, "x" | "y" | "w">): HotspotStyle {
  return { left: hotspot.x, top: hotspot.y, width: hotspot.w };
}

export function shouldAutoplayCarousel({
  isPaused,
  prefersReducedMotion,
  slideCount,
}: {
  isPaused: boolean;
  prefersReducedMotion: boolean;
  slideCount: number;
}) {
  return !isPaused && !prefersReducedMotion && slideCount > 1;
}
