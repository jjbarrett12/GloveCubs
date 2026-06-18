import { adminAlertSurface } from "@/components/admin/admin-theme-utils";

type ContaminationExclusionNoticeProps = {
  excludedTotal: number;
  kpiExcludedTotal?: number;
  partialScan?: boolean;
};

/**
 * Admin-only notice when KPI totals exclude likely test/demo/smoke rows.
 * Never rendered on public storefront routes.
 */
export function ContaminationExclusionNotice({
  excludedTotal,
  kpiExcludedTotal,
  partialScan,
}: ContaminationExclusionNoticeProps) {
  if (excludedTotal <= 0) return null;

  const kpiNote =
    kpiExcludedTotal != null && kpiExcludedTotal !== excludedTotal
      ? ` ${kpiExcludedTotal.toLocaleString()} row${kpiExcludedTotal === 1 ? "" : "s"} excluded from KPI card totals.`
      : "";

  return (
    <div
      className={adminAlertSurface("warning", "mb-4")}
      role="status"
      data-testid="contamination-exclusion-notice"
    >
      <p className="font-medium text-admin-primary">Test/demo rows excluded from operational totals</p>
      <p className="mt-1 text-admin-secondary">
        {excludedTotal.toLocaleString()} row{excludedTotal === 1 ? "" : "s"} matched contamination heuristics
        (definite/high confidence).{kpiNote} Detail lists may still show these records for review.
        {partialScan
          ? " Some tables were sample-scanned (see docs/CONTAMINATION_GOVERNANCE.md); run npm run report:contamination for a full audit."
          : null}
      </p>
    </div>
  );
}
