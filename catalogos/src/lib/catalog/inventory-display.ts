/**
 * Buyer-facing availability copy from normalized product attributes + offer coverage.
 */

export interface InventoryDisplay {
  label: string;
  tone: "positive" | "neutral" | "warning";
}

const STOCK_KEYS = ["stock_status", "availability", "inventory_status"] as const;

/** Derive a simple catalog-level availability line for PDP and grid. */
export function getInventoryDisplay(
  attributes: Record<string, unknown> | null | undefined,
  activeOfferCount: number
): InventoryDisplay {
  const attrs = attributes ?? {};
  for (const key of STOCK_KEYS) {
    const raw = attrs[key];
    if (raw == null || raw === "") continue;
    const s = String(raw).toLowerCase().replace(/-/g, "_");
    if (s.includes("out_of_stock") || s === "unavailable" || s === "discontinued") {
      return { label: "Currently unavailable — request a quote for alternatives", tone: "warning" };
    }
    if (s.includes("low_stock") || s.includes("limited")) {
      return { label: "Limited availability — confirm with quote", tone: "neutral" };
    }
    if (s.includes("in_stock") || s === "available" || s === "instock") {
      return { label: "In stock — request a quote to order", tone: "positive" };
    }
  }
  if (activeOfferCount > 0) {
    return {
      label: `Available from ${activeOfferCount} supplier${activeOfferCount === 1 ? "" : "s"} — pricing shown is your best delivered case price`,
      tone: "positive",
    };
  }
  return { label: "Contact us for availability and pricing", tone: "neutral" };
}
