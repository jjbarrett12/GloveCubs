import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  addBasketItem,
  clearBasket,
  clampQuoteLineQuantity,
  MAX_QUOTE_LINE_QUANTITY,
  updateBasketItem,
} from "./basket-store";
import type { QuoteBasketItem } from "./types";

const mem: Record<string, string> = {};

const ls = {
  getItem: (k: string) => mem[k] ?? null,
  setItem: (k: string, v: string) => {
    mem[k] = v;
  },
  removeItem: (k: string) => {
    delete mem[k];
  },
};

describe("basket-store hardening", () => {
  beforeEach(() => {
    Object.keys(mem).forEach((k) => delete mem[k]);
    vi.stubGlobal("window", { localStorage: ls as Storage });
    vi.stubGlobal("localStorage", ls as Storage);
    clearBasket();
  });

  it("clampQuoteLineQuantity enforces bounds", () => {
    expect(clampQuoteLineQuantity(0)).toBe(1);
    expect(clampQuoteLineQuantity(NaN)).toBe(1);
    expect(clampQuoteLineQuantity(1.9)).toBe(1);
    expect(clampQuoteLineQuantity(MAX_QUOTE_LINE_QUANTITY + 999)).toBe(MAX_QUOTE_LINE_QUANTITY);
  });

  it("addBasketItem clamps huge quantity", () => {
    const base = { productId: "p1", slug: "s", name: "N", unitPrice: 1, sku: "sk" };
    addBasketItem({ ...base, quantity: MAX_QUOTE_LINE_QUANTITY + 50_000 });
    const raw = mem.quote_basket;
    const items = JSON.parse(raw) as QuoteBasketItem[];
    expect(items[0].quantity).toBe(MAX_QUOTE_LINE_QUANTITY);
  });

  it("merging two adds caps total line quantity", () => {
    const base = { productId: "p2", slug: "s", name: "N", unitPrice: 1, sku: "sk" };
    addBasketItem({ ...base, quantity: MAX_QUOTE_LINE_QUANTITY - 10 });
    addBasketItem({ ...base, quantity: 50 });
    const raw = mem.quote_basket;
    const items = JSON.parse(raw) as QuoteBasketItem[];
    expect(items[0].quantity).toBe(MAX_QUOTE_LINE_QUANTITY);
  });

  it("updateBasketItem clamps quantity", () => {
    const base = { productId: "p3", slug: "s", name: "N", unitPrice: 1, sku: "sk" };
    addBasketItem({ ...base, quantity: 2 });
    updateBasketItem("p3", { quantity: MAX_QUOTE_LINE_QUANTITY + 1 });
    const raw = mem.quote_basket;
    const items = JSON.parse(raw) as QuoteBasketItem[];
    expect(items[0].quantity).toBe(MAX_QUOTE_LINE_QUANTITY);
  });

  it("addBasketItem persists canonicalProductId (defaults to productId)", () => {
    const id = "10000000-0000-4000-8000-000000000001";
    addBasketItem({
      productId: id,
      slug: "s",
      name: "N",
      unitPrice: 1,
      sku: "sk",
      quantity: 1,
    });
    const items = JSON.parse(mem.quote_basket) as QuoteBasketItem[];
    expect(items[0].canonicalProductId).toBe(id);
  });
});
