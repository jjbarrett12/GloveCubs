type ContaminationExclusionNoticeProps = {
  excludedTotal: number;
  kpiExcludedTotal?: number;
  partialScan?: boolean;
};

/**
 * Admin-only notice when KPI totals exclude likely test/demo/smoke rows.
 * Never rendered on public storefront routes.
 */
export function ContaminationExclusionNotice({ excludedTotal, kpiExcludedTotal, partialScan }: ContaminationExclusionNoticeProps) {
  if (excludedTotal <= 0) return null;

  const kpiNote =
    kpiExcludedTotal != null && kpiExcludedTotal !== excludedTotal
      ? ` ${kpiExcludedTotal.toLocaleString()} row${kpiExcludedTotal === 1 ? "" : "s"} excluded from KPI card totals.`
      : "";

  return (
    <div
      className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
      role="status"
      data-testid="contamination-exclusion-notice"
    >
      <p className="font-medium">Test/demo rows excluded from operational totals</p>
      <p className="mt-1 text-amber-900">
        {excludedTotal.toLocaleString()} row{excludedTotal === 1 ? "" : "s"} matched contamination heuristics (definite/high
        confidence).{kpiNote} Detail lists may still show these records for review.
        {partialScan
          ? " Some tables were sample-scanned (see docs/CONTAMINATION_GOVERNANCE.md); run npm run report:contamination for a full audit."
          : null}
      </p>
    </div>
  );
}
