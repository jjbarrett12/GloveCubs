import { extractProductFromHtml, type ExtractionResult, type ExtractedProductData, type ExtractedSizeOption } from "@/lib/admin/productExtraction";
import { attachSkuProposalsToDraft } from "@/lib/admin/variant-sku-intelligence";
import {
  normalizeGloveSizeCode,
  sortGloveSizeCodes,
} from "@/lib/admin/glove-size-normalization";
import {
  IMPORT_DRAFT_PARSER_VERSION,
  IMPORT_DRAFT_SCHEMA_VERSION,
  type ImportDraftProductV1,
  type ImportDraftVariantV1,
  type ImportFieldProvenanceV1,
  type StagingExtractedPayloadV1,
} from "@/lib/admin/import-draft-types";

const KNOWN_SIZE_CODES = new Set<string>(["XS", "S", "M", "L", "XL", "XXL", "XXXL", "OS", "UNKNOWN"]);

function provenanceFromScores(
  field: string,
  value: unknown,
  scores: Record<string, number>,
  sources: string[],
  method: "deterministic" | "ai_fallback" = "deterministic"
): ImportFieldProvenanceV1 | null {
  if (value === null || value === undefined || value === "") return null;
  const conf = scores[field] ?? 0.5;
  const source = sources[0] ?? "extractor";
  return { value, confidence: conf, source, method };
}

function pickImageUrl(result: ExtractionResult): string | null {
  const urls = pickImageUrls(result);
  return urls[0] ?? null;
}

function pickImageUrls(result: ExtractionResult): string[] {
  const fromGallery = result.extracted.images ?? [];
  if (fromGallery.length > 0) return fromGallery;
  const meta = result.raw_data.meta_tags ?? {};
  const og = meta["og:image"]?.trim();
  if (og && (og.startsWith("http://") || og.startsWith("https://"))) return [og];
  for (const node of result.raw_data.json_ld ?? []) {
    const img = node.image;
    if (typeof img === "string" && img.trim()) return [img.trim()];
    if (Array.isArray(img) && typeof img[0] === "string" && img[0].trim()) return [img[0].trim()];
  }
  return [];
}

function deriveQuantitySlugs(
  extracted: ExtractedProductData,
  textBlob: string
): { box_quantity: string | null; case_quantity: string | null } {
  const perBox = extracted.pack_size ?? extracted.units_per_box ?? null;
  let unitsPerCase = extracted.total_units_per_case ?? null;
  if (unitsPerCase == null && extracted.boxes_per_case != null && perBox != null) {
    unitsPerCase = extracted.boxes_per_case * perBox;
  }
  if (unitsPerCase == null || perBox == null) {
    const { case_pack, units_per_case } = deriveCasePack(extracted, textBlob);
    if (units_per_case != null) unitsPerCase = units_per_case;
    if (perBox == null && case_pack?.includes("/")) {
      const parts = case_pack.split("/");
      const maybeBox = parseInt(parts[1] ?? "", 10);
      if (Number.isFinite(maybeBox) && maybeBox > 0) {
        return {
          box_quantity: String(maybeBox),
          case_quantity: unitsPerCase != null ? String(unitsPerCase) : null,
        };
      }
    }
  }
  return {
    box_quantity: perBox != null ? String(perBox) : null,
    case_quantity: unitsPerCase != null ? String(unitsPerCase) : null,
  };
}

function summarizeJsonLd(nodes: Record<string, unknown>[] | undefined): Record<string, unknown> | null {
  if (!nodes?.length) return null;
  const product = nodes.find((n) => {
    const t = String(n["@type"] ?? "").toLowerCase();
    return t.includes("product");
  });
  if (!product) return null;
  return {
    name: product.name ?? null,
    sku: product.sku ?? null,
    mpn: product.mpn ?? null,
    brand: product.brand ?? null,
  };
}

/** Explicit one-size only — never use as unknown-size fallback. */
export function isExplicitOneSize(sizeLabel: string | null, normalizedCode: string): boolean {
  if (normalizedCode === "OS") return true;
  if (!sizeLabel) return false;
  return /\bone[\s-]?size\b/i.test(sizeLabel) || /\b(?:^|\s)os(?:\s|$)\b/i.test(sizeLabel);
}

export function normalizeSizeCode(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const t = raw.trim();
  const upper = t.toUpperCase();
  if (KNOWN_SIZE_CODES.has(upper)) return upper;
  const lower = t.toLowerCase();
  if (/\bone[\s-]?size\b/i.test(lower)) return "OS";
  const glove = normalizeGloveSizeCode(t);
  if (glove) return glove;
  if (/^\d+(\.\d+)?$/.test(t)) return t;
  return upper.length <= 6 ? upper : null;
}

function buildVariantFromSizeOption(
  opt: ExtractedSizeOption,
  extracted: ExtractedProductData,
  listPrice: string | null,
  fieldProvenance: Record<string, ImportFieldProvenanceV1>
): ImportDraftVariantV1 {
  const manufacturerSku = opt.manufacturerSku?.trim() || null;
  return {
    size_label: opt.rawLabel,
    normalized_size_code: opt.normalizedCode,
    sku: null,
    manufacturer_sku: manufacturerSku,
    source_sku: manufacturerSku,
    size_source: opt.source,
    size_confidence: opt.confidence,
    mpn: extracted.mpn ?? null,
    gtin: extracted.upc ?? null,
    list_price: listPrice,
    provenance: fieldProvenance.size ? { size: fieldProvenance.size } : undefined,
  };
}

function deriveCasePack(extracted: ExtractedProductData, textBlob: string): {
  case_pack: string | null;
  units_per_case: number | null;
} {
  if (extracted.boxes_per_case != null && extracted.pack_size != null) {
    const units = extracted.total_units_per_case ?? extracted.boxes_per_case * extracted.pack_size;
    return {
      case_pack: `${extracted.boxes_per_case}/${extracted.pack_size}`,
      units_per_case: units ?? null,
    };
  }
  const casePackMatch = textBlob.match(/\b(\d{1,4})\s*[x×]\s*(\d{1,5})\b/i);
  if (casePackMatch) {
    const boxes = parseInt(casePackMatch[1]!, 10);
    const perBox = parseInt(casePackMatch[2]!, 10);
    if (Number.isFinite(boxes) && Number.isFinite(perBox) && boxes > 0 && perBox > 0) {
      return { case_pack: `${boxes}/${perBox}`, units_per_case: boxes * perBox };
    }
  }
  const slashMatch = textBlob.match(/\b(\d{1,4})\s*\/\s*(\d{1,5})\s*(?:ct|count|gloves|pcs)?\b/i);
  if (slashMatch) {
    const boxes = parseInt(slashMatch[1]!, 10);
    const perBox = parseInt(slashMatch[2]!, 10);
    if (Number.isFinite(boxes) && Number.isFinite(perBox) && boxes > 0 && perBox > 0) {
      return { case_pack: `${boxes}/${perBox}`, units_per_case: boxes * perBox };
    }
  }
  if (extracted.total_units_per_case != null) {
    return { case_pack: null, units_per_case: extracted.total_units_per_case };
  }
  if (extracted.pack_size != null) {
    return { case_pack: String(extracted.pack_size), units_per_case: null };
  }
  return { case_pack: null, units_per_case: null };
}

function buildVariantRow(
  sizeLabel: string | null,
  normalized: string,
  extracted: ExtractedProductData,
  listPrice: string | null,
  fieldProvenance: Record<string, ImportFieldProvenanceV1>
): ImportDraftVariantV1 {
  const productSku = extracted.sku ?? extracted.item_number ?? null;
  return {
    size_label: sizeLabel,
    normalized_size_code: normalized,
    sku: productSku,
    manufacturer_sku: null,
    source_sku: productSku,
    size_source: null,
    size_confidence: null,
    mpn: extracted.mpn ?? null,
    gtin: extracted.upc ?? null,
    list_price: listPrice,
    provenance: fieldProvenance.size ? { size: fieldProvenance.size } : undefined,
  };
}

export function buildImportDraftVariants(
  extracted: ExtractedProductData,
  fieldProvenance: Record<string, ImportFieldProvenanceV1>,
  listPrice: string | null
): ImportDraftVariantV1[] {
  if (extracted.size_options && extracted.size_options.length >= 1) {
    const seen = new Set<string>();
    const rows: ImportDraftVariantV1[] = [];
    const ordered = sortGloveSizeCodes(extracted.size_options.map((o) => o.normalizedCode));
    for (const code of ordered) {
      if (seen.has(code)) continue;
      const opt = extracted.size_options.find((o) => o.normalizedCode === code);
      if (!opt) continue;
      seen.add(code);
      rows.push(buildVariantFromSizeOption(opt, extracted, listPrice, fieldProvenance));
    }
    if (rows.length > 0) return rows;
  }

  const explicitVariants: ImportDraftVariantV1[] = [];

  if (extracted.sizes_available && extracted.sizes_available.length >= 1) {
    const seen = new Set<string>();
    for (const raw of extracted.sizes_available) {
      const code = normalizeSizeCode(raw);
      if (!code || seen.has(code)) continue;
      seen.add(code);
      explicitVariants.push(buildVariantRow(raw, code, extracted, listPrice, fieldProvenance));
    }
    if (explicitVariants.length > 0) return explicitVariants;
  }

  if (extracted.size) {
    const code = normalizeSizeCode(extracted.size);
    if (code && isExplicitOneSize(extracted.size, code)) {
      return [buildVariantRow(extracted.size, "OS", extracted, listPrice, fieldProvenance)];
    }
    if (code) {
      return [buildVariantRow(extracted.size, code, extracted, listPrice, fieldProvenance)];
    }
  }

  return [buildVariantRow(null, "UNKNOWN", extracted, listPrice, fieldProvenance)];
}

export function toImportDraftProductV1(result: ExtractionResult, sourceUrl: string): ImportDraftProductV1 {
  const extracted = result.extracted;
  const scores = result.confidence.field_scores;
  const sources = result.reasoning.sources;
  const textBlob = [
    extracted.title ?? "",
    extracted.description ?? "",
    JSON.stringify(extracted.spec_table ?? {}),
  ].join("\n");

  const field_provenance: Record<string, ImportFieldProvenanceV1> = {};
  const addProv = (key: string, value: unknown) => {
    const p = provenanceFromScores(key, value, scores, sources);
    if (p) field_provenance[key] = p;
  };

  addProv("product_name", extracted.title);
  addProv("brand", extracted.brand ?? extracted.manufacturer);
  addProv("material", extracted.material);
  addProv("color", extracted.color);
  addProv("thickness_mil", extracted.thickness_mil);
  addProv("size", extracted.size);

  const { case_pack, units_per_case } = deriveCasePack(extracted, textBlob);
  if (case_pack) addProv("case_pack", case_pack);
  if (units_per_case != null) addProv("units_per_case", units_per_case);

  const { box_quantity, case_quantity } = deriveQuantitySlugs(extracted, textBlob);
  if (box_quantity) addProv("box_quantity", box_quantity);
  if (case_quantity) addProv("case_quantity", case_quantity);
  if (extracted.certifications?.length) addProv("certifications", extracted.certifications.join(", "));

  const glove_grade = extracted.exam_grade === true ? "medical_exam_grade" : null;
  const listPrice =
    extracted.price != null && Number.isFinite(extracted.price) ? String(extracted.price) : null;

  const image_urls = pickImageUrls(result);
  const variants = buildImportDraftVariants(extracted, field_provenance, listPrice);
  const primarySize = extracted.size ? normalizeSizeCode(extracted.size) : null;

  const commerce_packaging = result.commerce_packaging ?? null;
  const parse_warnings = [
    ...result.reasoning.warnings,
    ...(commerce_packaging?.parse_warnings ?? []),
  ];

  return attachSkuProposalsToDraft({
    schema_version: IMPORT_DRAFT_SCHEMA_VERSION,
    parser_version: IMPORT_DRAFT_PARSER_VERSION,
    source_url: sourceUrl,
    product_name: extracted.title?.trim() || null,
    brand: (extracted.brand ?? extracted.manufacturer)?.trim() || null,
    category_hint: null,
    description: extracted.description?.trim() || null,
    image_url: image_urls[0] ?? null,
    image_urls: image_urls.length > 0 ? image_urls : undefined,
    sku: (extracted.sku ?? extracted.item_number)?.trim() || null,
    mpn: extracted.mpn?.trim() || null,
    gtin: extracted.upc?.trim() || null,
    material: extracted.material ?? null,
    color: extracted.color ?? null,
    thickness_mil: extracted.thickness_mil ?? null,
    case_pack,
    units_per_case,
    box_quantity,
    case_quantity,
    certification_slugs: extracted.certifications?.length ? extracted.certifications : undefined,
    food_safe: extracted.food_safe ?? null,
    powder_free: extracted.powder_free ?? null,
    latex_free: extracted.latex_free ?? null,
    exam_grade: extracted.exam_grade ?? null,
    glove_grade,
    size: primarySize,
    variants,
    confidence: {
      overall: result.confidence.overall,
      fields: { ...scores },
    },
    field_provenance,
    parse_warnings,
    commerce_packaging,
    raw_evidence: {
      spec_table: extracted.spec_table,
      meta_tags: result.raw_data.meta_tags,
      json_ld_summary: summarizeJsonLd(result.raw_data.json_ld),
    },
  });
}

export function extractImportDraftFromHtml(html: string, sourceUrl: string): ImportDraftProductV1 {
  const result = extractProductFromHtml(html, sourceUrl);
  return toImportDraftProductV1(result, sourceUrl);
}

function legacyDraftFromExtracted(ex: Record<string, unknown>, sourceUrl: string): ImportDraftProductV1 | null {
  const name = typeof ex.suggested_name === "string" ? ex.suggested_name : typeof ex.page_title === "string" ? ex.page_title : null;
  if (!name?.trim()) return null;
  const sku =
    (typeof ex.suggested_sku === "string" ? ex.suggested_sku : null) ??
    (typeof ex.suggested_mpn === "string" ? ex.suggested_mpn : null);
  return {
    schema_version: IMPORT_DRAFT_SCHEMA_VERSION,
    parser_version: IMPORT_DRAFT_PARSER_VERSION,
    source_url: sourceUrl,
    product_name: name.trim(),
    brand: typeof ex.suggested_brand === "string" ? ex.suggested_brand.trim() : null,
    category_hint: null,
    description: typeof ex.suggested_description === "string" ? ex.suggested_description.trim() : null,
    image_url:
      (typeof ex.suggested_image_from_page === "string" ? ex.suggested_image_from_page : null) ??
      (typeof ex.source_image_url === "string" ? ex.source_image_url : null),
    sku: sku?.trim() || null,
    mpn: typeof ex.suggested_mpn === "string" ? ex.suggested_mpn.trim() : null,
    gtin: typeof ex.suggested_gtin === "string" ? ex.suggested_gtin.trim() : null,
    material: null,
    color: null,
    thickness_mil: null,
    case_pack: null,
    units_per_case: null,
    powder_free: null,
    latex_free: null,
    exam_grade: null,
    glove_grade: null,
    size: null,
    variants: [
      {
        size_label: null,
        normalized_size_code: "UNKNOWN",
        sku: sku?.trim() || null,
        mpn: typeof ex.suggested_mpn === "string" ? ex.suggested_mpn.trim() : null,
        gtin: typeof ex.suggested_gtin === "string" ? ex.suggested_gtin.trim() : null,
        list_price: null,
      },
    ],
    confidence: {
      overall: typeof ex.extraction_confidence === "number" ? ex.extraction_confidence : 0.45,
      fields: {},
    },
    field_provenance: {},
    parse_warnings: ["legacy_staging_payload"],
    raw_evidence: {},
  };
}

/** Read V1 draft from staging extracted blob (with legacy fallback). */
export function parseImportDraftFromExtracted(
  extracted: Record<string, unknown>,
  fallbackSourceUrl: string
): ImportDraftProductV1 | null {
  const draftRaw = extracted.draft;
  if (draftRaw && typeof draftRaw === "object" && !Array.isArray(draftRaw)) {
    const d = draftRaw as ImportDraftProductV1;
    if (d.schema_version === IMPORT_DRAFT_SCHEMA_VERSION && Array.isArray(d.variants)) {
      return d;
    }
  }
  const sourceUrl =
    (typeof extracted.source_product_page_url === "string" ? extracted.source_product_page_url : null) ??
    fallbackSourceUrl;
  return legacyDraftFromExtracted(extracted, sourceUrl);
}

export function buildStagingExtractedPayload(input: {
  draft: ImportDraftProductV1;
  sourceProductPageUrl: string;
  sourceImageUrl: string | null;
  htmlTruncated?: boolean;
  fetchError?: string | null;
}): StagingExtractedPayloadV1 {
  const { draft } = input;
  return {
    schema_version: IMPORT_DRAFT_SCHEMA_VERSION,
    draft,
    source_product_page_url: input.sourceProductPageUrl,
    source_image_url: input.sourceImageUrl,
    html_truncated: input.htmlTruncated,
    fetch_error: input.fetchError ?? undefined,
    suggested_name: draft.product_name,
    suggested_brand: draft.brand,
    suggested_sku: draft.sku,
    suggested_mpn: draft.mpn,
    suggested_gtin: draft.gtin,
    suggested_description: draft.description,
    suggested_image_from_page: draft.image_url,
    extraction_confidence: draft.confidence.overall,
  };
}

export function draftNeedsHumanReview(draft: ImportDraftProductV1): boolean {
  if (draft.variants.some((v) => v.normalized_size_code === "UNKNOWN")) return true;
  if (draft.parse_warnings.some((w) => /multiple sizes/i.test(w))) return true;
  return false;
}
