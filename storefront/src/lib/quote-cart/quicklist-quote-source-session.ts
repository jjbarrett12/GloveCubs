/**
 * Session-only note that lines were added from the buyer company quicklist (no DB persistence).
 * Separate from reorder-from-order semantics (reorder-source-session).
 */

export const QUICKLIST_QUOTE_SOURCE_SESSION_KEY = "glovecubs-quote-cart-quicklist-source-v1";

const DEFAULT_MESSAGE = "Started from your GloveCubs quicklist";

export function readQuicklistQuoteSourceNote(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(QUICKLIST_QUOTE_SOURCE_SESSION_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object") return null;
    const m = (o as Record<string, unknown>).message;
    return typeof m === "string" && m.trim() ? m.trim() : DEFAULT_MESSAGE;
  } catch {
    return null;
  }
}

export function writeQuicklistQuoteSourceNote(message = DEFAULT_MESSAGE): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(QUICKLIST_QUOTE_SOURCE_SESSION_KEY, JSON.stringify({ message }));
  } catch {
    // ignore quota / private mode
  }
}

export function clearQuicklistQuoteSourceNote(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(QUICKLIST_QUOTE_SOURCE_SESSION_KEY);
  } catch {
    // ignore
  }
}
