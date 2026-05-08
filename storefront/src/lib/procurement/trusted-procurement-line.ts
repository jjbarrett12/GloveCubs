/**
 * Governed procurement truth (Phase 3): machine matcher output alone is never trusted.
 * Only operator-approved rows with a canonical product id satisfy this predicate.
 */

export type ProcurementLineTrustInput = {
  review_status: string;
  decision_source: string | null | undefined;
  human_decided_at: string | null | undefined;
  human_decided_by: string | null | undefined;
  catalog_product_id: string | null | undefined;
};

export function isTrustedProcurementLine(row: ProcurementLineTrustInput): boolean {
  return (
    row.review_status === "approved" &&
    row.decision_source === "operator" &&
    row.human_decided_at != null &&
    String(row.human_decided_at).length > 0 &&
    row.human_decided_by != null &&
    String(row.human_decided_by).length > 0 &&
    row.catalog_product_id != null &&
    String(row.catalog_product_id).length > 0
  );
}
