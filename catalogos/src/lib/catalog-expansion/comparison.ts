/**
 * Compare current parsed feed rows to prior state; produce change summaries and requires_review.
 */

import type { ParsedRow } from "@/lib/ingestion/types";
import type { PriorRow } from "./types";
import type { ChangeSummary } from "./types";

export interface CompareResult {
  external_id: string;
  result_type: "new" | "changed" | "unchanged" | "missing";
  prior_raw_id?: string;
  prior_normalized_id?: string | null;
  change_summary: ChangeSummary;
  requires_review: boolean;
}

function num(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

/**
 * Derive external_id from parsed row (must match raw-service logic).
 */
export function externalIdFromRow(row: ParsedRow, index: number): string {
  const id = row.id ?? row.sku ?? row.item_number ?? row.product_id ?? row.item ?? index;
  return String(id).trim() || `row_${index}`;
}

/**
 * Compare one current row to prior row; return result_type and change_summary.
 */
export function compareRow(
  current: ParsedRow,
  prior: PriorRow,
  externalId: string
): Omit<CompareResult, "external_id"> {
  const summary: ChangeSummary = {};
  let requires_review = false;

  const raw = prior.raw_payload as Record<string, unknown>;
  const nd = prior.normalized_data as Record<string, unknown>;

  const titleOld = str(raw?.name ?? raw?.title ?? raw?.product_name ?? nd?.canonical_title ?? nd?.name);
  const titleNew = str(current.name ?? current.title ?? current.product_name);
  if (titleOld !== titleNew && (titleOld || titleNew)) {
    summary.title_changed = true;
  }

  const costOld = num(raw?.cost ?? raw?.price ?? nd?.supplier_cost);
  const costNew = num(current.cost ?? current.price ?? current.unit_cost);
  if (costOld !== costNew && (costOld != null || costNew != null)) {
    summary.cost_old = costOld;
    summary.cost_new = costNew;
    requires_review = true;
  }

  const caseCostOld = num(nd?.normalized_case_cost);
  const caseCostNew = num(current.normalized_case_cost);
  if (caseCostOld !== caseCostNew && (caseCostOld != null || caseCostNew != null)) {
    summary.normalized_case_cost_old = caseCostOld;
    summary.normalized_case_cost_new = caseCostNew;
    requires_review = true;
  }

  const caseQtyOld = num(raw?.case_qty ?? raw?.qty_per_case ?? nd?.case_qty);
  const caseQtyNew = num(current.case_qty ?? current.qty_per_case);
  if (caseQtyOld !== caseQtyNew && (caseQtyOld != null || caseQtyNew != null)) {
    summary.case_qty_old = caseQtyOld;
    summary.case_qty_new = caseQtyNew;
    summary.packaging_changed = true;
    requires_review = true;
  }

  const pricingNd = nd?.pricing as Record<string, unknown> | undefined;
  const basisOld = str(pricingNd?.supplier_price_basis ?? raw?.price_per ?? raw?.unit);
  const basisNew = str(current.price_per ?? current.unit);
  if (basisOld !== basisNew && (basisOld || basisNew)) {
    summary.price_basis_changed = true;
    requires_review = true;
  }

  const availOld = str(raw?.stock_status ?? raw?.availability ?? nd?.stock_status);
  const availNew = str(current.stock_status ?? current.availability);
  if (availOld !== availNew && (availOld || availNew)) {
    summary.availability_changed = true;
  }

  const hasChanges =
    summary.title_changed ||
    summary.cost_old != null ||
    summary.normalized_case_cost_old != null ||
    summary.case_qty_old != null ||
    summary.price_basis_changed ||
    summary.availability_changed;

  return {
    result_type: hasChanges ? "changed" : "unchanged",
    prior_raw_id: prior.raw_id,
    prior_normalized_id: prior.normalized_id,
    change_summary: summary,
    requires_review,
  };
}

/**
 * Build full compare results: new (current only), missing (prior only), changed/unchanged (both).
 */
export function runComparison(
  currentRows: { external_id: string; row: ParsedRow }[],
  priorByExternalId: Map<string, PriorRow>
): CompareResult[] {
  const currentIds = new Set(currentRows.map((r) => r.external_id));
  const priorIds = new Set(priorByExternalId.keys());
  const results: CompareResult[] = [];

  for (const { external_id, row } of currentRows) {
    const prior = priorByExternalId.get(external_id);
    if (!prior) {
      results.push({
        external_id,
        result_type: "new",
        change_summary: {},
        requires_review: true,
      });
      continue;
    }
    const compared = compareRow(row, prior, external_id);
    results.push({
      external_id,
      ...compared,
    });
  }

  for (const external_id of Array.from(priorIds)) {
    if (!currentIds.has(external_id)) {
      const prior = priorByExternalId.get(external_id)!;
      results.push({
        external_id,
        result_type: "missing",
        prior_raw_id: prior.raw_id,
        prior_normalized_id: prior.normalized_id,
        change_summary: {},
        requires_review: true,
      });
    }
  }

  return results;
}
