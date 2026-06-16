/**
 * Post-publish visibility: verify catalog_v2.catalog_products after publish.
 *
 * public.canonical_products and catalogos.sync_canonical_products() were removed
 * (migration 20261111120400_deprecate_canonical_products_sync.sql). Storefront reads
 * catalog_v2 directly — no legacy projection RPC.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseCatalogos, getSupabase } from "@/lib/db/client";
import type { SearchPublishStatus } from "./types";

const QUEUE_MAX_ATTEMPTS = 10;

const DEPRECATED_SYNC_SKIP =
  "legacy canonical_products sync removed (20261111120400); storefront uses catalog_v2";

/** @deprecated No-op — dropped RPC must not be called. */
export async function invokeSyncCanonicalProducts(
  _catalogos: SupabaseClient
): Promise<{ ok: true; skipped: true; reason: string }> {
  return { ok: true, skipped: true, reason: DEPRECATED_SYNC_SKIP };
}

/** @deprecated No-op — retained for callers during drain; does not hit the database. */
export async function syncCanonicalProductsWithRetry(
  _catalogos: SupabaseClient,
  _options?: { attempts?: number; delaysMs?: readonly number[] }
): Promise<{ ok: true; skipped: true; reason: string }> {
  return { ok: true, skipped: true, reason: DEPRECATED_SYNC_SKIP };
}

/** True if catalog_v2 parent exists and is active (only product SoT). */
export async function isCatalogV2ProductActive(productId: string): Promise<boolean> {
  const admin = getSupabase(true);
  const { data, error } = await admin
    .schema("catalog_v2")
    .from("catalog_products")
    .select("id")
    .eq("id", productId)
    .eq("status", "active")
    .maybeSingle();
  if (error) return false;
  return !!(data as { id?: string } | null)?.id;
}

export async function enqueueCanonicalSyncRetry(
  catalogos: SupabaseClient,
  input: { normalizedId: string; productId: string; lastError: string }
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await catalogos.from("canonical_sync_retry_queue").upsert(
    {
      normalized_id: input.normalizedId,
      product_id: input.productId,
      attempts: 0,
      last_error: input.lastError.slice(0, 8000),
      next_run_at: now,
      updated_at: now,
    },
    { onConflict: "normalized_id" }
  );
  if (error) {
    const { logAdminActionFailure } = await import("@/lib/observability");
    logAdminActionFailure("Failed to enqueue canonical_sync_retry_queue row", {
      normalized_id: input.normalizedId,
      product_id: input.productId,
      underlying: error.message,
    });
  }
}

/**
 * After product/offer/publish_event writes: verify catalog_v2.catalog_products is active.
 */
export async function finalizePublishSearchSync(input: {
  catalogos: SupabaseClient;
  normalizedIds: string[];
  productIds: string[];
}): Promise<
  | { ok: true; searchPublishStatus: SearchPublishStatus }
  | { ok: false; message: string; searchPublishStatus: SearchPublishStatus }
> {
  const { catalogos, normalizedIds, productIds } = input;
  if (normalizedIds.length !== productIds.length) {
    return {
      ok: false,
      message: "Internal error: normalizedIds/productIds length mismatch",
      searchPublishStatus: "sync_failed",
    };
  }

  const { data: normMeta } = await catalogos
    .from("supplier_products_normalized")
    .select("batch_id")
    .in("id", normalizedIds);
  const batchIds = [
    ...new Set((normMeta ?? []).map((r: { batch_id: string }) => r.batch_id).filter(Boolean)),
  ] as string[];

  const now = new Date().toISOString();

  for (const nid of normalizedIds) {
    await catalogos
      .from("supplier_products_normalized")
      .update({ search_publish_status: "published_pending_sync", updated_at: now })
      .eq("id", nid);
  }

  const missing: string[] = [];
  for (const pid of productIds) {
    const visible = await isCatalogV2ProductActive(pid);
    if (!visible) missing.push(pid);
  }

  if (missing.length > 0) {
    const msg = `Product(s) not found or inactive in catalog_v2.catalog_products after publish: ${missing.join(", ")}`;
    const { logPublishFailure, logAdminActionFailure } = await import("@/lib/observability");
    logPublishFailure(msg, { missing, normalizedIds, productIds, batchIds });
    logAdminActionFailure("Catalog product row missing or inactive after publish.", {
      missing,
      normalizedIds,
      productIds,
      batchIds,
    });

    for (let i = 0; i < normalizedIds.length; i++) {
      const nid = normalizedIds[i];
      const pid = productIds[i];
      await catalogos
        .from("supplier_products_normalized")
        .update({ search_publish_status: "sync_failed", updated_at: new Date().toISOString() })
        .eq("id", nid);
      await enqueueCanonicalSyncRetry(catalogos, {
        normalizedId: nid,
        productId: pid,
        lastError: msg,
      });
    }
    return { ok: false, message: msg, searchPublishStatus: "sync_failed" };
  }

  const doneAt = new Date().toISOString();
  for (const nid of normalizedIds) {
    await catalogos
      .from("supplier_products_normalized")
      .update({ search_publish_status: "published_synced", updated_at: doneAt })
      .eq("id", nid);
  }

  return { ok: true, searchPublishStatus: "published_synced" };
}

export interface ProcessCanonicalSyncQueueResult {
  examined: number;
  resolved: number;
  requeued: number;
  exhausted: number;
}

/**
 * Process due retry rows: success when catalog_v2 row is active (no legacy RPC).
 */
export async function processCanonicalSyncRetryQueue(
  limit = 30
): Promise<ProcessCanonicalSyncQueueResult> {
  const catalogos = getSupabaseCatalogos(true);
  const nowIso = new Date().toISOString();

  const { data: rows, error: fetchErr } = await catalogos
    .from("canonical_sync_retry_queue")
    .select("id, normalized_id, product_id, attempts")
    .lte("next_run_at", nowIso)
    .order("next_run_at", { ascending: true })
    .limit(limit);

  if (fetchErr || !rows?.length) {
    return { examined: 0, resolved: 0, requeued: 0, exhausted: 0 };
  }

  let resolved = 0;
  let requeued = 0;
  let exhausted = 0;

  for (const row of rows as {
    id: string;
    normalized_id: string;
    product_id: string;
    attempts: number;
  }[]) {
    const visible = await isCatalogV2ProductActive(row.product_id);

    if (visible) {
      await catalogos
        .from("supplier_products_normalized")
        .update({
          search_publish_status: "published_synced",
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.normalized_id);
      await catalogos.from("canonical_sync_retry_queue").delete().eq("id", row.id);
      resolved++;
      continue;
    }

    const nextAttempts = (row.attempts ?? 0) + 1;
    const errMsg = "Product still not active in catalog_v2.catalog_products";

    if (nextAttempts >= QUEUE_MAX_ATTEMPTS) {
      await catalogos
        .from("supplier_products_normalized")
        .update({
          search_publish_status: "sync_failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.normalized_id);
      await catalogos.from("canonical_sync_retry_queue").delete().eq("id", row.id);
      exhausted++;
      const { logAdminActionFailure } = await import("@/lib/observability");
      logAdminActionFailure("Catalog v2 visibility retry queue exhausted for normalized row.", {
        entity_type: "normalized_product",
        entity_id: row.normalized_id,
        product_id: row.product_id,
        attempts: nextAttempts,
        underlying: errMsg,
      });
      continue;
    }

    const backoffMs = Math.min(120_000, 3000 * 2 ** (nextAttempts - 1));
    await catalogos
      .from("canonical_sync_retry_queue")
      .update({
        attempts: nextAttempts,
        last_error: errMsg.slice(0, 8000),
        next_run_at: new Date(Date.now() + backoffMs).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    requeued++;
  }

  return { examined: rows.length, resolved, requeued, exhausted };
}
