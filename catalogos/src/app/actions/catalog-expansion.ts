"use server";

import { revalidatePath } from "next/cache";
import { runSync } from "@/lib/catalog-expansion/sync-service";
import { getFeedById, getFeedUrl } from "@/lib/catalogos/feeds";
import {
  updateDiscontinuedCandidate,
  resolveSyncItemResult,
  type DiscontinuedResolution,
} from "@/lib/catalog-expansion/sync-runs";
import { promoteSyncItemToStaging } from "@/lib/catalog-expansion/promotion-service";
import { applyDiscontinuedToOffers } from "@/lib/catalog-expansion/discontinued-service";

const EXPANSION_PATHS = ["/dashboard/catalog-expansion", "/dashboard/catalog-expansion/runs", "/dashboard/feeds", "/dashboard/operations", "/dashboard/review"];

async function revalidateExpansion() {
  EXPANSION_PATHS.forEach((p) => revalidatePath(p));
}

export interface RunSyncActionResult {
  success: boolean;
  runId?: string;
  error?: string;
}

export async function runSyncAction(feedId: string): Promise<RunSyncActionResult> {
  try {
    const feed = await getFeedById(feedId);
    if (!feed) return { success: false, error: "Feed not found" };
    const feedUrl = getFeedUrl(feed);
    if (!feedUrl) return { success: false, error: "Feed has no URL configured" };
    const { runId, error } = await runSync({
      feedId,
      supplierId: feed.supplier_id,
      feedUrl,
    });
    await revalidateExpansion();
    if (error) return { success: false, runId, error };
    return { success: true, runId };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Sync failed" };
  }
}

export interface ResolveSyncItemResult {
  success: boolean;
  error?: string;
}

export async function resolveSyncItemResultAction(
  itemResultId: string,
  resolution: "approved" | "rejected"
): Promise<ResolveSyncItemResult> {
  try {
    await resolveSyncItemResult(itemResultId, resolution);
    await revalidateExpansion();
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to resolve" };
  }
}

export interface ApproveAndPromoteResult {
  success: boolean;
  normalizedId?: string;
  error?: string;
}

/** Approve sync item and promote to staging (new/changed → supplier_products_normalized). Idempotent. */
export async function approveAndPromoteSyncItemAction(syncItemResultId: string): Promise<ApproveAndPromoteResult> {
  try {
    const result = await promoteSyncItemToStaging(syncItemResultId);
    if (result.success) await revalidateExpansion();
    return result;
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Promotion failed" };
  }
}

export interface UpdateDiscontinuedResult {
  success: boolean;
  error?: string;
}

export async function updateDiscontinuedCandidateAction(
  candidateId: string,
  status: DiscontinuedResolution,
  options?: { notes?: string }
): Promise<UpdateDiscontinuedResult & { offersUpdated?: number }> {
  try {
    await updateDiscontinuedCandidate(candidateId, status, { notes: options?.notes });
    let offersUpdated: number | undefined;
    if (status === "confirmed_discontinued") {
      const applied = await applyDiscontinuedToOffers(candidateId);
      if (!applied.success) return { success: false, error: applied.error };
      offersUpdated = applied.offersUpdated;
    }
    await revalidateExpansion();
    return { success: true, offersUpdated };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to update" };
  }
}
