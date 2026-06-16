/**
 * Admin KPI exclusion helpers (read-only classification).
 * Wired to admin dashboard KPI cards and contamination banner.
 *
 * Canonical heuristics live in repo-root `lib/contamination-heuristics.js`.
 */

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// eslint-disable-next-line -- CJS heuristics module; createRequire bridge from ESM storefront
const heuristics = require("../../../../lib/contamination-heuristics.js") as typeof import("../../../../lib/contamination-heuristics");

export type ContaminationEntityType =
  | "user"
  | "admin_user"
  | "company"
  | "product"
  | "catalog_product"
  | "quote_request"
  | "rfq"
  | "order"
  | "inventory_adjustment"
  | "purchase_order"
  | "supplier"
  | "contact_message"
  | "recommendation_outcome"
  | "email"
  | "session";

export type ContaminationClassification = {
  flagged: boolean;
  confidence: "definite" | "high" | "medium" | "low";
  severity: "critical" | "high" | "medium" | "low";
  recommendedAction: "quarantine_review" | "exclude_from_kpi" | "archive_candidate" | "manual_review" | "none";
  entityType: string;
  reasons: string[];
};

/** Classify a row for admin KPI exclusion (no DB writes). */
export function classifyAdminRow(entityType: ContaminationEntityType, row: Record<string, unknown>): ContaminationClassification {
  return heuristics.classifyRecord(entityType, row) as ContaminationClassification;
}

export function isLikelyTestData(row: Record<string, unknown>, entityType: ContaminationEntityType): boolean {
  return heuristics.isLikelyTestData(row, entityType);
}

export function getContaminationExclusionReason(row: Record<string, unknown>, entityType: ContaminationEntityType): string | null {
  return heuristics.getContaminationExclusionReason(row, entityType);
}

/** Future admin aggregates: exclude high-confidence test rows from counts. */
export function shouldExcludeFromAdminKpi(row: Record<string, unknown>, entityType: ContaminationEntityType): boolean {
  return heuristics.shouldExcludeFromAdminKpi(row, entityType);
}

export function filterLikelyTestRows<T extends Record<string, unknown>>(rows: T[], entityType: ContaminationEntityType): T[] {
  return heuristics.filterLikelyTestRows(rows, entityType) as T[];
}

export function countExcludingLikelyTest(rows: Record<string, unknown>[], entityType: ContaminationEntityType): {
  total: number;
  excluded: number;
  included: number;
} {
  return heuristics.countExcludingLikelyTest(rows, entityType);
}

/** Admin KPI count metadata (internal only — not customer-facing). */
export type AdminContaminationCountMeta = {
  total_count: number | null;
  trusted_count: number | null;
  excluded_test_count: number | null;
  /** True when every row in total_count was classified in memory. */
  scan_complete: boolean;
};

/**
 * Build trusted KPI metadata from fetched rows and optional DB head count.
 * When scan is incomplete, excluded_test_count reflects the sample; trusted_count is conservative (total − sample excluded).
 */
export function buildAdminContaminationCountMeta(
  rows: Record<string, unknown>[],
  entityType: ContaminationEntityType,
  totalFromDb: number | null
): AdminContaminationCountMeta {
  if (totalFromDb == null) {
    return { total_count: null, trusted_count: null, excluded_test_count: null, scan_complete: false };
  }
  const { excluded } = countExcludingLikelyTest(rows, entityType);
  const scanComplete = rows.length >= totalFromDb;
  return {
    total_count: totalFromDb,
    trusted_count: Math.max(0, totalFromDb - excluded),
    excluded_test_count: excluded,
    scan_complete: scanComplete,
  };
}

export function sumExcludedFromMetrics(...metrics: (AdminContaminationCountMeta | null | undefined)[]): number {
  return metrics.reduce((sum, m) => sum + (m?.excluded_test_count ?? 0), 0);
}

/** True when any KPI metric was sample-scanned (fetched rows < DB head count). */
export function anyPartialContaminationScan(...metrics: (AdminContaminationCountMeta | null | undefined)[]): boolean {
  return metrics.some((m) => m != null && m.total_count != null && !m.scan_complete);
}

export function countFlaggedForAdminVisibility(rows: Record<string, unknown>[], entityType: ContaminationEntityType): number {
  return heuristics.countFlaggedForAdminVisibility(rows, entityType);
}

export function sumFlaggedVisibleFromRows(
  entries: Array<{ rows: Record<string, unknown>[]; entityType: ContaminationEntityType }>
): number {
  return entries.reduce((sum, { rows, entityType }) => sum + countFlaggedForAdminVisibility(rows, entityType), 0);
}
