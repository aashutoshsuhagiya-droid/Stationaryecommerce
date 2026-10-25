export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export interface ReducedMotionPreference {
  readonly matches: boolean;
  subscribe?: (listener: (matches: boolean) => void) => () => void;
}

export interface ScrollRevealObserver {
  observe: (target: Element) => void;
  disconnect: () => void;
}

export type ScrollRevealObserverFactory = (
  listener: (entries: ReadonlyArray<{ isIntersecting: boolean }>) => void,
) => ScrollRevealObserver;

interface ObserveScrollRevealOptions {
  target: Element;
  motionPreference: ReducedMotionPreference;
  createObserver?: ScrollRevealObserverFactory;
  onPending: () => void;
  onReveal: () => void;
}

const noop: () => void = () => undefined;

export function observeScrollReveal({
  target,
  motionPreference,
  createObserver,
  onPending,
  onReveal,
}: ObserveScrollRevealOptions) {
  if (motionPreference.matches || !createObserver) {
    onReveal();
    return noop;
  }

  let active = true;
  let observer: ScrollRevealObserver | undefined;
  let unsubscribe = noop;

  const reveal = () => {
    if (!active) return;
    active = false;
    observer?.disconnect();
    unsubscribe();
    onReveal();
  };

  onPending();
  unsubscribe = motionPreference.subscribe?.((matches) => {
    if (matches) reveal();
  }) ?? noop;

  if (!active) {
    unsubscribe();
    return noop;
  }

  observer = createObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) reveal();
  });

  if (active) observer.observe(target);
  else observer.disconnect();

  return () => {
    if (!active) return;
    active = false;
    observer?.disconnect();
    unsubscribe();
  };
}
