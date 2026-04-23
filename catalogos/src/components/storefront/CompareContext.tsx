"use client";

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { trackConversionEvent } from "@/lib/conversion/analytics";

export interface CompareItem {
  id: string;
  slug: string | null;
  name: string;
  attributes: Record<string, unknown>;
  best_price: number | null;
  pricePerGlove: { display_per_glove: string; display_case: string; price_per_glove: number | null; gloves_per_box: number | null };
}

const MAX_COMPARE = 4;

interface CompareContextValue {
  items: CompareItem[];
  add: (item: CompareItem) => void;
  remove: (id: string) => void;
  clear: () => void;
  canAdd: boolean;
  isInCompare: (id: string) => boolean;
}

const CompareContext = createContext<CompareContextValue | null>(null);

export function CompareProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CompareItem[]>([]);

  const add = useCallback((item: CompareItem) => {
    setItems((prev) => {
      if (prev.some((i) => i.id === item.id)) return prev;
      if (prev.length >= MAX_COMPARE) return prev;
      trackConversionEvent("compare_add", { product_id: item.id });
      return [...prev, item];
    });
  }, []);

  const remove = useCallback((id: string) => {
    setItems((prev) => {
      const next = prev.filter((i) => i.id !== id);
      if (next.length !== prev.length) trackConversionEvent("compare_remove", { product_id: id });
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setItems([]);
  }, []);

  const canAdd = items.length < MAX_COMPARE;
  const isInCompare = useCallback((id: string) => items.some((i) => i.id === id), [items]);

  const value = useMemo(
    () => ({ items, add, remove, clear, canAdd, isInCompare }),
    [items, add, remove, clear, isInCompare]
  );

  return <CompareContext.Provider value={value}>{children}</CompareContext.Provider>;
}

export function useCompare() {
  const ctx = useContext(CompareContext);
  if (!ctx) return { items: [], add: () => {}, remove: () => {}, clear: () => {}, canAdd: true, isInCompare: () => false };
  return ctx;
}
