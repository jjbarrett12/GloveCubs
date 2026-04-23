import { getSupabase } from "@/lib/db/client";
import { normalizeDisposableGlove } from "@/lib/services/normalization/disposable-gloves";
import { matchToMaster } from "@/lib/services/matching/match-master";
import { DEFAULT_CATEGORY } from "@/lib/constants/categories";
import type { MasterProduct } from "@/types/catalogos";

export interface IngestInput {
  supplier_id: number;
  raw_rows: Record<string, unknown>[];
}

export interface IngestResult {
  batch_id: number;
  raw_count: number;
  staged_count: number;
  matched_count: number;
  errors: string[];
}

/**
 * Run a full ingestion: create batch, insert raw rows, normalize → staging, match to master.
 */
export async function runIngestion(input: IngestInput): Promise<IngestResult> {
  const supabase = getSupabase(true);
  const errors: string[] = [];

  const { data: batch, error: batchErr } = await supabase
    .from("catalogos_import_batches")
    .insert({
      supplier_id: input.supplier_id,
      feed_id: null,
      status: "running",
      stats: {},
    } as never)
    .select("id")
    .single();

  if (batchErr || !batch) {
    throw new Error(batchErr?.message ?? "Failed to create batch");
  }
  const batchId = (batch as { id: number }).id;

  await supabase.from("catalogos_job_logs").insert({
    batch_id: batchId,
    step: "ingest",
    status: "started",
    message: `Ingesting ${input.raw_rows.length} raw rows`,
  } as never);

  const rawIds: { external_id: string; id: number }[] = [];
  for (let i = 0; i < input.raw_rows.length; i++) {
    const row = input.raw_rows[i];
    const externalId = String(row?.id ?? row?.sku ?? row?.item ?? i);
    const { data: rawData, error: rawErr } = await supabase
      .from("catalogos_raw_supplier_products")
      .insert({
        batch_id: batchId,
        supplier_id: input.supplier_id,
        external_id: externalId,
        raw_json: row ?? {},
      } as never)
      .select("id")
      .single();
    if (rawErr) errors.push(`Row ${i}: ${rawErr.message}`);
    else {
      const rid = (rawData as { id?: number } | null)?.id;
      if (rid != null) rawIds.push({ external_id: externalId, id: rid });
    }
  }

  const { data: masters } = await supabase
    .from("catalogos_master_products")
    .select("*")
    .eq("category", DEFAULT_CATEGORY);
  const candidates = (masters ?? []) as MasterProduct[];

  let stagedCount = 0;
  let matchedCount = 0;
  for (const { external_id, id: rawId } of rawIds) {
    const rawRow = input.raw_rows.find(
      (r, i) => String(r?.id ?? r?.sku ?? r?.item ?? i) === external_id
    ) ?? {};
    const { normalized, attributes } = normalizeDisposableGlove(rawRow as Record<string, unknown>);
    const rr = rawRow as Record<string, unknown>;
    const upcRaw = rr.upc ?? rr.gtin;
    const matchResult = matchToMaster(
      {
        upc: upcRaw == null ? undefined : String(upcRaw),
        attributes: { ...attributes, ...normalized },
        category: DEFAULT_CATEGORY,
        supplier_sku: rr.sku as string,
      },
      candidates
    );

    const { error: stageErr } = await supabase.from("catalogos_staging_products").insert({
      batch_id: batchId,
      raw_id: rawId,
      supplier_id: input.supplier_id,
      normalized_json: normalized,
      attributes_json: attributes,
      master_product_id: matchResult.master_product_id,
      match_confidence: matchResult.confidence,
      status: "pending",
    } as never);
    if (stageErr) errors.push(`Staging ${external_id}: ${stageErr.message}`);
    else {
      stagedCount++;
      if (matchResult.master_product_id) matchedCount++;
    }
  }

  await supabase
    .from("catalogos_import_batches")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      stats: { raw_count: rawIds.length, staged_count: stagedCount, matched_count: matchedCount, error_count: errors.length },
    } as never)
    .eq("id", batchId);

  await supabase.from("catalogos_job_logs").insert({
    batch_id: batchId,
    step: "ingest",
    status: errors.length > 0 ? "failed" : "success",
    message: `Staged ${stagedCount}, matched ${matchedCount}`,
    payload: { raw_count: rawIds.length, staged_count: stagedCount, matched_count: matchedCount },
  } as never);

  return {
    batch_id: batchId,
    raw_count: rawIds.length,
    staged_count: stagedCount,
    matched_count: matchedCount,
    errors,
  };
}
