"use client";

import {
  AlertCircle,
  ArrowRight,
  Check,
  CircleDollarSign,
  Clock3,
  LoaderCircle,
  PackageCheck,
  PauseCircle,
  RefreshCw,
  Store,
  Truck,
  Wifi,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import styles from "./vendor.module.css";

type AvailabilityStatus = "ONLINE" | "OFFLINE" | "PAUSED";
type OrderAction = "START_PRODUCTION" | "SEND_TO_QUALITY_CHECK" | "MARK_READY_TO_SHIP";

type OrderSummary = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  currency: string;
  subtotalPaise: number;
  totalPaise: number;
  placedAt: string;
  completedAt: string | null;
  items: Array<{
    id: string;
    productNameSnapshot: string;
    quantity: number;
    lineTotalPaise: number;
  }>;
  addresses: Array<{
    fullName: string;
    phone: string;
    addressLine1: string;
    addressLine2: string | null;
    landmark: string | null;
    city: string;
    state: string;
    postalCode: string;
  }>;
};

type VendorWorkspace = {
  profile: {
    id: string;
    verificationStatus: "PENDING" | "APPROVED" | "REJECTED";
    operationalStatus: "INACTIVE" | "ACTIVE" | "SUSPENDED" | "CLOSED";
    availabilityStatus: AvailabilityStatus;
    acceptingOrders: boolean;
    maxConcurrentOrders: number;
    activeOrderCount: number;
    servicePostalCodes: string[];
    capabilityCount: number;
  };
  offers: Array<{
    id: string;
    status: string;
    expiresAt: string;
    acceptedAt: string | null;
    declinedAt: string | null;
    rejectionReason: string | null;
    createdAt: string;
    assignment: {
      id: string;
      status: string;
      order: OrderSummary;
    };
  }>;
  orders: Array<{
    id: string;
    status: string;
    assignedAt: string | null;
    order: OrderSummary;
  }>;
  earnings: {
    currency: string;
    completedOrderCount: number;
    grossFulfilledValuePaise: number;
    disclosure: string;
  };
};

type ApiBody<T> = { data?: T; error?: { message?: string } };
type Notice = { tone: "success" | "error"; message: string };

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const orderActionByStatus: Record<string, { action: OrderAction; label: string }> = {
  PRODUCTION_APPROVED: { action: "START_PRODUCTION", label: "Start production" },
  IN_PRODUCTION: { action: "SEND_TO_QUALITY_CHECK", label: "Send to quality check" },
  QUALITY_CHECK: { action: "MARK_READY_TO_SHIP", label: "Mark ready to ship" },
};

function apiMessage<T>(body: ApiBody<T>, fallback: string) {
  return body.error?.message?.trim() || fallback;
}

function money(paise: number) {
  return currencyFormatter.format(paise / 100);
}

function readableStatus(value: string) {
  return value.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function formatDateTime(value: string) {
  return dateTimeFormatter.format(new Date(value));
}

function shippingAddress(order: OrderSummary) {
  const address = order.addresses[0];
  if (!address) return "Shipping address unavailable";
  return [address.addressLine1, address.addressLine2, address.landmark, address.city, address.state, address.postalCode]
    .filter(Boolean)
    .join(", ");
}

export function VendorOperationsWorkspace({ initialSuspended }: { initialSuspended: boolean }) {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<VendorWorkspace | null>(null);
  const [availabilityStatus, setAvailabilityStatus] = useState<AvailabilityStatus>("OFFLINE");
  const [acceptingOrders, setAcceptingOrders] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [pendingAction, setPendingAction] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);

  const loadWorkspace = useCallback(async (options?: { quiet?: boolean; signal?: AbortSignal }) => {
    if (!options?.quiet) setLoading(true);
    setLoadError("");

    try {
      const response = await fetch("/api/vendor/workspace", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        signal: options?.signal,
      });
      const body = await response.json().catch(() => ({})) as ApiBody<VendorWorkspace>;
      if (!response.ok || !body.data) throw new Error(apiMessage(body, "The operations workspace could not be loaded."));
      setWorkspace(body.data);
      setAvailabilityStatus(body.data.profile.availabilityStatus);
      setAcceptingOrders(body.data.profile.acceptingOrders);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setLoadError(error instanceof Error ? error.message : "The operations workspace could not be loaded.");
    } finally {
      if (!options?.signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadWorkspace({ signal: controller.signal });
    return () => controller.abort();
  }, [loadWorkspace]);

  const readOnly = workspace ? workspace.profile.operationalStatus !== "ACTIVE" : initialSuspended;
  const suspended = workspace ? workspace.profile.operationalStatus === "SUSPENDED" : initialSuspended;
  const mutating = Boolean(pendingAction);
  const pendingOffers = useMemo(
    () => workspace?.offers.filter((offer) => offer.status === "PENDING") ?? [],
    [workspace],
  );

  async function mutate<T>(key: string, url: string, init: RequestInit, successMessage: string) {
    if (readOnly) {
      setNotice({ tone: "error", message: "Operations are read-only while this partner profile is not active." });
      return null;
    }

    setPendingAction(key);
    setNotice(null);
    try {
      const response = await fetch(url, { ...init, credentials: "same-origin", cache: "no-store" });
      const body = await response.json().catch(() => ({})) as ApiBody<T>;
      if (!response.ok || !body.data) throw new Error(apiMessage(body, "The operation could not be completed."));
      await loadWorkspace({ quiet: true });
      setNotice({ tone: "success", message: successMessage });
      router.refresh();
      return body.data;
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "The operation could not be completed." });
      return null;
    } finally {
      setPendingAction("");
    }
  }

  async function updateAvailability(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await mutate(
      "availability",
      "/api/vendor/availability",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ availabilityStatus, acceptingOrders: availabilityStatus === "ONLINE" && acceptingOrders }),
      },
      availabilityStatus === "ONLINE" && acceptingOrders
        ? "You are online and accepting new order offers."
        : `Availability changed to ${availabilityStatus.toLowerCase()}.`,
    );
  }

  async function respondToOffer(offerId: string, decision: "accept" | "decline") {
    await mutate(
      `offer-${offerId}-${decision}`,
      `/api/vendor/offers/${offerId}/${decision}`,
      decision === "accept"
        ? { method: "POST" }
        : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) },
      decision === "accept" ? "Order offer accepted and added to assigned orders." : "Order offer declined.",
    );
  }

  async function updateOrder(orderId: string, action: OrderAction, label: string) {
    await mutate(
      `order-${orderId}`,
      `/api/vendor/orders/${orderId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      },
      `${label} recorded.`,
    );
  }

  return (
    <section className={styles.liveWorkspace} id="operations" aria-labelledby="live-operations-title">
      <div className={styles.liveWorkspaceHeading}>
        <div>
          <p>Live partner operations</p>
          <h2 id="live-operations-title">Offers, production and availability</h2>
          <span>Data in this workspace is loaded directly from your vendor profile.</span>
        </div>
        {workspace && (
          <div className={`${styles.liveStatePill} ${workspace.profile.availabilityStatus === "ONLINE" && workspace.profile.acceptingOrders ? styles.liveStateOnline : ""}`}>
            <span aria-hidden="true" />{readOnly ? readableStatus(workspace.profile.operationalStatus) : readableStatus(workspace.profile.availabilityStatus)}
          </div>
        )}
      </div>

      {notice && (
        <div className={`${styles.workspaceNotice} ${notice.tone === "success" ? styles.workspaceNoticeSuccess : styles.workspaceNoticeError}`} role={notice.tone === "error" ? "alert" : "status"}>
          {notice.tone === "success" ? <Check aria-hidden="true" size={17} /> : <AlertCircle aria-hidden="true" size={17} />}
          <span>{notice.message}</span>
          <button aria-label="Dismiss message" onClick={() => setNotice(null)} type="button"><X size={14} /></button>
        </div>
      )}

      {loading && (
        <div className={styles.workspaceLoading} role="status"><LoaderCircle aria-hidden="true" className={styles.spinning} size={22} />Loading live operations…</div>
      )}

      {!loading && loadError && (
        <div className={styles.workspaceLoadError} role="alert">
          <AlertCircle aria-hidden="true" size={22} />
          <div><strong>Operations unavailable</strong><span>{loadError}</span></div>
          <button onClick={() => void loadWorkspace()} type="button"><RefreshCw aria-hidden="true" size={14} />Try again</button>
        </div>
      )}

      {!loading && workspace && (
        <>
          {readOnly && (
            <div className={styles.workspaceReadOnly} role="status">
              <PauseCircle aria-hidden="true" size={20} />
              <div>
                <strong>{suspended ? "Operations suspended — workspace is read-only" : `${readableStatus(workspace.profile.operationalStatus)} profile — workspace is read-only`}</strong>
                <span>Availability, offer responses and order transitions are disabled. Existing operational records remain visible below.</span>
              </div>
            </div>
          )}

          <div className={styles.workspaceOverviewGrid}>
            <form className={styles.availabilityCard} onSubmit={updateAvailability}>
              <div className={styles.workspaceCardHeading}>
                <span><Wifi aria-hidden="true" size={18} /></span>
                <div><p>Marketplace availability</p><h3>Control new order intake</h3></div>
              </div>
              <label className={styles.workspaceSelectField}>
                <span>Availability state</span>
                <select
                  disabled={readOnly || mutating}
                  onChange={(event) => {
                    const next = event.target.value as AvailabilityStatus;
                    setAvailabilityStatus(next);
                    if (next !== "ONLINE") setAcceptingOrders(false);
                  }}
                  value={availabilityStatus}
                >
                  <option value="OFFLINE">Offline</option>
                  <option value="ONLINE">Online</option>
                  <option value="PAUSED">Paused</option>
                </select>
              </label>
              <label className={`${styles.acceptingToggle} ${availabilityStatus !== "ONLINE" ? styles.acceptingToggleDisabled : ""}`}>
                <input
                  checked={acceptingOrders}
                  disabled={readOnly || availabilityStatus !== "ONLINE" || mutating}
                  onChange={(event) => setAcceptingOrders(event.target.checked)}
                  type="checkbox"
                />
                <span><strong>Accept new order offers</strong><small>Only online, accepting partners are eligible for matching.</small></span>
              </label>
              <div className={styles.capacityLine}>
                <span>Active capacity</span>
                <strong>{workspace.profile.activeOrderCount} / {workspace.profile.maxConcurrentOrders} orders</strong>
              </div>
              <button disabled={readOnly || mutating} type="submit">
                {pendingAction === "availability" ? <LoaderCircle aria-hidden="true" className={styles.spinning} size={16} /> : <Check aria-hidden="true" size={16} />}
                {pendingAction === "availability" ? "Saving…" : "Save availability"}
              </button>
            </form>

            <article className={styles.earningsCard}>
              <div className={styles.workspaceCardHeading}>
                <span><CircleDollarSign aria-hidden="true" size={19} /></span>
                <div><p>Earnings overview</p><h3>Gross fulfilled value</h3></div>
              </div>
              <strong className={styles.earningsValue}>{money(workspace.earnings.grossFulfilledValuePaise)}</strong>
              <div className={styles.earningsMeta}>
                <span>Delivered orders</span><strong>{workspace.earnings.completedOrderCount}</strong>
              </div>
              <p>{workspace.earnings.disclosure}</p>
            </article>
          </div>

          <section className={styles.workspaceSection} aria-labelledby="pending-offers-title">
            <div className={styles.workspaceSectionHeading}>
              <div><p>Requires a response</p><h3 id="pending-offers-title">Pending offers</h3></div>
              <span>{pendingOffers.length}</span>
            </div>
            {pendingOffers.length ? (
              <div className={styles.offerList}>
                {pendingOffers.map((offer) => {
                  const order = offer.assignment.order;
                  const expired = new Date(offer.expiresAt).getTime() <= Date.now();
                  return (
                    <article className={styles.offerCard} key={offer.id}>
                      <div className={styles.offerTopline}>
                        <div><span>Order offer</span><strong>#{order.orderNumber}</strong></div>
                        <strong>{money(order.totalPaise)}</strong>
                      </div>
                      <div className={styles.offerFacts}>
                        <span><PackageCheck aria-hidden="true" size={14} />{order.items.reduce((total, item) => total + item.quantity, 0)} items</span>
                        <span><Truck aria-hidden="true" size={14} />{order.addresses[0]?.postalCode ?? "No PIN"}</span>
                        <span><Clock3 aria-hidden="true" size={14} />{expired ? "Expired" : `Expires ${formatDateTime(offer.expiresAt)}`}</span>
                      </div>
                      <ul>{order.items.map((item) => <li key={item.id}><span>{item.productNameSnapshot} × {item.quantity}</span><strong>{money(item.lineTotalPaise)}</strong></li>)}</ul>
                      <div className={styles.offerActions}>
                        <button disabled={readOnly || expired || mutating} onClick={() => void respondToOffer(offer.id, "decline")} type="button">
                          {pendingAction === `offer-${offer.id}-decline` ? <LoaderCircle aria-hidden="true" className={styles.spinning} size={15} /> : <X aria-hidden="true" size={15} />}Decline
                        </button>
                        <button disabled={readOnly || expired || mutating} onClick={() => void respondToOffer(offer.id, "accept")} type="button">
                          {pendingAction === `offer-${offer.id}-accept` ? <LoaderCircle aria-hidden="true" className={styles.spinning} size={15} /> : <Check aria-hidden="true" size={15} />}Accept offer
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className={styles.workspaceEmpty}><Store aria-hidden="true" size={21} /><div><strong>No pending offers</strong><span>Eligible order offers will appear here while your profile is online and accepting orders.</span></div></div>
            )}
          </section>

          <section className={styles.workspaceSection} aria-labelledby="assigned-orders-title">
            <div className={styles.workspaceSectionHeading}>
              <div><p>Fulfilment queue</p><h3 id="assigned-orders-title">Assigned orders</h3></div>
              <span>{workspace.orders.length}</span>
            </div>
            {workspace.orders.length ? (
              <div className={styles.assignedOrderList}>
                {workspace.orders.map((assignment) => {
                  const order = assignment.order;
                  const nextAction = assignment.status === "ASSIGNED" ? orderActionByStatus[order.status] : undefined;
                  const busy = pendingAction === `order-${order.id}`;
                  return (
                    <article className={styles.assignedOrder} key={assignment.id}>
                      <div className={styles.assignedOrderHeader}>
                        <div><span>#{order.orderNumber}</span><strong>{readableStatus(order.status)}</strong></div>
                        <div><strong>{money(order.totalPaise)}</strong><span>{formatDateTime(order.placedAt)}</span></div>
                      </div>
                      <div className={styles.assignedOrderBody}>
                        <div>
                          <p>Items</p>
                          <ul>{order.items.map((item) => <li key={item.id}><span>{item.productNameSnapshot} × {item.quantity}</span><strong>{money(item.lineTotalPaise)}</strong></li>)}</ul>
                        </div>
                        <div>
                          <p>Ship to</p>
                          <strong>{order.addresses[0]?.fullName ?? "Customer"}</strong>
                          <span>{shippingAddress(order)}</span>
                        </div>
                      </div>
                      <div className={styles.assignedOrderFooter}>
                        <span>Assignment: {readableStatus(assignment.status)}</span>
                        {nextAction ? (
                          <button disabled={readOnly || mutating} onClick={() => void updateOrder(order.id, nextAction.action, nextAction.label)} type="button">
                            {busy ? <LoaderCircle aria-hidden="true" className={styles.spinning} size={15} /> : <ArrowRight aria-hidden="true" size={15} />}
                            {busy ? "Updating…" : nextAction.label}
                          </button>
                        ) : (
                          <small>No vendor action available for this order state.</small>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className={styles.workspaceEmpty}><PackageCheck aria-hidden="true" size={21} /><div><strong>No assigned orders</strong><span>Accepted offers and current production work will appear here.</span></div></div>
            )}
          </section>
        </>
      )}
    </section>
  );
}
