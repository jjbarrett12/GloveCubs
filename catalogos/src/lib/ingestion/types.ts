/**
 * CatalogOS Phase 1 — Ingestion pipeline type definitions.
 * All pipeline stages use these types; DB types (UUID) align with catalogos schema.
 */

/** Single row as parsed from CSV or JSON feed (before normalization). */
export type ParsedRow = Record<string, unknown>;

/** Output of feed fetch: body and detected/content-type for parser dispatch. */
export interface FetchedFeed {
  body: string;
  contentType: string;
  ok: boolean;
  status: number;
}

/** Result of parsing: array of row objects + optional parser metadata. */
export interface ParserResult {
  rows: ParsedRow[];
  format: "csv" | "json" | "jsonl";
  rowCount: number;
  /** Number of malformed lines skipped during parsing (JSONL only). */
  skippedLineCount?: number;
}

/** Extracted attributes for disposable gloves (rules-based). */
export interface GloveAttributes {
  material?: "nitrile" | "vinyl" | "latex" | "neoprene" | "poly";
  color?: "blue" | "black" | "white" | "clear" | "green" | "orange";
  size?: "XS" | "S" | "M" | "L" | "XL" | "XXL";
  thickness_mil?: number;
  powder_free?: boolean;
  latex_free?: boolean;
  case_qty?: number;
  product_type?: "disposable_gloves";
}

/** Confidence that product_type is disposable_gloves (0–1). */
export type ProductTypeConfidence = number;

/** Normalized record: common fields we expose to matching and staging. */
export interface NormalizedData {
  name?: string;
  sku?: string;
  brand?: string;
  description?: string;
  upc?: string;
  image_url?: string;
  cost?: number;
  uom?: string;
  pack_size?: string;
  category_guess?: string;
  /** Extracted + inferred attributes (glove-specific in Phase 1). */
  attributes?: GloveAttributes;
}

/** Result of matching a normalized row to the master catalog. */
export interface MatchResult {
  masterProductId: string | null;
  confidence: number;
  reason: "upc_exact" | "attribute_match" | "fuzzy_title" | "no_match" | "ai_suggested";
}

/** Pricing result for a row (cost -> sell price). */
export interface PricingResult {
  sellPrice: number;
  cost: number;
  marginPercent: number;
  ruleApplied: string;
}

/** Anomaly flag for admin review. */
export type AnomalyCode =
  | "missing_image"
  | "missing_category"
  | "missing_required_attributes"
  | "zero_or_negative_cost"
  | "suspiciously_high_markup"
  | "duplicate_supplier_sku_in_batch"
  | "conflicting_case_quantities"
  | "AI_SUGGESTED_NEEDS_REVIEW";

export interface AnomalyFlag {
  code: AnomalyCode;
  message: string;
  severity: "warning" | "error";
}

/** Raw row as stored (id from DB after insert). */
export interface RawRowRecord {
  id: string;
  batch_id: string;
  supplier_id: string;
  external_id: string;
  raw_payload: Record<string, unknown>;
}

/** Normalized row ready for DB insert (with match + anomalies). */
export interface NormalizedRowForDb {
  batch_id: string;
  raw_id: string;
  supplier_id: string;
  normalized_data: NormalizedData & { anomaly_flags?: AnomalyFlag[] };
  attributes: GloveAttributes;
  match_confidence: number | null;
  master_product_id: string | null;
  status: "pending";
}

/** Pipeline run context (batch + supplier + optional feed). */
export interface PipelineContext {
  batchId: string;
  supplierId: string;
  feedId: string | null;
  categoryId: string;
}

/** Per-row pipeline result (for logging and response). */
export interface RowPipelineResult {
  rawId: string;
  normalizedId: string;
  externalId: string;
  matchConfidence: number | null;
  anomalyCount: number;
  offerCreated: boolean;
}

/** Full pipeline result. */
export interface PipelineResult {
  batchId: string;
  supplierId: string;
  rawCount: number;
  normalizedCount: number;
  matchedCount: number;
  anomalyRowCount: number;
  rowResults: RowPipelineResult[];
  errors: string[];
  /** Structured batch summary for validation and testing. */
  summary?: BatchResultSummary;
  /** Chunk loop stopped early (e.g. cancel); batch may be marked cancelled. */
  aborted?: boolean;
}

/**
 * Batch import result summary for validation and testing.
 * Use for 10/100/500-row tests and operator visibility.
 */
export interface BatchResultSummary {
  totalRowsProcessed: number;
  rowsSucceeded: number;
  rowsFailed: number;
  duplicatesSkipped: number;
  canonicalProductsCreated: number;
  supplierOffersCreated: number;
  warnings: string[];
  /** import_batches.stats.ingestion_phase after run */
  ingestion_phase?: string;
  processing_time_ms?: number;
  chunks_processed?: number;
  rows_retried?: number;
}
