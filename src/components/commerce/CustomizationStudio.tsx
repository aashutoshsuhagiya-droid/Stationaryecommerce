"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, CircleAlert, Heart, Minus, PackageCheck, Plus, RotateCcw, ShieldCheck, ShoppingBag, Sparkles, Truck, WandSparkles, ZoomIn } from "lucide-react";
import type { PersonalizationTemplate, Product } from "@/lib/types";
import { formatPrice } from "@/lib/data";
import { useStore } from "@/components/store/StoreProvider";
import { ProductVisual } from "./ProductVisual";

const fontLabels: Record<string, string> = { rounded: "Friendly rounded", clean: "Clean sans", serif: "Classic serif" };

export function CustomizationStudio({ product, templates }: { product: Product; templates: PersonalizationTemplate[] }) {
  const { cart, addItem, removeItem, toggleWishlist, isWishlisted } = useStore();
  const [name, setName] = useState("");
  const [detail, setDetail] = useState("");
  const [templateId, setTemplateId] = useState(templates[0]?.id || "default");
  const [font, setFont] = useState("rounded");
  const [variantId, setVariantId] = useState(product.variants[0]?.id || "default");
  const [textColor, setTextColor] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState("");
  const [added, setAdded] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);

  const template = templates.find((item) => item.id === templateId) || templates[0];
  const variant = product.variants.find((item) => item.id === variantId) || product.variants[0];
  const currentPrice = (variant?.price || product.price) + (template?.premiumPrice || 0);
  const effectiveTextColor = textColor || template?.preview.foreground || "#17324D";
  const fontSize = name.length > 20 ? 18 : name.length > 14 ? 22 : 28;
  const stockLabel = product.stockStatus === "in_stock" ? "In stock" : product.stockStatus === "low_stock" ? "Limited availability" : "Made to order";
  const maxChars = product.customizationFields.find((field) => field.id === "name")?.maxLength || 24;

  useEffect(() => {
    if (editingKey || typeof window === "undefined") return;
    const key = new URLSearchParams(window.location.search).get("edit");
    const existing = key ? cart.find((item) => item.key === key) : undefined;
    if (!existing || existing.productId !== product.id) return;
    setEditingKey(existing.key);
    setQuantity(existing.quantity);
    if (existing.customization) {
      setName(existing.customization.name);
      setDetail(existing.customization.detail || "");
      const matchedTemplate = templates.find((item) => item.name === existing.customization?.template);
      if (matchedTemplate) setTemplateId(matchedTemplate.id);
      const matchedFont = Object.entries(fontLabels).find(([, label]) => label === existing.customization?.font)?.[0];
      if (matchedFont) setFont(matchedFont);
      setTextColor(existing.customization.textColor);
      const matchedVariant = product.variants.find((item) => item.name === existing.customization?.pack);
      if (matchedVariant) setVariantId(matchedVariant.id);
    }
  }, [cart, editingKey, product.id, product.variants, templates]);

  const previewStyle = useMemo(() => ({
    background: template?.preview.background || "#e4f5f2",
    color: effectiveTextColor,
    borderColor: template?.preview.accent || "#168c80",
    fontFamily: font === "serif" ? "Georgia, serif" : font === "rounded" ? "var(--font-manrope, Manrope), sans-serif" : "Arial, sans-serif",
  }), [template, effectiveTextColor, font]);

  function validate() {
    const trimmed = name.trim();
    if (!trimmed) { setError("Please enter the name exactly as it should be printed."); return false; }
    if (!/^[A-Za-zÀ-ž' .-]+$/.test(trimmed)) { setError("Use letters, spaces, apostrophes, dots or hyphens only."); return false; }
    if (trimmed.length > maxChars) { setError(`Keep the name within ${maxChars} characters.`); return false; }
    setError(""); return true;
  }

  function addToCart() {
    if (!product.customizable || validate()) {
      // Remove the line first so saving an unchanged design cannot merge into,
      // then immediately delete, the item being edited.
      if (editingKey) removeItem(editingKey);
      addItem({
        productId: product.id,
        variantId: variant?.id,
        slug: product.slug,
        name: product.name,
        price: currentPrice,
        quantity,
        visual: product.artwork,
        customization: product.customizable ? {
          name: name.trim(), detail: detail.trim(), templateId: template?.id, template: template?.name || "Standard", font: fontLabels[font] || font,
          textColor: effectiveTextColor, backgroundColor: template?.preview.background || "#e4f5f2", pack: variant?.name || `${product.packSize} pack`, material: variant?.material || product.material,
        } : undefined,
      });
      if (editingKey) setEditingKey(null);
      setAdded(true);
      window.setTimeout(() => setAdded(false), 3000);
    }
  }

  function reset() { setName(""); setDetail(""); setTemplateId(templates[0]?.id || "default"); setFont("rounded"); setTextColor(""); setError(""); }

  return (
    <>
      <section className="product-detail shell">
        <div className="product-gallery">
          <div className="gallery-thumbs" aria-label="Product previews"><button className="active"><ProductVisual artwork={product.artwork} name={product.name} /></button><button><ProductVisual artwork={product.artwork} name={`${product.name} alternate view`} accent="#e17b6f" background="#fff0eb" /></button><button><ProductVisual artwork={product.artwork} name={`${product.name} detail`} accent="#e0aa39" background="#fff5d9" /></button></div>
          <div className={`live-preview-stage ${zoomed ? "zoomed" : ""}`}>
            <div className="preview-toolbar"><span><Sparkles /> Live preview</span><button onClick={() => setZoomed((value) => !value)}><ZoomIn /> {zoomed ? "Fit" : "Zoom"}</button></div>
            {product.customizable ? <div className="label-sheet-preview" style={{ background: template?.preview.background || "#e4f5f2" }}>
              <div className={`preview-decoration ${template?.artwork || "standard"}`} style={{ color: template?.preview.accent }}><span>✦</span><span>●</span><span>◆</span></div>
              {[0,1,2,3,4,5].map((item) => <div className="custom-label-preview" style={previewStyle} key={item}><span className="label-symbol" style={{ background: template?.preview.accent || "#168C80" }}>{template?.artwork?.includes("space") ? "✦" : template?.artwork?.includes("garden") ? "❋" : template?.artwork?.includes("geo") ? "◆" : "●"}</span><div><strong style={{ fontSize }}>{name || "Your Name"}</strong>{detail && <small>{detail}</small>}</div></div>)}
              <span className="preview-caption">Preview of your selected design · proportions are indicative</span>
            </div> : <ProductVisual artwork={product.artwork} name={product.name} personalisedName={name || "Your Name"} />}
            <button className="preview-reset" onClick={reset}><RotateCcw /> Reset design</button>
          </div>
          <div className="preview-note"><ShieldCheck /><p><strong>Your details stay with this item</strong><span>The saved name, design, pack and material are stored together in your cart and order.</span></p></div>
        </div>

        <div className="product-config">
          <div className="product-status-row"><span className="status-pill">{stockLabel}</span><span>SKU {product.sku}</span></div>
          <h1>{product.name}</h1>{editingKey && <div className="notice edit-notice">You’re editing the saved design from your cart. Adding it will replace that cart line.</div>}
          <p className="product-short-description">{product.shortDescription}</p>
          <div className="product-price-block"><strong>{formatPrice(currentPrice)}</strong>{product.compareAtPrice && <del>{formatPrice(product.compareAtPrice)}</del>}<span>Inclusive of applicable taxes</span></div>
          <div className="config-divider" />

          {product.variants.length > 0 && <fieldset className="config-fieldset"><legend><span>1</span> Choose a pack <small>{variant?.packSize || product.packSize} pieces</small></legend><div className="variant-options">{product.variants.map((item) => <button type="button" className={variantId === item.id ? "active" : ""} onClick={() => setVariantId(item.id)} key={item.id}><span>{item.name}</span><strong>{formatPrice(item.price)}</strong>{variantId === item.id && <Check />}</button>)}</div></fieldset>}

          {product.customizable && <>
            <fieldset className="config-fieldset"><legend><span>2</span> Add the personal details</legend><div className="personal-fields"><label><span>Name to print <em>*</em><small>{name.length}/{maxChars}</small></span><input value={name} onChange={(event) => { setName(event.target.value.slice(0, maxChars)); setError(""); }} onBlur={validate} placeholder="e.g. Aarav Mehta" aria-invalid={!!error} /><small>Enter it exactly as it should appear.</small></label>{product.customizationFields.some((field) => field.id === "class-details") && <label><span>Class or details <small>{detail.length}/24</small></span><input value={detail} onChange={(event) => setDetail(event.target.value.slice(0, 24))} placeholder="e.g. Class 4 · B (optional)" /></label>}</div>{error && <div className="field-error" role="alert"><CircleAlert /> {error}</div>}</fieldset>

            {templates.length > 0 && <fieldset className="config-fieldset"><legend><span>3</span> Pick a design <small>{template?.name}</small></legend><div className="template-options">{templates.map((item) => <button type="button" className={templateId === item.id ? "active" : ""} onClick={() => { setTemplateId(item.id); setTextColor(""); }} key={item.id}><i style={{ background: item.preview.background, borderColor: item.preview.accent }}><b style={{ color: item.preview.foreground }}>Aa</b><u style={{ background: item.preview.accent }} /></i><span>{item.name}{item.premiumPrice > 0 && <small>+{formatPrice(item.premiumPrice)}</small>}</span>{templateId === item.id && <Check />}</button>)}</div></fieldset>}

            <fieldset className="config-fieldset compact"><legend><span>4</span> Finish the look</legend><div className="finish-grid"><label><span>Font style</span><div className="select-wrap"><select value={font} onChange={(event) => setFont(event.target.value)}><option value="rounded">Friendly rounded</option><option value="clean">Clean sans</option><option value="serif">Classic serif</option></select><ChevronDown /></div></label><div><span>Text colour</span><div className="color-options">{[template?.preview.foreground || "#17324d", "#17324D", "#168C80", "#D8655A"].filter((value, index, array) => array.indexOf(value) === index).map((color) => <button type="button" key={color} className={effectiveTextColor.toLowerCase() === color.toLowerCase() ? "active" : ""} style={{ background: color }} onClick={() => setTextColor(color)} aria-label={`Use ${color}`} />)}</div></div></div></fieldset>
          </>}

          <div className="purchase-row"><div className="quantity-control"><button onClick={() => setQuantity((value) => Math.max(1, value - 1))} aria-label="Decrease quantity"><Minus /></button><span>{quantity}</span><button onClick={() => setQuantity((value) => Math.min(20, value + 1))} aria-label="Increase quantity"><Plus /></button></div><button className="button button-primary add-cart-button" onClick={addToCart}>{added ? <><Check /> Added to cart</> : <><ShoppingBag /> {product.customizable ? "Approve & add to cart" : "Add to cart"}<strong>{formatPrice(currentPrice * quantity)}</strong></>}</button><button className={`save-product ${isWishlisted(product.id) ? "active" : ""}`} onClick={() => toggleWishlist(product.id)} aria-label="Save to wishlist"><Heart /></button></div>
          {added && <div className="added-confirmation" role="status"><Check /><span><strong>Your design is saved.</strong> It’s in your cart with all selected details.</span><Link href="/cart">View cart →</Link></div>}
          <div className="product-promises"><div><PackageCheck /><span><strong>Made with care</strong><small>Production: {product.productionDays.min}–{product.productionDays.max} working days</small></span></div><div><Truck /><span><strong>Delivery shown at checkout</strong><small>Calculated from your PIN code and chosen method</small></span></div><div><ShieldCheck /><span><strong>Personalised item policy</strong><small>Covered if damaged or made differently from the approved design</small></span></div></div>
        </div>
      </section>

      <section className="product-information section-soft">
        <div className="shell product-info-grid"><div><span className="eyebrow">The practical details</span><h2>Made for everyday use</h2><p>{product.description}</p><ul>{product.features.map((feature) => <li key={feature}><Check /> {feature}</li>)}</ul></div><dl><div><dt>Material</dt><dd>{variant?.material || product.material}</dd></div><div><dt>Dimensions</dt><dd>{product.dimensions}</dd></div><div><dt>What’s included</dt><dd>{variant?.packSize || product.packSize} pieces in your selected format</dd></div><div><dt>Production window</dt><dd>{product.productionDays.min}–{product.productionDays.max} working days after design review</dd></div>{product.careInstructions && <div><dt>Care</dt><dd>{product.careInstructions}</dd></div>}</dl></div>
      </section>

      <div className="mobile-buy-bar"><div><small>{product.name}</small><strong>{formatPrice(currentPrice * quantity)}</strong></div><button className="button button-primary" onClick={addToCart}>{added ? "Added" : "Add to cart"}</button></div>
    </>
  );
}
