"use client";

import { useMemo, useState } from "react";
import { Box, Check, Package, PenLine, Search, ShoppingBag, Sticker, Tag } from "lucide-react";

import { searchCategoryOptions, type CategoryOption } from "@/lib/listing-wizard";
import styles from "../admin.module.css";

function OptionIcon({ option }: { option: CategoryOption }) {
  const model = option.recipe?.model3D ?? "";
  const Icon = /bag|envelope/.test(model) ? ShoppingBag
    : /box|carton|pouch/.test(model) ? Box
    : /pencil|notebook/.test(model) ? PenLine
    : /sheet|label/.test(model) ? Sticker
    : option.recipe ? Tag : Package;
  return <Icon aria-hidden size={26} />;
}

function CategoryCard({ option, selected, best, onPick }: { option: CategoryOption; selected: boolean; best?: boolean; onPick: (option: CategoryOption) => void }) {
  return (
    <button aria-pressed={selected} className={selected ? styles.listingCategoryCardActive : styles.listingCategoryCard} onClick={() => onPick(option)} type="button">
      <span className={styles.listingCategoryImage}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {option.imageUrl ? <img alt="" loading="lazy" src={option.imageUrl} /> : <OptionIcon option={option} />}
        {selected && <span className={styles.listingCategoryCheck}><Check aria-hidden size={14} /></span>}
      </span>
      <strong>{option.label}</strong>
      <small>{option.benefit}</small>
      <span className={styles.listingBadges}>
        <span className={option.has3D ? styles.listingBadge3D : styles.listingBadge2D}>{option.has3D ? "3D preview" : "2D only"}</span>
        {best && <span className={styles.listingBadgeBest}>Best match</span>}
      </span>
    </button>
  );
}

/**
 * Step 2: the top three guesses as picture cards, a search box for anything
 * else, and the whole list one tap away. One list — no separate "types" and
 * "shelves".
 */
export function CategoryPicker({
  suggestions,
  options,
  selectedId,
  onPick,
}: {
  suggestions: readonly CategoryOption[];
  options: readonly CategoryOption[];
  selectedId: string;
  onPick: (option: CategoryOption) => void;
}) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const results = useMemo(() => searchCategoryOptions(options, query), [options, query]);
  const selected = options.find((option) => option.categoryId === selectedId);
  const suggestionIds = new Set(suggestions.map((option) => option.categoryId));

  return (
    <div className={styles.listingPicker}>
      <div className={styles.listingCategoryGrid}>
        {suggestions.map((option, index) => (
          <CategoryCard best={index === 0} key={option.categoryId} onPick={onPick} option={option} selected={option.categoryId === selectedId} />
        ))}
        {selected && !suggestionIds.has(selected.categoryId) && <CategoryCard onPick={onPick} option={selected} selected />}
      </div>
      <label className={styles.listingSearch}>
        <Search aria-hidden size={15} />
        <input aria-label="Something else? Type it" className={styles.input} onChange={(event) => setQuery(event.target.value)} placeholder="Something else? Type it…" type="search" value={query} />
      </label>
      {query.trim() && (results.length
        ? <div className={styles.listingCategoryList}>{results.map((option) => <CategoryCard key={option.categoryId} onPick={(picked) => { onPick(picked); setQuery(""); }} option={option} selected={option.categoryId === selectedId} />)}</div>
        : <p className={styles.listingMuted}>Nothing matches “{query.trim()}”. Try another word, like “box”, “pen” or “bag”.</p>)}
      {!query.trim() && (
        <details className={styles.listingAllTypes} onToggle={(event) => setShowAll((event.target as HTMLDetailsElement).open)} open={showAll}>
          <summary>See all {options.length} product types</summary>
          {showAll && <div className={styles.listingCategoryList}>
            {options.map((option) => <CategoryCard key={option.categoryId} onPick={onPick} option={option} selected={option.categoryId === selectedId} />)}
          </div>}
        </details>
      )}
    </div>
  );
}
