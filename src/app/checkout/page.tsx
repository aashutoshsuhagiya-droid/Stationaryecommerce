import type { Metadata } from "next";
import { CheckoutView } from "@/components/commerce/CheckoutView";

export const metadata: Metadata = { title: "Secure checkout", robots: { index: false, follow: false } };
export default function CheckoutPage() { return <CheckoutView />; }
