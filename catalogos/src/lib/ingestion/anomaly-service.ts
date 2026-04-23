/**
 * Flag anomalies for admin review: missing image, missing category, zero/negative cost,
 * suspiciously high markup, duplicate supplier SKU in batch, conflicting case quantities.
 */

import type { ParsedRow, NormalizedData, AnomalyFlag } from "./types";
import { isSuspiciouslyHighMarkup } from "./pricing-service";

export interface AnomalyInput {
  rawRow: ParsedRow;
  normalized: NormalizedData;
  matchConfidence: number;
  cost: number;
  marginPercent: number;
  supplierSkuInBatchCount: number;
  caseQtyValuesInBatch: number[];
}

/**
 * Collect anomaly flags for a single row.
 */
export function flagAnomalies(input: AnomalyInput): AnomalyFlag[] {
  const flags: AnomalyFlag[] = [];

  if (!input.normalized.image_url) {
    flags.push({ code: "missing_image", message: "No image URL", severity: "warning" });
  }

  if (!input.normalized.attributes?.product_type && input.matchConfidence < 0.6) {
    flags.push({ code: "missing_category", message: "Category could not be determined", severity: "warning" });
  }

  const hasRequired = input.normalized.name && (input.normalized.sku || input.normalized.upc);
  if (!hasRequired) {
    flags.push({ code: "missing_required_attributes", message: "Missing name or sku/upc", severity: "error" });
  }

  if (input.cost == null || input.cost <= 0) {
    flags.push({ code: "zero_or_negative_cost", message: "Cost is zero or negative", severity: "error" });
  }

  if (isSuspiciouslyHighMarkup(input.marginPercent)) {
    flags.push({
      code: "suspiciously_high_markup",
      message: `Markup ${input.marginPercent.toFixed(0)}% is very high`,
      severity: "warning",
    });
  }

  if (input.supplierSkuInBatchCount > 1) {
    flags.push({
      code: "duplicate_supplier_sku_in_batch",
      message: `Supplier SKU appears ${input.supplierSkuInBatchCount} times in this batch`,
      severity: "warning",
    });
  }

  if (input.caseQtyValuesInBatch.length > 1) {
    const distinct = [...new Set(input.caseQtyValuesInBatch)].filter((n) => n != null);
    if (distinct.length > 1) {
      flags.push({
        code: "conflicting_case_quantities",
        message: `Conflicting case quantities in batch: ${distinct.join(", ")}`,
        severity: "warning",
      });
    }
  }

  return flags;
}

/**
 * Count how many rows in the batch have the same supplier SKU.
 */
export function countSkuInBatch(sku: string, allSkus: string[]): number {
  const s = (sku ?? "").trim().toLowerCase();
  if (!s) return 0;
  return allSkus.filter((x) => x.trim().toLowerCase() === s).length;
}

/**
 * Collect all case_qty values from normalized rows in the batch (for conflicting check).
 */
export function collectCaseQtysInBatch(normalizedRows: { attributes?: { case_qty?: number } }[]): number[] {
  return normalizedRows
    .map((r) => r.attributes?.case_qty)
    .filter((n): n is number => typeof n === "number" && n >= 1);
}

/**
 * Collect case_qty from parsed rows (raw) for batch-wide conflicting check.
 */
export function collectCaseQtysFromParsed(rows: Record<string, unknown>[]): number[] {
  return rows
    .map((r) => {
      const v = r.case_qty ?? r.caseqty ?? r.qty_per_case ?? r.pack_qty;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) && n >= 1 ? n : undefined;
    })
    .filter((n): n is number => n != null);
}
