"use server";

import { revalidatePath } from "next/cache";
import { runMatching } from "@/lib/product-matching/run-orchestration";
import {
  updateDuplicateCandidateStatus,
  mergeDuplicateProducts,
  type DuplicateResolution,
} from "@/lib/product-matching/match-runs";

const MATCH_PATHS = [
  "/dashboard/product-matching",
  "/dashboard/product-matching/runs",
  "/dashboard/review",
  "/dashboard/batches",
  "/dashboard/staging",
];

async function revalidateMatch() {
  MATCH_PATHS.forEach((p) => revalidatePath(p));
}

export interface RunMatchingActionResult {
  success: boolean;
  runId?: string;
  error?: string;
}

export async function runMatchingAction(options: {
  batchId?: string | null;
  scope: "batch" | "all_pending";
  autoApplyHighConfidence?: boolean;
}): Promise<RunMatchingActionResult> {
  try {
    const result = await runMatching({
      batchId: options.batchId ?? null,
      scope: options.scope,
      autoApplyHighConfidence: options.autoApplyHighConfidence ?? false,
    });
    await revalidateMatch();
    return {
      success: !result.error,
      runId: result.runId,
      error: result.error,
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Matching failed",
    };
  }
}

export interface ResolveDuplicateResult {
  success: boolean;
  error?: string;
}

export async function resolveDuplicateCandidateAction(
  duplicateCandidateId: string,
  status: DuplicateResolution
): Promise<ResolveDuplicateResult> {
  try {
    await updateDuplicateCandidateStatus(duplicateCandidateId, status);
    await revalidateMatch();
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to update" };
  }
}

export interface MergeDuplicatesResult {
  success: boolean;
  offersMoved?: number;
  error?: string;
}

export async function mergeDuplicatesAction(
  keepProductId: string,
  mergeProductId: string
): Promise<MergeDuplicatesResult> {
  try {
    const result = await mergeDuplicateProducts(keepProductId, mergeProductId);
    await revalidateMatch();
    return result.success
      ? { success: true, offersMoved: result.offersMoved }
      : { success: false, error: result.error };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Merge failed" };
  }
}
