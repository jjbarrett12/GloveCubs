/**
 * Quote basket: in-memory + localStorage persistence.
 * Key: quote_basket. Value: QuoteBasketItem[].
 */

import type { QuoteBasketItem } from "./types";

const STORAGE_KEY = "quote_basket";

/** Aligned with submitQuoteRequestSchema line items (max 100_000). */
export const MAX_QUOTE_LINE_QUANTITY = 100_000;

export function clampQuoteLineQuantity(n: number): number {
  if (!Number.isFinite(n)) return 1;
  const i = Math.floor(n);
  return Math.min(MAX_QUOTE_LINE_QUANTITY, Math.max(1, i));
}

function load(): QuoteBasketItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is QuoteBasketItem =>
        x &&
        typeof x === "object" &&
        typeof (x as QuoteBasketItem).productId === "string" &&
        typeof (x as QuoteBasketItem).slug === "string" &&
        typeof (x as QuoteBasketItem).name === "string" &&
        typeof (x as QuoteBasketItem).quantity === "number" &&
        (x as QuoteBasketItem).quantity >= 1 &&
        (x as QuoteBasketItem).quantity <= MAX_QUOTE_LINE_QUANTITY &&
        ((x as QuoteBasketItem).canonicalProductId === undefined ||
          typeof (x as QuoteBasketItem).canonicalProductId === "string")
    );
  } catch {
    return [];
  }
}

function save(items: QuoteBasketItem[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // ignore
  }
}

export function getBasketItems(): QuoteBasketItem[] {
  return load();
}

export function addBasketItem(item: Omit<QuoteBasketItem, "quantity"> & { quantity?: number }): QuoteBasketItem[] {
  const current = load();
  const existing = current.findIndex((i) => i.productId === item.productId);
  const addQ = clampQuoteLineQuantity(item.quantity ?? 1);
  const newItem: QuoteBasketItem = {
    ...item,
    quantity: addQ,
    notes: item.notes ?? "",
    canonicalProductId: item.canonicalProductId ?? item.productId,
  };
  let next: QuoteBasketItem[];
  if (existing >= 0) {
    next = current.slice();
    const merged = clampQuoteLineQuantity(next[existing].quantity + addQ);
    next[existing] = {
      ...next[existing],
      quantity: merged,
      notes: newItem.notes || next[existing].notes,
      canonicalProductId: next[existing].canonicalProductId ?? newItem.canonicalProductId,
    };
  } else {
    next = [...current, newItem];
  }
  save(next);
  return next;
}

export function removeBasketItem(productId: string): QuoteBasketItem[] {
  const next = load().filter((i) => i.productId !== productId);
  save(next);
  return next;
}

export function updateBasketItem(productId: string, patch: Partial<Pick<QuoteBasketItem, "quantity" | "notes">>): QuoteBasketItem[] {
  const current = load();
  const next = current.map((i) =>
    i.productId === productId
      ? {
          ...i,
          ...patch,
          quantity: patch.quantity !== undefined ? clampQuoteLineQuantity(patch.quantity) : i.quantity,
        }
      : i
  );
  save(next);
  return next;
}

export function clearBasket(): QuoteBasketItem[] {
  save([]);
  return [];
}
