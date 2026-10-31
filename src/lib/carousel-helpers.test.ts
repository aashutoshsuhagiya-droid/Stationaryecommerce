import assert from "node:assert/strict";
import test from "node:test";

import {
  CAROUSEL_AUTOPLAY_INTERVAL_MS,
  hotspotStyle,
  isValidCarouselHotspot,
  shouldAutoplayCarousel,
} from "./carousel-helpers";
import { discountPercent } from "./data";

test("builds a percentage-based style for an image hotspot", () => {
  assert.deepEqual(
    hotspotStyle({ x: "18%", y: "32%", w: "28%" }),
    { left: "18%", top: "32%", width: "28%" },
  );
});

test("accepts only safe percentage hotspot coordinates and local destinations", () => {
  assert.equal(
    isValidCarouselHotspot({
      x: "18%",
      y: "32.5%",
      w: "28%",
      label: "Try the live studio",
      href: "/products/everyday-name-slips-72-pack",
    }),
    true,
  );
  assert.equal(
    isValidCarouselHotspot({ x: "18px", y: "32%", w: "28%", label: "Bad", href: "https://example.com" }),
    false,
  );
});

test("autoplay uses a six-second interval and respects paused and reduced-motion states", () => {
  assert.equal(CAROUSEL_AUTOPLAY_INTERVAL_MS, 6_000);
  assert.equal(shouldAutoplayCarousel({ isPaused: false, prefersReducedMotion: false, slideCount: 4 }), true);
  assert.equal(shouldAutoplayCarousel({ isPaused: true, prefersReducedMotion: false, slideCount: 4 }), false);
  assert.equal(shouldAutoplayCarousel({ isPaused: false, prefersReducedMotion: true, slideCount: 4 }), false);
  assert.equal(shouldAutoplayCarousel({ isPaused: false, prefersReducedMotion: false, slideCount: 1 }), false);
});

test("computes Myntra-style discount percentages without exposing negative discounts", () => {
  assert.equal(discountPercent({ price: 400, compareAtPrice: 500 }), 20);
  assert.equal(discountPercent({ price: 500, compareAtPrice: 500 }), 0);
  assert.equal(discountPercent({ price: 600, compareAtPrice: 500 }), 0);
  assert.equal(discountPercent({ price: 400 }), 0);
});
