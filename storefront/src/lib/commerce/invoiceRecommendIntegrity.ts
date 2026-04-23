import type { InvoiceLine, InvoiceRecommendResponse } from "@/lib/ai/schemas";
import type { SellableCatalogItem } from "./sellableCatalogForInvoice";

const EPS = 0.02;

function lineCurrentValue(line: InvoiceLine): number {
  if (line.total != null && Number.isFinite(line.total)) return line.total;
  const u = line.unit_price;
  const up = u != null && Number.isFinite(u) ? u : 0;
  return up * line.quantity;
}

export type InvoiceRecommendIntegrityFailure = {
  ok: false;
  code: "RECOMMENDATION_VALIDATION_FAILED";
  error: string;
};

export type InvoiceRecommendIntegritySuccess = { ok: true };

/**
 * Validates every recommended_sku is in the loaded sellable catalog, line indices are valid,
 * and aggregate totals reconcile with swaps + list prices (no silent acceptance of bad model math).
 */
export function validateInvoiceRecommendationIntegrity(
  lines: InvoiceLine[],
  catalog: SellableCatalogItem[],
  data: InvoiceRecommendResponse
): InvoiceRecommendIntegritySuccess | InvoiceRecommendIntegrityFailure {
  const allowed = new Set(catalog.map((c) => c.sku));
  const skuPriceCents = new Map(catalog.map((c) => [c.sku, c.listPriceCents] as const));

  const seenLine = new Set<number>();
  for (const s of data.swaps) {
    if (!allowed.has(s.recommended_sku)) {
      return {
        ok: false,
        code: "RECOMMENDATION_VALIDATION_FAILED",
        error: `Unknown recommended_sku: ${s.recommended_sku}`,
      };
    }
    if (!Number.isInteger(s.line_index) || s.line_index < 0 || s.line_index >= lines.length) {
      return {
        ok: false,
        code: "RECOMMENDATION_VALIDATION_FAILED",
        error: "Invalid line_index in swap",
      };
    }
    if (seenLine.has(s.line_index)) {
      return {
        ok: false,
        code: "RECOMMENDATION_VALIDATION_FAILED",
        error: "Duplicate line_index in swaps",
      };
    }
    seenLine.add(s.line_index);
  }

  if (data.swaps.length === 0) {
    if (
      Math.abs(data.total_current_estimate) > EPS ||
      Math.abs(data.total_recommended_estimate) > EPS ||
      Math.abs(data.estimated_savings) > EPS
    ) {
      return {
        ok: false,
        code: "RECOMMENDATION_VALIDATION_FAILED",
        error: "Totals must be zero when there are no swaps",
      };
    }
    return { ok: true };
  }

  let recomputedCurrent = 0;
  let recomputedRecommended = 0;
  for (const s of data.swaps) {
    const line = lines[s.line_index];
    recomputedCurrent += lineCurrentValue(line);
    const cents = skuPriceCents.get(s.recommended_sku);
    if (cents === undefined) {
      return {
        ok: false,
        code: "RECOMMENDATION_VALIDATION_FAILED",
        error: "Missing list price for recommended_sku",
      };
    }
    recomputedRecommended += (cents / 100) * line.quantity;
  }
  const recomputedSavings = recomputedCurrent - recomputedRecommended;

  if (Math.abs(data.total_current_estimate - recomputedCurrent) > EPS) {
    return {
      ok: false,
      code: "RECOMMENDATION_VALIDATION_FAILED",
      error: "total_current_estimate does not reconcile with swaps",
    };
  }
  if (Math.abs(data.total_recommended_estimate - recomputedRecommended) > EPS) {
    return {
      ok: false,
      code: "RECOMMENDATION_VALIDATION_FAILED",
      error: "total_recommended_estimate does not reconcile with swaps",
    };
  }
  if (Math.abs(data.estimated_savings - recomputedSavings) > EPS) {
    return {
      ok: false,
      code: "RECOMMENDATION_VALIDATION_FAILED",
      error: "estimated_savings does not reconcile with totals",
    };
  }

  return { ok: true };
}
