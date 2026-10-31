"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useEffect, useState, type FocusEvent, type KeyboardEvent } from "react";
import {
  CAROUSEL_AUTOPLAY_INTERVAL_MS,
  type CarouselHotspot,
  hotspotStyle,
  isValidCarouselHotspot,
  shouldAutoplayCarousel,
} from "@/lib/carousel-helpers";

export type CarouselSlide = {
  id: string;
  image: string;
  alt: string;
  kicker: string;
  title: string;
  description?: string;
  cta: string;
  href: string;
  hotspots?: CarouselHotspot[];
};

export { hotspotStyle } from "@/lib/carousel-helpers";

function nextIndex(currentIndex: number, direction: -1 | 1, slideCount: number) {
  return (currentIndex + direction + slideCount) % slideCount;
}

export function HomePromoCarousel({ slides }: { slides: readonly CarouselSlide[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const slideCount = slides.length;

  useEffect(() => {
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotionPreference = () => setPrefersReducedMotion(motionQuery.matches);
    updateMotionPreference();
    motionQuery.addEventListener("change", updateMotionPreference);
    return () => motionQuery.removeEventListener("change", updateMotionPreference);
  }, []);

  useEffect(() => {
    if (!shouldAutoplayCarousel({ isPaused, prefersReducedMotion, slideCount })) return;
    const interval = window.setInterval(() => {
      setActiveIndex((currentIndex) => nextIndex(currentIndex, 1, slideCount));
    }, CAROUSEL_AUTOPLAY_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [isPaused, prefersReducedMotion, slideCount]);

  useEffect(() => {
    if (activeIndex >= slideCount) setActiveIndex(0);
  }, [activeIndex, slideCount]);

  if (!slideCount) return null;

  const move = (direction: -1 | 1) => setActiveIndex((currentIndex) => nextIndex(currentIndex, direction, slideCount));
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      move(-1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      move(1);
    }
  };
  const handleBlur = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsPaused(false);
  };

  return (
    <section className="promoCarouselSection" aria-label="Featured store collections">
      <div
        className="shell promoCarousel"
        role="region"
        aria-roledescription="carousel"
        aria-label="Featured store collections"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onFocusCapture={() => setIsPaused(true)}
        onBlurCapture={handleBlur}
      >
        {slides.map((slide, index) => {
          const isActive = index === activeIndex;
          const hotspots = isActive ? slide.hotspots?.filter(isValidCarouselHotspot) ?? [] : [];
          const Heading = slide.id === "hero" ? "h1" : "h2";

          return (
            <article
              aria-hidden={!isActive}
              className={`promoCarouselSlide${isActive ? " is-active" : ""}`}
              hidden={!isActive}
              key={slide.id}
            >
              <div className="promoCarouselCopy">
                <span className="promoCarouselKicker">{slide.kicker}</span>
                <Heading>{slide.title}</Heading>
                {slide.description && <p>{slide.description}</p>}
                <Link className="button button-primary promoCarouselCta" href={slide.href} tabIndex={isActive ? 0 : -1}>
                  {slide.cta} <ArrowRight size={17} aria-hidden="true" />
                </Link>
              </div>

              <div className="promoCarouselMedia">
                <Link className="promoCarouselImageLink" href={slide.href} tabIndex={isActive ? 0 : -1} aria-label={`${slide.cta}: ${slide.title}`}>
                  <Image
                    alt={slide.alt}
                    fill
                    priority={index === 0}
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 52vw, 590px"
                    src={slide.image}
                  />
                </Link>
                {hotspots.map((hotspot) => (
                  <Link className="hotspot" href={hotspot.href} key={hotspot.label} style={hotspotStyle(hotspot)} aria-label={hotspot.label}>
                    <span className="hotspotChip" aria-hidden="true"><Plus size={18} /></span>
                    <span className="hotspotLabel" aria-hidden="true">{hotspot.label}</span>
                  </Link>
                ))}
              </div>
            </article>
          );
        })}

        <div className="promoCarouselControls" aria-label="Carousel controls">
          <button className="promoCarouselArrow" type="button" onClick={() => move(-1)} aria-label="Previous promotion">
            <ChevronLeft aria-hidden="true" />
          </button>
          <div className="promoCarouselDots" aria-label="Choose a promotion">
            {slides.map((slide, index) => (
              <button
                aria-label={`Show ${slide.title}`}
                aria-pressed={index === activeIndex}
                className={`promoCarouselDot${index === activeIndex ? " is-active" : ""}`}
                key={slide.id}
                onClick={() => setActiveIndex(index)}
                onFocus={() => setActiveIndex(index)}
                type="button"
              />
            ))}
          </div>
          <button className="promoCarouselArrow" type="button" onClick={() => move(1)} aria-label="Next promotion">
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
}
