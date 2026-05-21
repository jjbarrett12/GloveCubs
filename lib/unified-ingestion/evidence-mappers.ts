import type { FieldEvidenceInput } from "./types";

function field(
  fieldKey: string,
  value: unknown,
  confidence: number,
  sourceType: string,
  sourceRef?: string | null,
  extractionMethod: "deterministic" | "ai_fallback" = "deterministic"
): FieldEvidenceInput | null {
  if (value === null || value === undefined || value === "") return null;
  return {
    fieldKey,
    value,
    confidence,
    sourceType,
    sourceRef: sourceRef ?? null,
    extractionMethod,
  };
}

export function evidenceFromQuickExtracted(
  extracted: Record<string, unknown>,
  sourceUrl: string
): FieldEvidenceInput[] {
  const baseConf =
    typeof extracted.extraction_confidence === "number" ? extracted.extraction_confidence : 0.45;
  const ref = sourceUrl;
  const rows: (FieldEvidenceInput | null)[] = [
    field("name", extracted.suggested_name, baseConf, "json_ld", ref),
    field("description", extracted.suggested_description, baseConf * 0.9, "json_ld", ref),
    field("brand", extracted.suggested_brand, baseConf, "json_ld", ref),
    field("sku", extracted.suggested_sku, baseConf, "json_ld", ref),
    field("mpn", extracted.suggested_mpn, baseConf, "json_ld", ref),
    field("gtin", extracted.suggested_gtin, baseConf, "json_ld", ref),
    field(
      "image_url",
      extracted.source_image_url ?? extracted.suggested_image_from_page,
      baseConf,
      "page",
      ref
    ),
    field("canonical_url", extracted.canonical_url, 1, "page", ref),
    field("page_title", extracted.page_title, 0.6, "og_meta", ref),
  ];
  return rows.filter((r): r is FieldEvidenceInput => r != null);
}

export function evidenceFromDeepNormalized(
  normalized: Record<string, unknown>,
  sourceUrl: string,
  options?: { confidence?: number; aiUsed?: boolean }
): FieldEvidenceInput[] {
  const conf = options?.confidence ?? 0.65;
  const method = options?.aiUsed ? "ai_fallback" : "deterministic";
  const ref = sourceUrl;
  const rows: (FieldEvidenceInput | null)[] = [
    field("name", normalized.name ?? normalized.title, conf, "extractor", ref, method),
    field("description", normalized.description, conf * 0.9, "extractor", ref, method),
    field("brand", normalized.brand, conf, "extractor", ref, method),
    field("sku", normalized.sku ?? normalized.supplier_sku, conf, "extractor", ref, method),
    field("mpn", normalized.mpn, conf, "extractor", ref, method),
    field("gtin", normalized.gtin, conf, "extractor", ref, method),
    field("image_url", normalized.image_url ?? normalized.image, conf, "extractor", ref, method),
    field("size", normalized.size ?? normalized.inferred_size, conf, "extractor", ref, method),
  ];
  return rows.filter((r): r is FieldEvidenceInput => r != null);
}

export function pickNormalizedName(extracted: Record<string, unknown>): string | null {
  const n = extracted.suggested_name ?? extracted.name ?? extracted.page_title;
  return typeof n === "string" && n.trim() ? n.trim().slice(0, 300) : null;
}

export function pickNormalizedBrand(extracted: Record<string, unknown>): string | null {
  const b = extracted.suggested_brand ?? extracted.brand;
  return typeof b === "string" && b.trim() ? b.trim().slice(0, 120) : null;
}
