"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
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
};

export type CartItem = {
  key: string;
  productId: string;
  variantId?: string;
  slug: string;
  name: string;
  price: number;
  quantity: number;
  visual: string;
  customization?: Customization;
};

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
    typeof item.quantity === "number" &&
    Number.isInteger(item.quantity) &&
    item.quantity > 0
  );
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const storedCart: unknown = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
      const storedWishlist: unknown = JSON.parse(localStorage.getItem(WISHLIST_KEY) || "[]");
      setCart(Array.isArray(storedCart) ? storedCart.filter(isStoredCartItem) : []);
      setWishlist(
        Array.isArray(storedWishlist)
          ? storedWishlist.filter((value): value is string => typeof value === "string")
          : [],
      );
    } catch {
      localStorage.removeItem(CART_KEY);
      localStorage.removeItem(WISHLIST_KEY);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }, [cart, hydrated]);

  useEffect(() => {
    if (hydrated) localStorage.setItem(WISHLIST_KEY, JSON.stringify(wishlist));
  }, [wishlist, hydrated]);

  const addItem = useCallback((item: Omit<CartItem, "key">) => {
    const signature = JSON.stringify([item.productId, item.variantId, item.customization]);
    setCart((current) => {
      const match = current.find((entry) => JSON.stringify([entry.productId, entry.variantId, entry.customization]) === signature);
      if (match) {
        return current.map((entry) => entry.key === match.key ? { ...entry, quantity: entry.quantity + item.quantity } : entry);
      }
      const uniquePart = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
      return [...current, { ...item, key: `${item.productId}-${uniquePart}` }];
    });
  }, []);

  const updateQuantity = useCallback((key: string, quantity: number) => {
    setCart((current) => current.map((item) => item.key === key ? { ...item, quantity: Math.max(1, quantity) } : item));
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
    subtotal: cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
    addItem,
    updateQuantity,
    removeItem,
    clearCart,
    toggleWishlist,
    isWishlisted: (productId: string) => wishlist.includes(productId),
  }), [cart, wishlist, hydrated, addItem, updateQuantity, removeItem, clearCart, toggleWishlist]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) throw new Error("useStore must be used inside StoreProvider");
  return context;
}
