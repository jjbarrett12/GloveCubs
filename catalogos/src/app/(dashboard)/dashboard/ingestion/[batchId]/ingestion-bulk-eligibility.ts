/**
 * Pure eligibility logic for bulk actions in the ingestion batch detail UI.
 * Used to disable unsafe actions (e.g. publish rejected rows, approve without match).
 */

import type { StagingRow } from "@/lib/review/data";

export interface BulkEligibility {
  canApproveSelected: boolean;
  canRejectSelected: boolean;
  canMarkForReview: boolean;
  canApproveAllAbove: boolean;
  /** Each selected row has a completed AI suggestion (pass 2). */
  canApproveAiSuggestions: boolean;
  canPublishSelected: boolean;
  canPublishAll: boolean;
  firstMatchMasterId: string | null;
  selectedApprovedOrMergedCount: number;
  /** True when we have a StagingRow in memory for every selected id */
  selectionComplete: boolean;
}

/**
 * Compute which bulk actions are allowed given current selection and batch state.
 * @param selectedRows — Staging rows for every selected id (e.g. from a cross-page cache). If length &lt; selectedIds.size, approve/publish are disabled until missing rows are loaded or selection is cleared.
 */
export function getBulkEligibility(
  selectedRows: StagingRow[],
  selectedIds: Set<string>,
  approvedCount: number,
  pendingCount: number,
  isBlocked?: (row: StagingRow) => boolean,
  /** When set (e.g. ingestion workflow), gates “publish all” on rows not yet storefront-synced. */
  readyToPublishCount?: number
): BulkEligibility {
  const selectionComplete = selectedIds.size > 0 && selectedRows.length === selectedIds.size;
  const selectedApprovedOrMerged = selectedRows.filter(
    (r) => r.status === "approved" || r.status === "merged"
  );
  const anyBlocked = isBlocked ? selectedRows.some(isBlocked) : false;
  const allSelectedPublishable =
    selectedApprovedOrMerged.length === selectedIds.size && !anyBlocked;
  const firstMatchMasterId =
    selectedRows.find((r) => r.master_product_id != null)?.master_product_id ?? null;
  const allSelectedCanBeApproved = selectedRows.every(
    (r) => r.status === "pending" || r.status === "approved" || r.status === "merged"
  );
  const allSelectedHaveAiSuggestion =
    selectionComplete &&
    selectedRows.length > 0 &&
    selectedRows.every(
      (r) =>
        r.status === "pending" &&
        r.ai_match_status === "completed" &&
        r.ai_suggested_master_product_id != null &&
        r.ai_suggested_master_product_id !== ""
    );

  return {
    canApproveSelected:
      selectionComplete &&
      firstMatchMasterId != null &&
      allSelectedCanBeApproved,
    canRejectSelected: selectedIds.size > 0,
    canMarkForReview: selectedIds.size > 0,
    canApproveAllAbove: pendingCount > 0,
    canApproveAiSuggestions: allSelectedHaveAiSuggestion,
    canPublishSelected: selectionComplete && allSelectedPublishable,
    canPublishAll: (readyToPublishCount ?? approvedCount) > 0,
    firstMatchMasterId,
    selectedApprovedOrMergedCount: selectedApprovedOrMerged.length,
    selectionComplete,
  };
}
