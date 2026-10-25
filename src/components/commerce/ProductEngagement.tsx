"use client";

import Link from "next/link";
import { ArrowRight, Sparkles, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import type { Product } from "@/lib/types";
import { ProductCard } from "./ProductCard";
import styles from "./product-engagement.module.css";

const IDLE_SUGGESTION_DELAY_MS = 45_000;
const IDLE_SUGGESTION_STORAGE_KEY = "naamly-idle-suggestion-v1";

export function ProductEngagement({
  currentProductId,
  categorySlug,
  relatedProducts,
}: {
  currentProductId: string;
  categorySlug: string;
  relatedProducts: Product[];
}) {
  const [showIdleSuggestion, setShowIdleSuggestion] = useState(false);
  const hasShownIdleSuggestion = useRef(false);
  const idleSuggestionTitleId = useId();
  const firstRelated = relatedProducts[0];

  useEffect(() => {
    if (!firstRelated) return;
    try {
      if (window.sessionStorage.getItem(IDLE_SUGGESTION_STORAGE_KEY)) return;
    } catch {
      // Session storage can be unavailable in privacy-restricted browsers.
    }

    let timer: number | undefined;
    const schedule = () => {
      window.clearTimeout(timer);
      if (hasShownIdleSuggestion.current) return;
      timer = window.setTimeout(() => {
        if (hasShownIdleSuggestion.current) return;
        hasShownIdleSuggestion.current = true;
        setShowIdleSuggestion(true);
        try {
          window.sessionStorage.setItem(IDLE_SUGGESTION_STORAGE_KEY, "shown");
        } catch {
          // The in-memory state still guarantees one display for this mount.
        }
      }, IDLE_SUGGESTION_DELAY_MS);
    };
    const interactionEvents: Array<keyof WindowEventMap> = [
      "keydown",
      "pointerdown",
      "scroll",
      "touchstart",
    ];
    interactionEvents.forEach((eventName) => {
      window.addEventListener(eventName, schedule, { passive: true });
    });
    schedule();

    return () => {
      window.clearTimeout(timer);
      interactionEvents.forEach((eventName) => {
        window.removeEventListener(eventName, schedule);
      });
    };
  }, [currentProductId, firstRelated]);

  if (!relatedProducts.length) return null;

  return (
    <>
      <section className={styles.relatedSection} aria-labelledby="related-products-title">
        <div className="shell">
          <div className={styles.relatedHeader}>
            <div>
              <span>Keep exploring</span>
              <h2 id="related-products-title">More like this</h2>
            </div>
            <Link href={`/products?category=${encodeURIComponent(categorySlug)}`}>
              View the category <ArrowRight aria-hidden="true" />
            </Link>
          </div>
          <div className={styles.relatedRail}>
            {relatedProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </div>
      </section>

      {showIdleSuggestion && firstRelated && (
        <>
          <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
            A related product suggestion is available: {firstRelated.name}.
          </span>
          <aside className={styles.idleCard} aria-labelledby={idleSuggestionTitleId}>
            <button
              type="button"
              className={styles.dismiss}
              onClick={() => setShowIdleSuggestion(false)}
              aria-label="Dismiss suggestion"
            >
              <X aria-hidden="true" />
            </button>
            <Sparkles aria-hidden="true" />
            <h2 id={idleSuggestionTitleId}>A gentle nudge while you browse</h2>
            <p>Try another favourite from this collection when you are ready.</p>
            <Link href={`/products/${firstRelated.slug}`}>
              View {firstRelated.name} <ArrowRight aria-hidden="true" />
            </Link>
          </aside>
        </>
      )}
    </>
  );
}
