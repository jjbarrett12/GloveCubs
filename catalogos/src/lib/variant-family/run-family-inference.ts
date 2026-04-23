/**
 * Run family inference on a batch of staging rows and persist inferred_base_sku,
 * inferred_size, family_group_key, grouping_confidence to supplier_products_normalized.
 */

import { getSupabaseCatalogos } from "@/lib/db/client";
import {
  computeFamilyInference,
  FAMILY_GROUPING_CONFIDENCE_THRESHOLD,
} from "./family-inference";
import { createOpenAiVariantHint } from "./ai-variant-hint";

export interface RunFamilyInferenceResult {
  batchId: string;
  updated: number;
  groupedCount: number;
  errors: string[];
}

/**
 * Load all supplier_products_normalized rows for the batch, run inference, and update DB.
 */
export async function runFamilyInferenceForBatch(
  batchId: string,
  options: { confidenceThreshold?: number; enableAiVariantHint?: boolean } = {}
): Promise<RunFamilyInferenceResult> {
  const supabase = getSupabaseCatalogos(true);
  const errors: string[] = [];

  const { data: rows, error: fetchErr } = await supabase
    .from("supplier_products_normalized")
    .select("id, normalized_data, attributes")
    .eq("batch_id", batchId);

  if (fetchErr) {
    return { batchId, updated: 0, groupedCount: 0, errors: [fetchErr.message] };
  }

  const list = (rows ?? []) as {
    id: string;
    normalized_data?: Record<string, unknown>;
    attributes?: Record<string, unknown>;
  }[];

  const stagingRows = list.map((r) => ({
    id: r.id,
    sku: (r.normalized_data?.supplier_sku ?? r.normalized_data?.sku ?? "") as string,
    normalized_data: r.normalized_data,
    attributes: r.attributes,
  }));

  const wantAi =
    options.enableAiVariantHint === true ||
    String(process.env.CATALOGOS_FAMILY_AI ?? "").toLowerCase() === "1";
  const useAi = wantAi && Boolean(process.env.OPENAI_API_KEY);
  const inferred = await computeFamilyInference(stagingRows, {
    confidenceThreshold: options.confidenceThreshold ?? FAMILY_GROUPING_CONFIDENCE_THRESHOLD,
    enableAiVariantHint: useAi,
    aiVariantHint: useAi ? createOpenAiVariantHint() : undefined,
  });

  let updated = 0;
  const groupKeys = new Set<string>();
  for (const row of inferred) {
    const { error: updateErr } = await supabase
      .from("supplier_products_normalized")
      .update({
        inferred_base_sku: row.inferred_base_sku || null,
        inferred_size: row.inferred_size || null,
        family_group_key: row.family_group_key,
        grouping_confidence: row.grouping_confidence,
        variant_axis: row.variant_axis,
        variant_value: row.variant_value,
        family_group_meta: row.family_group_meta,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (updateErr) errors.push(`Update ${row.id}: ${updateErr.message}`);
    else {
      updated++;
      if (row.family_group_key) groupKeys.add(row.family_group_key);
    }
  }

  return {
    batchId,
    updated,
    groupedCount: groupKeys.size,
    errors,
  };
}
