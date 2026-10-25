"use client";

import type { ReactNode } from "react";

import { useScrollReveal } from "./use-scroll-reveal";
import styles from "./scroll-reveal.module.css";

export function ScrollReveal({
  children,
  delayMs = 0,
}: {
  children: ReactNode;
  delayMs?: number;
}) {
  const reveal = useScrollReveal<HTMLDivElement>();
  return (
    <div
      ref={reveal.ref}
      className={`${reveal.className} ${styles.item}`}
      data-scroll-reveal={reveal.state}
      style={{ transitionDelay: `${Math.max(0, delayMs)}ms` }}
    >
      {children}
    </div>
  );
}
