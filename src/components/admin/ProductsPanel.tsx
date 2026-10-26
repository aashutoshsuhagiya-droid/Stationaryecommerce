"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
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
  const [categoryRecords, setCategoryRecords] = useState<Array<{ id: string; name: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function loadCatalog() {
    const response = await fetch("/api/admin/catalog", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message || "Could not load the live catalog.");
    setCatalog(payload.data.products);
    setCategoryRecords(payload.data.categories.map((item: { id: string; name: string }) => ({ id: item.id, name: item.name })));
  }

  useEffect(() => { loadCatalog().catch(() => undefined); }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return catalog.filter((product) =>
      (!needle || [product.name, product.category, product.sku].some((value) => value.toLowerCase().includes(needle))) &&
      (category === "All categories" || product.category === category),
    );
  }, [catalog, query, category]);

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/admin/catalog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "product", name: String(data.get("name")), sku: String(data.get("sku")), categoryId: String(data.get("category")), price: Number(data.get("price")), imageUrl: String(data.get("imageUrl")), material: String(data.get("material") || ""), sizes: String(data.get("sizes") || "").split(",").map((value) => value.trim()).filter(Boolean), sizeDescription: String(data.get("sizeDescription") || ""), features: String(data.get("features") || "").split(",").map((value) => value.trim()).filter(Boolean), description: String(data.get("description") || ""), customizable: data.get("personalized") === "on", published: data.get("published") === "on", allow2D: data.get("allow2D") === "on", allow3D: data.get("allow3D") === "on", quantityMin: Number(data.get("quantityMin") || 1), quantityMax: Number(data.get("quantityMax") || 100), productionDaysMin: Number(data.get("productionDaysMin") || 0), productionDaysMax: Number(data.get("productionDaysMax") || 0) }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message || "Could not save product.");
      await loadCatalog(); setAdding(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save product."); } finally { setSaving(false); }
  }

  async function addCategory() {
    const name = window.prompt("Category name");
    if (!name?.trim()) return;
    const parentName = window.prompt(`Parent category (optional). Available: ${categoryRecords.map((category) => category.name).join(", ") || "none"}`)?.trim();
    const parentId = parentName ? categoryRecords.find((category) => category.name.toLowerCase() === parentName.toLowerCase())?.id : undefined;
    if (parentName && !parentId) { setError("Parent category was not found. Create it first or leave the parent blank."); return; }
    const response = await fetch("/api/admin/catalog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "category", name: name.trim(), parentId }) });
    if (response.ok) await loadCatalog(); else setError("Could not create the category.");
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
            <button className={styles.buttonSecondary} onClick={addCategory} type="button"><Plus size={14} /> Add category</button>
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
                    <select className={styles.select} name="category" required>{categoryRecords.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select>
                  </label>
                  <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Product image URL</span><input className={styles.input} name="imageUrl" placeholder="https://…" required type="url" /></label>
                  <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Material</span><input className={styles.input} name="material" placeholder="e.g. Vinyl, cotton, stainless steel" /></label>
                  <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Sizes / formats</span><input className={styles.input} name="sizes" placeholder="e.g. A5, A4, 50 × 30 mm" /><small>Separate options with commas.</small></label>
                  <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Size guide shown to customers</span><input className={styles.input} name="sizeDescription" placeholder="e.g. 50 × 30 mm per label; fits most lunch boxes" /></label>
                  <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Customer-facing features</span><input className={styles.input} name="features" placeholder="Waterproof, Dishwasher safe" /><small>Separate features with commas.</small></label>
                  <label className={styles.fieldGroup}><span className={styles.fieldLabel}>Description</span><textarea className={styles.textarea} name="description" placeholder="What customers should know about this product" /></label>
                  <div className={styles.fieldGrid}><label className={styles.fieldGroup}><span className={styles.fieldLabel}>Min production days</span><input className={styles.input} min="0" name="productionDaysMin" type="number" defaultValue="0" /></label><label className={styles.fieldGroup}><span className={styles.fieldLabel}>Max production days</span><input className={styles.input} min="0" name="productionDaysMax" type="number" defaultValue="0" /></label></div>
                  <label className={styles.toggleRow}>
                    <span className={styles.toggleCopy}><strong>Enable personalization</strong><span>Attach text fields and design templates.</span></span>
                    <input defaultChecked name="personalized" type="checkbox" />
                  </label>
                  <div className={styles.detailSection}><p className={styles.sectionCaption}>Customer configurator</p><label className={styles.toggleRow}><span className={styles.toggleCopy}><strong>Enable 2D layout editor</strong><span>Customers can position text and artwork on the product.</span></span><input defaultChecked name="allow2D" type="checkbox" /></label><label className={styles.toggleRow}><span className={styles.toggleCopy}><strong>Enable 3D preview</strong><span>Customers can inspect the live design in 3D.</span></span><input defaultChecked name="allow3D" type="checkbox" /></label><div className={styles.fieldGrid}><label className={styles.fieldGroup}><span className={styles.fieldLabel}>Minimum quantity</span><input className={styles.input} defaultValue="1" min="1" name="quantityMin" type="number" /></label><label className={styles.fieldGroup}><span className={styles.fieldLabel}>Maximum quantity</span><input className={styles.input} defaultValue="100" min="1" name="quantityMax" type="number" /></label></div></div>
                  <label className={styles.toggleRow}><span className={styles.toggleCopy}><strong>Publish on storefront</strong><span>Customers can see it immediately after saving.</span></span><input name="published" type="checkbox" /></label>
                  {error && <p className={styles.formError} role="alert">{error}</p>}
                </div>
              </div>
              <div className={styles.drawerFooter}>
                <button className={styles.buttonSecondary} onClick={() => setAdding(false)} type="button">Cancel</button>
                <button className={styles.buttonPrimary} disabled={saving || !categoryRecords.length} type="submit"><Archive size={13} /> {saving ? "Saving…" : "Save product"}</button>
              </div>
            </form>
          </aside>
        </>
      )}
    </>
  );
}
