/**
 * Phase 4: supplier row must be operator-governed before spend memory trusts it.
 */

export type SupplierMatchTrustInput = {
  review_status: string;
  decision_source: string | null | undefined;
  reviewed_at: string | null | undefined;
  reviewed_by: string | null | undefined;
  catalogos_supplier_id: string | null | undefined;
};

export function isTrustedSupplierMatch(row: SupplierMatchTrustInput): boolean {
  return (
    row.review_status === "approved" &&
    row.decision_source === "operator" &&
    row.reviewed_at != null &&
    String(row.reviewed_at).length > 0 &&
    row.reviewed_by != null &&
    String(row.reviewed_by).length > 0 &&
    row.catalogos_supplier_id != null &&
    String(row.catalogos_supplier_id).length > 0
  );
}
