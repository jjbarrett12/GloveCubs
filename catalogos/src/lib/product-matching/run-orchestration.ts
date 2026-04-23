/**
 * Product Matching Agent — run orchestration.
 * Load staged rows, run matching + duplicate detection, persist candidates; optionally update staging.
 */

import { getSupabaseCatalogos } from "@/lib/db/client";
import { matchStagedRow } from "./matching-service";
import type { StagedRowForMatching } from "./matching-service";
import { findDuplicateCandidates, productIdsInDuplicatePairs } from "./duplicate-detection";
import {
  createMatchRun,
  completeMatchRun,
  insertMatchCandidate,
  insertDuplicateCandidates,
  updateStagingFromMatch,
} from "./match-runs";
import type { MatchRunStats } from "./types";
import { CRITICAL_SAFETY_ATTRIBUTES } from "./scoring";

const LOW_CONFIDENCE_THRESHOLD = 0.6;
const AUTO_APPLY_THRESHOLD = 0.9;

export interface RunMatchingInput {
  batchId?: string | null;
  scope: "batch" | "all_pending";
  /** When true, update supplier_products_normalized with suggested match only if confidence >= AUTO_APPLY_THRESHOLD and no duplicate_warning */
  autoApplyHighConfidence?: boolean;
}

export interface RunMatchingResult {
  runId: string;
  stats: MatchRunStats;
  error?: string;
}

/**
 * Load staged rows for scope (batch or all pending).
 */
async function loadStagedRows(input: RunMatchingInput): Promise<StagedRowForMatching[]> {
  const supabase = getSupabaseCatalogos(true);
  let q = supabase
    .from("supplier_products_normalized")
    .select("id, normalized_data, attributes")
    .eq("status", "pending");

  if (input.scope === "batch" && input.batchId) {
    q = q.eq("batch_id", input.batchId);
  }

  const { data, error } = await q.limit(2000);
  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => ({
    id: r.id as string,
    normalized_data: (r.normalized_data as Record<string, unknown>) ?? {},
    attributes: (r.attributes as Record<string, unknown>) ?? {},
  }));
}

/**
 * Run full matching: create run, load rows, run duplicate detection per category, match each row, persist.
 */
export async function runMatching(input: RunMatchingInput): Promise<RunMatchingResult> {
  const { runId } = await createMatchRun({
    batchId: input.batchId,
    scope: input.scope,
  });

  const stats: MatchRunStats = {
    total: 0,
    matched: 0,
    uncertain: 0,
    no_match: 0,
    duplicates_found: 0,
  };

  try {
    const rows = await loadStagedRows(input);
    stats.total = rows.length;

    if (rows.length === 0) {
      await completeMatchRun(runId, stats);
      return { runId, stats };
    }

    const categoryIds = new Set<string>();
    const supabase = getSupabaseCatalogos(true);
    for (const r of rows) {
      const slug = (r.normalized_data?.category_slug as string) ?? (r.normalized_data?.category as string);
      if (slug) {
        const { data: cat } = await supabase.from("categories").select("id").eq("slug", slug).maybeSingle();
        if (cat?.id) categoryIds.add(cat.id as string);
      }
    }

    const allDuplicatePairs: { product_id_a: string; product_id_b: string; score: number; reason: string }[] = [];
    const duplicateIdsByCategory = new Map<string, Set<string>>();

    for (const cid of categoryIds) {
      const pairs = await findDuplicateCandidates(cid);
      for (const p of pairs) {
        allDuplicatePairs.push(p);
      }
      duplicateIdsByCategory.set(cid, productIdsInDuplicatePairs(pairs));
    }
    stats.duplicates_found = allDuplicatePairs.length;
    await insertDuplicateCandidates(runId, allDuplicatePairs);

    const categoryIdBySlug = new Map<string, string>();
    for (const cid of categoryIds) {
      const { data: cat } = await supabase.from("categories").select("id, slug").eq("id", cid).single();
      if (cat?.slug) categoryIdBySlug.set(cat.slug as string, cat.id as string);
    }

    for (const row of rows) {
      const slug = (row.normalized_data?.category_slug as string) ?? (row.normalized_data?.category as string);
      const categoryId = slug ? categoryIdBySlug.get(slug) ?? null : null;
      const staged: StagedRowForMatching = {
        ...row,
        category_id: categoryId ?? undefined,
      };
      const duplicateIds = categoryId ? duplicateIdsByCategory.get(categoryId) : new Set<string>();

      const result = await matchStagedRow(staged, { duplicateProductIds: duplicateIds });
      await insertMatchCandidate(runId, row.id, result);

      if (result.reason === "no_match" || result.confidence < LOW_CONFIDENCE_THRESHOLD) {
        stats.no_match = (stats.no_match ?? 0) + 1;
      } else if (result.requires_review) {
        stats.uncertain = (stats.uncertain ?? 0) + 1;
      } else {
        stats.matched = (stats.matched ?? 0) + 1;
      }

      // CRITICAL: Verify critical safety attributes match before auto-applying
      // Even high-confidence UPC matches can fail if sterility/material/size differ
      let criticalAttributeConflict = false;
      if (result.suggested_master_product_id) {
        const { data: master } = await supabase
          .from("products")
          .select("attributes")
          .eq("id", result.suggested_master_product_id)
          .single();
        if (master?.attributes) {
          const masterAttrs = master.attributes as Record<string, unknown>;
          const stagedAttrs = (row.attributes ?? {}) as Record<string, unknown>;
          for (const attrKey of CRITICAL_SAFETY_ATTRIBUTES) {
            const masterVal = masterAttrs[attrKey];
            const stagedVal = stagedAttrs[attrKey];
            // If both have values and they differ, it's a conflict
            if (masterVal != null && stagedVal != null) {
              const masterStr = String(masterVal).toLowerCase().trim();
              const stagedStr = String(stagedVal).toLowerCase().trim();
              if (masterStr !== stagedStr) {
                criticalAttributeConflict = true;
                console.warn(`[CatalogOS] Auto-apply blocked: ${attrKey} mismatch (master: ${masterStr}, staged: ${stagedStr}) for row ${row.id}`);
                break;
              }
            }
          }
        }
      }

      const canAutoApply =
        input.autoApplyHighConfidence &&
        result.suggested_master_product_id &&
        result.confidence >= AUTO_APPLY_THRESHOLD &&
        !result.duplicate_warning &&
        !criticalAttributeConflict;
      if (canAutoApply) {
        await updateStagingFromMatch(row.id, result.suggested_master_product_id, result.confidence);
      }
    }

    await completeMatchRun(runId, stats);
    return { runId, stats };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Matching failed";
    await completeMatchRun(runId, stats, msg);
    return { runId, stats, error: msg };
  }
}
