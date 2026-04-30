/**
 * Map url_import_products.normalized_payload (or OpenClaw NormalizedFamily) to ParsedRow
 * for the existing ingestion pipeline (extractContentFromRaw, runNormalization).
 */

import type { NormalizedFamily } from "@/lib/openclaw/normalize";

function num(v: string | number | undefined | null): number | undefined {
  if (v == null) return undefined;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isNaN(n) ? undefined : n;
}

/** OpenClaw ExtractedField or plain value → raw payload. */
export function unwrapExtractedField(val: unknown): unknown {
  if (val != null && typeof val === "object" && !Array.isArray(val) && "raw_value" in val) {
    const o = val as { raw_value?: unknown; normalized_value?: unknown };
    return o.raw_value ?? o.normalized_value;
  }
  return val;
}

function coerceString(val: unknown): string {
  const u = unwrapExtractedField(val);
  if (u == null) return "";
  return String(u).trim();
}

export function coerceStringArray(val: unknown): string[] {
  const u = unwrapExtractedField(val);
  if (u == null) return [];
  if (Array.isArray(u)) return u.map((x) => String(x).trim()).filter(Boolean);
  const s = String(u).trim();
  if (!s) return [];
  return s.split(/[,;|]/).map((x) => x.trim()).filter(Boolean);
}

function mergeUniqueStrings(a: string[], b: string[]): string[] {
  const out = new Set<string>([...a, ...b]);
  return [...out];
}

/** Map canonical dictionary slugs to phrases extract-attributes-dictionary regexes can match in combinedText (via long_description). */
const CERTIFICATION_SLUG_HINTS: Record<string, string> = {
  fda_approved: "fda approved",
  astm_tested: "astm",
  food_safe: "food safe",
  latex_free: "latex free",
  chemo_rated: "chemo",
  en_455: "en 455",
  en_374: "en 374",
};

const USES_SLUG_HINTS: Record<string, string> = {
  general_purpose: "general purpose",
  medical_exam: "medical exam",
  patient_care: "patient care",
  food_handling: "food handling",
  laboratory: "laboratory",
  chemical_handling: "chemical",
  industrial_maintenance: "industrial",
  cleanroom: "cleanroom",
};

const PROTECTION_SLUG_HINTS: Record<string, string> = {
  chemical_resistant: "chemical resistant",
  puncture_resistant: "puncture resistant",
  viral_barrier: "viral",
  biohazard: "biohazard",
  static_control: "static control",
  grip_enhanced: "grip",
  abrasion_enhanced: "abrasion",
};

function hintsForSlugs(slugs: string[], hintMap: Record<string, string>): string {
  const parts: string[] = [];
  for (const slug of slugs) {
    const key = slug.trim().toLowerCase().replace(/\s+/g, "_");
    const hint = hintMap[key] ?? slug.replace(/_/g, " ");
    if (hint) parts.push(hint);
  }
  return parts.join(" ");
}

function appendHintsToLongDescription(row: Record<string, unknown>, extra: string): void {
  const t = extra.trim();
  if (!t) return;
  const cur = coerceString(row.long_description ?? row.description ?? "");
  const next = cur ? `${cur} ${t}` : t;
  row.long_description = next;
}

function boxesPerCaseFromSpecTable(spec: unknown): number | undefined {
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) return undefined;
  const o = spec as Record<string, string>;
  for (const [k, v] of Object.entries(o)) {
    const kl = k.toLowerCase().replace(/\s+/g, " ");
    if (
      (kl.includes("box") && (kl.includes("case") || /\bcs\b/.test(kl) || kl.includes("/cs"))) ||
      kl.includes("bx/cs") ||
      kl.includes("boxes per case")
    ) {
      const n = parseFloat(String(v).replace(/[^\d.]/g, ""));
      if (Number.isFinite(n) && n > 0) return Math.trunc(n);
    }
  }
  return undefined;
}

function glovesPerBoxFromSpecTable(spec: unknown): number | undefined {
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) return undefined;
  const o = spec as Record<string, string>;
  for (const [k, v] of Object.entries(o)) {
    const kl = k.toLowerCase().replace(/\s+/g, " ");
    if (
      (kl.includes("glove") && kl.includes("box")) ||
      kl.includes("per box") ||
      kl.includes("qty/bx") ||
      kl.includes("count per box")
    ) {
      const n = parseFloat(String(v).replace(/[^\d.]/g, ""));
      if (Number.isFinite(n) && n > 0) return Math.trunc(n);
    }
  }
  return undefined;
}

function mergeHttpsImages(row: Record<string, unknown>, urls: string[]): void {
  const valid = urls.map((u) => u.trim()).filter((u) => u.startsWith("http://") || u.startsWith("https://"));
  if (valid.length === 0) return;
  const existing = coerceStringArray(row.images);
  const merged = mergeUniqueStrings(existing, valid);
  row.images = merged;
  if (!row.image_url) row.image_url = merged[0];
}

function mergeSpecSheetUrls(row: Record<string, unknown>, urls: string[]): void {
  const valid = urls.map((u) => u.trim()).filter((u) => u.startsWith("http://") || u.startsWith("https://"));
  if (valid.length === 0) return;
  const existing = coerceStringArray(row.spec_sheet_urls);
  row.spec_sheet_urls = mergeUniqueStrings(existing, valid);
}

/**
 * Lift OpenClaw extracted + parsed page fields into canonical ParsedRow keys.
 * Strips `_extracted` / `_fieldExtraction` so staging does not depend on nested JSON truth.
 */
export function finalizeUrlImportParsedRow(
  row: Record<string, unknown>,
  ctx: { extracted?: Record<string, unknown>; parsedPage?: Record<string, unknown> } = {}
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  const extracted = ctx.extracted ?? (out._extracted as Record<string, unknown> | undefined);
  const parsedPage = ctx.parsedPage;

  const complianceFromExtracted = coerceStringArray(extracted?.compliance_tags);
  const useFromExtracted = coerceStringArray(extracted?.use_case_tags);
  const protFromExtracted = coerceStringArray(extracted?.protection_tags);

  const complianceTop = coerceStringArray(out.compliance_tags);
  const useTop = coerceStringArray(out.use_case_tags);
  const certifications = mergeUniqueStrings(
    mergeUniqueStrings(coerceStringArray(out.certifications), complianceTop),
    complianceFromExtracted
  );
  if (certifications.length) {
    out.certifications = certifications;
    appendHintsToLongDescription(out, hintsForSlugs(certifications, CERTIFICATION_SLUG_HINTS));
  }

  const uses = mergeUniqueStrings(mergeUniqueStrings(coerceStringArray(out.uses), useTop), useFromExtracted);
  if (uses.length) {
    out.uses = uses;
    appendHintsToLongDescription(out, hintsForSlugs(uses, USES_SLUG_HINTS));
  }

  const protectionTags = mergeUniqueStrings(coerceStringArray(out.protection_tags), protFromExtracted);
  if (protectionTags.length) {
    out.protection_tags = protectionTags;
    appendHintsToLongDescription(out, hintsForSlugs(protectionTags, PROTECTION_SLUG_HINTS));
  }

  const mpnFromExtracted = coerceString(extracted?.mpn);
  const mpnTop = coerceString(out.mpn ?? out.manufacturer_part_number);
  const mpn = mpnTop || mpnFromExtracted;
  if (mpn) out.manufacturer_part_number = mpn;

  const supplierMfr = coerceString(out.supplier_manufacturer ?? parsedPage?.supplier_manufacturer);
  if (supplierMfr) out.manufacturer = coerceString(out.manufacturer) || supplierMfr;

  const upcFromPage = coerceString(parsedPage?.upc ?? parsedPage?.gtin ?? parsedPage?.ean ?? parsedPage?.barcode);
  const upc = coerceString(out.upc ?? out.gtin ?? out.ean ?? out.barcode) || upcFromPage;
  if (upc) out.upc = upc;

  const imageUrls = coerceStringArray(out.image_urls);
  if (imageUrls.length) mergeHttpsImages(out, imageUrls);

  if (parsedPage?.images && Array.isArray(parsedPage.images)) {
    mergeHttpsImages(out, parsedPage.images as string[]);
  }

  const specFromRow = coerceStringArray(out.spec_sheet_urls);
  const specFromParsed = coerceStringArray(parsedPage?.spec_sheet_urls);
  const specMerged = mergeUniqueStrings(specFromRow, specFromParsed);
  if (specMerged.length) out.spec_sheet_urls = specMerged;
  else delete out.spec_sheet_urls;

  const specBoxes = boxesPerCaseFromSpecTable(parsedPage?.spec_table);
  if (specBoxes != null && out.boxes_per_case == null) out.boxes_per_case = specBoxes;

  const specGloves = glovesPerBoxFromSpecTable(parsedPage?.spec_table);
  if (specGloves != null && out.gloves_per_box == null && out.box_qty == null) {
    out.gloves_per_box = specGloves;
    out.box_qty = specGloves;
  }

  const bpcFinal = num(out.boxes_per_case);
  if (bpcFinal != null) out.boxes_per_case = bpcFinal;
  else delete out.boxes_per_case;

  const gpbFinal = num(out.gloves_per_box ?? out.box_qty);
  if (gpbFinal != null) {
    out.gloves_per_box = gpbFinal;
    const existingBoxQty = num(out.box_qty);
    out.box_qty = existingBoxQty ?? gpbFinal;
  }

  const bpcT = num(out.boxes_per_case);
  const gpbT = num(out.gloves_per_box);
  if (bpcT != null && gpbT != null && bpcT > 0 && gpbT > 0) {
    out.total_gloves_per_case = bpcT * gpbT;
  } else {
    delete out.total_gloves_per_case;
  }

  delete out._extracted;
  delete out._fieldExtraction;
  delete out.compliance_tags;
  delete out.use_case_tags;
  delete out.mpn;
  if (supplierMfr) delete out.supplier_manufacturer;
  if (imageUrls.length) delete out.image_urls;

  return out;
}

export interface NormalizedFamilyToParsedRowOptions {
  case_price?: number;
  box_price?: number;
  image_urls?: string[];
  /** Parsed product page (spec table, supplier_manufacturer, images) — packaging hints only from explicit spec keys. */
  parsedPage?: Record<string, unknown>;
}

/**
 * Convert OpenClaw NormalizedFamily + optional pricing to ParsedRow shape.
 */
export function normalizedFamilyToParsedRow(
  normalized: NormalizedFamily,
  options: NormalizedFamilyToParsedRowOptions = {}
): Record<string, unknown> {
  const name = normalized.family_name ?? normalized.variant_name ?? "";
  const sku = normalized.sku ?? "";
  const cost = options.case_price ?? options.box_price ?? num(normalized.case_qty) ?? 0;
  const n = normalized as Record<string, unknown>;

  const boxesFromFamily = num(n.boxes_per_case);
  const boxesFromSpec =
    boxesFromFamily == null ? boxesPerCaseFromSpecTable(options.parsedPage?.spec_table) : undefined;
  const boxes_per_case = boxesFromFamily ?? boxesFromSpec;

  const glovesFromFamily = num(n.gloves_per_box);
  const glovesFromBoxQty = num(normalized.box_qty);
  const glovesFromSpec =
    glovesFromFamily == null && glovesFromBoxQty == null
      ? glovesPerBoxFromSpecTable(options.parsedPage?.spec_table)
      : undefined;
  const gloves_per_box = glovesFromFamily ?? glovesFromBoxQty ?? glovesFromSpec ?? undefined;
  const box_qty = glovesFromBoxQty ?? gloves_per_box;

  const case_qty = num(normalized.case_qty) ?? undefined;

  let total_gloves_per_case: number | undefined;
  if (boxes_per_case != null && gloves_per_box != null && boxes_per_case > 0 && gloves_per_box > 0) {
    total_gloves_per_case = boxes_per_case * gloves_per_box;
  }

  const base: Record<string, unknown> = {
    name,
    title: name,
    product_name: name,
    sku,
    supplier_sku: sku,
    id: sku,
    cost: Number.isFinite(cost) ? cost : 0,
    supplier_cost: Number.isFinite(cost) ? cost : 0,
    price: options.case_price ?? options.box_price,
    brand: normalized.brand ?? undefined,
    description: (normalized as unknown as Record<string, unknown>).description ?? undefined,
    material: normalized.material ?? undefined,
    size: normalized.size ?? undefined,
    color: normalized.color ?? undefined,
    thickness: normalized.thickness_mil ?? undefined,
    thickness_mil: normalized.thickness_mil ?? undefined,
    powder_free: (normalized as unknown as Record<string, unknown>).powder_status === "powder_free",
    grade: normalized.glove_type ?? undefined,
    case_qty,
    box_qty,
    gloves_per_box,
    boxes_per_case,
    total_gloves_per_case,
    source_url: normalized.source_url ?? undefined,
    image_url: Array.isArray(options.image_urls) && options.image_urls[0] ? options.image_urls[0] : undefined,
    images: options.image_urls ?? undefined,
  };

  return finalizeUrlImportParsedRow(base, {
    extracted: n._extracted as Record<string, unknown> | undefined,
    parsedPage: options.parsedPage,
  });
}

/**
 * Ensure a url_import_products.normalized_payload (already stored) is valid as ParsedRow.
 * Adds canonical keys if missing.
 */
export function urlImportPayloadToParsedRow(payload: Record<string, unknown>): Record<string, unknown> {
  const merged = finalizeUrlImportParsedRow({ ...payload }, {
    extracted: payload._extracted as Record<string, unknown> | undefined,
  });

  const name =
    (merged.name ??
      merged.title ??
      merged.product_name ??
      merged.canonical_title ??
      merged.sku ??
      "Untitled") as string;
  const skuRaw = merged.sku ?? merged.supplier_sku ?? merged.id ?? "";
  const sku = String(skuRaw).trim() || "UNKNOWN";
  const cost = Number(
    merged.cost ?? merged.supplier_cost ?? merged.price ?? merged.case_price ?? merged.box_price ?? 0
  );

  return {
    ...merged,
    name: name || sku || "Untitled",
    title: name || sku,
    product_name: name || sku,
    sku,
    supplier_sku: sku,
    cost: Number.isFinite(cost) ? cost : 0,
    supplier_cost: Number.isFinite(cost) ? cost : 0,
  };
}
