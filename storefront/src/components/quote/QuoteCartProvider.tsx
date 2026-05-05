"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { QuoteCartItem } from "@/lib/quote-cart/types";
import { QUOTE_CART_STORAGE_KEY } from "@/lib/quote-cart/types";

function readCart(): QuoteCartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(QUOTE_CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || !("items" in parsed)) return [];
    const items = (parsed as { items: unknown }).items;
    if (!Array.isArray(items)) return [];
    return items.filter(
      (i): i is QuoteCartItem =>
        typeof i === "object" &&
        i !== null &&
        typeof (i as QuoteCartItem).product_id === "string" &&
        typeof (i as QuoteCartItem).name === "string" &&
        typeof (i as QuoteCartItem).slug === "string" &&
        typeof (i as QuoteCartItem).quantity === "number"
    );
  } catch {
    return [];
  }
}

function writeCart(items: QuoteCartItem[]) {
  localStorage.setItem(QUOTE_CART_STORAGE_KEY, JSON.stringify({ items }));
}

type QuoteCartContextValue = {
  items: QuoteCartItem[];
  hydrated: boolean;
  addItem: (product: Omit<QuoteCartItem, "quantity">, qty?: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  removeItem: (productId: string) => void;
  clear: () => void;
  totalCount: number;
};

const QuoteCartContext = createContext<QuoteCartContextValue | null>(null);

export function QuoteCartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<QuoteCartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setItems(readCart());
    setHydrated(true);
  }, []);

  const persist = useCallback((next: QuoteCartItem[]) => {
    setItems(next);
    if (typeof window !== "undefined") writeCart(next);
  }, []);

  const addItem = useCallback(
    (product: Omit<QuoteCartItem, "quantity">, qty = 1) => {
      const prev = readCart();
      const idx = prev.findIndex((x) => x.product_id === product.product_id);
      let next: QuoteCartItem[];
      if (idx >= 0) {
        next = [...prev];
        next[idx] = {
          ...next[idx],
          quantity: Math.min(99999, next[idx].quantity + qty),
        };
      } else {
        next = [...prev, { ...product, quantity: qty }];
      }
      persist(next);
    },
    [persist]
  );

  const setQuantity = useCallback(
    (productId: string, quantity: number) => {
      const q = Math.max(1, Math.min(99999, Math.floor(quantity)));
      const prev = readCart();
      const next = prev.map((x) => (x.product_id === productId ? { ...x, quantity: q } : x));
      persist(next);
    },
    [persist]
  );

  const removeItem = useCallback(
    (productId: string) => {
      persist(readCart().filter((x) => x.product_id !== productId));
    },
    [persist]
  );

  const clear = useCallback(() => persist([]), [persist]);

  const totalCount = useMemo(() => items.reduce((s, x) => s + x.quantity, 0), [items]);

  const value = useMemo(
    () => ({
      items,
      hydrated,
      addItem,
      setQuantity,
      removeItem,
      clear,
      totalCount,
    }),
    [items, hydrated, addItem, setQuantity, removeItem, clear, totalCount]
  );

  return <QuoteCartContext.Provider value={value}>{children}</QuoteCartContext.Provider>;
}

export function useQuoteCart(): QuoteCartContextValue {
  const ctx = useContext(QuoteCartContext);
  if (!ctx) {
    throw new Error("useQuoteCart must be used within QuoteCartProvider");
  }
  return ctx;
}
