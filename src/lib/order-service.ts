import { createHash, randomUUID } from "node:crypto";

import { CommerceError } from "./commerce-error";
import {
  designTemplates,
  getProductById,
  neutralPresentationPalette,
  sampleOrder,
} from "./data";
import { buildProductConfiguration } from "./product-configuration";
import { priceCatalogItem } from "./pricing-service";
import type { Order, OrderItemSnapshot, PersonalizationValues } from "./types";
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

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function createOrderCustomization(
  input: OrderItemInput,
  priced: ReturnType<typeof priceCatalogItem>,
): PersonalizationValues | undefined {
  const submitted = input.customization;
  if (!submitted) return undefined;
  const product = getProductById(priced.productId);
  if (!product) {
    throw new CommerceError(404, "PRODUCT_NOT_FOUND", "The selected product no longer exists.");
  }
  const configuration = buildProductConfiguration(product);
  const preset = submitted.dimensionPresetId
    ? configuration.dimensions.presets.find((candidate) => candidate.id === submitted.dimensionPresetId)
    : configuration.dimensions.presets.find((candidate) => candidate.id === configuration.dimensions.defaultPresetId);
  if (!preset) {
    throw new CommerceError(
      422,
      "DIMENSION_PRESET_INVALID",
      "The selected dimensions are not available for this product.",
      { productId: product.id, dimensionPresetId: submitted.dimensionPresetId },
    );
  }
  if (submitted.dimensionLabel && submitted.dimensionLabel.trim() !== preset.label) {
    throw new CommerceError(
      422,
      "DIMENSION_LABEL_MISMATCH",
      "The submitted dimension label does not match the selected catalog preset.",
      { productId: product.id, dimensionPresetId: preset.id },
    );
  }
  const supportedUnits = configuration.dimensions.supportedDisplayUnits;
  const displayUnit = submitted.displayUnit ?? supportedUnits[0] ?? configuration.dimensions.canonicalUnit;
  if (
    (supportedUnits.length > 0 && !supportedUnits.includes(displayUnit)) ||
    (supportedUnits.length === 0 && displayUnit !== configuration.dimensions.canonicalUnit)
  ) {
    throw new CommerceError(
      422,
      "DISPLAY_UNIT_INVALID",
      "The selected measurement unit is not available for this product.",
      { productId: product.id, displayUnit },
    );
  }

  const template = submitted.templateId
    ? designTemplates.find((candidate) => candidate.id === submitted.templateId)
    : undefined;
  const fontField = product.customizationFields.find((field) => field.id === "font");
  const fontValue = submitted.fields.font;
  const fontLabel = fontField?.options?.find((option) => option.value === fontValue)?.label
    ?? fontValue
    ?? "Product default";
  const nameLayer = submitted.artwork?.surfaces
    .flatMap((surface) => surface.layers)
    .find((layer) => layer.id === "personalization-name" && layer.type === "text");
  const name = submitted.fields.name?.trim() || product.name;
  const detail = submitted.fields["class-details"]?.trim() || submitted.fields.subtitle?.trim();
  const {
    quote: _untrustedQuote,
    presentation: _untrustedPresentation,
    dimensionPresetId: _untrustedDimensionPresetId,
    dimensionLabel: _untrustedDimensionLabel,
    displayUnit: _untrustedDisplayUnit,
    ...stable
  } = submitted;

  return {
    ...stable,
    dimensionPresetId: preset.id,
    dimensionLabel: preset.label,
    displayUnit,
    presentation: {
      name,
      ...(detail ? { detail } : {}),
      templateLabel: template?.name ?? "Product default",
      fontLabel,
      textColor: nameLayer?.type === "text" ? nameLayer.color : template?.preview.foreground ?? neutralPresentationPalette.ink,
      backgroundColor: template?.preview.background ?? neutralPresentationPalette.surface,
      packLabel: priced.productSnapshot.variantName,
      materialLabel: priced.productSnapshot.material,
    },
  };
}

function createOrderItem(input: OrderItemInput): OrderItemSnapshot {
  const priced = priceCatalogItem(input);
  const customization = createOrderCustomization(input, priced);

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
    ...(customization ? { customization } : {}),
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
  const payloadHash = createHash("sha256").update(canonicalJson(input)).digest("hex");
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
    ...(input.notes ? { notes: input.notes } : {}),
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

export function toOrderTrackingSummary(order: Order) {
  return {
    orderNumber: order.orderNumber,
    currency: order.currency,
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    itemCount: order.items.length,
    totalPaise: order.totalPaise,
    updatedAt: order.updatedAt,
  };
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
