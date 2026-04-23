/**
 * Tests for bulk action eligibility: selection behavior and disabled invalid actions.
 */

import { describe, it, expect } from "vitest";
import { getBulkEligibility } from "./ingestion-bulk-eligibility";
import type { StagingRow } from "@/lib/review/data";

function row(
  id: string,
  status: string,
  master_product_id: string | null = null
): StagingRow {
  return {
    id,
    batch_id: "batch-1",
    raw_id: "raw-1",
    supplier_id: "sup-1",
    normalized_data: {},
    attributes: {},
    match_confidence: 0.9,
    master_product_id,
    status,
    created_at: new Date().toISOString(),
  };
}

describe("getBulkEligibility", () => {
  it("with no selection: only batch-level actions can be enabled", () => {
    const rows: StagingRow[] = [
      row("r1", "pending", "master-1"),
      row("r2", "approved", "master-1"),
    ];
    const el = getBulkEligibility(rows, new Set(), 1, 1);
    expect(el.canApproveSelected).toBe(false);
    expect(el.canApproveAiSuggestions).toBe(false);
    expect(el.canRejectSelected).toBe(false);
    expect(el.canMarkForReview).toBe(false);
    expect(el.canPublishSelected).toBe(false);
    expect(el.canApproveAllAbove).toBe(true);
    expect(el.canPublishAll).toBe(true);
  });

  it("with selection of approved rows: publish selected is enabled", () => {
    const rows: StagingRow[] = [
      row("r1", "approved", "master-1"),
      row("r2", "approved", "master-1"),
    ];
    const el = getBulkEligibility(rows, new Set(["r1", "r2"]), 2, 0);
    expect(el.canPublishSelected).toBe(true);
    expect(el.canApproveSelected).toBe(true);
    expect(el.firstMatchMasterId).toBe("master-1");
  });

  it("with selection including rejected: publish selected is disabled", () => {
    const rows: StagingRow[] = [
      row("r1", "approved", "master-1"),
      row("r2", "rejected", null),
    ];
    const el = getBulkEligibility(rows, new Set(["r1", "r2"]), 1, 0);
    expect(el.canPublishSelected).toBe(false);
    expect(el.selectedApprovedOrMergedCount).toBe(1);
  });

  it("with selection of pending rows with no match: approve selected is disabled", () => {
    const rows: StagingRow[] = [
      row("r1", "pending", null),
      row("r2", "pending", null),
    ];
    const el = getBulkEligibility(rows, new Set(["r1", "r2"]), 0, 2);
    expect(el.canApproveSelected).toBe(false);
    expect(el.firstMatchMasterId).toBeNull();
  });

  it("with selection of pending rows with one match: approve selected is enabled", () => {
    const rows: StagingRow[] = [
      row("r1", "pending", "master-1"),
      row("r2", "pending", null),
    ];
    const el = getBulkEligibility(rows, new Set(["r1", "r2"]), 0, 2);
    expect(el.canApproveSelected).toBe(true);
    expect(el.firstMatchMasterId).toBe("master-1");
  });

  it("with selection including rejected: approve selected is disabled", () => {
    const rows: StagingRow[] = [
      row("r1", "pending", "master-1"),
      row("r2", "rejected", null),
    ];
    const el = getBulkEligibility(rows, new Set(["r1", "r2"]), 0, 1);
    expect(el.canApproveSelected).toBe(false);
  });

  it("reject and mark-for-review enabled whenever any row selected", () => {
    const rows: StagingRow[] = [row("r1", "rejected", null)];
    const el = getBulkEligibility(rows, new Set(["r1"]), 0, 0);
    expect(el.canRejectSelected).toBe(true);
    expect(el.canMarkForReview).toBe(true);
  });

  it("when no pending rows: approve all above confidence is disabled", () => {
    const rows: StagingRow[] = [row("r1", "approved", "master-1")];
    const el = getBulkEligibility(rows, new Set(), 1, 0);
    expect(el.canApproveAllAbove).toBe(false);
  });

  it("when no approved rows: publish all is disabled", () => {
    const rows: StagingRow[] = [row("r1", "pending", "master-1")];
    const el = getBulkEligibility(rows, new Set(), 0, 1);
    expect(el.canPublishAll).toBe(false);
  });

  it("selection behavior: all rows selected and all approved enables publish selected", () => {
    const rows: StagingRow[] = [
      row("r1", "approved", "master-1"),
      row("r2", "merged", "master-1"),
    ];
    const allIds = new Set(rows.map((r) => r.id));
    const el = getBulkEligibility(rows, allIds, 2, 0);
    expect(el.canPublishSelected).toBe(true);
  });

  it("selection behavior: one pending in selection disables publish selected", () => {
    const rows: StagingRow[] = [
      row("r1", "approved", "master-1"),
      row("r2", "pending", "master-1"),
    ];
    const el = getBulkEligibility(rows, new Set(["r1", "r2"]), 1, 1);
    expect(el.canPublishSelected).toBe(false);
  });

  it("when isBlocked returns true for a selected row, canPublishSelected is false", () => {
    const rows: StagingRow[] = [
      row("r1", "approved", "master-1"),
      row("r2", "approved", "master-1"),
    ];
    const isBlocked = (r: StagingRow) => r.id === "r2";
    const el = getBulkEligibility(rows, new Set(["r1", "r2"]), 2, 0, isBlocked);
    expect(el.canPublishSelected).toBe(false);
  });

  it("when isBlocked returns false for all selected, canPublishSelected stays true", () => {
    const rows: StagingRow[] = [
      row("r1", "approved", "master-1"),
      row("r2", "approved", "master-1"),
    ];
    const el = getBulkEligibility(rows, new Set(["r1", "r2"]), 2, 0, () => false);
    expect(el.canPublishSelected).toBe(true);
  });

  it("when selectedIds exceed cached row snapshots, approve/publish are disabled", () => {
    const rows: StagingRow[] = [row("r1", "pending", "master-1")];
    const el = getBulkEligibility(rows, new Set(["r1", "r2"]), 0, 2);
    expect(el.selectionComplete).toBe(false);
    expect(el.canApproveSelected).toBe(false);
    expect(el.canPublishSelected).toBe(false);
    expect(el.canRejectSelected).toBe(true);
  });

  it("canApproveAiSuggestions is true when every selected row has completed AI suggestion", () => {
    const r1: StagingRow = {
      ...row("r1", "pending", null),
      ai_match_status: "completed",
      ai_suggested_master_product_id: "master-ai-1",
    };
    const r2: StagingRow = {
      ...row("r2", "pending", null),
      ai_match_status: "completed",
      ai_suggested_master_product_id: "master-ai-2",
    };
    const el = getBulkEligibility([r1, r2], new Set(["r1", "r2"]), 0, 2);
    expect(el.selectionComplete).toBe(true);
    expect(el.canApproveAiSuggestions).toBe(true);
  });

  it("canApproveAiSuggestions is false when one selected row lacks AI suggestion", () => {
    const r1: StagingRow = {
      ...row("r1", "pending", null),
      ai_match_status: "completed",
      ai_suggested_master_product_id: "master-ai-1",
    };
    const r2: StagingRow = {
      ...row("r2", "pending", null),
      ai_match_status: "pending",
      ai_suggested_master_product_id: null,
    };
    const el = getBulkEligibility([r1, r2], new Set(["r1", "r2"]), 0, 2);
    expect(el.canApproveAiSuggestions).toBe(false);
  });
});
