/**
 * TEMPORARY CONTAINMENT — server-only.
 *
 * Single source of truth for whether Express-bridged order fulfillment actions
 * (status/ship/tracking, invoice payment, create PO, auto-create PO) may run.
 *
 * The Express fulfillment bridge host is intentionally offline while these
 * actions are migrated to native Supabase. This gate FAILS CLOSED: actions are
 * unavailable unless an operator has *intentionally* re-enabled the bridge
 * (`ORDER_FULFILLMENT_BRIDGE_ENABLED`) AND the bridge env is configured. This
 * prevents operators from initiating an action that would fail mid-flight and
 * leave partial order / inventory / AR / PO / email side effects.
 *
 * It does NOT perform a live DNS/reachability probe — availability is an
 * explicit, intentional configuration decision, not a network guess.
 *
 * REMOVE this module (and its callers in the order BFF routes, order detail
 * page, and dashboard) once native order actions replace the Express bridge.
 *
 * FOLLOW-UP CONTRACT: any future order-action surface — notably the
 * `POST /admin/api/orders` auto-create-PO path and `NewOrderForm` — MUST gate its
 * Express-bridge call through `resolveOrderFulfillmentAvailability()` (return 503 +
 * `ORDER_FULFILLMENT_ACTIONS_UNAVAILABLE` before any bridge call) before it can be
 * merged. Do not add a second, divergent availability check.
 *
 * Must only be imported by server code (route handlers, server components).
 * Never import from a client component — it reads server-only env.
 */
import { isExpressBridgeConfigured } from "./admin-health";

export const ORDER_FULFILLMENT_ACTIONS_UNAVAILABLE_CODE =
  "ORDER_FULFILLMENT_ACTIONS_UNAVAILABLE" as const;

/** Operator-facing 503 body message. Never includes env names or host internals. */
export const ORDER_FULFILLMENT_ACTIONS_UNAVAILABLE_MESSAGE =
  "Order fulfillment actions are temporarily unavailable. No changes were made." as const;

/** Short, operator-safe reason shown next to disabled controls. */
export const ORDER_FULFILLMENT_DISABLED_CONTROL_HINT =
  "Unavailable — fulfillment API not connected." as const;

export type OrderFulfillmentAvailability =
  | { available: true }
  | {
      available: false;
      code: typeof ORDER_FULFILLMENT_ACTIONS_UNAVAILABLE_CODE;
      reason: string;
    };

/**
 * Explicit, intentional opt-in. Absent/any-other value => disabled (fail closed).
 * This is deliberately separate from JWT_SECRET / NEXT_PUBLIC_GLOVECUBS_API so
 * that merely having those env vars present does not imply the bridge is healthy.
 */
function isFulfillmentBridgeIntentionallyEnabled(): boolean {
  const flag = process.env.ORDER_FULFILLMENT_BRIDGE_ENABLED?.trim().toLowerCase();
  return flag === "1" || flag === "true";
}

export function resolveOrderFulfillmentAvailability(): OrderFulfillmentAvailability {
  if (isFulfillmentBridgeIntentionallyEnabled() && isExpressBridgeConfigured()) {
    return { available: true };
  }
  return {
    available: false,
    code: ORDER_FULFILLMENT_ACTIONS_UNAVAILABLE_CODE,
    reason: ORDER_FULFILLMENT_DISABLED_CONTROL_HINT,
  };
}

export function isOrderFulfillmentAvailable(): boolean {
  return resolveOrderFulfillmentAvailability().available;
}
