/**
 * Read-only data for import monitoring dashboard.
 * No changes to ingestion logic; visibility only.
 */

import { getSupabaseCatalogos } from "@/lib/db/client";

export interface ImportMonitoringFilters {
  supplier_id?: string;
  status?: string;
  date_from?: string; // ISO date
  date_to?: string;   // ISO date
}

export interface BatchMonitoringRow {
  id: string;
  supplier_id: string;
  supplier_name: string;
  feed_id: string | null;
  status: string;
  started_at: string;
  completed_at: string | null;
  total_rows: number;
  succeeded: number;
  failed: number;
  duplicates_skipped: number;
  offers_created: number;
  warnings_summary: string;
  stats: Record<string, unknown>;
}

export async function getBatchesForMonitoring(
  filters: ImportMonitoringFilters,
  limit = 100
): Promise<BatchMonitoringRow[]> {
  const supabase = getSupabaseCatalogos(true);
  let query = supabase
    .from("import_batches")
    .select("id, supplier_id, feed_id, status, started_at, completed_at, stats")
    .order("started_at", { ascending: false })
    .limit(limit);

  if (filters.supplier_id) query = query.eq("supplier_id", filters.supplier_id);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.date_from) query = query.gte("started_at", filters.date_from);
  if (filters.date_to) {
    const end = new Date(filters.date_to);
    end.setUTCHours(23, 59, 59, 999);
    query = query.lte("started_at", end.toISOString());
  }

  const { data: batches, error } = await query;
  if (error) throw new Error(error.message);
  const list = (batches ?? []) as Array<{
    id: string;
    supplier_id: string;
    feed_id: string | null;
    status: string;
    started_at: string;
    completed_at: string | null;
    stats: Record<string, unknown> | null;
  }>;
  if (list.length === 0) return [];

  const supplierIds = [...new Set(list.map((b) => b.supplier_id))];
  const { data: suppliers } = await supabase.from("suppliers").select("id, name").in("id", supplierIds);
  const nameById = new Map((suppliers ?? []).map((s: { id: string; name: string }) => [s.id, s.name]));

  const batchIds = list.map((b) => b.id);
  const [rawCounts, normCounts, offerCounts, normAnomalies] = await Promise.all([
    getRawCountsByBatch(supabase, batchIds),
    getNormalizedCountsByBatch(supabase, batchIds),
    getOffersCreatedCountByBatch(supabase, batchIds),
    getAnomalyCountsByBatch(supabase, batchIds),
  ]);

  return list.map((b) => {
    const stats = (b.stats ?? {}) as Record<string, number>;
    const rawCount = rawCounts.get(b.id) ?? stats.raw_count ?? 0;
    const normCount = normCounts.get(b.id) ?? stats.normalized_count ?? 0;
    const succeeded = normCount;
    const failed = Math.max(0, rawCount - normCount);
    const offersCreated = offerCounts.get(b.id) ?? 0;
    const anomalyCount = normAnomalies.get(b.id) ?? stats.anomaly_row_count ?? 0;
    const errorCount = stats.error_count ?? 0;
    const warnings: string[] = [];
    if (anomalyCount > 0) warnings.push(`${anomalyCount} anomalies`);
    if (errorCount > 0) warnings.push(`${errorCount} errors`);
    return {
      id: b.id,
      supplier_id: b.supplier_id,
      supplier_name: nameById.get(b.supplier_id) ?? b.supplier_id,
      feed_id: b.feed_id,
      status: b.status,
      started_at: b.started_at,
      completed_at: b.completed_at,
      total_rows: rawCount,
      succeeded,
      failed,
      duplicates_skipped: 0,
      offers_created: offersCreated,
      warnings_summary: warnings.join("; ") || "—",
      stats: b.stats ?? {},
    };
  });
}

async function getRawCountsByBatch(
  supabase: ReturnType<typeof getSupabaseCatalogos>,
  batchIds: string[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (batchIds.length === 0) return out;
  const { data } = await supabase
    .from("supplier_products_raw")
    .select("batch_id")
    .in("batch_id", batchIds);
  for (const row of data ?? []) {
    const bid = (row as { batch_id: string }).batch_id;
    out.set(bid, (out.get(bid) ?? 0) + 1);
  }
  return out;
}

async function getNormalizedCountsByBatch(
  supabase: ReturnType<typeof getSupabaseCatalogos>,
  batchIds: string[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (batchIds.length === 0) return out;
  const { data } = await supabase
    .from("supplier_products_normalized")
    .select("batch_id")
    .in("batch_id", batchIds);
  for (const row of data ?? []) {
    const bid = (row as { batch_id: string }).batch_id;
    out.set(bid, (out.get(bid) ?? 0) + 1);
  }
  return out;
}

async function getOffersCreatedCountByBatch(
  supabase: ReturnType<typeof getSupabaseCatalogos>,
  batchIds: string[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (batchIds.length === 0) return out;
  const { data: normRows } = await supabase
    .from("supplier_products_normalized")
    .select("id, batch_id")
    .in("batch_id", batchIds);
  const normIdsByBatch = new Map<string, string[]>();
  for (const r of normRows ?? []) {
    const row = r as { id: string; batch_id: string };
    const arr = normIdsByBatch.get(row.batch_id) ?? [];
    arr.push(row.id);
    normIdsByBatch.set(row.batch_id, arr);
  }
  for (const batchId of batchIds) {
    const ids = normIdsByBatch.get(batchId) ?? [];
    if (ids.length === 0) {
      out.set(batchId, 0);
      continue;
    }
    const { count } = await supabase
      .from("supplier_offers")
      .select("id", { count: "exact", head: true })
      .in("normalized_id", ids);
    out.set(batchId, count ?? 0);
  }
  return out;
}

async function getAnomalyCountsByBatch(
  supabase: ReturnType<typeof getSupabaseCatalogos>,
  batchIds: string[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (batchIds.length === 0) return out;
  const { data } = await supabase
    .from("supplier_products_normalized")
    .select("batch_id, normalized_data")
    .in("batch_id", batchIds);
  for (const row of data ?? []) {
    const r = row as { batch_id: string; normalized_data?: { anomaly_flags?: unknown[] } };
    const flags = r.normalized_data?.anomaly_flags ?? [];
    if (flags.length > 0) out.set(r.batch_id, (out.get(r.batch_id) ?? 0) + 1);
  }
  return out;
}

// --- Batch detail: raw, normalized, failed, warnings, offers ---

export interface RawRowMonitor {
  id: string;
  batch_id: string;
  external_id: string;
  raw_payload: Record<string, unknown>;
  created_at: string;
}

export async function getRawRowsByBatch(batchId: string, limit = 500): Promise<RawRowMonitor[]> {
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase
    .from("supplier_products_raw")
    .select("id, batch_id, external_id, raw_payload, created_at")
    .eq("batch_id", batchId)
    .order("created_at")
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as RawRowMonitor[];
}

export interface NormalizedRowMonitor {
  id: string;
  batch_id: string;
  raw_id: string;
  status: string;
  normalized_data: Record<string, unknown>;
  attributes: Record<string, unknown>;
  match_confidence: number | null;
  master_product_id: string | null;
  created_at: string;
}

export async function getNormalizedRowsByBatch(batchId: string, limit = 500): Promise<NormalizedRowMonitor[]> {
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase
    .from("supplier_products_normalized")
    .select("id, batch_id, raw_id, status, normalized_data, attributes, match_confidence, master_product_id, created_at")
    .eq("batch_id", batchId)
    .order("created_at")
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as NormalizedRowMonitor[];
}

/** Raw rows that have no corresponding normalized row (failed to normalize). */
export async function getFailedRawRowsByBatch(batchId: string, limit = 500): Promise<RawRowMonitor[]> {
  const supabase = getSupabaseCatalogos(true);
  const { data: rawRows } = await supabase
    .from("supplier_products_raw")
    .select("id, batch_id, external_id, raw_payload, created_at")
    .eq("batch_id", batchId)
    .order("created_at")
    .limit(limit * 2);
  const rawList = (rawRows ?? []) as RawRowMonitor[];
  if (rawList.length === 0) return [];
  const rawIds = rawList.map((r) => r.id);
  const { data: normRows } = await supabase
    .from("supplier_products_normalized")
    .select("raw_id")
    .eq("batch_id", batchId)
    .in("raw_id", rawIds);
  const normalizedRawIds = new Set((normRows ?? []).map((r: { raw_id: string }) => r.raw_id));
  return rawList.filter((r) => !normalizedRawIds.has(r.id)).slice(0, limit);
}

export interface WarningItem {
  normalized_id: string;
  sku: string;
  name: string;
  messages: string[];
}

export async function getWarningsByBatch(batchId: string): Promise<WarningItem[]> {
  const supabase = getSupabaseCatalogos(true);
  const { data } = await supabase
    .from("supplier_products_normalized")
    .select("id, normalized_data")
    .eq("batch_id", batchId);
  const rows = (data ?? []) as Array<{ id: string; normalized_data?: { anomaly_flags?: Array<{ code?: string; message?: string }>; sku?: string; name?: string } }>;
  const out: WarningItem[] = [];
  for (const r of rows) {
    const flags = r.normalized_data?.anomaly_flags ?? [];
    if (flags.length === 0) continue;
    out.push({
      normalized_id: r.id,
      sku: r.normalized_data?.sku ?? "—",
      name: r.normalized_data?.name ?? "—",
      messages: flags.map((f) => f.message ?? f.code ?? "Unknown"),
    });
  }
  return out;
}

export interface OfferMonitorRow {
  id: string;
  supplier_id: string;
  product_id: string;
  supplier_sku: string;
  cost: number;
  normalized_id: string;
  raw_id: string | null;
  created_at: string;
  product_sku?: string;
  product_name?: string;
}

export async function getOffersCreatedByBatch(batchId: string, limit = 500): Promise<OfferMonitorRow[]> {
  const supabase = getSupabaseCatalogos(true);
  const { data: normRows } = await supabase
    .from("supplier_products_normalized")
    .select("id")
    .eq("batch_id", batchId)
    .limit(limit * 2);
  const normIds = (normRows ?? []).map((r: { id: string }) => r.id);
  if (normIds.length === 0) return [];
  const { data: offers, error } = await supabase
    .from("supplier_offers")
    .select("id, supplier_id, product_id, supplier_sku, cost, normalized_id, raw_id, created_at")
    .in("normalized_id", normIds)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  const list = (offers ?? []) as OfferMonitorRow[];
  const productIds = [...new Set(list.map((o) => o.product_id))];
  const { data: products } = await supabase.from("products").select("id, sku, name").in("id", productIds);
  const byId = new Map((products ?? []).map((p: { id: string; sku: string; name: string }) => [p.id, { sku: p.sku, name: p.name }]));
  list.forEach((o) => {
    const p = byId.get(o.product_id);
    if (p) {
      o.product_sku = p.sku;
      o.product_name = p.name;
    }
  });
  return list;
}
