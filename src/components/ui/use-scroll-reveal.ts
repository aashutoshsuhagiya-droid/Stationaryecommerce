"use client";

import { useLayoutEffect, useRef, useState } from "react";
import {
  observeScrollReveal,
  REDUCED_MOTION_QUERY,
  type ReducedMotionPreference,
  type ScrollRevealObserverFactory,
} from "@/lib/scroll-reveal";
import styles from "./scroll-reveal.module.css";

type ScrollRevealState = "pending" | "visible";

export function useScrollReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [state, setState] = useState<ScrollRevealState>("visible");

  // Install the pending state before paint so server-rendered content never flashes away.
  useLayoutEffect(() => {
    const target = ref.current;
    if (!target) return;

    const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY);
    const motionPreference: ReducedMotionPreference = {
      get matches() {
        return mediaQuery.matches;
      },
      subscribe(listener) {
        const handleChange = (event: MediaQueryListEvent) => listener(event.matches);
        mediaQuery.addEventListener("change", handleChange);
        return () => mediaQuery.removeEventListener("change", handleChange);
      },
    };
    const createObserver: ScrollRevealObserverFactory | undefined =
      typeof window.IntersectionObserver === "function"
        ? (listener) => new window.IntersectionObserver(
            (entries) => listener(entries),
            { rootMargin: "0px 0px -10%", threshold: 0.12 },
          )
        : undefined;

    return observeScrollReveal({
      target,
      motionPreference,
      createObserver,
      onPending: () => setState("pending"),
      onReveal: () => setState("visible"),
    });
  }, []);

  return { ref, state, className: styles.reveal };
}
