"use client";

import { useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronRight,
  Download,
  FileText,
  KanbanSquare,
  List,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { orders, inr, type AdminOrder } from "./admin-data";
import { Card, PageHeader, StatusBadge, statusTone } from "./AdminUI";
import styles from "./admin.module.css";

type View = "table" | "board";

const boardColumns = [
  { title: "Needs review", statuses: ["New", "Artwork review"] },
  { title: "In production", statuses: ["In production"] },
  { title: "Quality check", statuses: ["Quality check"] },
  { title: "Ready & shipped", statuses: ["Ready to ship", "Shipped"] },
];

export function OrdersPanel() {
  const [view, setView] = useState<View>("table");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All statuses");
  const [selected, setSelected] = useState<AdminOrder | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return orders.filter((order) => {
      const matchesQuery = !needle || [order.id, order.customer, order.product, order.detail].some((value) => value.toLowerCase().includes(needle));
      const matchesStatus = status === "All statuses" || order.status === status;
      return matchesQuery && matchesStatus;
    });
  }, [query, status]);

  return (
    <>
      <PageHeader
        actions={
          <>
            <button className={styles.buttonSecondary} type="button"><Download size={14} /> Export</button>
            <button className={styles.buttonPrimary} type="button"><Plus size={14} /> Create order</button>
          </>
        }
        description="Review personalization, keep production moving, and hand every parcel to shipping with confidence."
        eyebrow="Operations"
        title="Orders & fulfillment"
      />

      <Card>
        <div className={styles.catalogSummary}>
          <span className={styles.summaryItem}><strong>28</strong> open orders</span>
          <span className={styles.summaryItem}><strong>6</strong> need review</span>
          <span className={styles.summaryItem}><strong>2</strong> due today</span>
          <span className={styles.summaryItem}><strong>9</strong> ready to dispatch</span>
        </div>
        <div className={styles.toolbar}>
          <label className={styles.localSearch}>
            <span className={styles.srOnly}>Search orders</span>
            <Search size={14} />
            <input className={styles.input} onChange={(event) => setQuery(event.target.value)} placeholder="Search order, customer or product" type="search" value={query} />
          </label>
          <select aria-label="Order status" className={styles.select} onChange={(event) => setStatus(event.target.value)} value={status}>
            <option>All statuses</option>
            {["New", "Artwork review", "In production", "Quality check", "Ready to ship", "Shipped"].map((option) => <option key={option}>{option}</option>)}
          </select>
          <button className={styles.buttonSecondary} type="button"><CalendarDays size={13} /> Date</button>
          <button className={styles.buttonSecondary} type="button"><SlidersHorizontal size={13} /> More filters</button>
          <div aria-label="Change order view" className={styles.segmentControl}>
            <button aria-label="Table view" className={`${styles.segmentButton} ${view === "table" ? styles.segmentActive : ""}`} onClick={() => setView("table")} type="button"><List size={14} /></button>
            <button aria-label="Board view" className={`${styles.segmentButton} ${view === "board" ? styles.segmentActive : ""}`} onClick={() => setView("board")} type="button"><KanbanSquare size={14} /></button>
          </div>
          <span className={styles.resultCount}>{filtered.length} orders shown</span>
        </div>

        {view === "table" ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Order</th><th>Customer</th><th>Product & personalization</th><th>Payment</th><th>Fulfillment</th><th>Due</th><th /></tr></thead>
              <tbody>
                {filtered.map((order) => (
                  <tr className={styles.clickRow} key={order.id} onClick={() => setSelected(order)}>
                    <td><span className={styles.orderId}>{order.id}</span><span className={styles.cellStack}><span>{order.placed}</span></span></td>
                    <td>
                      <div className={styles.customerCell}>
                        <span className={styles.avatar} data-color={order.color}>{order.initials}</span>
                        <span className={styles.cellStack}><strong>{order.customer}</strong><span>{order.email}</span></span>
                      </div>
                    </td>
                    <td><span className={styles.cellStack}><strong>{order.product}</strong><span>{order.detail}</span></span></td>
                    <td><span className={styles.cellStack}><strong>{inr(order.total)}</strong><span><StatusBadge tone={statusTone(order.payment)}>{order.payment}</StatusBadge></span></span></td>
                    <td><StatusBadge tone={statusTone(order.status)}>{order.status}</StatusBadge></td>
                    <td>{order.due}</td>
                    <td><button aria-label={`Open ${order.id}`} className={styles.buttonGhost} type="button"><ChevronRight size={14} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.kanban}>
            {boardColumns.map((column) => {
              const columnOrders = filtered.filter((order) => column.statuses.includes(order.status));
              return (
                <div className={styles.kanbanColumn} key={column.title}>
                  <div className={styles.kanbanHeader}><span>{column.title}</span><span className={styles.kanbanCount}>{columnOrders.length}</span></div>
                  <div className={styles.kanbanStack}>
                    {columnOrders.map((order) => (
                      <article className={styles.orderCard} key={order.id} onClick={() => setSelected(order)}>
                        <div className={styles.orderCardTop}><strong>{order.id}</strong><span>{order.due}</span></div>
                        <h4>{order.product}</h4><p>{order.detail}</p>
                        <div className={styles.orderCardFoot}><span>{order.customer}</span><strong>{inr(order.total)}</strong></div>
                      </article>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {selected && (
        <>
          <button aria-label="Close order details" className={styles.drawerBackdrop} onClick={() => setSelected(null)} type="button" />
          <aside aria-label={`Details for ${selected.id}`} className={styles.drawer}>
            <div className={styles.drawerHeader}>
              <div><h3>{selected.id}</h3><p>Placed {selected.placed}</p></div>
              <button aria-label="Close" className={styles.iconButton} onClick={() => setSelected(null)} type="button"><X size={16} /></button>
            </div>
            <div className={styles.drawerBody}>
              <div className={styles.detailHero}>
                <span className={styles.avatar} data-color={selected.color}>{selected.initials}</span>
                <div><h4>{selected.customer}</h4><p>{selected.email}</p></div>
                <strong>{inr(selected.total)}</strong>
              </div>

              <div className={styles.detailSection}>
                <h4>Personalization preview</h4>
                <div className={styles.personalizationCard}>
                  <span>{selected.product}</span>
                  <strong>{selected.detail.split(" · ").at(-1)}</strong>
                  <p>{selected.detail}</p>
                </div>
              </div>

              <div className={styles.detailSection}>
                <h4>Order details</h4>
                <div className={styles.detailRows}>
                  <div className={styles.detailRow}><span>Payment</span><StatusBadge tone={statusTone(selected.payment)}>{selected.payment}</StatusBadge></div>
                  <div className={styles.detailRow}><span>Fulfillment</span><StatusBadge tone={statusTone(selected.status)}>{selected.status}</StatusBadge></div>
                  <div className={styles.detailRow}><span>Production due</span><strong>{selected.due}</strong></div>
                  <div className={styles.detailRow}><span>Artwork file</span><strong>300 DPI · Print ready</strong></div>
                </div>
              </div>

              <div className={styles.detailSection}>
                <h4>Internal note</h4>
                <textarea className={styles.textarea} defaultValue="Double-check name spelling against the final artwork before printing." />
              </div>

              <div className={styles.drawerFooter}>
                <button className={styles.buttonSecondary} type="button"><FileText size={13} /> Packing slip</button>
                <button className={styles.buttonPrimary} type="button">Update status <ChevronRight size={13} /></button>
              </div>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
