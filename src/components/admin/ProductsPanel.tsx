"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  Archive,
  ChevronDown,
  Download,
  MoreHorizontal,
  Package,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { products as initialProducts, inr, type AdminProduct } from "./admin-data";
import { Card, PageHeader, StatusBadge, statusTone } from "./AdminUI";
import styles from "./admin.module.css";

export function ProductsPanel() {
  const [catalog, setCatalog] = useState<AdminProduct[]>(initialProducts);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All categories");
  const [adding, setAdding] = useState(false);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return catalog.filter((product) =>
      (!needle || [product.name, product.category, product.sku].some((value) => value.toLowerCase().includes(needle))) &&
      (category === "All categories" || product.category === category),
    );
  }, [catalog, query, category]);

  function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") || "Untitled product");
    const newProduct: AdminProduct = {
      id: `p${Date.now()}`,
      name,
      category: String(data.get("category") || "Name labels"),
      sku: String(data.get("sku") || "NEW-001"),
      price: Number(data.get("price") || 0),
      stock: 0,
      orders: 0,
      status: "Draft",
      personalized: data.get("personalized") === "on",
      art: "labels",
    };
    setCatalog((current) => [newProduct, ...current]);
    setAdding(false);
  }

  const categories = Array.from(new Set(catalog.map((product) => product.category)));
  const activeCount = catalog.filter((product) => product.status === "Active").length;
  const lowCount = catalog.filter((product) => product.status === "Low stock").length;

  return (
    <>
      <PageHeader
        actions={
          <>
            <button className={styles.buttonSecondary} type="button"><Download size={14} /> Export</button>
            <button className={styles.buttonPrimary} onClick={() => setAdding(true)} type="button"><Plus size={14} /> Add product</button>
          </>
        }
        description="Build a clean catalog, control inventory, and connect each personalized product to the right design experience."
        eyebrow="Catalog"
        title="Products"
      />

      <Card>
        <div className={styles.catalogSummary}>
          <span className={styles.summaryItem}><strong>{catalog.length}</strong> products</span>
          <span className={styles.summaryItem}><strong>{activeCount}</strong> active</span>
          <span className={styles.summaryItem}><strong>{lowCount}</strong> low stock</span>
          <span className={styles.summaryItem}><strong>{categories.length}</strong> categories</span>
        </div>
        <div className={styles.toolbar}>
          <label className={styles.localSearch}>
            <span className={styles.srOnly}>Search products</span>
            <Search size={14} />
            <input className={styles.input} onChange={(event) => setQuery(event.target.value)} placeholder="Search product or SKU" type="search" value={query} />
          </label>
          <select aria-label="Product category" className={styles.select} onChange={(event) => setCategory(event.target.value)} value={category}>
            <option>All categories</option>
            {categories.map((option) => <option key={option}>{option}</option>)}
          </select>
          <select aria-label="Product status" className={styles.select}><option>All statuses</option><option>Active</option><option>Draft</option><option>Low stock</option></select>
          <button className={styles.buttonSecondary} type="button"><SlidersHorizontal size={13} /> Filters</button>
          <span className={styles.resultCount}>{filtered.length} products</span>
        </div>

        {filtered.length ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Product</th><th>Status</th><th>Inventory</th><th>Price</th><th>Orders</th><th>Personalization</th><th /></tr></thead>
              <tbody>
                {filtered.map((product) => {
                  const stockWidth = Math.min(100, Math.round((product.stock / 130) * 100));
                  return (
                    <tr key={product.id}>
                      <td>
                        <div className={styles.productNameCell}>
                          <span className={styles.productThumb} data-art={product.art} />
                          <span className={styles.cellStack}><strong>{product.name}</strong><span>{product.category} · {product.sku}</span></span>
                        </div>
                      </td>
                      <td><StatusBadge tone={statusTone(product.status)}>{product.status}</StatusBadge></td>
                      <td>
                        <span className={styles.cellStack}><strong>{product.stock ? `${product.stock} in stock` : "Not tracked"}</strong>
                          <span className={`${styles.stockMeter} ${product.stock < 20 ? styles.stockLow : ""}`}><span style={{ width: `${stockWidth}%` }} /></span>
                        </span>
                      </td>
                      <td><strong>{inr(product.price)}</strong></td>
                      <td>{product.orders}</td>
                      <td>{product.personalized ? <StatusBadge tone="violet">Enabled</StatusBadge> : <StatusBadge>Standard</StatusBadge>}</td>
                      <td><button aria-label={`Actions for ${product.name}`} className={styles.buttonGhost} type="button"><MoreHorizontal size={15} /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.emptyState}><div><span className={styles.emptyIcon}><Package size={20} /></span><h3>No matching products</h3><p>Try a broader search or clear your category filter.</p></div></div>
        )}
      </Card>

      {adding && (
        <>
          <button aria-label="Close product form" className={styles.drawerBackdrop} onClick={() => setAdding(false)} type="button" />
          <aside aria-label="Add product" className={styles.drawer}>
            <div className={styles.drawerHeader}>
              <div><h3>Add a new product</h3><p>Start with the essentials. You can add variants next.</p></div>
              <button aria-label="Close" className={styles.iconButton} onClick={() => setAdding(false)} type="button"><X size={16} /></button>
            </div>
            <form className={styles.drawerBody} onSubmit={createProduct}>
              <div className={styles.personalizationCard}>
                <span>New catalog item</span><strong>Ready for your details</strong><p>Products are saved as drafts until you publish them.</p>
              </div>
              <div className={styles.detailSection}>
                <div className={styles.editorFields}>
                  <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Product name</span><input className={styles.input} name="name" placeholder="e.g. Waterproof name labels" required /></label>
                  <div className={styles.fieldGrid}>
                    <label className={styles.fieldGroup}><span className={styles.fieldLabel}>SKU</span><input className={styles.input} name="sku" placeholder="NL-WP-048" required /></label>
                    <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Price (₹)</span><input className={styles.input} min="0" name="price" placeholder="649" required type="number" /></label>
                  </div>
                  <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Category</span>
                    <select className={styles.select} name="category">{categories.map((option) => <option key={option}>{option}</option>)}</select>
                  </label>
                  <label className={styles.toggleRow}>
                    <span className={styles.toggleCopy}><strong>Enable personalization</strong><span>Attach text fields and design templates.</span></span>
                    <input defaultChecked name="personalized" type="checkbox" />
                  </label>
                </div>
              </div>
              <div className={styles.drawerFooter}>
                <button className={styles.buttonSecondary} onClick={() => setAdding(false)} type="button">Cancel</button>
                <button className={styles.buttonPrimary} type="submit"><Archive size={13} /> Save draft</button>
              </div>
            </form>
          </aside>
        </>
      )}
    </>
  );
}
