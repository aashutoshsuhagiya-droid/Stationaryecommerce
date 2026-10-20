"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { ArrowRight, ChevronRight, LoaderCircle, Minus, PackageOpen, Plus, ShieldCheck, ShoppingBag, Tag, Trash2 } from "lucide-react";
import { ProductVisual } from "./ProductVisual";
import { MAX_CART_ITEM_QUANTITY, useStore } from "@/components/store/StoreProvider";
import { formatPrice } from "@/lib/data";

const SHIPPING_ESTIMATE = 79;

type CouponResponse = {
  data?: { message?: string };
  error?: {
    message?: string;
    details?: Array<{ message?: string }>;
  };
};

export function CartView() {
  const { cart, subtotal, updateQuantity, removeItem, isHydrated } = useStore();
  const estimatedTotal = subtotal + (cart.length ? SHIPPING_ESTIMATE : 0);
  const [couponCode, setCouponCode] = useState("");
  const [couponPending, setCouponPending] = useState(false);
  const [couponMessage, setCouponMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  async function validateCoupon(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCouponPending(true);
    setCouponMessage(null);

    try {
      const response = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: couponCode }),
      });
      const payload = await response.json().catch(() => null) as CouponResponse | null;
      if (!response.ok) {
        const fieldMessage = payload?.error?.details?.find((detail) => detail.message)?.message;
        throw new Error(fieldMessage ?? payload?.error?.message ?? "The coupon could not be checked.");
      }

      setCouponMessage({
        tone: "success",
        text: payload?.data?.message ?? "Coupon validated. Any discount will be calculated securely at checkout.",
      });
    } catch (error) {
      setCouponMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "The coupon could not be checked.",
      });
    } finally {
      setCouponPending(false);
    }
  }

  if (!isHydrated) return <section className="shell cart-empty" aria-busy="true"><div className="empty-state"><ShoppingBag size={38} /><h1>Loading your cart…</h1></div></section>;

  if (!cart.length) return <section className="shell cart-empty"><div className="empty-state"><ShoppingBag size={38} /><h1>Your cart is ready for something personal</h1><p>Explore the collection, create a design and it’ll be saved here with every selected detail.</p><Link href="/products" className="button button-primary">Explore products <ArrowRight /></Link></div></section>;

  return <>
    <section className="cart-title shell"><div className="breadcrumbs"><Link href="/">Home</Link><ChevronRight /><span>Cart</span></div><div><h1>Your cart</h1><span>{cart.reduce((sum, item) => sum + item.quantity, 0)} items</span></div></section>
    <section className="cart-layout shell">
      <div className="cart-items">
        <div className="cart-section-heading"><strong>Review your items</strong><span>Personalisation is saved separately for every item.</span></div>
        {cart.map((item) => <article className="cart-item" key={item.key}>
          <Link href={`/products/${item.slug}`} className="cart-item-visual"><ProductVisual artwork={item.visual} name={item.name} personalisedName={item.customization?.name || "Your Name"} accent={item.customization?.textColor} background={item.customization?.backgroundColor} /></Link>
          <div className="cart-item-info"><div className="cart-item-top"><div><span className="status-pill">Made to order</span><h2><Link href={`/products/${item.slug}`}>{item.name}</Link></h2></div><button onClick={() => removeItem(item.key)} aria-label={`Remove ${item.name}`}><Trash2 /></button></div>
            {item.customization && <div className="cart-customization"><div><span>Name</span><strong>{item.customization.name}</strong></div>{item.customization.detail && <div><span>Details</span><strong>{item.customization.detail}</strong></div>}<div><span>Design</span><strong>{item.customization.template}</strong></div><div><span>Pack</span><strong>{item.customization.pack}</strong></div>{item.customization.dimensionLabel && <div><span>Size</span><strong>{item.customization.dimensionLabel}</strong></div>}<div><span>Material</span><strong>{item.customization.material}</strong></div></div>}
            <div className="cart-item-bottom"><Link href={`/products/${item.slug}?edit=${encodeURIComponent(item.key)}`}>Edit {item.customization ? "design" : "product"}</Link><div className="quantity-control"><button onClick={() => updateQuantity(item.key, item.quantity - 1)} disabled={item.quantity <= 1} aria-label={`Decrease quantity of ${item.name}`}><Minus /></button><span aria-label={`Quantity ${item.quantity}`}>{item.quantity}</span><button onClick={() => updateQuantity(item.key, item.quantity + 1)} disabled={item.quantity >= MAX_CART_ITEM_QUANTITY} aria-label={`Increase quantity of ${item.name}`}><Plus /></button></div><strong>{formatPrice(item.price * item.quantity)}</strong></div>
          </div>
        </article>)}
        <Link className="continue-shopping" href="/products">← Continue shopping</Link>
      </div>
      <aside className="cart-summary card-panel">
        <h2>Order summary</h2>
        <dl><div><dt>Subtotal</dt><dd>{formatPrice(subtotal)}</dd></div><div><dt>Shipping estimate</dt><dd>{formatPrice(SHIPPING_ESTIMATE)}</dd></div><div><dt>Taxes</dt><dd>Calculated at checkout</dd></div></dl>
        <details className="coupon-box"><summary><Tag /> Have a coupon code? <ChevronRight /></summary><form onSubmit={validateCoupon}><input value={couponCode} onChange={(event) => { setCouponCode(event.target.value.toUpperCase()); setCouponMessage(null); }} placeholder="Enter code" aria-label="Coupon code" aria-describedby={`coupon-help${couponMessage ? " coupon-message" : ""}`} aria-invalid={couponMessage?.tone === "error"} autoComplete="off" minLength={3} maxLength={40} pattern="[A-Za-z0-9][A-Za-z0-9_-]*" required /><button type="submit" disabled={couponPending} aria-busy={couponPending}>{couponPending ? <><LoaderCircle className="coupon-spinner" aria-hidden="true" /> Checking</> : "Apply"}</button></form><small id="coupon-help">Coupons are validated against active store promotions.</small>{couponMessage && <p id="coupon-message" className="coupon-message" data-tone={couponMessage.tone} role={couponMessage.tone === "error" ? "alert" : "status"}>{couponMessage.text}</p>}</details>
        <div className="cart-total"><span>Estimated total <small>Final taxes shown at checkout</small></span><strong>{formatPrice(estimatedTotal)}</strong></div>
        <Link href="/checkout" className="button button-primary button-block">Continue to checkout <ArrowRight /></Link>
        <div className="summary-trust"><ShieldCheck /><span><strong>Your preview is attached</strong><small>Each item carries its own saved personalisation into the order.</small></span></div>
        <div className="summary-note"><PackageOpen /><span>Production begins after order and artwork checks. Product-specific timing stays visible in your confirmation.</span></div>
      </aside>
    </section>
  </>;
}
