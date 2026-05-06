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
import { normalizeQuoteCartLineInput, quoteCartLinesMatch } from "@/lib/quote-cart/line-utils";

function isOptionalStringOrNull(v: unknown): boolean {
  return v === undefined || v === null || typeof v === "string";
}

function readCart(): QuoteCartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(QUOTE_CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || !("items" in parsed)) return [];
    const items = (parsed as { items: unknown }).items;
    if (!Array.isArray(items)) return [];
    const filtered = items.filter((i): i is QuoteCartItem => {
      if (typeof i !== "object" || i === null) return false;
      const o = i as Record<string, unknown>;
      if (typeof o.product_id !== "string" || typeof o.name !== "string" || typeof o.slug !== "string") return false;
      if (typeof o.quantity !== "number" || !Number.isFinite(o.quantity)) return false;
      if (!isOptionalStringOrNull(o.brandName)) return false;
      if (!isOptionalStringOrNull(o.catalog_variant_id)) return false;
      if (!isOptionalStringOrNull(o.variant_sku)) return false;
      if (!isOptionalStringOrNull(o.size_code)) return false;
      return true;
    });
    return filtered.map((i) => {
      const { quantity, ...rest } = i;
      return {
        ...normalizeQuoteCartLineInput(rest),
        quantity: Math.max(1, Math.min(99999, Math.floor(quantity))),
      };
    });
  } catch {
    return [];
  }
}

function writeCart(items: QuoteCartItem[]) {
  localStorage.setItem(QUOTE_CART_STORAGE_KEY, JSON.stringify({ items }));
}

function findLineIndex(lines: QuoteCartItem[], incoming: Omit<QuoteCartItem, "quantity">): number {
  const norm = normalizeQuoteCartLineInput(incoming);
  return lines.findIndex((x) => quoteCartLinesMatch(x, norm));
}

type QuoteCartContextValue = {
  items: QuoteCartItem[];
  hydrated: boolean;
  addItem: (product: Omit<QuoteCartItem, "quantity">, qty?: number) => void;
  /** Single persist — merges each line like addItem. */
  addItems: (products: Omit<QuoteCartItem, "quantity">[], qtyEach?: number) => void;
  setQuantity: (productId: string, quantity: number, catalogVariantId?: string | null) => void;
  removeItem: (productId: string, catalogVariantId?: string | null) => void;
  clear: () => void;
  lineCount: number;
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
      const norm = normalizeQuoteCartLineInput(product);
      const idx = findLineIndex(prev, norm);
      let next: QuoteCartItem[];
      if (idx >= 0) {
        next = [...prev];
        next[idx] = {
          ...next[idx],
          quantity: Math.min(99999, next[idx].quantity + qty),
        };
      } else {
        next = [...prev, { ...norm, quantity: qty }];
      }
      persist(next);
    },
    [persist]
  );

  const addItems = useCallback(
    (products: Omit<QuoteCartItem, "quantity">[], qtyEach = 1) => {
      if (products.length === 0) return;
      let next = [...readCart()];
      for (const product of products) {
        const norm = normalizeQuoteCartLineInput(product);
        const idx = findLineIndex(next, norm);
        if (idx >= 0) {
          next[idx] = {
            ...next[idx],
            quantity: Math.min(99999, next[idx].quantity + qtyEach),
          };
        } else {
          next = [...next, { ...norm, quantity: qtyEach }];
        }
      }
      persist(next);
    },
    [persist]
  );

  const setQuantity = useCallback(
    (productId: string, quantity: number, catalogVariantId?: string | null) => {
      const q = Math.max(1, Math.min(99999, Math.floor(quantity)));
      const prev = readCart();
      const probe = normalizeQuoteCartLineInput({
        product_id: productId,
        name: "",
        slug: "",
        brandName: null,
        catalog_variant_id: catalogVariantId ?? null,
      });
      const next = prev.map((x) => (quoteCartLinesMatch(x, probe) && x.product_id === productId ? { ...x, quantity: q } : x));
      persist(next);
    },
    [persist]
  );

  const removeItem = useCallback(
    (productId: string, catalogVariantId?: string | null) => {
      const probe = normalizeQuoteCartLineInput({
        product_id: productId,
        name: "",
        slug: "",
        brandName: null,
        catalog_variant_id: catalogVariantId ?? null,
      });
      persist(readCart().filter((x) => !(x.product_id === productId && quoteCartLinesMatch(x, probe))));
    },
    [persist]
  );

  const clear = useCallback(() => persist([]), [persist]);

  const lineCount = items.length;
  const totalCount = useMemo(() => items.reduce((s, x) => s + x.quantity, 0), [items]);

  const value = useMemo(
    () => ({
      items,
      hydrated,
      addItem,
      addItems,
      setQuantity,
      removeItem,
      clear,
      lineCount,
      totalCount,
    }),
    [items, hydrated, addItem, addItems, setQuantity, removeItem, clear, lineCount, totalCount]
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
