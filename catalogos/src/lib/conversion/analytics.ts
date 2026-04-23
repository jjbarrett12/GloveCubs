/**
 * Conversion analytics: track events for product decisions.
 * Sends to console in dev; can be wired to telemetry/GA later.
 */

export type ConversionEventName =
  | "industry_selected"
  | "product_compared"
  | "product_clicked"
  | "product_viewed"
  | "search_used"
  | "help_me_choose_submit"
  | "compare_add"
  | "compare_remove";

export interface ConversionEvent {
  name: ConversionEventName;
  payload?: Record<string, unknown>;
}

const SENSITIVE_KEYS = new Set(["password", "token", "email"]);

function sanitize(p: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!p || typeof p !== "object") return p;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) {
    if (SENSITIVE_KEYS.has(k.toLowerCase())) continue;
    out[k] = typeof v === "string" && v.length > 200 ? v.slice(0, 200) : v;
  }
  return out;
}

export function trackConversionEvent(name: ConversionEventName, payload?: Record<string, unknown>): void {
  try {
    const event: ConversionEvent = { name, payload: sanitize(payload) };
    if (typeof window !== "undefined") {
      (window as unknown as { glovecubsConversionEvents?: ConversionEvent[] }).glovecubsConversionEvents =
        (window as unknown as { glovecubsConversionEvents?: ConversionEvent[] }).glovecubsConversionEvents ?? [];
      (window as unknown as { glovecubsConversionEvents: ConversionEvent[] }).glovecubsConversionEvents.push(event);
    }
    if (process.env.NODE_ENV === "development") {
      console.info("[conversion]", name, payload);
    }
  } catch {
    // never throw
  }
}
