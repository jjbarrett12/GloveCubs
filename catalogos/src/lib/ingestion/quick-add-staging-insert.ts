import type { SupabaseClient } from "@supabase/supabase-js";
import {
  COST_PROVENANCE_ACTOR,
  parseCostSourceType,
  stagingLandedCostFields,
} from "@/lib/pricing/landed-cost-provenance";

export interface InsertQuickAddStagingRowInput {
  batchId: string;
  supplierId: string;
  sourceRowIndex: number;
  externalId: string;
  rawPayload: Record<string, unknown>;
  sku: string;
  name: string;
  category_slug: string;
  normalized_case_cost: number;
  cost_source_type?: string;
  cost_source_reference?: string | null;
  cost_updated_by?: string;
  landed_cost_trusted?: boolean;
  /** Merged into normalized_data after the standard Quick Add shape (e.g. csv_bulk_needs_review). */
  normalizedDataExtra?: Record<string, unknown>;
}

export type InsertQuickAddStagingRowResult =
  | { success: true; rawId: string; normalizedId: string }
  | { success: false; error: string };

/**
 * Inserts one supplier_products_raw + supplier_products_normalized pair for Quick Add–compatible staging.
 * On normalized insert failure, removes the raw row so callers are not left with a dangling raw row.
 */
export async function insertQuickAddStagingRow(
  supabase: SupabaseClient,
  input: InsertQuickAddStagingRowInput
): Promise<InsertQuickAddStagingRowResult> {
  const {
    batchId,
    supplierId,
    sourceRowIndex,
    externalId,
    rawPayload,
    sku,
    name,
    category_slug,
    normalized_case_cost: cost,
    cost_source_type,
    cost_source_reference,
    cost_updated_by,
    landed_cost_trusted,
    normalizedDataExtra,
  } = input;

  const { data: rawRow, error: rawErr } = await supabase
    .from("supplier_products_raw")
    .insert({
      batch_id: batchId,
      supplier_id: supplierId,
      external_id: externalId,
      raw_payload: rawPayload,
      source_row_index: sourceRowIndex,
    })
    .select("id")
    .single();

  if (rawErr || !rawRow?.id) {
    return { success: false, error: rawErr?.message ?? "Failed to create raw row" };
  }

  const rawId = rawRow.id as string;
  const sourceType = parseCostSourceType(cost_source_type) ?? "manual";
  const trusted = landed_cost_trusted !== false;
  const landed = stagingLandedCostFields({
    cost,
    sourceType,
    sourceReference: cost_source_reference,
    updatedBy: cost_updated_by?.trim() || COST_PROVENANCE_ACTOR.catalogos_operator,
    trusted,
  });
  const normalized_data: Record<string, unknown> = {
    name,
    canonical_title: name,
    supplier_sku: sku,
    sku,
    category_slug,
    filter_attributes: {},
    ...landed,
    pricing: {
      ...(typeof landed.pricing === "object" && landed.pricing !== null ? (landed.pricing as object) : {}),
      sell_unit: "case",
      normalized_case_cost: cost,
    },
    quick_add: true,
    ...(normalizedDataExtra ?? {}),
  };

  const { data: normRow, error: normErr } = await supabase
    .from("supplier_products_normalized")
    .insert({
      batch_id: batchId,
      raw_id: rawId,
      supplier_id: supplierId,
      normalized_data,
      attributes: {},
      match_confidence: null,
      master_product_id: null,
      status: "pending",
    })
    .select("id")
    .single();

  if (normErr || !normRow?.id) {
    await supabase.from("supplier_products_raw").delete().eq("id", rawId);
    return { success: false, error: normErr?.message ?? "Failed to create staging row" };
  }

  return { success: true, rawId, normalizedId: normRow.id as string };
}
