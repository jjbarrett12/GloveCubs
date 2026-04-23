/**
 * Load prior feed state (latest completed batch) for comparison.
 */

import { getSupabaseCatalogos } from "@/lib/db/client";
import type { PriorRow } from "./types";

export interface LoadPriorStateInput {
  feedId: string;
  supplierId: string;
}

/**
 * Load latest completed import_batch for feed/supplier, then all raw + normalized rows keyed by external_id.
 */
export async function loadPriorState(input: LoadPriorStateInput): Promise<Map<string, PriorRow>> {
  const supabase = getSupabaseCatalogos(true);

  const { data: batch, error: batchErr } = await supabase
    .from("import_batches")
    .select("id")
    .eq("feed_id", input.feedId)
    .eq("supplier_id", input.supplierId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (batchErr || !batch?.id) return new Map();

  const batchId = batch.id as string;

  const { data: rawRows, error: rawErr } = await supabase
    .from("supplier_products_raw")
    .select("id, external_id, raw_payload")
    .eq("batch_id", batchId)
    .eq("supplier_id", input.supplierId);

  if (rawErr || !rawRows?.length) return new Map();

  const rawIds = rawRows.map((r) => r.id as string);
  const { data: normRows, error: normErr } = await supabase
    .from("supplier_products_normalized")
    .select("id, raw_id, normalized_data, attributes")
    .in("raw_id", rawIds);

  type NormRow = NonNullable<typeof normRows>[number];
  const normByRawId = new Map<string, NormRow>();
  if (!normErr && normRows) {
    for (const n of normRows) {
      if (n.raw_id) normByRawId.set(n.raw_id as string, n);
    }
  }

  const map = new Map<string, PriorRow>();
  for (const r of rawRows) {
    const external_id = (r.external_id as string) ?? "";
    const norm = normByRawId.get(r.id as string);
    map.set(external_id, {
      external_id,
      raw_id: r.id as string,
      raw_payload: (r.raw_payload as Record<string, unknown>) ?? {},
      normalized_id: norm?.id ?? null,
      normalized_data: (norm?.normalized_data as Record<string, unknown>) ?? {},
      attributes: (norm?.attributes as Record<string, unknown>) ?? {},
    });
  }
  return map;
}
