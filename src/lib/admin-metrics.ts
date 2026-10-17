import type { AdminDashboardSnapshot, Order, Product } from "./types";

export function buildAdminDashboardSnapshot(input: {
  orders: Order[];
  products: Product[];
  source: AdminDashboardSnapshot["source"];
  generatedAt?: string;
}): AdminDashboardSnapshot {
  const { orders, products, source } = input;
  const count = (...statuses: Order["fulfillmentStatus"][]) =>
    orders.filter((order) => statuses.includes(order.fulfillmentStatus)).length;
  const paidRevenue = orders
    .filter((order) => order.paymentStatus === "paid")
    .reduce((total, order) => total + order.totalPaise, 0);
  const lowStock = products
    .flatMap((product) => product.variants)
    .filter((variant) => variant.stockStatus === "low_stock").length;

  return {
    source,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    currency: "INR",
    metrics: [
      {
        id: "total_orders",
        label: "Total orders",
        value: orders.length,
        format: "number",
        description: source === "demo" ? "Demo records only" : "All non-deleted orders",
      },
      {
        id: "revenue",
        label: "Paid revenue",
        value: paidRevenue,
        format: "currency",
        description: "Captured order value in paise; excludes pending and failed payments",
      },
      {
        id: "pending",
        label: "Pending orders",
        value: orders.filter(
          (order) =>
            order.paymentStatus === "pending" || order.fulfillmentStatus === "order_received",
        ).length,
        format: "number",
        description: "Awaiting payment or initial review",
      },
      {
        id: "in_production",
        label: "In production",
        value: count("customization_review", "production_approved", "in_production", "quality_check"),
        format: "number",
        description: "Customization through quality-check stages",
      },
      {
        id: "ready_to_ship",
        label: "Ready to ship",
        value: count("ready_to_ship"),
        format: "number",
        description: "Passed quality check",
      },
      {
        id: "completed",
        label: "Completed",
        value: count("delivered"),
        format: "number",
        description: "Delivered orders",
      },
      {
        id: "cancelled",
        label: "Cancelled",
        value: count("cancelled"),
        format: "number",
        description: "Cancelled orders",
      },
      {
        id: "low_stock",
        label: "Low-stock variants",
        value: lowStock,
        format: "number",
        description: "Variants flagged for attention",
      },
    ],
    recentOrders: [...orders]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 8)
      .map((order) => ({
        orderNumber: order.orderNumber,
        customerName: order.shippingAddress.fullName,
        paymentStatus: order.paymentStatus,
        fulfillmentStatus: order.fulfillmentStatus,
        totalPaise: order.totalPaise,
        createdAt: order.createdAt,
      })),
  };
}
