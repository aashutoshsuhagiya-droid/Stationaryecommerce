"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { categories as initialCategories } from "@/lib/data";
import type { Category } from "@/lib/types";

type GroupId = "labels" | "school" | "gifts" | "bulk";
type RailId = "all" | GroupId;

type RailItem = {
  id: RailId;
  label: string;
  href: string;
  accent: string;
  groupOrder: GroupId[];
};

type MenuGroup = {
  id: GroupId;
  title: string;
  accent: string;
  slugs: readonly string[];
  items: Category[];
};

type MegaMenuContextValue = {
  activeGroup: RailId;
  isDesktop: boolean;
  isOpen: boolean;
  railItems: readonly RailItem[];
  railRefs: MutableRefObject<Array<HTMLAnchorElement | null>>;
  closeNow: () => void;
  handleRailKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
  openGroup: (group: RailId) => void;
};

const CLOSE_DELAY_MS = 250;
const DESKTOP_QUERY = "(min-width: 1024px)";
const HOVER_DESKTOP_QUERY = "(min-width: 1024px) and (hover: hover)";

const groupDefinitions = [
  {
    id: "labels",
    title: "Label Essentials",
    accent: "var(--mega-labels)",
    slugs: ["customized-name-slips", "waterproof-stickers", "bottle-tiffin-labels"],
  },
  {
    id: "school",
    title: "School & Writing",
    accent: "var(--mega-school)",
    slugs: ["school-labels", "personalized-notebooks", "personalized-pencils-pens", "school-accessories"],
  },
  {
    id: "gifts",
    title: "Gifts & Keepsakes",
    accent: "var(--mega-gifts)",
    slugs: ["personalized-gifts", "name-plates-keychains"],
  },
  {
    id: "bulk",
    title: "Bulk & Institutional",
    accent: "var(--mega-bulk)",
    slugs: ["bulk-orders"],
  },
] as const;

const railItems: RailItem[] = [
  {
    id: "all",
    label: "All products",
    href: "/products",
    accent: "var(--mega-all)",
    groupOrder: ["labels", "school", "gifts", "bulk"],
  },
  {
    id: "labels",
    label: "Labels",
    href: "/products?category=customized-name-slips",
    accent: "var(--mega-labels)",
    groupOrder: ["labels", "school", "gifts"],
  },
  {
    id: "school",
    label: "School",
    href: "/products?category=school-labels",
    accent: "var(--mega-school)",
    groupOrder: ["school", "labels", "gifts"],
  },
  {
    id: "gifts",
    label: "Gifts",
    href: "/products?category=personalized-gifts",
    accent: "var(--mega-gifts)",
    groupOrder: ["gifts", "labels", "school"],
  },
  {
    id: "bulk",
    label: "Bulk",
    href: "/products?category=bulk-orders",
    accent: "var(--mega-bulk)",
    groupOrder: ["bulk", "gifts", "school"],
  },
];

const quickLinks = [
  { label: "New arrivals", href: "/products?sort=newest" },
  { label: "Custom size — request a quote", href: "/bulk-orders" },
  { label: "Bulk Buy", href: "/bulk-orders" },
  { label: "Sell with us", href: "/vendor/register" },
];

const MegaMenuContext = createContext<MegaMenuContextValue | null>(null);

function useMegaMenu() {
  const context = useContext(MegaMenuContext);
  if (!context) throw new Error("CategoryRail must be rendered inside CategoryMegaMenu.");
  return context;
}

export function CategoryRail() {
  const {
    activeGroup,
    closeNow,
    handleRailKeyDown,
    isDesktop,
    isOpen,
    openGroup,
    railItems: items,
    railRefs,
  } = useMegaMenu();

  return (
    <nav className="rail" aria-label="Shop product categories" onKeyDown={handleRailKeyDown}>
      {items.map((item, index) => {
        const isActive = isDesktop && isOpen && activeGroup === item.id;
        return (
          <Link
            aria-expanded={isActive}
            aria-haspopup="true"
            className={"railItem railItem--" + item.id + (isActive ? " is-active" : "")}
            href={item.href}
            key={item.id}
            onClick={closeNow}
            onFocus={() => openGroup(item.id)}
            onMouseEnter={() => openGroup(item.id)}
            ref={(node) => { railRefs.current[index] = node; }}
            style={{ "--rail-accent": item.accent } as CSSProperties}
          >
            {item.id === "all" && <span className="railGridChip" aria-hidden="true">⠿</span>}
            <span>{item.label}</span>
          </Link>
        );
      })}
      <Link className="railNewLink" href="/products?sort=newest" onFocus={closeNow} onMouseEnter={closeNow}>
        New arrivals <span>New</span>
      </Link>
    </nav>
  );
}

export function CategoryMegaMenu({ children }: { children: ReactNode }) {
  const [activeGroup, setActiveGroup] = useState<RailId>("all");
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [isDesktop, setIsDesktop] = useState(false);
  const [canHover, setCanHover] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const railRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const rootRef = useRef<HTMLDivElement>(null);

  const clearCloseTimer = useCallback(() => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const closeNow = useCallback(() => {
    clearCloseTimer();
    setIsOpen(false);
  }, [clearCloseTimer]);

  const closeAfterDelay = useCallback(() => {
    if (!isDesktop) return;
    clearCloseTimer();
    closeTimer.current = window.setTimeout(() => {
      setIsOpen(false);
      closeTimer.current = null;
    }, CLOSE_DELAY_MS);
  }, [clearCloseTimer, isDesktop]);

  const openGroup = useCallback((group: RailId) => {
    if (!isDesktop) return;
    clearCloseTimer();
    setActiveGroup(group);
    setIsOpen(true);
  }, [clearCloseTimer, isDesktop]);

  useEffect(() => {
    const desktopQuery = window.matchMedia(DESKTOP_QUERY);
    const hoverQuery = window.matchMedia(HOVER_DESKTOP_QUERY);
    const updateMedia = () => {
      setIsDesktop(desktopQuery.matches);
      setCanHover(hoverQuery.matches);
      if (!desktopQuery.matches) {
        clearCloseTimer();
        setIsOpen(false);
      }
    };

    updateMedia();
    desktopQuery.addEventListener("change", updateMedia);
    hoverQuery.addEventListener("change", updateMedia);
    return () => {
      desktopQuery.removeEventListener("change", updateMedia);
      hoverQuery.removeEventListener("change", updateMedia);
    };
  }, [clearCloseTimer]);

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  useEffect(() => {
    fetch("/api/products?limit=1", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (Array.isArray(payload?.categories)) setCategories(payload.categories);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!isOpen || !isDesktop) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeNow();
    }
    function onPointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) closeNow();
    }
    function onScroll() {
      closeNow();
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [closeNow, isDesktop, isOpen]);

  const groups = useMemo<MenuGroup[]>(() => {
    const categoryBySlug = new Map(categories.map((category) => [category.slug, category]));
    const categoryById = new Map(categories.map((category) => [category.id, category]));
    const knownSlugs = new Set<string>(groupDefinitions.flatMap((group) => group.slugs));
    const resolvedGroups = groupDefinitions.map((definition) => ({
      ...definition,
      items: definition.slugs
        .map((slug) => categoryBySlug.get(slug))
        .filter((category): category is Category => Boolean(category)),
    }));

    categories
      .filter((category) => !knownSlugs.has(category.slug))
      .forEach((category) => {
        const parent = category.parentId ? categoryById.get(category.parentId) : undefined;
        const parentGroupIndex = parent
          ? groupDefinitions.findIndex((group) => (group.slugs as readonly string[]).includes(parent.slug))
          : -1;
        const targetGroupIndex = parentGroupIndex >= 0 ? parentGroupIndex : 0;
        resolvedGroups[targetGroupIndex]?.items.push(category);
      });

    return resolvedGroups;
  }, [categories]);

  const activeRail = railItems.find((item) => item.id === activeGroup) ?? railItems[0]!;
  const orderedGroups = activeRail.groupOrder
    .map((groupId) => groups.find((group) => group.id === groupId))
    .filter((group): group is MenuGroup => Boolean(group));

  function handleRailKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (!isDesktop) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeNow();
      return;
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

    event.preventDefault();
    const focusedIndex = railRefs.current.findIndex((item) => item === document.activeElement);
    const currentIndex = focusedIndex >= 0 ? focusedIndex : railItems.findIndex((item) => item.id === activeGroup);
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (currentIndex + direction + railItems.length) % railItems.length;
    const nextItem = railItems[nextIndex]!;
    openGroup(nextItem.id);
    railRefs.current[nextIndex]?.focus();
  }

  const contextValue: MegaMenuContextValue = {
    activeGroup,
    closeNow,
    handleRailKeyDown,
    isDesktop,
    isOpen,
    openGroup,
    railItems,
    railRefs,
  };

  return (
    <MegaMenuContext.Provider value={contextValue}>
      <div
        className="megaMenu"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) closeAfterDelay();
        }}
        onMouseEnter={clearCloseTimer}
        onMouseLeave={() => {
          if (canHover) closeAfterDelay();
        }}
        ref={rootRef}
      >
        {children}
        {isDesktop && isOpen && (
          <section className="megaPanel" aria-label={activeRail.label + " product categories"}>
            <div className={"megaPanelGrid" + (activeRail.id === "all" ? " megaPanelGrid--all" : "")}>
              {orderedGroups.map((group) => (
                <div
                  className="megaPanelCol"
                  key={group.id}
                  style={{ "--mega-column-accent": group.accent } as CSSProperties}
                >
                  <h3>{group.title}</h3>
                  <ul>
                    {group.items.map((item) => (
                      <li key={item.id}>
                        <Link href={"/products?category=" + item.slug} onClick={closeNow}>{item.name}</Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <div
                className="megaPanelCol megaPanelShortcuts"
                style={{ "--mega-column-accent": activeRail.accent } as CSSProperties}
              >
                <h3>Shortcuts</h3>
                <ul>
                  {quickLinks.map((link) => (
                    <li key={link.href + "-" + link.label}>
                      <Link href={link.href} onClick={closeNow}>{link.label}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="megaPanelFooter">
              <Link href="/products" onClick={closeNow}>View all products <ArrowRight size={13} aria-hidden="true" /></Link>
              <p>Free artwork preflight check before anything reaches print.</p>
            </div>
          </section>
        )}
      </div>
    </MegaMenuContext.Provider>
  );
}
