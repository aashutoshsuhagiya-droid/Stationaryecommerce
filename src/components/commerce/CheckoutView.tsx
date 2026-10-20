"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, ChevronRight, CreditCard, LockKeyhole, MapPin, PackageCheck, ShieldCheck, Truck } from "lucide-react";
import { useStore } from "@/components/store/StoreProvider";
import { designTemplates, formatPrice, getProductById } from "@/lib/data";
import type { Order } from "@/lib/types";
import { ProductVisual } from "./ProductVisual";

const SHIPPING = 79;
const INDIAN_STATES = [
  "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh",
  "Chhattisgarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa", "Gujarat", "Haryana",
  "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep",
  "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Puducherry",
  "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand",
  "West Bengal",
];

export function CheckoutView() {
  const { cart, subtotal, clearCart, isHydrated } = useStore();
  const router = useRouter();
  const [payment, setPayment] = useState("online");
  const [processing, setProcessing] = useState(false);
  const [formError, setFormError] = useState("");
  const idempotencyKey = useRef<string | null>(null);

  async function placeOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cart.length) { setFormError("Your cart is empty."); return; }
    const form = new FormData(event.currentTarget);
    const required = ["fullName", "mobile", "email", "postalCode", "city", "state", "addressLine1"];
    if (required.some((field) => !String(form.get(field) || "").trim())) { setFormError("Please complete all required delivery details."); return; }
    if (!/^[6-9]\d{9}$/.test(String(form.get("mobile")))) { setFormError("Enter a valid 10-digit Indian mobile number."); return; }
    if (!/^[1-9]\d{5}$/.test(String(form.get("postalCode")))) { setFormError("Enter a valid 6-digit PIN code."); return; }
    setFormError(""); setProcessing(true);
    try {
      const items = cart.map((item) => {
        const product = getProductById(item.productId);
        const variantId = item.variantId ?? product?.variants.find((variant) => variant.name === item.customization?.pack)?.id ?? product?.variants[0]?.id;
        if (!variantId) throw new Error(`${item.name} is no longer available. Remove it from your cart and add it again.`);
        const templateId = item.customization?.templateId ?? designTemplates.find((template) => template.name === item.customization?.template)?.id;
        return {
          productId: item.productId,
          variantId,
          quantity: item.quantity,
          ...(item.customization ? { customization: {
            ...(templateId ? { templateId } : {}),
            ...(item.customization.configurationId ? { configurationId: item.customization.configurationId } : {}),
            ...(item.customization.dimensionPresetId ? { dimensionPresetId: item.customization.dimensionPresetId } : {}),
            ...(item.customization.dimensionLabel ? { dimensionLabel: item.customization.dimensionLabel } : {}),
            ...(item.customization.displayUnit ? { displayUnit: item.customization.displayUnit } : {}),
            ...(item.customization.artwork ? { artwork: item.customization.artwork } : {}),
            fields: {
              ...(item.customization.fields ?? {
                name: item.customization.name,
                ...(item.customization.detail ? { "class-details": item.customization.detail } : {}),
                font: Object.entries({ rounded: "Friendly rounded", clean: "Clean sans", serif: "Classic serif" }).find(([, label]) => label === item.customization?.font)?.[0] ?? item.customization.font,
              }),
            },
            previewVersion: 1,
            presentation: {
              name: item.customization.name,
              ...(item.customization.detail ? { detail: item.customization.detail } : {}),
              templateLabel: item.customization.template,
              fontLabel: item.customization.font,
              textColor: item.customization.textColor,
              backgroundColor: item.customization.backgroundColor,
              packLabel: item.customization.pack,
              materialLabel: item.customization.material,
            },
            ...(item.customization.quote ? { quote: item.customization.quote } : {}),
          } } : {}),
        };
      });
      const requestKey = idempotencyKey.current ?? globalThis.crypto.randomUUID();
      idempotencyKey.current = requestKey;
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": requestKey },
        body: JSON.stringify({
          items,
          shippingAddress: {
            fullName: String(form.get("fullName")), mobile: String(form.get("mobile")), email: String(form.get("email")),
            addressLine1: String(form.get("addressLine1")), addressLine2: String(form.get("addressLine2") || ""),
            city: String(form.get("city")), state: String(form.get("state")), postalCode: String(form.get("postalCode")), country: "IN",
          },
          shippingMethod: "standard",
          acceptedTerms: form.get("acceptedTerms") === "on",
        }),
      });
      const payload = await response.json() as { data?: Order; error?: { message?: string } };
      if (!response.ok || !payload.data) throw new Error(payload.error?.message || "The order could not be created.");
      const order = payload.data;
      const record = { orderNumber: order.orderNumber, items: cart, total: order.totalPaise / 100, payment: payment === "online" ? "Payment setup required" : "Pay on delivery", placedAt: order.createdAt, customer: Object.fromEntries(form.entries()) };
      sessionStorage.setItem(`naamly-order-${order.orderNumber}`, JSON.stringify(record));
      clearCart();
      router.push(`/order-confirmation?order=${order.orderNumber}`);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "The order could not be created. Your cart is unchanged; please try again.");
      setProcessing(false);
    }
  }

  if (!isHydrated) return <section className="shell checkout-empty" aria-busy="true"><PackageCheck /><h1>Loading your checkout…</h1></section>;
  if (!cart.length) return <section className="shell checkout-empty"><PackageCheck /><h1>There’s nothing to check out yet.</h1><p>Your cart needs at least one item before an order can be created.</p><Link className="button button-primary" href="/products">Browse products</Link></section>;

  return <form className="checkout-page" onSubmit={placeOrder}>
    <div className="checkout-head"><div className="shell"><Link href="/cart"><ArrowLeft /> Back to cart</Link><div className="checkout-steps"><span className="complete"><Check /> Cart</span><i /><span className="active"><b>2</b> Details</span><i /><span><b>3</b> Confirmation</span></div><span><LockKeyhole /> Secure checkout</span></div></div>
    <div className="checkout-layout shell">
      <div className="checkout-form-area">
        <div className="checkout-section-title"><span>1</span><div><h1>Contact information</h1><p>We’ll use this only for order updates and support.</p></div></div>
        <div className="form-grid"><div className="form-field"><label htmlFor="fullName">Full name *</label><input id="fullName" name="fullName" autoComplete="name" required /></div><div className="form-field"><label htmlFor="mobile">Mobile number *</label><input id="mobile" name="mobile" inputMode="numeric" autoComplete="tel" placeholder="10-digit number" required /></div><div className="form-field full-span"><label htmlFor="email">Email address *</label><input id="email" name="email" type="email" autoComplete="email" required /><span className="field-hint">Order confirmation and receipts will be sent here.</span></div></div>

        <div className="checkout-separator" />
        <div className="checkout-section-title"><span>2</span><div><h2>Delivery address</h2><p>Indian address format with PIN validation.</p></div></div>
        <div className="form-grid"><div className="form-field"><label htmlFor="postalCode">PIN code *</label><input id="postalCode" name="postalCode" inputMode="numeric" autoComplete="postal-code" maxLength={6} required /></div><div className="form-field"><label htmlFor="state">State *</label><select id="state" name="state" required defaultValue=""><option value="" disabled>Select state or union territory</option>{INDIAN_STATES.map((state) => <option key={state}>{state}</option>)}</select></div><div className="form-field"><label htmlFor="city">City *</label><input id="city" name="city" autoComplete="address-level2" required /></div><div className="form-field"><label htmlFor="addressLine1">Flat / house / street *</label><input id="addressLine1" name="addressLine1" autoComplete="address-line1" required /></div><div className="form-field full-span"><label htmlFor="addressLine2">Area, landmark or delivery note</label><input id="addressLine2" name="addressLine2" autoComplete="address-line2" /></div></div>

        <div className="checkout-separator" />
        <div className="checkout-section-title"><span>3</span><div><h2>Shipping method</h2><p>Accurate estimates require a configured shipping provider.</p></div></div>
        <label className="shipping-option selected"><input type="radio" defaultChecked name="shipping" value="standard" /><Truck /><span><strong>Standard tracked shipping</strong><small>Dispatch timing follows the longest production window in your order.</small></span><b>{formatPrice(SHIPPING)}</b></label>

        <div className="checkout-separator" />
        <div className="checkout-section-title"><span>4</span><div><h2>Payment</h2><p>Card details are never stored by Naamly.</p></div></div>
        <div className="payment-options"><label className={payment === "online" ? "selected" : ""}><input type="radio" name="payment" value="online" checked={payment === "online"} onChange={() => setPayment("online")} /><CreditCard /><span><strong>Secure online payment</strong><small>UPI, cards, netbanking and supported wallets via the configured gateway.</small></span></label><label className={payment === "cod" ? "selected" : ""}><input type="radio" name="payment" value="cod" checked={payment === "cod"} onChange={() => setPayment("cod")} /><PackageCheck /><span><strong>Cash on delivery</strong><small>Available only when enabled for the entered PIN code.</small></span></label></div>
        <div className="gateway-note"><ShieldCheck /><p><strong>Demo checkout is active.</strong><span>Connect merchant credentials to create and verify live Razorpay orders server-side. This preview never collects card details.</span></p></div>
        <label className="shipping-option"><input type="checkbox" name="acceptedTerms" required /><ShieldCheck aria-hidden="true" /><span><strong>I agree to the store terms</strong><small>I understand the personalised-product return conditions and that this demo does not collect payment.</small></span></label>
        {formError && <div className="checkout-error" role="alert">{formError}</div>}
      </div>

      <aside className="checkout-summary card-panel"><h2>Review your order</h2><div className="checkout-items">{cart.map((item) => <div key={item.key}><div className="checkout-item-image"><ProductVisual artwork={item.visual} name={item.name} personalisedName={item.customization?.name || "Your Name"} background={item.customization?.backgroundColor} accent={item.customization?.textColor} /><span>{item.quantity}</span></div><p><strong>{item.name}</strong>{item.customization && <small>{item.customization.name} · {item.customization.template}</small>}</p><b>{formatPrice(item.price * item.quantity)}</b></div>)}</div><dl><div><dt>Subtotal</dt><dd>{formatPrice(subtotal)}</dd></div><div><dt>Shipping</dt><dd>{formatPrice(SHIPPING)}</dd></div><div><dt>Taxes</dt><dd>Calculated by configuration</dd></div></dl><div className="checkout-total"><span>Total</span><strong>{formatPrice(subtotal + SHIPPING)}</strong></div><button className="button button-primary button-block" type="submit" disabled={processing}>{processing ? "Saving your demo order…" : payment === "online" ? "Save demo order" : "Place demo order"} <ChevronRight /></button><small className="checkout-consent">Demo mode does not capture payment or create a production order. Live checkout also requires agreement to the store terms and personalised-product return conditions.</small></aside>
    </div>
  </form>;
}
