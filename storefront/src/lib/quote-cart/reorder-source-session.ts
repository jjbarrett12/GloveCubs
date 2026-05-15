/**
 * Session-only note that the quote cart was seeded from a past order (no DB persistence).
 */

export const REORDER_SOURCE_SESSION_KEY = "glovecubs-reorder-source-v1";

export type ReorderSourcePayload = {
  orderId: string;
  orderNumber: string;
  createdAt: string;
};

export function readReorderSource(): ReorderSourcePayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(REORDER_SOURCE_SESSION_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object") return null;
    const r = o as Record<string, unknown>;
    if (typeof r.orderId !== "string" || typeof r.orderNumber !== "string" || typeof r.createdAt !== "string") return null;
    return { orderId: r.orderId, orderNumber: r.orderNumber, createdAt: r.createdAt };
  } catch {
    return null;
  }
}

export function writeReorderSource(payload: ReorderSourcePayload): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(REORDER_SOURCE_SESSION_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota / private mode
  }
}

export function clearReorderSource(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(REORDER_SOURCE_SESSION_KEY);
  } catch {
    // ignore
  }
}
