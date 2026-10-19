import { createHash, randomUUID } from "node:crypto";

import { CommerceError } from "./commerce-error";
import { sampleOrder } from "./data";
import { priceCatalogItem } from "./pricing-service";
import type { Order, OrderItemSnapshot } from "./types";
import type { CreateOrderInput, OrderItemInput } from "./validation";

export { CommerceError } from "./commerce-error";

interface DemoOrderStore {
  orders: Map<string, Order>;
  idempotency: Map<string, { orderNumber: string; payloadHash: string }>;
  providerOrderIds: Map<string, string>;
}

declare global {
  // eslint-disable-next-line no-var
  var __naamlyDemoOrderStore: DemoOrderStore | undefined;
}

const demoStore: DemoOrderStore = globalThis.__naamlyDemoOrderStore ?? {
  orders: new Map([[sampleOrder.orderNumber, sampleOrder]]),
  idempotency: new Map(),
  providerOrderIds: new Map(),
};

if (process.env.NODE_ENV !== "production") {
  globalThis.__naamlyDemoOrderStore = demoStore;
}

const normalizeOrderNumber = (orderNumber: string) => orderNumber.trim().toUpperCase();

function createOrderItem(input: OrderItemInput): OrderItemSnapshot {
  const priced = priceCatalogItem(input);

  return {
    id: randomUUID(),
    productId: priced.productId,
    variantId: priced.variantId,
    productName: priced.productName,
    productSlug: priced.productSlug,
    sku: priced.sku,
    image: priced.image,
    quantity: priced.quantity,
    unitPricePaise: priced.unitPricePaise,
    ...(input.customization ? { customization: input.customization } : {}),
    lineTotalPaise: priced.lineTotalPaise,
    productSnapshot: priced.productSnapshot,
  };
}

function makeOrderNumber() {
  const day = new Date().toISOString().slice(2, 10).replaceAll("-", "");
  let orderNumber: string;
  do {
    const randomSuffix = randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase();
    orderNumber = `NMLY-${day}-${randomSuffix}`;
  } while (demoStore.orders.has(orderNumber));
  return orderNumber;
}

export function createDemoOrder(input: CreateOrderInput, idempotencyKey: string) {
  const payloadHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const previousRequest = demoStore.idempotency.get(idempotencyKey);
  if (previousRequest) {
    if (previousRequest.payloadHash !== payloadHash) {
      throw new CommerceError(
        409,
        "IDEMPOTENCY_KEY_REUSED",
        "This idempotency key was already used for a different order request.",
      );
    }
    const previous = demoStore.orders.get(previousRequest.orderNumber);
    if (previous) return { order: previous, replayed: true };
  }

  if (input.couponCode) {
    throw new CommerceError(
      422,
      "COUPON_NOT_CONFIGURED",
      "This demo catalog has no active coupon codes.",
    );
  }

  const items = input.items.map(createOrderItem);
  const subtotalPaise = items.reduce((total, item) => total + item.lineTotalPaise, 0);
  // This is an explicit demo setting, not a shipping promise. Production reads a ShippingMethod record.
  const shippingPaise = 7900;
  // Catalog prices are treated as tax-inclusive in demo mode; production needs merchant tax configuration.
  const taxPaise = 0;
  const discountPaise = 0;
  const now = new Date().toISOString();
  const order: Order = {
    id: randomUUID(),
    orderNumber: makeOrderNumber(),
    currency: "INR",
    items,
    shippingAddress: input.shippingAddress,
    paymentStatus: "pending",
    fulfillmentStatus: "order_received",
    subtotalPaise,
    shippingPaise,
    taxPaise,
    discountPaise,
    totalPaise: subtotalPaise + shippingPaise + taxPaise - discountPaise,
    createdAt: now,
    updatedAt: now,
  };

  demoStore.orders.set(order.orderNumber, order);
  demoStore.idempotency.set(idempotencyKey, { orderNumber: order.orderNumber, payloadHash });
  return { order, replayed: false };
}

export function getDemoOrder(orderNumber: string, email?: string) {
  const order = demoStore.orders.get(normalizeOrderNumber(orderNumber));
  if (!order) return undefined;
  if (email && order.shippingAddress.email.toLowerCase() !== email.toLowerCase()) return undefined;
  return order;
}

export function bindProviderOrder(orderNumber: string, providerOrderId: string) {
  const order = getDemoOrder(orderNumber);
  if (!order) {
    throw new CommerceError(404, "ORDER_NOT_FOUND", "Order not found.");
  }
  const current = demoStore.providerOrderIds.get(order.orderNumber);
  if (current && current !== providerOrderId) {
    throw new CommerceError(
      409,
      "PAYMENT_ORDER_MISMATCH",
      "This order is already bound to a different provider order.",
    );
  }
  demoStore.providerOrderIds.set(order.orderNumber, providerOrderId);
}

export function providerOrderMatches(orderNumber: string, providerOrderId: string) {
  return demoStore.providerOrderIds.get(normalizeOrderNumber(orderNumber)) === providerOrderId;
}

export function markDemoOrderPaid(orderNumber: string) {
  const order = getDemoOrder(orderNumber);
  if (!order) {
    throw new CommerceError(404, "ORDER_NOT_FOUND", "Order not found.");
  }
  if (order.paymentStatus === "paid") return order;
  const updated: Order = {
    ...order,
    paymentStatus: "paid",
    updatedAt: new Date().toISOString(),
  };
  demoStore.orders.set(order.orderNumber, updated);
  return updated;
}
