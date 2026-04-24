/**
 * Server-side data for CatalogOS review dashboard and ingestion console.
 * All reads use catalogos schema (getSupabaseCatalogos) so batch counts, review-required,
 * publish-ready, and failed counts are from the same source of truth. No public-schema mix.
 */

import { getSupabaseCatalogos } from "@/lib/db/client";
import { v2RowToMasterShape } from "@/lib/catalog/v2-master-product";
import type { FamilyGroupMetaV1 } from "@/lib/variant-family";
import { matchesStagingSearchRow, normalizeSearchQuery } from "./staging-search";

export interface BatchListItem {
  id: string;
  supplier_id: string;
  feed_id: string | null;
  status: string;
  started_at: string;
  completed_at: string | null;
  stats: { raw_count?: number; normalized_count?: number; matched_count?: number; anomaly_row_count?: number; error_count?: number };
  supplier_name?: string;
  /** Inferred: "feed" when feed_id set, "url" or "manual" when null. */
  source_type?: "feed" | "url" | "manual";
}

/** Extended batch summary for ingestion console: row counts by status and published. */
export interface IngestionBatchSummary extends BatchListItem {
  total_rows: number;
  accepted_rows: number;   // approved + merged
  review_required_rows: number; // pending
  rejected_rows: number;
  published_rows: number;
  duplicate_warning_rows: number; // has anomaly_flags indicating duplicate
  /** Rows with search_publish_status = sync_failed (storefront may not show product). */
  sync_failed_rows: number;
  /** Rows stuck in published_pending_sync (sync in flight or interrupted). */
  pending_search_sync_rows: number;
}

export interface StagingFilters {
  supplier_id?: string;
  batch_id?: string;
  category_id?: string;
  /** Single status or array (e.g. ["approved", "merged"] for "accepted"). */
  status?: string | string[];
  confidence_min?: number;
  confidence_max?: number;
  has_anomalies?: boolean;
  missing_attributes?: boolean;
  unmatched_only?: boolean;
  /**
   * Pending rows where pass-2 AI finished and suggested a master product (not yet approved).
   */
  ai_suggestions_ready?: boolean;
  /**
   * Operator triage queues (pending rows only). Mutually exclusive subsets for fast review.
   * - auto_ready: ingestion_disposition = auto_candidate (pipeline) + master linked
   * - needs_review_disposition: ingestion_disposition = needs_review
   * - missing_image: normalized_data.image_missing = true
   * - missing_image_family: pending variant rows (family_group_key set) still missing image after family enrichment
   * - low_confidence_match: same as needs_attention (pending + master + low/unset confidence)
   * - family_conflict: pending rows in families with conflicting masters or AI suggestions
   */
  review_queue?:
    | "auto_approvable"
    | "unmatched"
    | "needs_attention"
    | "auto_ready"
    | "needs_review"
    | "needs_review_disposition"
    | "missing_image"
    | "missing_image_family"
    | "low_confidence_match"
    | "family_conflict";
  /** Limit to a single inferred variant family (family_group_key). */
  family_group_key?: string;
  /** Case-insensitive match on name, SKU, master SKU/name, supplier name, or UUID substring. */
  search?: string;
  /** Row offset for pagination (ignored when combined with `search` — search is client-filtered). */
  offset?: number;
}

/** Pricing math exposed in review queue: supplier price → conversion → case cost → sell price. */
export interface StagingPricingPayload {
  supplier_price_amount?: number;
  supplier_price_basis?: string;
  conversion_formula?: string;
  normalized_case_cost?: number | null;
  pricing_confidence?: number;
  pricing_notes?: string[];
}

export interface StagingRow {
  id: string;
  batch_id: string;
  raw_id: string;
  supplier_id: string;
  normalized_data: Record<string, unknown> & {
    name?: string;
    sku?: string;
    cost?: number;
    image_url?: string;
    /** Pipeline / enrichment (JSON on row). */
    image_missing?: boolean;
    image_source?: string;
    image_confidence?: number;
    image_search_query?: string;
    ingestion_disposition?: string;
    ingestion_review_reasons?: string[];
    attributes?: Record<string, unknown>;
    anomaly_flags?: { code: string; message: string; severity: string }[];
    /** Case-price normalization: supplier price → conversion → case cost (sell price from case cost + markup). */
    pricing?: StagingPricingPayload;
    /** Landed cost → tier A–D → list (import pipeline). */
    import_auto_pricing?: {
      supplier_cost: number;
      shipping_estimate: number;
      payment_fee_estimate: number;
      landed_cost: number;
      tier_a_price: number;
      tier_b_price: number;
      tier_c_price: number;
      tier_d_price: number;
      display_tier_price: number;
      display_tier: string;
      list_price: number;
      list_price_multiplier: number;
      pricing_rule_version: string;
      pricing_manual_override?: {
        list_price?: number;
        tier_a_price?: number;
        tier_b_price?: number;
        tier_c_price?: number;
        tier_d_price?: number;
        updated_at?: string;
      } | null;
    };
    normalized_case_cost?: number | null;
    override_sell_price?: number | null;
  };
  attributes: Record<string, unknown>;
  match_confidence: number | null;
  master_product_id: string | null;
  match_method?: string | null;
  ai_match_status?: string | null;
  /** Why the row was queued for pass-2 AI (e.g. no_rules_match). */
  ai_match_queue_reason?: string | null;
  ai_suggested_master_product_id?: string | null;
  ai_confidence?: number | null;
  status: string;
  created_at: string;
  updated_at?: string;
  supplier_name?: string;
  batch_started_at?: string;
  master_sku?: string;
  master_name?: string;
  /** Populated when ai_suggested_master_product_id is set (same query as master_*). */
  ai_suggested_master_sku?: string;
  ai_suggested_master_name?: string;
  sell_price?: number;
  inferred_base_sku?: string | null;
  inferred_size?: string | null;
  family_group_key?: string | null;
  grouping_confidence?: number | null;
  variant_axis?: string | null;
  variant_value?: string | null;
  /** Rules-only audit blob when part of a multi-row proposed family. */
  family_group_meta?: FamilyGroupMetaV1 | null;
  /** Storefront search sync lifecycle (public.canonical_products). */
  search_publish_status?: string | null;
}

/** Proposed variant family: rows that share the same family_group_key. */
export interface ProposedFamilyGroup {
  family_group_key: string;
  inferred_base_sku: string;
  variant_axis: string | null;
  confidence: number;
  variantCount: number;
  /** Same object on each row in `rows` when inference populated it. */
  family_group_meta: FamilyGroupMetaV1 | null;
  rows: StagingRow[];
}

export async function getBatchesList(limit = 50): Promise<BatchListItem[]> {
  const supabase = getSupabaseCatalogos(true);
  const { data: batches, error } = await supabase
    .from("import_batches")
    .select("id, supplier_id, feed_id, status, started_at, completed_at, stats")
    .order("started_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  const list = (batches ?? []) as BatchListItem[];

  const supplierIds = [...new Set(list.map((b) => b.supplier_id))];
  if (supplierIds.length > 0) {
    const { data: suppliers } = await supabase.from("suppliers").select("id, name").in("id", supplierIds);
    const names = new Map((suppliers ?? []).map((s: { id: string; name: string }) => [s.id, s.name]));
    list.forEach((b) => { b.supplier_name = names.get(b.supplier_id); });
  }
  list.forEach((b) => { b.source_type = b.feed_id ? "feed" : "manual"; });
  return list;
}

/** Batch summaries for ingestion console: row counts by status and published. */
export async function getIngestionBatchSummaries(limit = 30): Promise<IngestionBatchSummary[]> {
  const batches = await getBatchesList(limit);
  if (batches.length === 0) return [];
  const batchIds = batches.map((b) => b.id);
  const supabase = getSupabaseCatalogos(true);

  const { data: stagingRows } = await supabase
    .from("supplier_products_normalized")
    .select("id, batch_id, status, normalized_data, search_publish_status")
    .in("batch_id", batchIds);
  const rows = (stagingRows ?? []) as {
    id: string;
    batch_id: string;
    status: string;
    normalized_data?: { anomaly_flags?: unknown[] };
    search_publish_status?: string | null;
  }[];

  const normalizedIds = rows.map((r) => r.id);
  let publishedSet = new Set<string>();
  if (normalizedIds.length > 0) {
    const { data: events } = await supabase
      .from("publish_events")
      .select("normalized_id")
      .in("normalized_id", normalizedIds);
    publishedSet = new Set((events ?? []).map((e: { normalized_id: string }) => e.normalized_id));
  }

  const byBatch = new Map<
    string,
    {
      pending: number;
      approved: number;
      rejected: number;
      merged: number;
      duplicateWarning: number;
      syncFailed: number;
      pendingSearchSync: number;
    }
  >();
  for (const b of batchIds) {
    byBatch.set(b, {
      pending: 0,
      approved: 0,
      rejected: 0,
      merged: 0,
      duplicateWarning: 0,
      syncFailed: 0,
      pendingSearchSync: 0,
    });
  }
  for (const r of rows) {
    const c = byBatch.get(r.batch_id);
    if (!c) continue;
    if (r.status === "pending") c.pending++;
    else if (r.status === "approved") c.approved++;
    else if (r.status === "rejected") c.rejected++;
    else if (r.status === "merged") c.merged++;
    const flags = r.normalized_data?.anomaly_flags ?? [];
    if (flags.length > 0) c.duplicateWarning++;
    if (r.search_publish_status === "sync_failed") c.syncFailed++;
    if (r.search_publish_status === "published_pending_sync") c.pendingSearchSync++;
  }

  return batches.map((b) => {
    const c = byBatch.get(b.id) ?? {
      pending: 0,
      approved: 0,
      rejected: 0,
      merged: 0,
      duplicateWarning: 0,
      syncFailed: 0,
      pendingSearchSync: 0,
    };
    const total = c.pending + c.approved + c.rejected + c.merged;
    const published = rows.filter((r) => r.batch_id === b.id && publishedSet.has(r.id)).length;
    return {
      ...b,
      total_rows: total,
      accepted_rows: c.approved + c.merged,
      review_required_rows: c.pending,
      rejected_rows: c.rejected,
      published_rows: published,
      duplicate_warning_rows: c.duplicateWarning,
      sync_failed_rows: c.syncFailed,
      pending_search_sync_rows: c.pendingSearchSync,
    };
  });
}

export async function getBatchById(id: string) {
  const supabase = getSupabaseCatalogos(true);
  const { data: batch, error } = await supabase.from("import_batches").select("*").eq("id", id).single();
  if (error || !batch) return null;
  const b = batch as Record<string, unknown>;
  if (b.supplier_id) {
    const { data: sup } = await supabase.from("suppliers").select("id, name").eq("id", b.supplier_id).single();
    b.supplier = sup;
  }
  return b;
}

/** Accurate status/sync counts for an import batch (full table; no row limit). */
export interface BatchStagingSummaryCounts {
  total: number;
  pending: number;
  approved_or_merged: number;
  rejected: number;
  sync_failed: number;
  pending_search_sync: number;
  /** Rows with non-null match_confidence &lt; 0.85 */
  low_confidence: number;
  /** Queued for deferred AI matching (pass 1 finished, pass 2 not yet). */
  ai_match_pending: number;
  /** Pending staging rows with an AI suggestion ready to approve. */
  ai_suggestions_ready: number;
}

export async function getBatchStagingSummaryCounts(batchId: string): Promise<BatchStagingSummaryCounts> {
  const supabase = getSupabaseCatalogos(true);
  const base = () =>
    supabase.from("supplier_products_normalized").select("*", { count: "exact", head: true }).eq("batch_id", batchId);

  const [
    totalR,
    pendingR,
    acceptedR,
    rejectedR,
    syncFailedR,
    pendingSyncR,
    lowConfR,
    aiPendingR,
    aiReadyR,
  ] = await Promise.all([
    base(),
    base().eq("status", "pending"),
    base().in("status", ["approved", "merged"]),
    base().eq("status", "rejected"),
    base().eq("search_publish_status", "sync_failed"),
    base().eq("search_publish_status", "published_pending_sync"),
    base().not("match_confidence", "is", null).lt("match_confidence", 0.85),
    base().eq("ai_match_status", "pending"),
    base()
      .eq("status", "pending")
      .eq("ai_match_status", "completed")
      .not("ai_suggested_master_product_id", "is", null),
  ]);

  return {
    total: totalR.count ?? 0,
    pending: pendingR.count ?? 0,
    approved_or_merged: acceptedR.count ?? 0,
    rejected: rejectedR.count ?? 0,
    sync_failed: syncFailedR.count ?? 0,
    pending_search_sync: pendingSyncR.count ?? 0,
    low_confidence: lowConfR.count ?? 0,
    ai_match_pending: aiPendingR.count ?? 0,
    ai_suggestions_ready: aiReadyR.count ?? 0,
  };
}

/** Row-level operator queues (counts only; family conflicts computed in family panel). */
export interface BatchOperatorQueueCounts {
  auto_approvable: number;
  unmatched: number;
  needs_attention: number;
}

export async function getBatchOperatorQueueCounts(batchId: string): Promise<BatchOperatorQueueCounts> {
  const supabase = getSupabaseCatalogos(true);
  const base = () =>
    supabase.from("supplier_products_normalized").select("*", { count: "exact", head: true }).eq("batch_id", batchId);

  const [autoR, unR, attR] = await Promise.all([
    base().eq("status", "pending").not("master_product_id", "is", null).gte("match_confidence", 0.85),
    base().eq("status", "pending").is("master_product_id", null),
    base()
      .eq("status", "pending")
      .not("master_product_id", "is", null)
      .or("match_confidence.is.null,match_confidence.lt.0.85"),
  ]);

  return {
    auto_approvable: autoR.count ?? 0,
    unmatched: unR.count ?? 0,
    needs_attention: attR.count ?? 0,
  };
}

/** `family_group_key` values where pending rows disagree on master or AI suggestion (operator should reconcile). */
export async function getFamilyConflictGroupKeysForBatch(batchId: string): Promise<string[]> {
  const groups = await getProposedFamiliesForBatch(batchId);
  const { enrichFamilyGroupWithOperatorMeta } = await import("./family-review");
  const { hasFamilyConflict } = await import("./family-review-types");
  return groups
    .map((g) => enrichFamilyGroupWithOperatorMeta(g))
    .filter((g) => hasFamilyConflict(g.operator))
    .map((g) => g.family_group_key);
}

/** Ingestion-console workflow metrics (disposition, images, publish backlog). */
export interface BatchIngestionWorkflowSummary {
  total: number;
  auto_candidate: number;
  needs_review_disposition: number;
  missing_image: number;
  /** Pending rows in grouped families (excludes singletons) with image_missing. */
  missing_image_family: number;
  low_confidence_match: number;
  unmatched: number;
  family_conflict_rows: number;
  /** Approved/merged rows not yet storefront-synced (includes sync_failed / pending sync). */
  ready_to_publish: number;
}

export async function getBatchIngestionWorkflowSummary(batchId: string): Promise<BatchIngestionWorkflowSummary> {
  const supabase = getSupabaseCatalogos(true);
  const base = () =>
    supabase.from("supplier_products_normalized").select("*", { count: "exact", head: true }).eq("batch_id", batchId);

  const conflictKeys = await getFamilyConflictGroupKeysForBatch(batchId);
  const conflictKeysCap = conflictKeys.slice(0, 400);

  const familyConflictPromise =
    conflictKeysCap.length === 0
      ? Promise.resolve({ count: 0 })
      : base().eq("status", "pending").in("family_group_key", conflictKeysCap);

  const [
    totalR,
    autoCandR,
    needsDispR,
    missImgR,
    missImgFamR,
    lowConfR,
    unR,
    acceptedR,
    syncedR,
    familyConflictR,
  ] = await Promise.all([
    base(),
    base()
      .eq("status", "pending")
      .filter("normalized_data->>ingestion_disposition", "eq", "auto_candidate")
      .not("master_product_id", "is", null),
    base().eq("status", "pending").filter("normalized_data->>ingestion_disposition", "eq", "needs_review"),
    base().eq("status", "pending").filter("normalized_data->>image_missing", "eq", "true"),
    base()
      .eq("status", "pending")
      .not("family_group_key", "is", null)
      .filter("normalized_data->>image_missing", "eq", "true"),
    base()
      .eq("status", "pending")
      .not("master_product_id", "is", null)
      .or("match_confidence.is.null,match_confidence.lt.0.85"),
    base().eq("status", "pending").is("master_product_id", null),
    base().in("status", ["approved", "merged"]),
    base().in("status", ["approved", "merged"]).eq("search_publish_status", "published_synced"),
    familyConflictPromise,
  ]);

  const accepted = acceptedR.count ?? 0;
  const synced = syncedR.count ?? 0;

  return {
    total: totalR.count ?? 0,
    auto_candidate: autoCandR.count ?? 0,
    needs_review_disposition: needsDispR.count ?? 0,
    missing_image: missImgR.count ?? 0,
    missing_image_family: missImgFamR.count ?? 0,
    low_confidence_match: lowConfR.count ?? 0,
    unmatched: unR.count ?? 0,
    family_conflict_rows: familyConflictR.count ?? 0,
    ready_to_publish: Math.max(0, accepted - synced),
  };
}

export async function getStagingRows(filters: StagingFilters & { limit?: number }): Promise<StagingRow[]> {
  const supabase = getSupabaseCatalogos(true);
  const limit = filters.limit ?? 100;
  const offset = Math.max(0, filters.offset ?? 0);
  const searchQ = filters.search ? normalizeSearchQuery(filters.search) : "";
  const fetchLimit = searchQ ? Math.min(Math.max(limit * 4, 200), 600) : limit;

  let familyConflictKeys: string[] | null = null;
  if (filters.review_queue === "family_conflict") {
    if (!filters.batch_id) {
      throw new Error("batch_id is required when review_queue=family_conflict");
    }
    const keys = await getFamilyConflictGroupKeysForBatch(filters.batch_id);
    familyConflictKeys = keys.slice(0, 400);
    if (familyConflictKeys.length === 0) {
      return [];
    }
  }

  let query = supabase
    .from("supplier_products_normalized")
    .select(
      "id, batch_id, raw_id, supplier_id, normalized_data, attributes, match_confidence, master_product_id, match_method, ai_match_status, ai_match_queue_reason, ai_suggested_master_product_id, ai_confidence, status, created_at, updated_at, inferred_base_sku, inferred_size, family_group_key, grouping_confidence, variant_axis, variant_value, family_group_meta, search_publish_status"
    )
    .order("created_at", { ascending: false });

  if (searchQ) {
    query = query.limit(fetchLimit);
  } else if (offset > 0) {
    query = query.range(offset, offset + fetchLimit - 1);
  } else {
    query = query.limit(fetchLimit);
  }

  if (filters.supplier_id) query = query.eq("supplier_id", filters.supplier_id);
  if (filters.batch_id) query = query.eq("batch_id", filters.batch_id);
  if (filters.status != null) {
    if (Array.isArray(filters.status)) query = query.in("status", filters.status);
    else query = query.eq("status", filters.status);
  }
  if (filters.confidence_min != null) query = query.gte("match_confidence", filters.confidence_min);
  if (filters.confidence_max != null) query = query.lte("match_confidence", filters.confidence_max);
  if (filters.unmatched_only) query = query.is("master_product_id", null);
  if (filters.family_group_key) query = query.eq("family_group_key", filters.family_group_key);

  if (filters.review_queue === "auto_approvable") {
    query = query
      .eq("status", "pending")
      .not("master_product_id", "is", null)
      .gte("match_confidence", 0.85);
  } else if (filters.review_queue === "auto_ready") {
    query = query
      .eq("status", "pending")
      .filter("normalized_data->>ingestion_disposition", "eq", "auto_candidate")
      .not("master_product_id", "is", null);
  } else if (filters.review_queue === "needs_review_disposition" || filters.review_queue === "needs_review") {
    query = query.eq("status", "pending").filter("normalized_data->>ingestion_disposition", "eq", "needs_review");
  } else if (filters.review_queue === "missing_image") {
    query = query.eq("status", "pending").filter("normalized_data->>image_missing", "eq", "true");
  } else if (filters.review_queue === "missing_image_family") {
    query = query
      .eq("status", "pending")
      .not("family_group_key", "is", null)
      .filter("normalized_data->>image_missing", "eq", "true");
  } else if (filters.review_queue === "unmatched") {
    query = query.eq("status", "pending").is("master_product_id", null);
  } else if (filters.review_queue === "needs_attention" || filters.review_queue === "low_confidence_match") {
    query = query
      .eq("status", "pending")
      .not("master_product_id", "is", null)
      .or("match_confidence.is.null,match_confidence.lt.0.85");
  } else if (filters.review_queue === "family_conflict" && familyConflictKeys && familyConflictKeys.length > 0) {
    query = query.eq("status", "pending").in("family_group_key", familyConflictKeys);
  }

  if (filters.ai_suggestions_ready && !filters.review_queue) {
    query = query
      .eq("status", "pending")
      .eq("ai_match_status", "completed")
      .not("ai_suggested_master_product_id", "is", null);
  }

  const { data: rows, error } = await query;
  if (error) throw new Error(error.message);

  let result = (rows ?? []) as StagingRow[];

  if (filters.has_anomalies) {
    result = result.filter((r) => {
      const flags = (r.normalized_data?.anomaly_flags as unknown[]) ?? [];
      return flags.length > 0;
    });
  }
  if (filters.missing_attributes) {
    result = result.filter((r) => {
      const attrs = r.attributes ?? {};
      return Object.keys(attrs).length === 0 || !attrs.material;
    });
  }
  if (filters.category_id) {
    result = result.filter((r) => {
      const nd = r.normalized_data as Record<string, unknown> | undefined;
      const cat = nd?.category_id ?? (r.attributes as Record<string, unknown>)?.category_id;
      return cat === filters.category_id;
    });
  }

  const supplierIds = [...new Set(result.map((r) => r.supplier_id))];
  const batchIds = [...new Set(result.map((r) => r.batch_id))];
  const masterIds = [
    ...new Set(
      result
        .flatMap((r) => [r.master_product_id, r.ai_suggested_master_product_id].filter(Boolean))
        .filter(Boolean)
    ),
  ] as string[];

  const [suppliersRes, batchesRes, mastersRes] = await Promise.all([
    supplierIds.length ? supabase.from("suppliers").select("id, name").in("id", supplierIds) : { data: [] },
    batchIds.length ? supabase.from("import_batches").select("id, started_at").in("id", batchIds) : { data: [] },
    masterIds.length
      ? supabase.schema("catalog_v2").from("catalog_products").select("id, internal_sku, name, metadata").in("id", masterIds)
      : { data: [] },
  ]);

  const supplierNames = new Map((suppliersRes.data ?? []).map((s: { id: string; name: string }) => [s.id, s.name]));
  const batchStarted = new Map((batchesRes.data ?? []).map((b: { id: string; started_at: string }) => [b.id, b.started_at]));
  const masterInfo = new Map(
    (mastersRes.data ?? []).map((p: { id: string; internal_sku: string | null; name: string; metadata: unknown }) => {
      const s = v2RowToMasterShape(p);
      return [p.id, { sku: s.sku, name: s.name }];
    })
  );

  result.forEach((r) => {
    r.supplier_name = supplierNames.get(r.supplier_id);
    r.batch_started_at = batchStarted.get(r.batch_id);
    if (r.master_product_id) {
      const m = masterInfo.get(r.master_product_id);
      if (m) { r.master_sku = m.sku; r.master_name = m.name; }
    }
    if (r.ai_suggested_master_product_id) {
      const m = masterInfo.get(r.ai_suggested_master_product_id);
      if (m) {
        r.ai_suggested_master_sku = m.sku;
        r.ai_suggested_master_name = m.name;
      }
    }
    const cost = (r.normalized_data?.cost as number) ?? 0;
    r.sell_price = cost ? Math.round(cost * 1.35 * 100) / 100 : undefined;
  });

  if (searchQ) {
    result = result.filter((r) => matchesStagingSearchRow(r, searchQ));
    const sliceFrom = offset;
    result = result.slice(sliceFrom, sliceFrom + limit);
  }

  return result;
}

export async function getStagingById(id: string) {
  const supabase = getSupabaseCatalogos(true);
  const { data: row, error } = await supabase.from("supplier_products_normalized").select("*").eq("id", id).single();
  if (error || !row) return null;
  const r = row as Record<string, unknown>;
  if (r.raw_id) {
    const { data: raw } = await supabase.from("supplier_products_raw").select("raw_payload").eq("id", r.raw_id).single();
    r.raw = raw;
  }
  if (r.master_product_id) {
    const { data: master } = await supabase
      .schema("catalog_v2")
      .from("catalog_products")
      .select("id, internal_sku, name, metadata")
      .eq("id", r.master_product_id)
      .single();
    if (master) {
      const s = v2RowToMasterShape(master as { id: string; internal_sku: string | null; name: string; metadata: unknown });
      r.master_product = { id: s.id, sku: s.sku, name: s.name, category_id: s.category_id || null };
    }
  }
  if (r.supplier_id) {
    const { data: sup } = await supabase.from("suppliers").select("id, name").eq("id", r.supplier_id).single();
    r.supplier = sup;
  }
  return r;
}

export async function getPublishReady(limit = 100): Promise<StagingRow[]> {
  return getStagingRows({ status: "approved", limit });
}

export async function getSuppliersForFilter() {
  const supabase = getSupabaseCatalogos(true);
  const { data } = await supabase.from("suppliers").select("id, name").eq("is_active", true).order("name");
  return (data ?? []) as { id: string; name: string }[];
}

export async function getCategoriesForFilter() {
  const supabase = getSupabaseCatalogos(true);
  const { data } = await supabase.from("categories").select("id, slug, name").order("sort_order");
  return (data ?? []) as { id: string; slug: string; name: string }[];
}

/**
 * Return proposed variant families for a batch (rows grouped by family_group_key).
 * Only includes groups with at least 2 variants and non-null family_group_key.
 * Paginates through all staging rows for the batch (not capped at 500).
 */
export async function getProposedFamiliesForBatch(batchId: string): Promise<ProposedFamilyGroup[]> {
  const PAGE = 500;
  const rows: StagingRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const chunk = await getStagingRows({ batch_id: batchId, limit: PAGE, offset });
    rows.push(...chunk);
    if (chunk.length < PAGE) break;
  }

  const byKey = new Map<string, StagingRow[]>();
  for (const r of rows) {
    const key = r.family_group_key;
    if (!key) continue;
    const list = byKey.get(key) ?? [];
    list.push(r);
    byKey.set(key, list);
  }
  const groups: ProposedFamilyGroup[] = [];
  for (const [family_group_key, list] of byKey) {
    if (list.length < 2) continue;
    const first = list[0];
    const conf = first.grouping_confidence ?? 0;
    groups.push({
      family_group_key,
      inferred_base_sku: first.inferred_base_sku ?? "",
      variant_axis: first.variant_axis ?? null,
      confidence: conf,
      variantCount: list.length,
      family_group_meta: (first.family_group_meta as FamilyGroupMetaV1 | null) ?? null,
      rows: list,
    });
  }
  return groups.sort((a, b) => b.variantCount - a.variantCount);
}
