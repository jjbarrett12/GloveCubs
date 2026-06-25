/**
 * Unified catalog_v2 staging writer — shared by CatalogOS and storefront.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { computeProductFingerprint, computeSourceFingerprint } from "./fingerprint";
import { assertIngestionJobTransition } from "./state-machine";
import type { UnifiedIngestionEmit } from "./telemetry-events";
import { noopUnifiedIngestionEmit } from "./telemetry-events";
import type {
  FieldEvidenceInput,
  IngestionJobStatus,
  IngestionLineage,
  WriteUnifiedStagingInput,
  WriteUnifiedStagingResult,
} from "./types";

function v2(client: SupabaseClient) {
  return client.schema("catalog_v2");
}

function clampConfidence(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function identityFromEvidence(variants: WriteUnifiedStagingInput["variants"]): {
  gtin?: string | null;
  mpn?: string | null;
  supplierSku?: string | null;
} {
  const first = variants[0]?.evidence ?? [];
  const pick = (key: string) => {
    const row = first.find((e) => e.fieldKey === key);
    const v = row?.value;
    return typeof v === "string" ? v : v != null ? String(v) : null;
  };
  return {
    gtin: pick("gtin"),
    mpn: pick("mpn"),
    supplierSku: pick("supplier_sku") ?? pick("sku"),
  };
}

async function findActiveJobByFingerprint(
  client: SupabaseClient,
  sourceFingerprint: string
): Promise<{ id: string; status: string } | null> {
  const { data, error } = await v2(client)
    .from("ingestion_jobs")
    .select("id, status")
    .eq("source_fingerprint", sourceFingerprint)
    .neq("status", "failed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`ingestion_jobs lookup: ${error.message}`);
  return data as { id: string; status: string } | null;
}

export async function transitionIngestionJobStatus(
  client: SupabaseClient,
  jobId: string,
  to: IngestionJobStatus,
  emit: UnifiedIngestionEmit,
  patch?: { failed_reason?: string; blocked_reason?: string }
): Promise<void> {
  const { data: row, error: loadErr } = await v2(client)
    .from("ingestion_jobs")
    .select("status")
    .eq("id", jobId)
    .single();
  if (loadErr || !row) throw new Error(`ingestion job not found: ${jobId}`);
  const from = (row as { status: IngestionJobStatus }).status;
  assertIngestionJobTransition(from, to);
  const update: Record<string, unknown> = {
    status: to,
    updated_at: new Date().toISOString(),
  };
  if (to === "failed" && patch?.failed_reason) update.failed_reason = patch.failed_reason;
  if (to === "blocked") {
    update.blocked_at = new Date().toISOString();
    if (patch?.blocked_reason) update.blocked_reason = patch.blocked_reason;
  }
  const { error } = await v2(client).from("ingestion_jobs").update(update).eq("id", jobId);
  if (error) throw new Error(`ingestion job update: ${error.message}`);
  emit({ type: "unified_ingestion_state", jobId, from, to });
}

async function insertBlockedJob(
  client: SupabaseClient,
  input: WriteUnifiedStagingInput,
  sourceFingerprint: string,
  duplicateOf: string,
  reason: string,
  emit: UnifiedIngestionEmit
): Promise<WriteUnifiedStagingResult> {
  const { data, error } = await v2(client)
    .from("ingestion_jobs")
    .insert({
      ingestion_mode: input.mode,
      status: "blocked",
      source_fingerprint: sourceFingerprint,
      source_url: input.sourceUrl,
      supplier_id: input.supplierId ?? null,
      blocked_reason: reason,
      blocked_at: new Date().toISOString(),
      lineage: input.lineage ?? {},
      metadata: { ...input.metadata, duplicate_of: duplicateOf },
      created_by: input.createdBy ?? null,
    })
    .select("id")
    .single();
  if (error) {
    return { ok: false, error: error.message, blockedDuplicateOf: duplicateOf };
  }
  const jobId = (data as { id: string }).id;
  emit({
    type: "unified_ingestion_blocked",
    jobId,
    sourceFingerprint,
    duplicateOf,
    reason,
  });
  return { ok: false, error: reason, blockedDuplicateOf: duplicateOf };
}

function aggregateConfidence(evidence: FieldEvidenceInput[]): number {
  if (evidence.length === 0) return 0;
  const sum = evidence.reduce((a, e) => a + clampConfidence(e.confidence), 0);
  return sum / evidence.length;
}

function resolveTerminalStatus(
  input: WriteUnifiedStagingInput,
  variants: WriteUnifiedStagingInput["variants"]
): IngestionJobStatus {
  if (input.requireHumanReview) return "awaiting_human";
  const avg =
    variants.length === 0
      ? 0
      : variants.reduce((a, v) => a + aggregateConfidence(v.evidence), 0) / variants.length;
  if (avg > 0 && avg < 0.5) return "awaiting_human";
  return "review_ready";
}

export async function writeUnifiedStagingArtifacts(
  input: WriteUnifiedStagingInput,
  client: SupabaseClient,
  emit: UnifiedIngestionEmit = noopUnifiedIngestionEmit
): Promise<WriteUnifiedStagingResult> {
  if (input.variants.length === 0) {
    return { ok: false, error: "At least one staging variant is required." };
  }

  const identityKeys = input.identityKeys ?? identityFromEvidence(input.variants);
  const sourceFingerprint = computeSourceFingerprint({
    mode: input.mode,
    sourceUrl: input.sourceUrl,
    supplierId: input.supplierId,
    identityKeys,
  });

  const existing = await findActiveJobByFingerprint(client, sourceFingerprint);
  if (existing) {
    return insertBlockedJob(
      client,
      input,
      sourceFingerprint,
      existing.id,
      `duplicate_source_fingerprint: active job ${existing.id} (${existing.status})`,
      emit
    );
  }

  const terminalStatus = resolveTerminalStatus(input, input.variants);

  const { data: jobRow, error: jobErr } = await v2(client)
    .from("ingestion_jobs")
    .insert({
      ingestion_mode: input.mode,
      status: "queued",
      source_fingerprint: sourceFingerprint,
      source_url: input.sourceUrl,
      supplier_id: input.supplierId ?? null,
      lineage: (input.lineage ?? {}) as IngestionLineage,
      metadata: input.metadata ?? {},
      created_by: input.createdBy ?? null,
    })
    .select("id")
    .single();

  if (jobErr || !jobRow) {
    if (jobErr?.code === "23505") {
      const again = await findActiveJobByFingerprint(client, sourceFingerprint);
      if (again) {
        return insertBlockedJob(
          client,
          input,
          sourceFingerprint,
          again.id,
          `duplicate_source_fingerprint: race with job ${again.id}`,
          emit
        );
      }
    }
    emit({
      type: "unified_staging_write_failed",
      error: jobErr?.message ?? "job insert failed",
      sourceFingerprint,
    });
    return { ok: false, error: jobErr?.message ?? "Failed to create ingestion job." };
  }

  const jobId = (jobRow as { id: string }).id;
  emit({ type: "unified_ingestion_job_created", jobId, mode: input.mode, sourceFingerprint });

  try {
    await transitionIngestionJobStatus(client, jobId, "fetching", emit);
    await transitionIngestionJobStatus(client, jobId, "extracting", emit);
    await transitionIngestionJobStatus(client, jobId, "normalized", emit);

    const productFingerprint = computeProductFingerprint({
      sourceFingerprint,
      variantKey: input.variants[0]?.variantKey ?? input.variants[0]?.proposedVariantSku,
    });

    const { data: stagingProduct, error: spErr } = await v2(client)
      .from("catalog_staging_products")
      .insert({
        ingestion_job_id: jobId,
        ingestion_mode: input.mode,
        source_url: input.sourceUrl,
        source_fingerprint: sourceFingerprint,
        product_fingerprint: productFingerprint,
        supplier_id: input.supplierId ?? null,
        source_batch_id: input.lineage?.import_batch_id ?? null,
        status: "ready",
        review_status: "needs_review",
        media_status: "pending",
        raw_payload: input.product.rawPayload ?? {},
        normalized_name: input.product.normalizedName ?? null,
        normalized_brand: input.product.normalizedBrand ?? null,
        legacy_clipboard_staging_id: input.lineage?.clipboard_staging_id ?? null,
      })
      .select("id")
      .single();

    if (spErr || !stagingProduct) {
      throw new Error(spErr?.message ?? "staging product insert failed");
    }

    const stagingProductId = (stagingProduct as { id: string }).id;
    const stagingVariantIds: string[] = [];
    let evidenceCount = 0;

    for (const variant of input.variants) {
      const variantFp = computeProductFingerprint({
        sourceFingerprint,
        variantKey: variant.variantKey ?? variant.proposedVariantSku,
      });

      const { data: stagingVariant, error: svErr } = await v2(client)
        .from("catalog_staging_variants")
        .insert({
          staging_product_id: stagingProductId,
          ingestion_job_id: jobId,
          source_url: variant.sourceUrl,
          product_fingerprint: variantFp,
          status: "ready",
          media_status: "pending",
          proposed_variant_sku: variant.proposedVariantSku ?? null,
          primary_image_url: variant.primaryImageUrl ?? null,
          raw_payload: variant.rawPayload ?? {},
          legacy_url_import_product_id: input.lineage?.url_import_product_id ?? null,
        })
        .select("id")
        .single();

      if (svErr || !stagingVariant) {
        throw new Error(svErr?.message ?? "staging variant insert failed");
      }

      const stagingVariantId = (stagingVariant as { id: string }).id;
      stagingVariantIds.push(stagingVariantId);

      if (variant.evidence.length > 0) {
        const rows = variant.evidence.map((e) => ({
          staging_variant_id: stagingVariantId,
          field_key: e.fieldKey,
          extracted_value: e.value === undefined ? null : e.value,
          confidence: clampConfidence(e.confidence),
          source_type: e.sourceType,
          source_ref: e.sourceRef ?? null,
          source_snippet: e.sourceSnippet ?? null,
          extraction_method: e.extractionMethod ?? "deterministic",
        }));
        const { error: evErr } = await v2(client).from("ingestion_field_evidence").insert(rows);
        if (evErr) throw new Error(`evidence insert: ${evErr.message}`);
        evidenceCount += rows.length;
      }
    }

    await transitionIngestionJobStatus(client, jobId, terminalStatus, emit);

    emit({
      type: "unified_staging_written",
      jobId,
      stagingProductId,
      stagingVariantIds,
      evidenceCount,
    });

    return {
      ok: true,
      jobId,
      status: terminalStatus,
      stagingProductId,
      stagingVariantIds,
      sourceFingerprint,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    try {
      await transitionIngestionJobStatus(client, jobId, "failed", emit, { failed_reason: msg });
    } catch {
      await v2(client)
        .from("ingestion_jobs")
        .update({ status: "failed", failed_reason: msg, updated_at: new Date().toISOString() })
        .eq("id", jobId);
    }
    emit({ type: "unified_staging_write_failed", error: msg, sourceFingerprint });
    return { ok: false, error: msg };
  }
}
