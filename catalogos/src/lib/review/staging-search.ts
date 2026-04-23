/**
 * Pure staging search matcher (used by review queue after bounded DB fetch).
 */

import type { StagingRow } from "./data";

export function normalizeSearchQuery(q: string): string {
  return q.trim().toLowerCase();
}

export function matchesStagingSearchRow(row: StagingRow, qLower: string): boolean {
  if (!qLower) return true;
  const nd = row.normalized_data ?? {};
  const name = String(nd.name ?? "").toLowerCase();
  const sku = String(nd.sku ?? "").toLowerCase();
  const ms = (row.master_sku ?? "").toLowerCase();
  const mn = (row.master_name ?? "").toLowerCase();
  const sn = (row.supplier_name ?? "").toLowerCase();
  return (
    name.includes(qLower) ||
    sku.includes(qLower) ||
    ms.includes(qLower) ||
    mn.includes(qLower) ||
    sn.includes(qLower) ||
    row.id.toLowerCase().includes(qLower)
  );
}
