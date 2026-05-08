/**
 * Curated spec-group membership: operator-approved only (Phase 5+).
 */

export function isApprovedSpecGroupMember(m: Record<string, unknown>): boolean {
  return (
    m.approved_at != null &&
    String(m.approved_at).length > 0 &&
    m.decision_source === "operator" &&
    (m.valid_to == null || String(m.valid_to).length === 0)
  );
}
