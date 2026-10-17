import type { Metadata } from "next";
import { OrderConfirmationView } from "@/components/commerce/OrderConfirmationView";

export const metadata: Metadata = { title: "Order received", robots: { index: false, follow: false } };

export default async function OrderConfirmationPage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const query = await searchParams;
  const orderId = query.order?.replace(/[^a-zA-Z0-9-]/g, "") || "NMLY-DEMO-1001";
  return <OrderConfirmationView orderId={orderId} />;
}
