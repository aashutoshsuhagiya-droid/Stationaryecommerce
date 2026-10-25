import styles from "./storefront-skeletons.module.css";

function SkeletonCard({ index }: { index: number }) {
  return (
    <div className={styles.card} aria-hidden="true" key={index}>
      <div className={styles.media} />
      <div className={styles.line} />
      <div className={styles.line} />
      <div className={styles.line} />
    </div>
  );
}

export function CatalogSkeleton() {
  return (
    <div className={styles.catalog} role="status" aria-label="Loading products">
      <div className={styles.catalogHero} aria-hidden="true">
        <div className="shell">
          <div className={`${styles.line} ${styles.breadcrumb}`} />
          <div className={`${styles.line} ${styles.eyebrow}`} />
          <div className={`${styles.line} ${styles.title}`} />
          <div className={`${styles.line} ${styles.copy}`} />
        </div>
      </div>
      <div className={`shell ${styles.catalogLayout}`}>
        <aside className={styles.sidebar} aria-hidden="true">
          <div className={`${styles.line} ${styles.filterTitle}`} />
          {Array.from({ length: 3 }, (_, index) => (
            <div className={styles.filterGroup} key={index}>
              <div className={`${styles.line} ${styles.filterLabel}`} />
              <div className={`${styles.line} ${styles.filterOption}`} />
              <div className={`${styles.line} ${styles.filterOption}`} />
              <div className={`${styles.line} ${styles.filterOption}`} />
            </div>
          ))}
        </aside>
        <div className={styles.results}>
          <div className={styles.toolbar} aria-hidden="true">
            <div className={`${styles.line} ${styles.toolbarChip}`} />
            <div className={`${styles.line} ${styles.toolbarSort}`} />
          </div>
          <div className={styles.grid}>
            {Array.from({ length: 8 }, (_, index) => <SkeletonCard index={index} key={index} />)}
          </div>
        </div>
      </div>
      <span className="sr-only">Loading products…</span>
    </div>
  );
}

export function ProductSkeleton() {
  return (
    <div className={`shell ${styles.product}`} role="status" aria-label="Loading product">
      <div className={styles.productGrid}>
        <div className={styles.gallery}><div className={styles.media} /></div>
        <div className={styles.details}>
          <div className={styles.line} />
          <div className={styles.line} />
          <div className={styles.line} />
          <div className={styles.panel} />
          <div className={styles.panel} />
          <div className={styles.panel} />
        </div>
      </div>
      <span className="sr-only">Loading product…</span>
    </div>
  );
}

export function PreviewSkeleton() {
  return <div className={styles.preview} role="status"><span>Preparing your 3D preview…</span></div>;
}
