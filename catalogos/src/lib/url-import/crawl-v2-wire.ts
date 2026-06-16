import type { ParsedRow } from "@/lib/ingestion/types";
import {
  bridgeExtractionV2ToParsedRows,
  buildUrlImportProductPayloadsForExtractionV2,
} from "@/lib/product-extraction/extraction-v2-bridge";
import type { ProductUrlExtractionV2 } from "@/lib/product-extraction/types";

export type UrlImportProductInsertRow = {
  normalized_payload: ParsedRow;
  raw_payload: Record<string, unknown>;
  extraction_method: "deterministic";
  confidence: number;
  ai_used: boolean;
};

export type BuildUrlImportProductInsertsFromExtractionV2Input = {
  extraction: ProductUrlExtractionV2;
  legacyRawPayload?: Record<string, unknown>;
};

/** Shape url_import_products inserts from a scored V2 extraction (no DB writes). */
export function buildUrlImportProductInsertsFromExtractionV2(
  input: BuildUrlImportProductInsertsFromExtractionV2Input
): { inserts: UrlImportProductInsertRow[]; warnings: string[] } {
  const { extraction, legacyRawPayload } = input;
  const bridged = bridgeExtractionV2ToParsedRows({ extraction });
  const payloads = buildUrlImportProductPayloadsForExtractionV2({
    extraction,
    rows: bridged.rows,
    legacyRawPayload: {
      source_url: extraction.sourceUrl,
      ...legacyRawPayload,
    },
  });

  const confidence = Math.min(1, Math.max(0, extraction.confidence.overall));

  const inserts: UrlImportProductInsertRow[] = payloads.map((p) => ({
    normalized_payload: p.normalizedPayload as ParsedRow,
    raw_payload: p.rawPayload,
    extraction_method: "deterministic",
    confidence,
    ai_used: false,
  }));

  const warnings = [
    ...bridged.warnings,
    ...extraction.review.warnings,
    ...extraction.review.blockers.map((b) => `[review-blocker] ${b}`),
  ];

  return { inserts, warnings: [...new Set(warnings)] };
}
