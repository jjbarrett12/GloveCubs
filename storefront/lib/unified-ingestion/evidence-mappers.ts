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

type DraftLike = {
  source_url?: string;
  product_name?: string | null;
  description?: string | null;
  brand?: string | null;
  sku?: string | null;
  mpn?: string | null;
  gtin?: string | null;
  image_url?: string | null;
  material?: string | null;
  color?: string | null;
  thickness_mil?: number | null;
  case_pack?: string | null;
  units_per_case?: number | null;
  powder_free?: boolean | null;
  latex_free?: boolean | null;
  exam_grade?: boolean | null;
  size?: string | null;
  confidence?: { overall?: number; fields?: Record<string, number> };
  field_provenance?: Record<string, { confidence?: number }>;
};

function draftFromExtracted(extracted: Record<string, unknown>): DraftLike | null {
  const d = extracted.draft;
  if (!d || typeof d !== "object" || Array.isArray(d)) return null;
  if ((d as { schema_version?: number }).schema_version !== 1) return null;
  return d as DraftLike;
}

function confFromDraft(draft: DraftLike, key: string, fallback: number): number {
  return draft.field_provenance?.[key]?.confidence ?? draft.confidence?.fields?.[key] ?? fallback;
}

function evidenceFromDraft(draft: DraftLike): FieldEvidenceInput[] {
  const ref = draft.source_url ?? "";
  const base = draft.confidence?.overall ?? 0.5;
  const rows: (FieldEvidenceInput | null)[] = [
    field("name", draft.product_name, confFromDraft(draft, "product_name", base), "extractor", ref),
    field("description", draft.description, confFromDraft(draft, "description", base * 0.9), "extractor", ref),
    field("brand", draft.brand, confFromDraft(draft, "brand", base), "extractor", ref),
    field("sku", draft.sku, confFromDraft(draft, "sku", base), "extractor", ref),
    field("mpn", draft.mpn, confFromDraft(draft, "mpn", base), "extractor", ref),
    field("gtin", draft.gtin, confFromDraft(draft, "gtin", base), "extractor", ref),
    field("image_url", draft.image_url, confFromDraft(draft, "image_url", base), "page", ref),
    field("canonical_url", draft.source_url, 1, "page", ref),
    field("material", draft.material, confFromDraft(draft, "material", base), "extractor", ref),
    field("color", draft.color, confFromDraft(draft, "color", base), "extractor", ref),
    field("thickness_mil", draft.thickness_mil, confFromDraft(draft, "thickness_mil", base), "extractor", ref),
    field("case_pack", draft.case_pack, confFromDraft(draft, "case_pack", base), "extractor", ref),
    field("units_per_case", draft.units_per_case, confFromDraft(draft, "units_per_case", base), "extractor", ref),
    field("powder_free", draft.powder_free, confFromDraft(draft, "powder_free", base), "extractor", ref),
    field("latex_free", draft.latex_free, confFromDraft(draft, "latex_free", base), "extractor", ref),
    field("exam_grade", draft.exam_grade, confFromDraft(draft, "exam_grade", base), "extractor", ref),
    field("size", draft.size, confFromDraft(draft, "size", base), "extractor", ref),
  ];
  return rows.filter((r): r is FieldEvidenceInput => r != null);
}

function legacyEvidenceFromExtracted(
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

export function evidenceFromQuickExtracted(
  extracted: Record<string, unknown>,
  sourceUrl: string
): FieldEvidenceInput[] {
  const draft = draftFromExtracted(extracted);
  if (draft) return evidenceFromDraft(draft);
  return legacyEvidenceFromExtracted(extracted, sourceUrl);
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
  const draft = draftFromExtracted(extracted);
  if (draft?.product_name) return draft.product_name.slice(0, 300);
  const n = extracted.suggested_name ?? extracted.name ?? extracted.page_title;
  return typeof n === "string" && n.trim() ? n.trim().slice(0, 300) : null;
}

export function pickNormalizedBrand(extracted: Record<string, unknown>): string | null {
  const draft = draftFromExtracted(extracted);
  if (draft?.brand) return draft.brand.slice(0, 120);
  const b = extracted.suggested_brand ?? extracted.brand;
  return typeof b === "string" && b.trim() ? b.trim().slice(0, 120) : null;
}
