/**
 * GET /api/supplier-import/batches/[id]/rows
 * Paginated staging rows for large-batch review (same shape as dashboard staging, without search offset quirks).
 *
 * Query: limit (default 100, max 500), offset (default 0), status (optional: pending|approved|merged|rejected),
 *        confidence_min (optional, e.g. 0.85 for “high confidence” filter)
 *        ai_suggestions_ready=1 — pending rows with deferred AI suggestion (pass 2 completed)
 *        review_queue=auto_approvable|unmatched|needs_attention|auto_ready|needs_review|needs_review_disposition|missing_image|missing_image_family|low_confidence_match|family_conflict
 *        family_group_key=... — restrict to one variant family
 */

import { NextResponse } from "next/server";
import { getSupabaseCatalogos } from "@/lib/db/client";
import { getFamilyConflictGroupKeysForBatch, getStagingRows } from "@/lib/review/data";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: batchId } = await params;
    if (!batchId || !UUID_RE.test(batchId)) {
      return NextResponse.json({ error: "Invalid batch id" }, { status: 400 });
    }

    const url = new URL(req.url);
    const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get("limit") || "100", 10) || 100));
    const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10) || 0);
    const statusParam = url.searchParams.get("status");
    const status =
      statusParam === "pending" ||
      statusParam === "approved" ||
      statusParam === "merged" ||
      statusParam === "rejected"
        ? statusParam
        : undefined;

    const confRaw = url.searchParams.get("confidence_min");
    const confidenceMin =
      confRaw != null && confRaw !== ""
        ? Math.min(1, Math.max(0, parseFloat(confRaw)))
        : undefined;
    const confidenceMinValid = confidenceMin != null && !Number.isNaN(confidenceMin);
    const aiSuggestionsReady = url.searchParams.get("ai_suggestions_ready") === "1";
    const reviewQueueRaw = url.searchParams.get("review_queue");
    const reviewQueue =
      reviewQueueRaw === "auto_approvable" ||
      reviewQueueRaw === "unmatched" ||
      reviewQueueRaw === "needs_attention" ||
      reviewQueueRaw === "auto_ready" ||
      reviewQueueRaw === "needs_review" ||
      reviewQueueRaw === "needs_review_disposition" ||
      reviewQueueRaw === "missing_image" ||
      reviewQueueRaw === "missing_image_family" ||
      reviewQueueRaw === "low_confidence_match" ||
      reviewQueueRaw === "family_conflict"
        ? reviewQueueRaw
        : undefined;
    const familyGroupKeyRaw = url.searchParams.get("family_group_key");
    const familyGroupKey =
      familyGroupKeyRaw && familyGroupKeyRaw.length <= 512 ? familyGroupKeyRaw : undefined;

    const supabase = getSupabaseCatalogos(true);
    const { data: batch, error: bErr } = await supabase
      .from("import_batches")
      .select("id")
      .eq("id", batchId)
      .maybeSingle();
    if (bErr || !batch) {
      return NextResponse.json({ error: "Batch not found" }, { status: 404 });
    }

    let countQuery = supabase
      .from("supplier_products_normalized")
      .select("*", { count: "exact", head: true })
      .eq("batch_id", batchId);

    if (reviewQueue === "auto_approvable") {
      countQuery = countQuery
        .eq("status", "pending")
        .not("master_product_id", "is", null)
        .gte("match_confidence", 0.85);
    } else if (reviewQueue === "auto_ready") {
      countQuery = countQuery
        .eq("status", "pending")
        .filter("normalized_data->>ingestion_disposition", "eq", "auto_candidate")
        .not("master_product_id", "is", null);
    } else if (reviewQueue === "needs_review" || reviewQueue === "needs_review_disposition") {
      countQuery = countQuery
        .eq("status", "pending")
        .filter("normalized_data->>ingestion_disposition", "eq", "needs_review");
    } else if (reviewQueue === "missing_image") {
      countQuery = countQuery.eq("status", "pending").filter("normalized_data->>image_missing", "eq", "true");
    } else if (reviewQueue === "missing_image_family") {
      countQuery = countQuery
        .eq("status", "pending")
        .not("family_group_key", "is", null)
        .filter("normalized_data->>image_missing", "eq", "true");
    } else if (reviewQueue === "unmatched") {
      countQuery = countQuery.eq("status", "pending").is("master_product_id", null);
    } else if (reviewQueue === "needs_attention" || reviewQueue === "low_confidence_match") {
      countQuery = countQuery
        .eq("status", "pending")
        .not("master_product_id", "is", null)
        .or("match_confidence.is.null,match_confidence.lt.0.85");
    } else if (reviewQueue === "family_conflict") {
      const keys = (await getFamilyConflictGroupKeysForBatch(batchId)).slice(0, 400);
      if (keys.length === 0) {
        countQuery = countQuery.eq("id", "00000000-0000-0000-0000-000000000000");
      } else {
        countQuery = countQuery.eq("status", "pending").in("family_group_key", keys);
      }
    } else {
      if (status === "approved") countQuery = countQuery.in("status", ["approved", "merged"]);
      else if (status) countQuery = countQuery.eq("status", status);
      if (aiSuggestionsReady) {
        countQuery = countQuery
          .eq("status", "pending")
          .eq("ai_match_status", "completed")
          .not("ai_suggested_master_product_id", "is", null);
      }
    }

    if (confidenceMinValid) countQuery = countQuery.gte("match_confidence", confidenceMin!);
    if (familyGroupKey) countQuery = countQuery.eq("family_group_key", familyGroupKey);

    const { count: total } = await countQuery;

    const filters: Parameters<typeof getStagingRows>[0] = {
      batch_id: batchId,
      limit,
      offset,
    };
    if (status === "approved") filters.status = ["approved", "merged"];
    else if (status) filters.status = status;
    if (confidenceMinValid) filters.confidence_min = confidenceMin;
    if (familyGroupKey) filters.family_group_key = familyGroupKey;
    if (reviewQueue) filters.review_queue = reviewQueue;
    else if (aiSuggestionsReady) filters.ai_suggestions_ready = true;

    const rows = await getStagingRows(filters);

    return NextResponse.json({
      batch_id: batchId,
      rows,
      total: total ?? rows.length,
      limit,
      offset,
      filters_applied: {
        status: status ?? null,
        confidence_min: confidenceMinValid ? confidenceMin : null,
        ai_suggestions_ready: aiSuggestionsReady && !reviewQueue,
        review_queue: reviewQueue ?? null,
        family_group_key: familyGroupKey ?? null,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load rows" },
      { status: 500 }
    );
  }
}
