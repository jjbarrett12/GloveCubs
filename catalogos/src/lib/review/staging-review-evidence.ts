/**
 * Read-only helpers for review UI: show normalized values next to extraction confidence / method
 * without creating new canonical data (display only).
 */

import type {
  FieldEvidence,
  FieldTrust,
  ProductUrlExtractionV2,
  ProductUrlExtractionV2Summary,
} from "@/lib/product-extraction/types";
import {
  isProductSetupContractSummaryV1,
  resolveProductSetupContractFull,
} from "@/lib/product-extraction/product-setup-contract";

export type StagedReviewSourceHint = {
  rawDisplay: string;
  confidence?: number;
  method?: string;
};

export type StagedReviewFieldRow = {
  /** Stable id for React keys */
  id: string;
  /** Human label */
  label: string;
  /** Current normalized / staged value shown to the operator */
  normalizedDisplay: string;
  /** From normalized_data.confidence_by_key[confidenceKey] when present */
  normalizedConfidence?: number;
  /** supplier_products_raw / OpenClaw extract (when present) */
  sourceHint?: StagedReviewSourceHint;
  /** normalized_data._fieldExtraction entry (site ontology pass), shown separately from raw */
  ontologyHint?: StagedReviewSourceHint;
};

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function formatDisplayValue(v: unknown): string {
  if (v == null) return "—";
  if (Array.isArray(v)) {
    const parts = v.map((x) => str(x)).filter(Boolean);
    return parts.length ? parts.join(", ") : "—";
  }
  const s = str(v);
  return s || "—";
}

/** Unwrap OpenClaw ExtractedField-shaped objects from raw_payload. */
export function unwrapExtractedField(val: unknown): { rawDisplay: string; confidence?: number; method?: string } | null {
  if (val == null) return null;
  if (Array.isArray(val)) {
    const parts = val
      .map((x) => (typeof x === "string" || typeof x === "number" ? String(x).trim() : ""))
      .filter(Boolean);
    if (!parts.length) return null;
    return { rawDisplay: parts.join(", ") };
  }
  if (typeof val === "object" && !Array.isArray(val) && ("raw_value" in val || "normalized_value" in val)) {
    const o = val as {
      raw_value?: unknown;
      normalized_value?: unknown;
      confidence?: number;
      extraction_method?: string;
    };
    const raw = o.raw_value ?? o.normalized_value;
    let rawDisplay = "";
    if (Array.isArray(raw)) rawDisplay = raw.map((x) => str(x)).filter(Boolean).join(", ");
    else rawDisplay = str(raw);
    if (!rawDisplay) return null;
    return {
      rawDisplay,
      confidence: typeof o.confidence === "number" && Number.isFinite(o.confidence) ? o.confidence : undefined,
      method: o.extraction_method ? String(o.extraction_method) : undefined,
    };
  }
  if (typeof val === "string" && val.trim()) {
    return { rawDisplay: val.trim() };
  }
  if (typeof val === "number" && Number.isFinite(val)) {
    return { rawDisplay: String(val) };
  }
  return null;
}

/** Map review row id → raw_payload key used by OpenClaw extract (when different). */
function rawPayloadKeysForField(id: string): string[] {
  switch (id) {
    case "powder":
      return ["powder", "powder_status", "powder_free"];
    case "grade":
      return ["grade", "glove_type"];
    case "sterility":
      return ["sterility", "sterile_status"];
    case "size_code":
      return ["size", "sizes"];
    case "certifications":
      return ["certifications", "compliance_tags", "compliance_certifications"];
    case "uses":
      return ["uses", "use_case_tags"];
    case "protection_tags":
      return ["protection_tags"];
    case "gtin":
      return ["upc", "gtin", "ean", "barcode"];
    case "mpn":
      return ["mpn", "manufacturer_part_number"];
    case "manufacturer":
      return ["manufacturer", "supplier_manufacturer", "vendor"];
    case "variant_sku":
      return ["sku", "supplier_sku", "id"];
    case "thickness_mil":
      return ["thickness_mil", "thickness", "mil"];
    default:
      return [id];
  }
}

function firstSourceHint(raw: Record<string, unknown>, id: string): StagedReviewSourceHint | undefined {
  for (const k of rawPayloadKeysForField(id)) {
    const u = unwrapExtractedField(raw[k]);
    if (u) {
      return { rawDisplay: u.rawDisplay, confidence: u.confidence, method: u.method };
    }
  }
  return undefined;
}

function firstNonEmpty(...vals: unknown[]): string {
  for (const v of vals) {
    const s = formatDisplayValue(v);
    if (s !== "—") return s;
  }
  return "—";
}

/**
 * Same precedence as evidence row `variant_sku` ("Variant SKU (supplier)") —
 * use for StagingTable and StagedProductDetail so list/detail never drift.
 */
export function getVariantSkuDisplay(nd: Record<string, unknown>, attrs: Record<string, unknown>): string {
  return firstNonEmpty(nd.supplier_sku, nd.sku, attrs.supplier_sku, attrs.sku);
}

/** Source title for staging list rows from `normalized_data` only (no raw-table join). */
export function getStagingSourceTitle(nd: Record<string, unknown>): string {
  return firstNonEmpty(nd.canonical_title, nd.name, nd.title, nd.product_name);
}

/** Size: inferred column first, then `attributes.size` (matches review table). */
export function getStagingSizeDisplay(inferredSize: unknown, attrs: Record<string, unknown>): string {
  const fromInfer = formatDisplayValue(inferredSize);
  if (fromInfer !== "—") return fromInfer;
  return formatDisplayValue(attrs.size);
}

const EVIDENCE_LOW_CONFIDENCE_THRESHOLD = 0.6;

/** Counts for review UI summary; low = normalized confidence present and strictly below 0.60. */
export function summarizeEvidenceReview(rows: StagedReviewFieldRow[]): {
  total: number;
  lowConfidenceCount: number;
} {
  const lowConfidenceCount = rows.filter(
    (r) =>
      r.normalizedConfidence != null &&
      Number.isFinite(r.normalizedConfidence) &&
      r.normalizedConfidence < EVIDENCE_LOW_CONFIDENCE_THRESHOLD
  ).length;
  return { total: rows.length, lowConfidenceCount };
}

function numOrDash(v: unknown): string {
  if (v == null) return "—";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "—";
  return String(n);
}

/** Same resolution as `boxes_per_case` / `gloves_per_box` / `total_gloves_per_case` evidence rows. */
function packagingBoxesPerCase(nd: Record<string, unknown>): number | null {
  const p = nd.pricing as Record<string, unknown> | undefined;
  const raw = nd.boxes_per_case ?? p?.boxes_per_case;
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function packagingGlovesPerBox(nd: Record<string, unknown>): number | null {
  const raw = nd.gloves_per_box ?? nd.box_qty;
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function packagingDeclaredTotalGloves(nd: Record<string, unknown>): number | null {
  const raw = nd.total_gloves_per_case;
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  return n;
}

export type PackagingMathReviewState = "incomplete" | "matches" | "mismatch";

/**
 * Read-only packaging math for import review UI. Precedence matches {@link ND_FIELD_SPECS}
 * for the three packaging fields (normalized_data only).
 */
export function getPackagingMathReview(nd: Record<string, unknown>): {
  state: PackagingMathReviewState;
  boxes: number | null;
  glovesPerBox: number | null;
  computedTotal: number | null;
  declaredTotal: number | null;
  caseLabel: string | null;
  palletLabel: string | null;
  innerUnitLabel: string | null;
} {
  const cp = nd.commerce_packaging as
    | {
        inners_per_case?: number | null;
        units_per_inner?: number | null;
        units_per_case?: number | null;
        inner_unit_type?: string | null;
        case_label?: string | null;
        pallet_label?: string | null;
      }
    | undefined;

  if (cp?.units_per_case != null && cp.inners_per_case != null && cp.units_per_inner != null) {
    const boxes = cp.inners_per_case;
    const glovesPerBox = cp.units_per_inner;
    const computedTotal = boxes * glovesPerBox;
    const declaredTotal = cp.units_per_case;
    const state: PackagingMathReviewState =
      computedTotal === declaredTotal ? "matches" : "mismatch";
    return {
      state,
      boxes,
      glovesPerBox,
      computedTotal,
      declaredTotal,
      caseLabel: cp.case_label ?? null,
      palletLabel: cp.pallet_label ?? null,
      innerUnitLabel: cp.inner_unit_type ?? null,
    };
  }

  const boxes = packagingBoxesPerCase(nd);
  const glovesPerBox = packagingGlovesPerBox(nd);
  const declaredTotal = packagingDeclaredTotalGloves(nd) ?? cp?.units_per_case ?? null;
  const computedTotal =
    boxes != null && glovesPerBox != null ? boxes * glovesPerBox : null;

  if (computedTotal == null) {
    return {
      state: "incomplete",
      boxes,
      glovesPerBox,
      computedTotal: null,
      declaredTotal,
      caseLabel: cp?.case_label ?? null,
      palletLabel: cp?.pallet_label ?? null,
      innerUnitLabel: cp?.inner_unit_type ?? null,
    };
  }
  if (declaredTotal == null) {
    return {
      state: "matches",
      boxes,
      glovesPerBox,
      computedTotal,
      declaredTotal: null,
      caseLabel: cp?.case_label ?? null,
      palletLabel: cp?.pallet_label ?? null,
      innerUnitLabel: cp?.inner_unit_type ?? null,
    };
  }
  if (computedTotal === declaredTotal) {
    return {
      state: "matches",
      boxes,
      glovesPerBox,
      computedTotal,
      declaredTotal,
      caseLabel: cp?.case_label ?? null,
      palletLabel: cp?.pallet_label ?? null,
      innerUnitLabel: cp?.inner_unit_type ?? null,
    };
  }
  return {
    state: "mismatch",
    boxes,
    glovesPerBox,
    computedTotal,
    declaredTotal,
    caseLabel: cp?.case_label ?? null,
    palletLabel: cp?.pallet_label ?? null,
    innerUnitLabel: cp?.inner_unit_type ?? null,
  };
}

const ND_FIELD_SPECS: {
  id: string;
  label: string;
  confidenceKey?: string;
  normalizedPick: (nd: Record<string, unknown>, attrs: Record<string, unknown>) => string;
  sourceId?: string;
}[] = [
  {
    id: "material",
    label: "Material",
    confidenceKey: "material",
    normalizedPick: (_nd, a) => formatDisplayValue(a.material),
  },
  {
    id: "color",
    label: "Color",
    confidenceKey: "color",
    normalizedPick: (_nd, attrs) => formatDisplayValue(attrs.color),
  },
  {
    id: "thickness_mil",
    label: "Thickness (mil)",
    confidenceKey: "thickness_mil",
    normalizedPick: (_nd, attrs) => formatDisplayValue(attrs.thickness_mil ?? attrs.thickness),
  },
  {
    id: "powder",
    label: "Powder",
    confidenceKey: "powder",
    normalizedPick: (_nd, attrs) => formatDisplayValue(attrs.powder),
    sourceId: "powder",
  },
  {
    id: "grade",
    label: "Grade",
    confidenceKey: "grade",
    normalizedPick: (_nd, attrs) => formatDisplayValue(attrs.grade),
    sourceId: "grade",
  },
  {
    id: "texture",
    label: "Texture",
    confidenceKey: "texture",
    normalizedPick: (_nd, attrs) => formatDisplayValue(attrs.texture),
  },
  {
    id: "cuff_style",
    label: "Cuff style",
    confidenceKey: "cuff_style",
    normalizedPick: (_nd, attrs) => formatDisplayValue(attrs.cuff_style),
  },
  {
    id: "sterility",
    label: "Sterility",
    confidenceKey: "sterility",
    normalizedPick: (_nd, attrs) => formatDisplayValue(attrs.sterility),
    sourceId: "sterility",
  },
  {
    id: "certifications",
    label: "Certifications",
    confidenceKey: "certifications",
    normalizedPick: (_nd, attrs) => formatDisplayValue(attrs.certifications),
  },
  {
    id: "industries",
    label: "Industries",
    confidenceKey: "industries",
    normalizedPick: (_nd, attrs) => formatDisplayValue(attrs.industries),
  },
  {
    id: "uses",
    label: "Uses",
    confidenceKey: "uses",
    normalizedPick: (_nd, attrs) => formatDisplayValue(attrs.uses),
  },
  {
    id: "protection_tags",
    label: "Protection tags",
    confidenceKey: "protection_tags",
    normalizedPick: (_nd, attrs) => formatDisplayValue(attrs.protection_tags),
  },
  {
    id: "size_code",
    label: "Size code",
    confidenceKey: "size",
    normalizedPick: (_nd, attrs) => formatDisplayValue(attrs.size),
    sourceId: "size_code",
  },
  {
    id: "variant_sku",
    label: "Variant SKU (supplier)",
    confidenceKey: "supplier_sku",
    normalizedPick: (nd, attrs) => getVariantSkuDisplay(nd, attrs),
  },
  {
    id: "gtin",
    label: "GTIN / UPC",
    confidenceKey: "upc",
    normalizedPick: (nd) => firstNonEmpty(nd.upc, nd.gtin, nd.ean, nd.barcode),
  },
  {
    id: "mpn",
    label: "MPN",
    confidenceKey: "manufacturer_part_number",
    normalizedPick: (nd) => firstNonEmpty(nd.manufacturer_part_number, nd.mpn),
  },
  {
    id: "manufacturer",
    label: "Manufacturer",
    normalizedPick: (nd) => firstNonEmpty(nd.manufacturer, nd.supplier_manufacturer),
  },
  {
    id: "boxes_per_case",
    label: "Boxes per case",
    normalizedPick: (nd) => {
      const p = nd.pricing as Record<string, unknown> | undefined;
      return numOrDash(nd.boxes_per_case ?? p?.boxes_per_case);
    },
  },
  {
    id: "gloves_per_box",
    label: "Gloves per box",
    normalizedPick: (nd) => numOrDash(nd.gloves_per_box ?? nd.box_qty),
  },
  {
    id: "total_gloves_per_case",
    label: "Total gloves per case",
    normalizedPick: (nd) => numOrDash(nd.total_gloves_per_case),
  },
  {
    id: "spec_sheet_urls",
    label: "Spec sheets / SDS / PDFs",
    normalizedPick: (nd) => {
      const u = nd.spec_sheet_urls;
      if (!Array.isArray(u) || u.length === 0) return "—";
      return `${u.length} link(s)`;
    },
  },
  {
    id: "images",
    label: "Images",
    normalizedPick: (nd) => {
      const imgs = nd.images;
      if (!Array.isArray(imgs) || imgs.length === 0) return "—";
      return `${imgs.length} URL(s): ${imgs
        .slice(0, 2)
        .map((u) => str(u))
        .join(" · ")}${imgs.length > 2 ? " …" : ""}`;
    },
  },
];

/** Map review field id → key on normalized_data._fieldExtraction (OpenClaw normalize output). */
function fieldExtractionKey(specId: string): string {
  const m: Record<string, string> = {
    powder: "powder_status",
    grade: "glove_type",
    sterility: "sterile_status",
    size_code: "size",
  };
  return m[specId] ?? specId;
}

/**
 * URL / OpenClaw per-field extraction from normalized_data._fieldExtraction (if present on row).
 * Does not overwrite normalized pipeline confidence — shown separately in UI.
 */
function fieldExtractionHint(nd: Record<string, unknown>, specId: string): StagedReviewSourceHint | undefined {
  const fe = nd._fieldExtraction as Record<string, unknown> | undefined;
  if (!fe || typeof fe !== "object") return undefined;
  const entry = fe[fieldExtractionKey(specId)];
  if (!entry || typeof entry !== "object") return undefined;
  const o = entry as { raw_value?: unknown; normalized_value?: unknown; confidence?: number };
  const raw = o.raw_value ?? o.normalized_value;
  let rawDisplay = "";
  if (Array.isArray(raw)) rawDisplay = raw.map((x) => str(x)).filter(Boolean).join(", ");
  else rawDisplay = str(raw);
  if (!rawDisplay) return undefined;
  const confidence = typeof o.confidence === "number" && Number.isFinite(o.confidence) ? o.confidence : undefined;
  return { rawDisplay, confidence, method: "site_ontology" };
}

/**
 * Build read-only review rows for the staged product detail sheet.
 *
 * @param normalizedData supplier_products_normalized.normalized_data
 * @param attributes Top-level attributes mirror (filter_attributes)
 * @param rawPayload supplier_products_raw.raw_payload when present
 */
export function buildStagedProductReviewEvidence(
  normalizedData: Record<string, unknown>,
  attributes: Record<string, unknown>,
  rawPayload: Record<string, unknown>
): StagedReviewFieldRow[] {
  const fa =
    normalizedData.filter_attributes && typeof normalizedData.filter_attributes === "object" && !Array.isArray(normalizedData.filter_attributes)
      ? (normalizedData.filter_attributes as Record<string, unknown>)
      : {};
  const attrs = { ...fa, ...attributes };
  const conf = (normalizedData.confidence_by_key ?? {}) as Record<string, number>;
  const rows: StagedReviewFieldRow[] = [];

  for (const spec of ND_FIELD_SPECS) {
    const normalizedDisplay = spec.normalizedPick(normalizedData, attrs);
    const ck = spec.confidenceKey;
    const normalizedConfidence =
      ck && typeof conf[ck] === "number" && Number.isFinite(conf[ck]) ? conf[ck] : undefined;

    const sourceId = spec.sourceId ?? spec.id;
    const fromRaw = firstSourceHint(rawPayload, sourceId);
    const fromFe = fieldExtractionHint(normalizedData, spec.id);

    let ontologyHint: StagedReviewSourceHint | undefined = fromFe;
    if (
      ontologyHint &&
      fromRaw &&
      ontologyHint.rawDisplay === fromRaw.rawDisplay &&
      ontologyHint.confidence === fromRaw.confidence
    ) {
      ontologyHint = undefined;
    }

    rows.push({
      id: spec.id,
      label: spec.label,
      normalizedDisplay,
      normalizedConfidence,
      sourceHint: fromRaw,
      ontologyHint,
    });
  }

  return rows;
}

export function formatConfidencePct(conf: number | undefined): string {
  if (conf == null || !Number.isFinite(conf)) return "—";
  return `${(conf * 100).toFixed(0)}%`;
}

const EXTRACTION_V2_VERSION = "product-url-extraction-v2";

const CONFIDENCE_KEYS = [
  "overall",
  "identity",
  "variants",
  "images",
  "packaging",
  "attributes",
] as const;

export type UrlExtractionReviewContext = {
  summary: ProductUrlExtractionV2Summary;
  full: ProductUrlExtractionV2 | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

function hasValidExtractionV2Version(o: Record<string, unknown>): boolean {
  return o.version === EXTRACTION_V2_VERSION && o.schemaVersion === 1;
}

function parseExtractionConfidence(v: unknown): ProductUrlExtractionV2["confidence"] | null {
  if (!isRecord(v)) return null;
  for (const k of CONFIDENCE_KEYS) {
    const n = v[k];
    if (typeof n !== "number" || !Number.isFinite(n)) return null;
  }
  return v as ProductUrlExtractionV2["confidence"];
}

function parseExtractionReview(v: unknown): ProductUrlExtractionV2["review"] | null {
  if (!isRecord(v)) return null;
  if (typeof v.safeToCreateMaster !== "boolean") return null;
  if (typeof v.safeToStageVariants !== "boolean") return null;
  if (!Array.isArray(v.blockers) || !v.blockers.every((b) => typeof b === "string")) return null;
  if (!Array.isArray(v.warnings) || !v.warnings.every((w) => typeof w === "string")) return null;
  const hints = v.publishReadinessHints;
  if (!isRecord(hints)) return null;
  if (typeof hints.hasVariantCandidates !== "boolean") return null;
  if (typeof hints.hasImageCandidate !== "boolean") return null;
  if (typeof hints.hasPackagingSignal !== "boolean") return null;
  if (typeof hints.hasSkuSourceSeparation !== "boolean") return null;
  if (!Array.isArray(hints.warnings) || !hints.warnings.every((w) => typeof w === "string")) return null;
  return v as ProductUrlExtractionV2["review"];
}

/** Read compact V2 summary from normalized_data (contract summary preferred). */
export function parseExtractionV2Summary(
  normalizedData: Record<string, unknown>
): ProductUrlExtractionV2Summary | null {
  if (!isRecord(normalizedData)) return null;

  const contractSummary = normalizedData.product_setup_contract_summary;
  if (isProductSetupContractSummaryV1(contractSummary)) {
    const compat = contractSummary._extraction_v2_compat;
    if (compat && hasValidExtractionV2Version(compat)) {
      return compat as ProductUrlExtractionV2Summary;
    }
  }

  const raw = normalizedData._extraction_v2;
  if (!isRecord(raw)) return null;
  if (!hasValidExtractionV2Version(raw)) return null;
  if (typeof raw.sourceUrl !== "string" || !raw.sourceUrl.trim()) return null;
  if (typeof raw.imageCandidateCount !== "number" || !Number.isFinite(raw.imageCandidateCount)) return null;
  if (typeof raw.proposedVariantCount !== "number" || !Number.isFinite(raw.proposedVariantCount)) return null;
  if (!Array.isArray(raw.variantDimensions)) return null;
  const confidence = parseExtractionConfidence(raw.confidence);
  if (!confidence) return null;
  const review = parseExtractionReview(raw.review);
  if (!review) return null;
  return raw as ProductUrlExtractionV2Summary;
}

/** Read full V2 extraction from raw_payload (contract full preferred). */
export function parseFullExtractionV2(rawPayload: Record<string, unknown>): ProductUrlExtractionV2 | null {
  if (!isRecord(rawPayload)) return null;

  const contractFull = resolveProductSetupContractFull(rawPayload);
  if (contractFull?._sourceExtractionV2) {
    return contractFull._sourceExtractionV2;
  }

  const raw = rawPayload.extraction_v2;
  if (!isRecord(raw)) return null;
  if (!hasValidExtractionV2Version(raw)) return null;
  if (typeof raw.sourceUrl !== "string" || !raw.sourceUrl.trim()) return null;
  if (typeof raw.fetchedAt !== "string" || !raw.fetchedAt.trim()) return null;
  return raw as ProductUrlExtractionV2;
}

/** Resolve summary (required) and optional full extraction for review UI. */
export function resolveUrlExtractionReviewContext(
  normalizedData: Record<string, unknown>,
  rawPayload: Record<string, unknown>
): UrlExtractionReviewContext | null {
  const summary = parseExtractionV2Summary(normalizedData);
  if (!summary) return null;
  const full = parseFullExtractionV2(rawPayload);
  return { summary, full };
}

/** Display value from a FieldEvidence object; returns em dash when absent. */
export function formatFieldEvidenceValue(evidence: FieldEvidence<unknown> | unknown): string {
  if (evidence == null) return "—";
  if (!isRecord(evidence) || !("value" in evidence)) return "—";
  const v = evidence.value;
  if (Array.isArray(v)) {
    const parts = v.map((x) => str(x)).filter(Boolean);
    return parts.length ? parts.join(", ") : "—";
  }
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (v == null || v === "") return "—";
  return String(v);
}

const TRUST_LABELS: Record<FieldTrust, string> = {
  trusted: "Trusted",
  probable: "Probable",
  weak: "Weak",
  conflicting: "Conflicting",
  missing: "Missing",
};

/** Human label for FieldTrust badges in review UI. */
export function formatTrustLabel(trust: FieldTrust): string {
  return TRUST_LABELS[trust] ?? trust;
}
