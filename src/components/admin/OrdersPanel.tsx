"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Check,
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

type ArtworkAssetSummary = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
  hasTransparency: boolean;
  status: string;
};

type OrderItemSummary = {
  id: string;
  productNameSnapshot: string;
  quantity: number;
  lineTotalPaise: number;
  personalization: { values: unknown; artworkStatus: string; approvedAt: string | null; templateSnapshot: unknown } | null;
  artworkAssets: ArtworkAssetSummary[];
};

type OrderRow = AdminOrder & { databaseId?: string; items?: OrderItemSummary[] };

type ApiOrder = {
  id: string;
  orderNumber: string;
  customerEmail: string;
  status: string;
  paymentStatus: string;
  totalPaise: number;
  placedAt: string;
  addresses: Array<{ fullName: string; city: string; postalCode: string }>;
  items: OrderItemSummary[];
};

const boardColumns = [
  { title: "Needs review", statuses: ["New", "Artwork review"] },
  { title: "In production", statuses: ["In production"] },
  { title: "Quality check", statuses: ["Quality check"] },
  { title: "Ready & shipped", statuses: ["Ready to ship", "Shipped"] },
];

function titleCase(value: string) {
  return value.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function humanizeKey(value: string) {
  return value.replaceAll(/[-_]+/g, " ").replace(/^./, (character) => character.toUpperCase());
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function personalizationParts(value: unknown, templateSnapshot?: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const record = value as Record<string, unknown>;
  const presentation = recordValue(record.presentation);
  const fields = recordValue(record.fields);
  const template = recordValue(templateSnapshot);
  const parts = [
    typeof presentation.templateLabel === "string" ? presentation.templateLabel : typeof template.name === "string" ? template.name : undefined,
    typeof presentation.packLabel === "string" ? presentation.packLabel : undefined,
    typeof presentation.materialLabel === "string" ? presentation.materialLabel : undefined,
    typeof record.dimensionLabel === "string" ? record.dimensionLabel : undefined,
    typeof presentation.name === "string" ? presentation.name : undefined,
    typeof presentation.detail === "string" ? presentation.detail : undefined,
    ...Object.entries(fields)
      .filter(([key, item]) => key !== "name" && typeof item === "string" && item.trim())
      .map(([key, item]) => `${humanizeKey(key)}: ${item}`),
  ].filter((item): item is string => Boolean(item));
  return [...new Set(parts)];
}

function personalizationArtworkSummary(value: unknown) {
  const artwork = recordValue(recordValue(value).artwork);
  const surfaces = Array.isArray(artwork.surfaces) ? artwork.surfaces : [];
  let textCount = 0;
  let imageCount = 0;
  for (const surface of surfaces) {
    const layers = Array.isArray(recordValue(surface).layers) ? recordValue(surface).layers as unknown[] : [];
    for (const layer of layers) {
      const type = recordValue(layer).type;
      if (type === "text") textCount += 1;
      if (type === "image") imageCount += 1;
    }
  }
  if (!surfaces.length && !textCount && !imageCount) return "";
  return [
    `${surfaces.length} print surface${surfaces.length === 1 ? "" : "s"}`,
    `${textCount} text layer${textCount === 1 ? "" : "s"}`,
    `${imageCount} image layer${imageCount === 1 ? "" : "s"}`,
  ].join(" · ");
}

function formatAssetSize(bytes: number) {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.ceil(bytes / 1024))} KB`;
}

function personalizationVisualizationSummary(value: unknown) {
  const visualization = recordValue(recordValue(value).visualization);
  if (!Object.keys(visualization).length) return "";
  const dimensions = recordValue(visualization.dimensionsMm);
  const dimensionLabel = ["width", "height", "depth", "diameter", "gusset"]
    .flatMap((key) => typeof dimensions[key] === "number"
      ? [`${humanizeKey(key)} ${dimensions[key]} mm`]
      : [])
    .join(" x ");
  const mappings = Array.isArray(visualization.surfaceMappings)
    ? visualization.surfaceMappings.length
    : Array.isArray(visualization.surfaceIds) ? visualization.surfaceIds.length : 0;
  return [
    typeof visualization.model === "string"
      ? `3D model: ${humanizeKey(visualization.model)}`
      : "Versioned 3D preview",
    typeof visualization.templateVersion === "number"
      ? `template v${visualization.templateVersion}`
      : typeof visualization.configurationVersion === "string"
        ? visualization.configurationVersion
        : undefined,
    dimensionLabel || undefined,
    mappings ? `${mappings} mapped surface${mappings === 1 ? "" : "s"}` : undefined,
  ].filter((item): item is string => Boolean(item)).join(" · ");
}

function personalizationVisualizationSourceAssetId(value: unknown) {
  const sourceAssetId = recordValue(recordValue(value).visualization).sourceAssetId;
  return typeof sourceAssetId === "string" && /^[a-zA-Z0-9_-]{1,120}$/.test(sourceAssetId)
    ? sourceAssetId
    : undefined;
}

function assetStatus(value: string) {
  return value === "ATTACHED" ? "Attached privately" : titleCase(value);
}

function mapApiOrder(order: ApiOrder): OrderRow {
  const customer = order.addresses[0]?.fullName || order.customerEmail.split("@", 1)[0] || "Customer";
  const initials = customer.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "CU";
  const firstItem = order.items[0];
  const detailParts = firstItem?.personalization
    ? personalizationParts(firstItem.personalization.values, firstItem.personalization.templateSnapshot)
    : [];
  if (order.items.length > 1) detailParts.push(`+${order.items.length - 1} more item${order.items.length === 2 ? "" : "s"}`);
  const payment: AdminOrder["payment"] = order.paymentStatus === "CAPTURED"
    ? "Paid"
    : order.paymentStatus === "REFUNDED" || order.paymentStatus === "PARTIALLY_REFUNDED"
      ? "Refunded"
      : "Pending";
  const statusByValue: Record<string, AdminOrder["status"]> = {
    ORDER_RECEIVED: "New",
    PAYMENT_CONFIRMED: "New",
    CUSTOMIZATION_REVIEW: "Artwork review",
    PRODUCTION_APPROVED: "In production",
    IN_PRODUCTION: "In production",
    QUALITY_CHECK: "Quality check",
    READY_TO_SHIP: "Ready to ship",
    SHIPPED: "Shipped",
  };
  return {
    id: order.orderNumber,
    databaseId: order.id,
    customer,
    initials,
    email: order.customerEmail,
    product: firstItem?.productNameSnapshot ?? "Order",
    detail: detailParts.join(" · ") || `${order.items.reduce((total, item) => total + item.quantity, 0)} item(s)`,
    total: order.totalPaise / 100,
    payment,
    status: statusByValue[order.status] ?? "New",
    placed: new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(order.placedAt)),
    due: order.status === "CUSTOMIZATION_REVIEW" ? "Review now" : titleCase(order.status),
    color: "teal",
    items: order.items,
  };
}

export function OrdersPanel() {
  const [view, setView] = useState<View>("table");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All statuses");
  const [selected, setSelected] = useState<OrderRow | null>(null);
  const [liveOrders, setLiveOrders] = useState<OrderRow[] | null>(null);
  const [reviewingItemId, setReviewingItemId] = useState<string | null>(null);
  const [reviewMessage, setReviewMessage] = useState<{ text: string; error: boolean } | null>(null);

  const refreshOrders = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch("/api/admin/orders", { cache: "no-store", signal });
    const payload = await response.json() as { data?: { orders?: ApiOrder[] }; error?: { message?: string } };
    if (!response.ok || !payload.data?.orders) {
      throw new Error(payload.error?.message ?? "Orders could not be refreshed.");
    }
    const mapped = payload.data.orders.map(mapApiOrder);
    setLiveOrders(mapped);
    setSelected((current) => current?.databaseId
      ? mapped.find((order) => order.databaseId === current.databaseId) ?? current
      : current);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    refreshOrders(controller.signal)
      .catch(() => undefined);
    return () => controller.abort();
  }, [refreshOrders]);

  async function reviewArtwork(orderId: string, orderItemId: string, decision: "APPROVE" | "REJECT") {
    setReviewingItemId(orderItemId);
    setReviewMessage(null);
    try {
      const response = await fetch("/api/admin/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, orderItemId, decision }),
      });
      const payload = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "The artwork review could not be saved.");
      await refreshOrders();
      setReviewMessage({ text: decision === "APPROVE" ? "Artwork approved for production." : "Artwork rejected and returned to review.", error: false });
    } catch (error) {
      setReviewMessage({ text: error instanceof Error ? error.message : "The artwork review could not be saved.", error: true });
    } finally {
      setReviewingItemId(null);
    }
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (liveOrders ?? orders).filter((order) => {
      const matchesQuery = !needle || [order.id, order.customer, order.product, order.detail].some((value) => value.toLowerCase().includes(needle));
      const matchesStatus = status === "All statuses" || order.status === status;
      return matchesQuery && matchesStatus;
    });
  }, [liveOrders, query, status]);

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
                  <tr className={styles.clickRow} key={order.id} onClick={() => { setSelected(order); setReviewMessage(null); }}>
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
                      <article className={styles.orderCard} key={order.id} onClick={() => { setSelected(order); setReviewMessage(null); }}>
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
                {reviewMessage && <p aria-live="polite" className={`${styles.artworkReviewMessage} ${reviewMessage.error ? styles.artworkReviewMessageError : ""}`}>{reviewMessage.text}</p>}
                {selected.items?.length ? selected.items.map((item) => (
                  <div className={styles.personalizationCard} key={item.id}>
                    <span>{item.productNameSnapshot} × {item.quantity}</span>
                    <strong>{item.personalization ? `Artwork: ${titleCase(item.personalization.artworkStatus)}` : "No personalisation submitted"}</strong>
                    {item.personalization && <>
                      <p>{personalizationParts(item.personalization.values, item.personalization.templateSnapshot).join(" · ") || "Saved product defaults"}</p>
                      {personalizationArtworkSummary(item.personalization.values) && <p className={styles.personalizationArtworkMeta}>{personalizationArtworkSummary(item.personalization.values)}</p>}
                      {personalizationVisualizationSummary(item.personalization.values) && <p className={styles.personalizationArtworkMeta}>{personalizationVisualizationSummary(item.personalization.values)}</p>}
                      {personalizationVisualizationSourceAssetId(item.personalization.values) && <a className={styles.buttonGhost} href={`/api/admin/visualization-studio/assets/${encodeURIComponent(personalizationVisualizationSourceAssetId(item.personalization.values)!)}`}><Download size={12} /> View 3D source artwork</a>}
                    </>}
                    {item.artworkAssets.length > 0 ? (
                      <ul className={styles.personalizationAssets} aria-label={`Private artwork files for ${item.productNameSnapshot}`}>
                        {item.artworkAssets.map((asset) => (
                          <li key={asset.id}>
                            <div><b>{asset.originalName}</b><small>{asset.mimeType.replace("image/", "").toUpperCase()} · {asset.width}×{asset.height}px · {formatAssetSize(asset.sizeBytes)}{asset.hasTransparency ? " · Transparency" : ""}</small><em>{assetStatus(asset.status)}</em></div>
                            <a aria-label={`Download private artwork ${asset.originalName}`} href={`/api/artwork-assets/${encodeURIComponent(asset.id)}`}><Download size={12} /> Download</a>
                          </li>
                        ))}
                      </ul>
                    ) : item.personalization && <p className={styles.personalizationArtworkMeta}>No customer image file attached.</p>}
                    {item.personalization && selected.databaseId && (
                      <div className={styles.artworkReviewActions}>
                        <button
                          className={styles.buttonPrimary}
                          disabled={reviewingItemId === item.id || item.personalization.artworkStatus === "APPROVED"}
                          type="button"
                          onClick={() => void reviewArtwork(selected.databaseId!, item.id, "APPROVE")}
                        ><Check size={13} /> {reviewingItemId === item.id ? "Saving..." : "Approve artwork"}</button>
                        <button
                          className={styles.buttonDanger}
                          disabled={reviewingItemId === item.id || item.personalization.artworkStatus === "REJECTED"}
                          type="button"
                          onClick={() => void reviewArtwork(selected.databaseId!, item.id, "REJECT")}
                        ><X size={13} /> Reject artwork</button>
                      </div>
                    )}
                  </div>
                )) : (
                  <div className={styles.personalizationCard}>
                    <span>{selected.product}</span>
                    <strong>{selected.detail.split(" · ").at(-1)}</strong>
                    <p>{selected.detail}</p>
                  </div>
                )}
              </div>

              <div className={styles.detailSection}>
                <h4>Order details</h4>
                <div className={styles.detailRows}>
                  <div className={styles.detailRow}><span>Payment</span><StatusBadge tone={statusTone(selected.payment)}>{selected.payment}</StatusBadge></div>
                  <div className={styles.detailRow}><span>Fulfillment</span><StatusBadge tone={statusTone(selected.status)}>{selected.status}</StatusBadge></div>
                  <div className={styles.detailRow}><span>Production due</span><strong>{selected.due}</strong></div>
                  <div className={styles.detailRow}><span>Artwork files</span><strong>{selected.items?.reduce((total, item) => total + item.artworkAssets.length, 0) ?? 0} private original(s)</strong></div>
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
