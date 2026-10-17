import { createHash, randomUUID } from "node:crypto";

import { designTemplates, getProductById, sampleOrder } from "./data";
import type { Order, OrderItemSnapshot, Product } from "./types";
import type { CreateOrderInput, OrderItemInput } from "./validation";

export class CommerceError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "CommerceError";
  }
}

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

const toPaise = (rupees: number) => Math.round(rupees * 100);
const normalizeOrderNumber = (orderNumber: string) => orderNumber.trim().toUpperCase();

function validateCustomization(product: Product, input: OrderItemInput) {
  const customization = input.customization;
  if (!product.customizable && customization) {
    throw new CommerceError(
      422,
      "CUSTOMIZATION_NOT_SUPPORTED",
      `${product.name} does not accept personalization.`,
      { productId: product.id },
    );
  }

  const supportedFieldIds = new Set(
    product.customizationFields
      .filter((field) => field.type !== "template")
      .map((field) => field.id),
  );
  const unsupportedFieldIds = Object.keys(customization?.fields ?? {}).filter(
    (fieldId) => !supportedFieldIds.has(fieldId),
  );
  if (unsupportedFieldIds.length > 0) {
    throw new CommerceError(
      422,
      "CUSTOMIZATION_FIELDS_INVALID",
      "The customization contains fields that are not available for this product.",
      { productId: product.id, fieldIds: unsupportedFieldIds },
    );
  }

  const requiredFields = product.customizationFields.filter(
    (field) => field.required && field.type !== "template",
  );

  if (requiredFields.length > 0 && !customization) {
    throw new CommerceError(
      422,
      "CUSTOMIZATION_REQUIRED",
      `Personalization is required for ${product.name}.`,
      { productId: product.id },
    );
  }

  const requiresTemplate = product.customizationFields.some(
    (field) => field.required && field.type === "template",
  );
  if (requiresTemplate && !customization?.templateId) {
    throw new CommerceError(
      422,
      "TEMPLATE_REQUIRED",
      `Choose a design for ${product.name}.`,
      { productId: product.id },
    );
  }

  let templatePricePaise = 0;
  if (customization?.templateId) {
    const template = designTemplates.find((candidate) => candidate.id === customization.templateId);
    if (
      !template ||
      !template.active ||
      !product.templateIds.includes(template.id) ||
      !template.compatibleProductIds.includes(product.id)
    ) {
      throw new CommerceError(
        422,
        "INVALID_TEMPLATE",
        "The selected design is not available for this product.",
        { productId: product.id, templateId: customization.templateId },
      );
    }
    templatePricePaise = toPaise(template.premiumPrice);
  }

  for (const field of product.customizationFields) {
    if (field.type === "template") continue;
    const rawValue = customization?.fields[field.id] ?? "";
    const value = rawValue.trim();

    if (field.required && !value) {
      throw new CommerceError(
        422,
        "CUSTOMIZATION_FIELD_REQUIRED",
        `${field.label} is required for ${product.name}.`,
        { productId: product.id, fieldId: field.id },
      );
    }
    if (!value) continue;

    if (field.minLength && value.length < field.minLength) {
      throw new CommerceError(422, "CUSTOMIZATION_TOO_SHORT", `${field.label} is too short.`, {
        productId: product.id,
        fieldId: field.id,
        minLength: field.minLength,
      });
    }
    if (field.maxLength && value.length > field.maxLength) {
      throw new CommerceError(422, "CUSTOMIZATION_TOO_LONG", `${field.label} is too long.`, {
        productId: product.id,
        fieldId: field.id,
        maxLength: field.maxLength,
      });
    }
    if (field.allowedPattern && !new RegExp(field.allowedPattern, "u").test(value)) {
      throw new CommerceError(
        422,
        "CUSTOMIZATION_UNSUPPORTED_CHARACTERS",
        `${field.label} contains unsupported characters.`,
        { productId: product.id, fieldId: field.id },
      );
    }
    if (
      field.options?.length &&
      !field.options.some((option) => option.value === value)
    ) {
      throw new CommerceError(
        422,
        "CUSTOMIZATION_OPTION_INVALID",
        `${field.label} is not an available option.`,
        { productId: product.id, fieldId: field.id },
      );
    }
  }

  return templatePricePaise;
}

function createOrderItem(input: OrderItemInput): OrderItemSnapshot {
  const product = getProductById(input.productId);
  if (!product) {
    throw new CommerceError(404, "PRODUCT_NOT_FOUND", "One of the selected products no longer exists.", {
      productId: input.productId,
    });
  }

  const variant = product.variants.find((candidate) => candidate.id === input.variantId);
  if (!variant) {
    throw new CommerceError(422, "VARIANT_NOT_FOUND", "The selected product option is unavailable.", {
      productId: product.id,
      variantId: input.variantId,
    });
  }
  if (variant.stockStatus === "out_of_stock") {
    throw new CommerceError(409, "OUT_OF_STOCK", `${variant.name} is currently unavailable.`, {
      productId: product.id,
      variantId: variant.id,
    });
  }

  const templatePricePaise = validateCustomization(product, input);
  const unitPricePaise = toPaise(variant.price) + templatePricePaise;
  const lineTotalPaise = unitPricePaise * input.quantity;

  return {
    id: randomUUID(),
    productId: product.id,
    variantId: variant.id,
    productName: product.name,
    productSlug: product.slug,
    sku: variant.sku,
    image: product.image,
    quantity: input.quantity,
    unitPricePaise,
    ...(input.customization ? { customization: input.customization } : {}),
    lineTotalPaise,
    productSnapshot: {
      name: product.name,
      sku: variant.sku,
      variantName: variant.name,
      material: variant.material ?? product.material,
      dimensions: product.dimensions,
    },
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
