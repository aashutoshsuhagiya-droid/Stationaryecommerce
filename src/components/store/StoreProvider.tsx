"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ArtworkDocument } from "@/components/configurator/artwork-types";

export type Customization = {
  configurationId?: string;
  name: string;
  detail?: string;
  fields?: Record<string, string>;
  templateId?: string;
  template: string;
  font: string;
  textColor: string;
  backgroundColor: string;
  pack: string;
  material: string;
  dimensionPresetId?: string;
  dimensionLabel?: string;
  displayUnit?: "mm" | "cm" | "in";
  artwork?: ArtworkDocument;
  quote?: {
    id: string;
    pricingVersion: string;
    calculatedAt: string;
    unitPricePaise: number;
  };
  visualization?: {
    schemaVersion: 1;
    previewMode: "3d";
    model: string;
    configurationVersion: string;
    dimensionPresetId: string;
    dimensionsMm: Record<string, number> | null;
    material: string;
    surfaceIds: string[];
    templateId?: string;
    templateVersion?: number;
    sourceAssetId?: string;
    surfaceMappings?: Array<{
      surfaceId: string;
      role: "front" | "back" | "left" | "right" | "top" | "bottom" | "wrap" | "gusset" | "inside" | "other";
    }>;
  };
};

export type CartItem = {
  key: string;
  productId: string;
  variantId?: string;
  slug: string;
  name: string;
  price: number;
  lineAdjustment?: number;
  quantity: number;
  visual: string;
  customization?: Customization;
};

export function cartLineTotal(item: Pick<CartItem, "price" | "quantity" | "lineAdjustment">) {
  return item.price * item.quantity + (item.lineAdjustment ?? 0);
}

type StoreContextValue = {
  cart: CartItem[];
  wishlist: string[];
  isHydrated: boolean;
  cartCount: number;
  subtotal: number;
  addItem: (item: Omit<CartItem, "key">) => void;
  updateQuantity: (key: string, quantity: number) => void;
  removeItem: (key: string) => void;
  clearCart: () => void;
  toggleWishlist: (productId: string) => void;
  isWishlisted: (productId: string) => boolean;
};

const StoreContext = createContext<StoreContextValue | null>(null);
const CART_KEY = "naamly-cart-v1";
const WISHLIST_KEY = "naamly-wishlist-v1";
export const MAX_CART_ITEM_QUANTITY = 1000;

function clampCartItemQuantity(quantity: number) {
  if (!Number.isFinite(quantity)) return 1;
  return Math.min(MAX_CART_ITEM_QUANTITY, Math.max(1, Math.trunc(quantity)));
}

function isStoredCartItem(value: unknown): value is CartItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<CartItem>;
  return (
    typeof item.key === "string" &&
    typeof item.productId === "string" &&
    typeof item.slug === "string" &&
    typeof item.name === "string" &&
    typeof item.visual === "string" &&
    typeof item.price === "number" &&
    Number.isFinite(item.price) &&
    item.price >= 0 &&
    (typeof item.lineAdjustment === "undefined" || (typeof item.lineAdjustment === "number" && Number.isFinite(item.lineAdjustment))) &&
    typeof item.quantity === "number" &&
    Number.isInteger(item.quantity) &&
    item.quantity > 0 &&
    item.quantity <= MAX_CART_ITEM_QUANTITY
  );
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [cartToast, setCartToast] = useState<{ id: number; name: string } | null>(null);
  const toastSequenceRef = useRef(0);

  useEffect(() => {
    try {
      const storedCart: unknown = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
      setCart(Array.isArray(storedCart) ? storedCart.filter(isStoredCartItem) : []);
    } catch {
      setCart([]);
    }
    try {
      const storedWishlist: unknown = JSON.parse(localStorage.getItem(WISHLIST_KEY) || "[]");
      setWishlist(
        Array.isArray(storedWishlist)
          ? storedWishlist.filter((value): value is string => typeof value === "string")
          : [],
      );
    } catch {
      setWishlist([]);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch (error) {
      console.warn("Cart persistence is unavailable for this browser session.", error);
    }
  }, [cart, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(WISHLIST_KEY, JSON.stringify(wishlist));
    } catch (error) {
      console.warn("Wishlist persistence is unavailable for this browser session.", error);
    }
  }, [wishlist, hydrated]);

  useEffect(() => {
    if (!cartToast) return;
    const timeout = window.setTimeout(() => setCartToast(null), 2_400);
    return () => window.clearTimeout(timeout);
  }, [cartToast]);

  const addItem = useCallback((item: Omit<CartItem, "key">) => {
    const signature = JSON.stringify([item.productId, item.variantId, item.lineAdjustment ?? 0, item.customization]);
    const quantity = clampCartItemQuantity(item.quantity);
    toastSequenceRef.current += 1;
    setCartToast({ id: toastSequenceRef.current, name: item.name });
    setCart((current) => {
      const match = !item.customization?.quote && !item.lineAdjustment
        ? current.find((entry) => JSON.stringify([entry.productId, entry.variantId, entry.lineAdjustment ?? 0, entry.customization]) === signature)
        : undefined;
      if (match) {
        return current.map((entry) => entry.key === match.key ? {
          ...entry,
          quantity: clampCartItemQuantity(entry.quantity + quantity),
        } : entry);
      }
      const uniquePart = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
      return [...current, { ...item, quantity, key: `${item.productId}-${uniquePart}` }];
    });
  }, []);

  const updateQuantity = useCallback((key: string, quantity: number) => {
    setCart((current) => current.map((item) => item.key === key && !item.customization?.quote ? {
      ...item,
      quantity: clampCartItemQuantity(quantity),
    } : item));
  }, []);

  const removeItem = useCallback((key: string) => {
    setCart((current) => current.filter((item) => item.key !== key));
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  const toggleWishlist = useCallback((productId: string) => {
    setWishlist((current) => current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId]);
  }, []);

  const value = useMemo(() => ({
    cart,
    wishlist,
    isHydrated: hydrated,
    cartCount: cart.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: cart.reduce((sum, item) => sum + cartLineTotal(item), 0),
    addItem,
    updateQuantity,
    removeItem,
    clearCart,
    toggleWishlist,
    isWishlisted: (productId: string) => wishlist.includes(productId),
  }), [cart, wishlist, hydrated, addItem, updateQuantity, removeItem, clearCart, toggleWishlist]);

  return (
    <StoreContext.Provider value={value}>
      {children}
      {cartToast && (
        <div key={cartToast.id} className="cart-toast" role="status" aria-live="polite" aria-atomic="true">
          <span aria-hidden="true">✓</span>
          <div><strong>Added to cart</strong><small>{cartToast.name}</small></div>
        </div>
      )}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) throw new Error("useStore must be used inside StoreProvider");
  return context;
}
