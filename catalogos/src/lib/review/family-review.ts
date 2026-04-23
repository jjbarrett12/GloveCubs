/**
 * Family-first review: classify proposed variant groups for operator queues and bulk actions.
 */

import type { ProposedFamilyGroup, StagingRow } from "./data";
import type { FamilyGroupMetaV1 } from "@/lib/variant-family";
import { getProposedFamiliesForBatch } from "./data";
import type { FamilyOperatorMeta } from "./family-review-types";

export type { FamilyOperatorMeta } from "./family-review-types";
export { hasFamilyConflict } from "./family-review-types";

const HIGH_CONF = 0.85;

export interface FamilyReviewGroup extends ProposedFamilyGroup {
  operator: FamilyOperatorMeta;
}

function distinct<T>(vals: (T | null | undefined)[]): T[] {
  return [...new Set(vals.filter((v): v is T => v != null && v !== ""))];
}

export function enrichFamilyGroupWithOperatorMeta(group: ProposedFamilyGroup): FamilyReviewGroup {
  const pending = group.rows.filter((r) => r.status === "pending");
  const pendingIds = pending.map((r) => r.id);

  const masters = distinct(pending.map((r) => r.master_product_id));
  const aiSuggested = distinct(
    pending
      .filter((r) => r.ai_match_status === "completed" && r.ai_suggested_master_product_id)
      .map((r) => r.ai_suggested_master_product_id)
  );

  const firstPendingMaster = pending[0]?.master_product_id;
  const sharedAutoApproveMasterId =
    pending.length > 0 &&
    firstPendingMaster != null &&
    pending.every(
      (r) =>
        r.master_product_id === firstPendingMaster &&
        r.match_confidence != null &&
        Number(r.match_confidence) >= HIGH_CONF
    )
      ? firstPendingMaster
      : null;

  const unmatchedPendingCount = pending.filter((r) => !r.master_product_id).length;
  const aiSuggestionReadyCount = pending.filter(
    (r) =>
      r.ai_match_status === "completed" &&
      r.ai_suggested_master_product_id != null
  ).length;
  const aiMatchQueuedCount = pending.filter((r) => r.ai_match_status === "pending" || r.ai_match_status === "processing").length;

  const conflictingMasters = masters.length > 1;
  const conflictingAiSuggestions = aiSuggested.length > 1;

  const inferenceFlags = new Set<string>();
  for (const r of group.rows) {
    const meta = r.family_group_meta ?? group.family_group_meta;
    const flags = (meta as FamilyGroupMetaV1 | null)?.flags;
    if (Array.isArray(flags)) flags.forEach((f) => inferenceFlags.add(f));
  }

  return {
    ...group,
    operator: {
      pendingIds,
      pendingCount: pending.length,
      sharedAutoApproveMasterId,
      unmatchedPendingCount,
      aiSuggestionReadyCount,
      aiMatchQueuedCount,
      conflictingMasters,
      conflictingAiSuggestions,
      inferenceFlags: [...inferenceFlags],
    },
  };
}

/** Proposed families with operator metadata (queues, conflicts, bulk-action hints). */
export async function getFamilyReviewGroupsForBatch(batchId: string): Promise<FamilyReviewGroup[]> {
  const groups = await getProposedFamiliesForBatch(batchId);
  return groups.map(enrichFamilyGroupWithOperatorMeta);
}
