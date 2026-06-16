/** Mirrors Express `lib/adminOrderGuards.js` ADMIN_SETTABLE_STATUSES for operator UI. */
export const ADMIN_SETTABLE_ORDER_STATUSES = [
  "pending",
  "processing",
  "invoiced",
  "shipped",
  "completed",
  "delivered",
  "cancelled",
  "payment_failed",
  "expired",
] as const;

export type AdminSettableOrderStatus = (typeof ADMIN_SETTABLE_ORDER_STATUSES)[number];
