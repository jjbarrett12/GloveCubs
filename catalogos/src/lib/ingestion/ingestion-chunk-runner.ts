/**
 * Chunked bulk insert for normalized staging rows + per-row retry fallback.
 * One multi-row INSERT per chunk ≈ single DB transaction (Postgres statement boundary).
 */

import type { ParsedRow, RowPipelineResult, NormalizedData, AnomalyFlag, MatchResult } from "./types";
import { getSupabaseCatalogos } from "@/lib/db/client";
import { computeSellPrice } from "./pricing-service";
import { loadImportPricingConfig } from "./import-pricing-config";
import { computeImportAutoPricing, listPriceMarkupOnLandedPercent } from "./import-pricing";
import { flagAnomalies, countSkuInBatch, collectCaseQtysFromParsed } from "./anomaly-service";
import { createSuggestedOffer } from "./offer-service";
import { LOW_CONFIDENCE_THRESHOLD, loadMasterProducts, matchToMaster, type MasterProductRow } from "./match-service";
import { runNormalization } from "@/lib/normalization/normalization-engine";
import { buildStagingPayload } from "@/lib/normalization/staging-payload";
import type { ReviewFlag } from "@/lib/normalization/types";
import type { SynonymMap } from "@/lib/catalogos/synonym-provider";
import {
  INGESTION_CHUNK_SIZE_DEFAULT,
  INGESTION_ROW_INSERT_RETRIES,
} from "./ingestion-config";
import { patchImportBatchStats } from "./batch-service";
import { extractSupplierImportHints } from "./import-hints";

export interface ChunkRunnerInput {
  batchId: string;
  supplierId: string;
  categoryId: string;
  rawIds: { externalId: string; rawId: string }[];
  parsedRows: ParsedRow[];
  synonymMap: SynonymMap;
  chunkSize?: number;
  /** Existing errors (e.g. row limit warning); more may be appended. */
  errors: string[];
  /** Optional progress callback between chunks (for stats / heartbeats). */
  onChunkComplete?: (args: {
    chunkIndex: number;
    rowsProcessedSoFar: number;
    chunksTotal: number;
  }) => Promise<void>;
  /** When true, stop after current chunk (cooperative cancel). */
  shouldAbort?: () => Promise<boolean>;
}

export interface ChunkRunnerResult {
  rowResults: RowPipelineResult[];
  matchedCount: number;
  anomalyRowCount: number;
  errors: string[];
  processingTimeMs: number;
  chunksProcessed: number;
  rowsRetried: number;
  /** True when shouldAbort stopped the chunk loop early. */
  aborted?: boolean;
}

function anomalyFlagsToReviewFlags(flags: AnomalyFlag[]): ReviewFlag[] {
  return flags.map((f) => ({
    code: f.code as ReviewFlag["code"],
    message: f.message,
    severity: "warning" as const,
  }));
}

function normalizedDataFromResult(result: {
  content: {
    canonical_title: string;
    supplier_sku: string;
    supplier_cost: number;
    brand?: string;
    long_description?: string;
    short_description?: string;
    upc?: string;
    images?: string[];
  };
  filter_attributes: Record<string, unknown>;
}): NormalizedData {
  const c = result.content;
  return {
    name: c.canonical_title,
    sku: c.supplier_sku,
    brand: c.brand,
    description: c.long_description ?? c.short_description,
    upc: c.upc,
    image_url: Array.isArray(c.images) && c.images.length > 0 ? c.images[0] : undefined,
    cost: c.supplier_cost,
    attributes: result.filter_attributes as NormalizedData["attributes"],
  };
}

type PreparedRow = {
  externalId: string;
  rawId: string;
  rowIndex: number;
  insertRow: Record<string, unknown>;
  rulesMatch: MatchResult;
  rulesAccepted: boolean;
  anomalyFlags: AnomalyFlag[];
  normalized: NormalizedData;
  cost: number;
};

async function insertPreparedChunk(
  prepared: PreparedRow[],
  errors: string[],
  rowsRetried: { n: number }
): Promise<Map<string, string>> {
  const supabase = getSupabaseCatalogos(true);
  const idByRawId = new Map<string, string>();
  if (prepared.length === 0) return idByRawId;

  const payloads = prepared.map((p) => p.insertRow);
  const { data: bulkData, error: bulkErr } = await supabase
    .from("supplier_products_normalized")
    .insert(payloads)
    .select("id, raw_id");

  if (!bulkErr && bulkData && bulkData.length === prepared.length) {
    for (const row of bulkData) {
      idByRawId.set(row.raw_id as string, row.id as string);
    }
    return idByRawId;
  }

  if (bulkErr) {
    errors.push(
      `Chunk bulk insert failed (${prepared.length} rows): ${bulkErr.message}; retrying per-row`
    );
  }

  for (let i = 0; i < prepared.length; i++) {
    const p = prepared[i];
    let insertedId: string | null = null;
    let lastMsg = bulkErr?.message ?? "bulk insert mismatch";

    for (let attempt = 0; attempt <= INGESTION_ROW_INSERT_RETRIES && !insertedId; attempt++) {
      if (attempt > 0) rowsRetried.n += 1;
      const { data: one, error: oneErr } = await supabase
        .from("supplier_products_normalized")
        .insert(p.insertRow)
        .select("id")
        .single();
      if (!oneErr && one?.id) {
        insertedId = one.id as string;
        break;
      }
      lastMsg = oneErr?.message ?? lastMsg;
    }

    if (insertedId) idByRawId.set(p.rawId, insertedId);
    else errors.push(`Normalized ${p.externalId}: ${lastMsg}`);
  }

  return idByRawId;
}

export async function runIngestionChunks(input: ChunkRunnerInput): Promise<ChunkRunnerResult> {
  const {
    batchId,
    supplierId,
    categoryId,
    rawIds,
    parsedRows,
    synonymMap,
    errors,
    onChunkComplete,
    shouldAbort,
  } = input;
  const chunkSize = input.chunkSize ?? INGESTION_CHUNK_SIZE_DEFAULT;

  const t0 = Date.now();
  const masterCandidates: MasterProductRow[] = await loadMasterProducts(categoryId);
  const allSkus = parsedRows.map((r) => String(r.sku ?? r.item ?? r.id ?? "").trim());
  const caseQtysInBatch = collectCaseQtysFromParsed(parsedRows);

  const byIndex = new Map<number, RowPipelineResult>();
  let matchedCount = 0;
  let anomalyRowCount = 0;
  let chunksProcessed = 0;
  const rowsRetried = { n: 0 };
  let aborted = false;

  const n = rawIds.length;
  const chunksTotal = Math.ceil(n / chunkSize) || 0;
  const importPricingConfig = loadImportPricingConfig();

  for (let start = 0; start < n; start += chunkSize) {
    if (await shouldAbort?.()) {
      aborted = true;
      break;
    }
    const prepared: PreparedRow[] = [];

    for (let i = start; i < Math.min(start + chunkSize, n); i++) {
      const { externalId, rawId } = rawIds[i];
      const row = parsedRows[i] ?? {};

      let result: ReturnType<typeof runNormalization>;
      try {
        result = runNormalization(row, {
          categoryHint: "disposable_gloves",
          synonymMap,
        });
      } catch (normErr) {
        const errMsg = normErr instanceof Error ? normErr.message : "Normalization failed";
        errors.push(`Row ${i} (${externalId}): Normalization error - ${errMsg}`);
        byIndex.set(i, {
          rawId,
          normalizedId: "",
          externalId,
          matchConfidence: 0,
          anomalyCount: 0,
          offerCreated: false,
        });
        continue;
      }

      const normalized = normalizedDataFromResult(result);
      const rulesMatch = await matchToMaster({
        normalized,
        categoryId,
        supplierSku: normalized.sku,
        masterCandidates,
      });
      const rulesAccepted = rulesMatch.matched;
      const masterProductIdForRow = rulesAccepted ? rulesMatch.masterProductId : null;

      const cost = normalized.cost ?? 0;
      const importAuto = computeImportAutoPricing({
        supplierCost: Number(result.content.supplier_cost),
        categorySlug: result.category_slug,
        filterAttributes: result.filter_attributes as Record<string, unknown>,
        config: importPricingConfig,
      });
      let marginPercentForAnomaly: number;
      if (importAuto) {
        marginPercentForAnomaly = listPriceMarkupOnLandedPercent(importAuto);
      } else {
        const pricing = await computeSellPrice({
          cost,
          categoryId,
          supplierId,
          productId: masterProductIdForRow ?? undefined,
        });
        marginPercentForAnomaly = pricing.marginPercent;
      }
      const skuCount = countSkuInBatch(normalized.sku ?? externalId, allSkus);

      let anomalyFlags = flagAnomalies({
        rawRow: row,
        normalized,
        matchConfidence: rulesMatch.confidence,
        cost,
        marginPercent: marginPercentForAnomaly,
        supplierSkuInBatchCount: skuCount,
        caseQtyValuesInBatch: caseQtysInBatch,
      });
      if (!rulesMatch.matched && rulesMatch.confidence > 0) {
        anomalyFlags.push({
          code: "match_uncertain_needs_review",
          message: `No master link: match confidence ${rulesMatch.confidence.toFixed(2)} is below threshold or ambiguous.`,
          severity: "warning",
        });
      }
      if (anomalyFlags.length > 0) anomalyRowCount++;

      const payload = buildStagingPayload({
        result,
        batchId,
        rawId,
        supplierId,
        matchConfidence: rulesMatch.confidence,
        masterProductId: masterProductIdForRow,
        extraAnomalyFlags: anomalyFlagsToReviewFlags(anomalyFlags),
        importAutoPricing: importAuto ?? null,
      });
      const nd = payload.normalized_data;
      const hints = extractSupplierImportHints(row);
      const matchMethod = rulesAccepted ? "rules" : "none";
      const aiMatchStatus = rulesAccepted ? "not_needed" : "pending";
      const aiMatchQueueReason = rulesAccepted
        ? null
        : rulesMatch.confidence > 0
          ? "rules_below_threshold"
          : "no_rules_match";
      const normalizedDataWithMeta = {
        ...nd,
        ...hints,
        name: nd.canonical_title,
        sku: nd.supplier_sku,
        cost: nd.supplier_cost,
        attributes: nd.filter_attributes,
        anomaly_flags: nd.anomaly_flags,
        match_explanation: rulesMatch.reason,
        ai_matching_used: false,
      };

      prepared.push({
        externalId,
        rawId,
        rowIndex: i,
        insertRow: {
          batch_id: payload.batch_id,
          raw_id: payload.raw_id,
          supplier_id: payload.supplier_id,
          normalized_data: normalizedDataWithMeta,
          attributes: payload.attributes,
          match_confidence: payload.match_confidence,
          master_product_id: payload.master_product_id,
          status: payload.status,
          match_method: matchMethod,
          ai_match_status: aiMatchStatus,
          ai_match_queue_reason: aiMatchQueueReason,
          ai_suggested_master_product_id: null,
          ai_confidence: null,
          match_explanation: rulesMatch.reason,
          ai_matching_used: false,
          ai_match_result: null,
        },
        rulesMatch,
        rulesAccepted,
        anomalyFlags,
        normalized,
        cost,
      });
    }

    const idByRawId = await insertPreparedChunk(prepared, errors, rowsRetried);
    chunksProcessed += 1;

    for (const p of prepared) {
      const normalizedId = idByRawId.get(p.rawId) ?? "";
      if (!normalizedId) {
        byIndex.set(p.rowIndex, {
          rawId: p.rawId,
          normalizedId: "",
          externalId: p.externalId,
          matchConfidence: p.rulesMatch.confidence,
          anomalyCount: p.anomalyFlags.length,
          offerCreated: false,
        });
        continue;
      }

      if (p.rulesAccepted && p.rulesMatch.masterProductId) {
        matchedCount++;
        const caseQty = p.normalized.attributes?.case_qty;
        const unitsPer =
          typeof caseQty === "number" && Number.isFinite(caseQty) && caseQty > 0 ? Math.trunc(caseQty) : null;
        const offerCreated = await createSuggestedOffer({
          supplierId,
          masterProductId: p.rulesMatch.masterProductId,
          supplierSku: p.normalized.sku ?? p.externalId,
          cost: p.cost,
          rawId: p.rawId,
          normalizedId,
          currencyCode: "USD",
          costBasis: "per_case",
          unitsPerCase: unitsPer,
        });
        byIndex.set(p.rowIndex, {
          rawId: p.rawId,
          normalizedId,
          externalId: p.externalId,
          matchConfidence: p.rulesMatch.confidence,
          anomalyCount: p.anomalyFlags.length,
          offerCreated,
        });
      } else {
        byIndex.set(p.rowIndex, {
          rawId: p.rawId,
          normalizedId,
          externalId: p.externalId,
          matchConfidence: p.rulesMatch.confidence,
          anomalyCount: p.anomalyFlags.length,
          offerCreated: false,
        });
      }
    }

    const rowsProcessedSoFar = byIndex.size;
    await patchImportBatchStats(batchId, {
      ingestion_phase: "processing",
      rows_processed: rowsProcessedSoFar,
      chunks_processed: chunksProcessed,
      chunks_total: chunksTotal,
    });
    await onChunkComplete?.({
      chunkIndex: chunksProcessed - 1,
      rowsProcessedSoFar,
      chunksTotal,
    });
  }

  const rowResults: RowPipelineResult[] = rawIds.map((rid, i) => {
    const r = byIndex.get(i);
    if (r) return r;
    return {
      rawId: rid.rawId,
      normalizedId: "",
      externalId: rid.externalId,
      matchConfidence: 0,
      anomalyCount: 0,
      offerCreated: false,
    };
  });

  return {
    rowResults,
    matchedCount,
    anomalyRowCount,
    errors,
    processingTimeMs: Date.now() - t0,
    chunksProcessed,
    rowsRetried: rowsRetried.n,
    aborted,
  };
}
