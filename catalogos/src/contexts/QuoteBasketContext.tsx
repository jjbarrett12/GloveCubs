"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { QuoteBasketItem } from "@/lib/quotes/types";
import * as basket from "@/lib/quotes/basket-store";

interface QuoteBasketContextValue {
  items: QuoteBasketItem[];
  count: number;
  addItem: (item: Omit<QuoteBasketItem, "quantity"> & { quantity?: number }) => void;
  removeItem: (productId: string) => void;
  updateItem: (productId: string, patch: Partial<Pick<QuoteBasketItem, "quantity" | "notes">>) => void;
  clear: () => void;
}

const QuoteBasketContext = createContext<QuoteBasketContextValue | null>(null);

function loadInitial(): QuoteBasketItem[] {
  if (typeof window === "undefined") return [];
  return basket.getBasketItems();
}

export function QuoteBasketProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<QuoteBasketItem[]>([]);

  useEffect(() => {
    setItems(loadInitial());
  }, []);

  const addItem = useCallback((item: Omit<QuoteBasketItem, "quantity"> & { quantity?: number }) => {
    const next = basket.addBasketItem(item);
    setItems(next);
  }, []);
  const removeItem = useCallback((productId: string) => {
    const next = basket.removeBasketItem(productId);
    setItems(next);
  }, []);
  const updateItem = useCallback((productId: string, patch: Partial<Pick<QuoteBasketItem, "quantity" | "notes">>) => {
    const next = basket.updateBasketItem(productId, patch);
    setItems(next);
  }, []);
  const clear = useCallback(() => {
    basket.clearBasket();
    setItems([]);
  }, []);

  const value: QuoteBasketContextValue = {
    items,
    count: items.reduce((s, i) => s + i.quantity, 0),
    addItem,
    removeItem,
    updateItem,
    clear,
  };

  return (
    <QuoteBasketContext.Provider value={value}>
      {children}
    </QuoteBasketContext.Provider>
  );
}

export function useQuoteBasket(): QuoteBasketContextValue {
  const ctx = useContext(QuoteBasketContext);
  if (!ctx) throw new Error("useQuoteBasket must be used within QuoteBasketProvider");
  return ctx;
}
