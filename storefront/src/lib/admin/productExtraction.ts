/**
 * Product Extraction Service
 * 
 * Extracts product attributes from HTML pages:
 * - Item number / SKU / MPN
 * - Title and description
 * - Spec table parsing
 * - Material, size, thickness, color
 * - Pack size and units
 * 
 * Uses both structural extraction (JSON-LD, meta tags, tables)
 * and heuristic extraction (pattern matching).
 */

import {
  extractTextContent,
  extractMetaTags,
  extractTitle,
  extractTables,
  extractJsonLd,
} from './urlFetch';
import { extractCommercePackagingFromHtml } from '@commerce-packaging/extract';
import type { CommercePackagingV1 } from '@commerce-packaging/types';
import {
  canonicalizeManufacturerSku,
  decodeHospecoCompactManufacturerSku,
  normalizeGloveSizeCode,
  sortGloveSizeCodes,
} from './glove-size-normalization';

// ============================================================================
// TYPES
// ============================================================================

export type SizeOptionSource =
  | 'json_ld'
  | 'select_option'
  | 'variant_tile'
  | 'spec_table'
  | 'main_product_id'
  | 'url_pattern'
  | 'text_fallback';

export type ExtractedSizeOption = {
  rawLabel: string;
  normalizedCode: string;
  manufacturerSku?: string | null;
  source: SizeOptionSource;
  confidence: number;
  evidenceText?: string;
};

export interface ExtractedProductData {
  // Identifiers
  item_number?: string;
  sku?: string;
  mpn?: string;
  upc?: string;
  
  // Core info
  title?: string;
  description?: string;
  brand?: string;
  manufacturer?: string;
  
  // Product attributes
  material?: string;
  size?: string;
  sizes_available?: string[];
  /** Structured multi-size extraction with manufacturer SKU evidence. */
  size_options?: ExtractedSizeOption[];
  color?: string;
  colors_available?: string[];
  thickness_mil?: number;
  
  // Pack info
  pack_size?: number;
  units_per_box?: number;
  boxes_per_case?: number;
  total_units_per_case?: number;

  /** Product gallery / PDP image URLs (deduped, ordered). */
  images?: string[];

  /** Canonical certification slugs (e.g. astm_d6319, fda_food_contact). */
  certifications?: string[];
  
  // Product flags
  powder_free?: boolean;
  latex_free?: boolean;
  sterile?: boolean;
  exam_grade?: boolean;
  food_safe?: boolean;
  
  // Price (if available)
  price?: number;
  price_per_unit?: number;
  
  // Raw extracted data
  spec_table?: Record<string, string>;
  all_attributes?: Record<string, unknown>;
}

export interface ExtractionResult {
  success: boolean;
  extracted: ExtractedProductData;
  /** Case/pallet packaging extracted from page evidence. */
  commerce_packaging?: CommercePackagingV1;
  confidence: {
    overall: number;
    field_scores: Record<string, number>;
  };
  reasoning: {
    summary: string;
    sources: string[];
    warnings: string[];
  };
  raw_data: {
    json_ld?: Record<string, unknown>[];
    meta_tags?: Record<string, string>;
    spec_tables?: Array<{ headers: string[]; rows: string[][] }>;
  };
}

// ============================================================================
// EXTRACTION PATTERNS
// ============================================================================

const MATERIAL_PATTERNS: Record<string, RegExp[]> = {
  nitrile: [/nitrile/i, /nit\b/i],
  latex: [/latex/i, /natural\s*rubber/i],
  vinyl: [/vinyl/i, /pvc/i],
  neoprene: [/neoprene/i, /chloroprene/i],
  poly: [/polyethylene/i, /poly\s*glove/i, /\bpe\b/i],
  blend: [/blend/i, /hybrid/i],
};

const SIZE_PATTERNS: Record<string, RegExp[]> = {
  XS: [/\bxs\b/i, /\bx-small\b/i, /\bextra\s*small\b/i],
  S: [/\bsmall\b/i, /\bs\b(?!pecial|terile)/i],
  M: [/\bmedium\b/i, /\bmed\b/i],
  L: [/\blarge\b/i, /\blg\b/i],
  XL: [/\bx-?large\b/i, /\bxl\b/i, /\bextra\s*large\b/i],
  XXL: [/\bxxl\b/i, /\b2xl\b/i, /\bxx-?large\b/i],
};

const COLOR_PATTERNS: Record<string, RegExp[]> = {
  blue: [/\bblue\b/i],
  black: [/\bblack\b/i],
  white: [/\bwhite\b/i],
  purple: [/\bpurple\b/i, /\bviolet\b/i],
  green: [/\bgreen\b/i],
  orange: [/\borange\b/i],
  pink: [/\bpink\b/i],
  clear: [/\bclear\b/i, /\btransparent\b/i],
};

/** Multi-token color phrases (longest first for greedy match). */
const COLOR_PHRASES: string[] = [
  "Blue Violet",
  "Light Blue",
  "Dark Gray",
  "Dark Grey",
  "Forest Green",
  "Royal Blue",
  "Navy Blue",
  "Sky Blue",
  "Light Gray",
  "Light Grey",
  "Dark Green",
  "Dark Blue",
].sort((a, b) => b.length - a.length);

const TITLE_BRAND_STOP_WORDS = new Set([
  "nitrile",
  "vinyl",
  "latex",
  "neoprene",
  "poly",
  "polyethylene",
  "exam",
  "examination",
  "medical",
  "industrial",
  "glove",
  "gloves",
  "powder",
  "free",
  "powder-free",
  "powdered",
  "disposable",
  "synthetic",
  "rubber",
  "grade",
  "food",
  "service",
  "proworks",
  "medium",
  "small",
  "large",
  "xlarge",
  "xxl",
  "xs",
  "xl",
  "lg",
  "sm",
  "med",
  "mil",
]);

const SPEC_TABLE_KEYS: Record<string, string[]> = {
  item_number: ['item', 'item number', 'item #', 'item no', 'product code', 'part number', 'part #', 'catalog'],
  sku: ['sku', 'stock keeping unit', 'stock number'],
  mpn: ['mpn', 'mfg part', 'manufacturer part', 'mfr part', 'mfg #', 'model'],
  upc: ['upc', 'gtin', 'ean', 'barcode'],
  brand: ['brand', 'brand name'],
  manufacturer: ['manufacturer', 'mfg', 'made by', 'mfr'],
  material: ['material', 'composition', 'glove material', 'type'],
  size: ['size', 'glove size', 'available sizes', 'sizes'],
  color: ['color', 'colour'],
  thickness: ['thickness', 'mil', 'gauge'],
  pack_size: ['pack size', 'quantity', 'count', 'units', 'gloves per box', 'per box', 'box qty'],
  units_per_case: ['per case', 'case qty', 'case quantity', 'units per case'],
  powder_free: ['powder', 'powder free', 'powder-free'],
  latex_free: ['latex free', 'latex-free'],
  sterile: ['sterile', 'sterility'],
  exam_grade: ['exam', 'examination', 'medical'],
  food_safe: ['food', 'food safe', 'food grade', 'food service'],
};

// ============================================================================
// SIZE OPTION EXTRACTION
// ============================================================================

type SizeCandidate = ExtractedSizeOption & { manufacturerSku: string | null };

function upsertSizeCandidate(map: Map<string, SizeCandidate>, candidate: SizeCandidate): void {
  const key = candidate.normalizedCode;
  const prev = map.get(key);
  if (!prev || candidate.confidence > prev.confidence) {
    map.set(key, candidate);
  }
}

function sizeLabelFromCode(code: string): string {
  const labels: Record<string, string> = {
    XS: 'X-Small',
    S: 'Small',
    M: 'Medium',
    L: 'Large',
    XL: 'X-Large',
    XXL: 'XX-Large',
    XXXL: 'XXX-Large',
  };
  return labels[code] ?? code;
}

function parseSizeListText(text: string): string[] {
  return text
    .split(/[,;/|]|(?:\s+and\s+)/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

function extractSizesFromJsonLd(jsonLd: Record<string, unknown>[]): SizeCandidate[] {
  const out: SizeCandidate[] = [];
  for (const item of jsonLd) {
    const type = String(item['@type'] ?? '').toLowerCase();
    if (!type.includes('product')) continue;

    const variants = item.hasVariant;
    const list = Array.isArray(variants) ? variants : variants ? [variants] : [];
    for (const raw of list) {
      if (!raw || typeof raw !== 'object') continue;
      const v = raw as Record<string, unknown>;
      const sizeRaw =
        (typeof v.size === 'string' ? v.size : null) ??
        (typeof v.name === 'string' ? v.name : null);
      if (!sizeRaw?.trim()) continue;
      const code = normalizeGloveSizeCode(sizeRaw);
      if (!code) continue;
      const sku =
        (typeof v.sku === 'string' ? v.sku.trim() : null) ??
        (typeof v.mpn === 'string' ? v.mpn.trim() : null);
      out.push({
        rawLabel: sizeRaw.trim(),
        normalizedCode: code,
        manufacturerSku: sku,
        source: 'json_ld',
        confidence: 0.95,
        evidenceText: sku ? `${sizeRaw} (${sku})` : sizeRaw,
      });
    }

    const offers = item.offers;
    const offerList = Array.isArray(offers) ? offers : offers ? [offers] : [];
    for (const raw of offerList) {
      if (!raw || typeof raw !== 'object') continue;
      const o = raw as Record<string, unknown>;
      const sizeRaw = typeof o.size === 'string' ? o.size : null;
      if (!sizeRaw?.trim()) continue;
      const code = normalizeGloveSizeCode(sizeRaw);
      if (!code) continue;
      const sku = typeof o.sku === 'string' ? o.sku.trim() : null;
      out.push({
        rawLabel: sizeRaw.trim(),
        normalizedCode: code,
        manufacturerSku: sku,
        source: 'json_ld',
        confidence: 0.95,
        evidenceText: sizeRaw,
      });
    }
  }
  return out;
}

function extractSizesFromEmbeddedVariants(html: string): SizeCandidate[] {
  const out: SizeCandidate[] = [];
  const patterns = [
    /"variants"\s*:\s*(\[[\s\S]{0,80000}?\])/i,
    /"product"\s*:\s*\{[\s\S]{0,80000}?"variants"\s*:\s*(\[[\s\S]{0,80000}?\])/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (!m?.[1]) continue;
    try {
      const arr = JSON.parse(m[1]) as unknown[];
      if (!Array.isArray(arr)) continue;
      for (const raw of arr) {
        if (!raw || typeof raw !== 'object') continue;
        const v = raw as Record<string, unknown>;
        const option1 = typeof v.option1 === 'string' ? v.option1 : null;
        const title = typeof v.title === 'string' ? v.title : null;
        const sizeRaw = option1 ?? title;
        if (!sizeRaw?.trim()) continue;
        const code = normalizeGloveSizeCode(sizeRaw);
        if (!code) continue;
        const sku = typeof v.sku === 'string' ? v.sku.trim() : null;
        out.push({
          rawLabel: sizeRaw.trim(),
          normalizedCode: code,
          manufacturerSku: sku,
          source: 'select_option',
          confidence: 0.9,
          evidenceText: sku ?? sizeRaw,
        });
      }
    } catch {
      /* ignore malformed JSON */
    }
  }
  return out;
}

function extractSizesFromSelectOptions(html: string): SizeCandidate[] {
  const out: SizeCandidate[] = [];
  const selectBlocks = html.match(/<select[^>]*(?:size|variant)[^>]*>[\s\S]*?<\/select>/gi) ?? [];
  const blocks = selectBlocks.length > 0 ? selectBlocks : html.match(/<select[^>]*>[\s\S]*?<\/select>/gi) ?? [];
  for (const block of blocks) {
    if (!/size|variant|option/i.test(block)) continue;
    for (const m of block.matchAll(/<option[^>]*>([\s\S]*?)<\/option>/gi)) {
      const optTag = m[0] ?? '';
      const label = (m[1] ?? '').replace(/<[^>]+>/g, '').trim();
      if (!label || /select|choose|size/i.test(label) && label.length < 12) continue;
      const code = normalizeGloveSizeCode(label);
      if (!code) continue;
      const valueMatch = optTag.match(/\bvalue=["']([^"']+)["']/i);
      const dataSku = optTag.match(/\bdata-(?:sku|mpn)=["']([^"']+)["']/i);
      const dataSize = optTag.match(/\bdata-size=["']([^"']+)["']/i);
      const rawLabel = dataSize?.[1]?.trim() || label;
      const sku = dataSku?.[1]?.trim() || valueMatch?.[1]?.trim() || null;
      const manufacturerSku = sku && /[A-Z0-9-]/i.test(sku) ? sku : null;
      out.push({
        rawLabel,
        normalizedCode: code,
        manufacturerSku,
        source: 'select_option',
        confidence: 0.9,
        evidenceText: manufacturerSku ? `${rawLabel} (${manufacturerSku})` : rawLabel,
      });
    }
  }
  return out;
}

function extractSizesFromVariantTiles(html: string): SizeCandidate[] {
  const out: SizeCandidate[] = [];
  const re =
    /<(button|a|label|div|span)[^>]*\bdata-(?:size|variant-size)=["']([^"']+)["'][^>]*(?:data-(?:sku|mpn)=["']([^"']+)["'])?[^>]*>([\s\S]*?)<\/\1>/gi;
  for (const m of html.matchAll(re)) {
    const rawLabel = (m[2] ?? m[4] ?? '').replace(/<[^>]+>/g, '').trim();
    if (!rawLabel) continue;
    const code = normalizeGloveSizeCode(rawLabel);
    if (!code) continue;
    const sku = m[3]?.trim() || null;
    out.push({
      rawLabel,
      normalizedCode: code,
      manufacturerSku: sku,
      source: 'variant_tile',
      confidence: 0.9,
      evidenceText: sku ? `${rawLabel} (${sku})` : rawLabel,
    });
  }
  return out;
}

function extractSizesFromSpecTables(html: string): SizeCandidate[] {
  const out: SizeCandidate[] = [];
  const tables = extractTables(html);
  for (const table of tables) {
    for (const row of table.rows) {
      if (row.length < 2) continue;
      const key = row[0]!.toLowerCase().trim();
      const value = row[1]!.trim();
      if (!/(available\s*)?sizes?|size\s*options?|options/i.test(key)) continue;
      for (const part of parseSizeListText(value)) {
        const code = normalizeGloveSizeCode(part);
        if (!code) continue;
        out.push({
          rawLabel: part,
          normalizedCode: code,
          manufacturerSku: null,
          source: 'spec_table',
          confidence: 0.8,
          evidenceText: value,
        });
      }
    }
  }
  return out;
}

function extractSizesFromTextFallback(pageText: string): SizeCandidate[] {
  const out: SizeCandidate[] = [];
  const listPatterns = [
    /available\s+(?:in\s+)?sizes?\s*[:\-]?\s*([^.;\n]+)/i,
    /sizes?\s*available\s*[:\-]?\s*([^.;\n]+)/i,
    /available\s+(?:in\s+)?([Xx][\s-]?[Ss]mall[^.;]+)/i,
  ];
  for (const re of listPatterns) {
    const m = pageText.match(re);
    if (!m?.[1]) continue;
    for (const part of parseSizeListText(m[1])) {
      const code = normalizeGloveSizeCode(part);
      if (!code) continue;
      out.push({
        rawLabel: part,
        normalizedCode: code,
        manufacturerSku: null,
        source: 'text_fallback',
        confidence: 0.45,
        evidenceText: m[0],
      });
    }
  }
  return out;
}

function inferSkuForSize(baseSku: string, code: string): string | null {
  const suffixMap: Record<string, string> = {
    XS: 'XS',
    S: 'S',
    M: 'M',
    L: 'L',
    XL: 'XL',
    XXL: 'XXL',
    XXXL: 'XXXL',
  };
  const suffix = suffixMap[code];
  if (!suffix) return null;
  if (/-[A-Z0-9]+$/i.test(baseSku)) {
    return baseSku.replace(/-[A-Z0-9]+$/i, `-${suffix}`);
  }
  return `${baseSku}-${suffix}`;
}

function parseMainProductIdCsv(html: string): string[] {
  const skus: string[] = [];
  const patterns = [
    /name=["']MainProductId["'][^>]*\bvalue=["']([^"']+)["']/gi,
    /\bvalue=["']([^"']+)["'][^>]*name=["']MainProductId["']/gi,
  ];
  for (const re of patterns) {
    for (const m of html.matchAll(re)) {
      const csv = m[1] ?? "";
      for (const part of csv.split(",")) {
        const t = part.trim();
        if (t) skus.push(t);
      }
    }
  }
  return skus;
}

function collectPageProductSkus(
  html: string,
  url?: string,
  jsonLd?: Record<string, unknown>[]
): string[] {
  const skus = new Set<string>();

  for (const item of jsonLd ?? []) {
    const type = String(item["@type"] ?? "").toLowerCase();
    if (!type.includes("product")) continue;
    const sku = typeof item.sku === "string" ? item.sku.trim() : null;
    if (sku) skus.add(sku);
    const mpn = typeof item.mpn === "string" ? item.mpn.trim() : null;
    if (mpn) skus.add(mpn);
  }

  for (const m of html.matchAll(/itemprop=["']sku["'][^>]*>([^<]+)</gi)) {
    const t = m[1]?.trim();
    if (t) skus.add(t);
  }

  if (url?.trim()) {
    const upper = url.toUpperCase();
    for (const m of upper.matchAll(/\b(GL-N125(?:FXS|FS|FM|FL|FX))\b/g)) {
      skus.add(m[1]!);
    }
    const slug = url.match(/gl-n125(fxs|fs|fm|fl|fx)\b/i);
    if (slug?.[1]) {
      skus.add(`GL-N125${slug[1].toUpperCase()}`);
    }
  }

  const productSkuMatch = html.match(/\bSKU\s*[:#]?\s*([A-Z0-9-]{4,})\b/i);
  if (productSkuMatch?.[1]?.trim()) skus.add(productSkuMatch[1].trim());

  return [...skus];
}

function canonicalizeSizeCandidate(row: SizeCandidate): SizeCandidate {
  if (!row.manufacturerSku) return row;
  const decoded = decodeHospecoCompactManufacturerSku(row.manufacturerSku);
  if (!decoded) return row;
  const evidence =
    row.evidenceText && row.evidenceText.includes(decoded.rawSku)
      ? row.evidenceText
      : [row.evidenceText, `raw:${decoded.rawSku}`].filter(Boolean).join("; ");
  return {
    ...row,
    normalizedCode: decoded.normalizedCode,
    rawLabel: sizeLabelFromCode(decoded.normalizedCode),
    manufacturerSku: decoded.canonicalSku,
    evidenceText: evidence,
  };
}

function extractSizesFromMainProductId(
  html: string,
  url?: string,
  jsonLd?: Record<string, unknown>[]
): { candidates: SizeCandidate[]; warnings: string[] } {
  const warnings: string[] = [];
  const csvSkus = parseMainProductIdCsv(html);
  const pageSkus = collectPageProductSkus(html, url, jsonLd);
  const allRaw = [...new Set([...csvSkus, ...pageSkus].map((s) => s.trim()).filter(Boolean))];
  if (allRaw.length === 0) return { candidates: [], warnings };

  const decoded = allRaw
    .map((raw) => ({ raw, info: decodeHospecoCompactManufacturerSku(raw) }))
    .filter((row): row is { raw: string; info: NonNullable<typeof row.info> } => Boolean(row.info));

  if (decoded.length === 0) return { candidates: [], warnings };

  const bases = new Set(
    decoded.map((d) => d.info.canonicalSku.replace(/-(XS|S|M|L|XL|XXL|XXXL)$/, ""))
  );
  const singleBase = bases.size === 1;
  const multiFromCsv = csvSkus.length >= 2;
  const pageConfirmed =
    pageSkus.length === 0 ||
    pageSkus.some((sku) => {
      const info = decodeHospecoCompactManufacturerSku(sku);
      return info && bases.has(info.canonicalSku.replace(/-(XS|S|M|L|XL|XXL|XXXL)$/, ""));
    });

  let confidence = 0.75;
  if (multiFromCsv && singleBase && pageConfirmed) confidence = 0.88;
  else if (multiFromCsv && singleBase) confidence = 0.88;

  if (decoded.some((d) => d.raw !== d.info.canonicalSku)) {
    warnings.push("Size options inferred from Hospeco compact MainProductId SKU suffixes.");
  }

  const bySize = new Map<string, (typeof decoded)[number]>();
  for (const row of decoded) {
    if (!bySize.has(row.info.normalizedCode)) bySize.set(row.info.normalizedCode, row);
  }

  const candidates = [...bySize.values()].map(({ raw, info }) => ({
    rawLabel: sizeLabelFromCode(info.normalizedCode),
    normalizedCode: info.normalizedCode,
    manufacturerSku: info.canonicalSku,
    source: "main_product_id" as const,
    confidence,
    evidenceText: `MainProductId:${raw}`,
  }));

  return { candidates, warnings };
}

function extractSizesFromUrl(url?: string): SizeCandidate[] {
  if (!url?.trim()) return [];
  const out: SizeCandidate[] = [];
  for (const m of url.toUpperCase().matchAll(/\b(GL-N125(?:FXS|FS|FM|FL|FX))\b/g)) {
    const decoded = decodeHospecoCompactManufacturerSku(m[1]!);
    if (decoded && !out.some((s) => s.normalizedCode === decoded.normalizedCode)) {
      out.push({
        rawLabel: sizeLabelFromCode(decoded.normalizedCode),
        normalizedCode: decoded.normalizedCode,
        manufacturerSku: decoded.canonicalSku,
        source: "url_pattern",
        confidence: 0.55,
        evidenceText: url,
      });
    }
  }

  const skuSizeMatch = url.match(/([A-Z]{2,}-[A-Z0-9]+-([XSML]{1,2}|XL|XXL|XXXL))\b/i);
  if (skuSizeMatch) {
    const fullSku = skuSizeMatch[1]!.toUpperCase();
    const suffix = skuSizeMatch[2]!.toUpperCase();
    const code = normalizeGloveSizeCode(suffix);
    if (code && !out.some((s) => s.normalizedCode === code)) {
      out.push({
        rawLabel: sizeLabelFromCode(code),
        normalizedCode: code,
        manufacturerSku: canonicalizeManufacturerSku(fullSku),
        source: 'url_pattern',
        confidence: 0.55,
        evidenceText: url,
      });
    }
  }
  const slugSizeMatch = url.match(/[-_/](xs|xl|xxl|xxxl|small|medium|large|x-small|x-large)[-/_.]/i);
  if (slugSizeMatch?.[1]) {
    const code = normalizeGloveSizeCode(slugSizeMatch[1]);
    if (code && !out.some((s) => s.normalizedCode === code)) {
      out.push({
        rawLabel: sizeLabelFromCode(code),
        normalizedCode: code,
        manufacturerSku: null,
        source: 'url_pattern',
        confidence: 0.55,
        evidenceText: url,
      });
    }
  }
  return out;
}

/** Extract glove size options with manufacturer SKU evidence from HTML. */
export function extractSizeOptionsFromHtml(
  html: string,
  pageText: string,
  url?: string
): { sizes: ExtractedSizeOption[]; warnings: string[] } {
  const warnings: string[] = [];
  const jsonLd = extractJsonLd(html);
  const byCode = new Map<string, SizeCandidate>();

  const structuredSources: SizeOptionSource[] = [
    'json_ld',
    'select_option',
    'variant_tile',
    'spec_table',
    'main_product_id',
  ];

  for (const c of extractSizesFromJsonLd(jsonLd)) upsertSizeCandidate(byCode, c);
  for (const c of extractSizesFromEmbeddedVariants(html)) upsertSizeCandidate(byCode, c);
  for (const c of extractSizesFromSelectOptions(html)) upsertSizeCandidate(byCode, c);
  for (const c of extractSizesFromVariantTiles(html)) upsertSizeCandidate(byCode, c);
  for (const c of extractSizesFromSpecTables(html)) upsertSizeCandidate(byCode, c);

  const mainProductId = extractSizesFromMainProductId(html, url, jsonLd);
  warnings.push(...mainProductId.warnings);
  for (const c of mainProductId.candidates) upsertSizeCandidate(byCode, c);

  const hasStructured = [...byCode.values()].some((s) => structuredSources.includes(s.source));

  if (!hasStructured) {
    for (const c of extractSizesFromTextFallback(pageText)) upsertSizeCandidate(byCode, c);
  }

  for (const c of extractSizesFromUrl(url)) {
    const prev = byCode.get(c.normalizedCode);
    if (prev && !prev.manufacturerSku && c.manufacturerSku) {
      upsertSizeCandidate(byCode, { ...prev, manufacturerSku: c.manufacturerSku, evidenceText: c.evidenceText });
    } else if (!prev) {
      upsertSizeCandidate(byCode, c);
    }
  }

  if (byCode.size === 0) {
    return { sizes: [], warnings };
  }

  const onlyFallback = [...byCode.values()].every((s) => s.source === 'text_fallback' || s.source === 'url_pattern');
  if (onlyFallback && [...byCode.values()].some((s) => s.source === 'text_fallback')) {
    warnings.push('Size options came from text fallback and should be reviewed.');
  }

  const productSkuMatch = html.match(/\bSKU\s*[:#]?\s*([A-Z0-9-]{4,})\b/i);
  const baseSku = productSkuMatch?.[1]?.trim() ?? null;
  if (baseSku && !hasStructured) {
    for (const [code, row] of byCode) {
      if (!row.manufacturerSku) {
        const inferred = inferSkuForSize(baseSku, code);
        if (inferred) {
          byCode.set(code, {
            ...row,
            manufacturerSku: inferred,
            confidence: Math.min(row.confidence, 0.65),
            evidenceText: `Inferred from product SKU ${baseSku}`,
          });
        }
      }
    }
  }

  const sortedCodes = sortGloveSizeCodes([...byCode.keys()]);
  const sizes: ExtractedSizeOption[] = sortedCodes.map((code) => {
    const row = canonicalizeSizeCandidate(byCode.get(code)!);
    return {
      rawLabel: row.rawLabel,
      normalizedCode: row.normalizedCode,
      manufacturerSku: row.manufacturerSku,
      source: row.source,
      confidence: row.confidence,
      evidenceText: row.evidenceText,
    };
  });

  return { sizes, warnings };
}

// ============================================================================
// MAIN EXTRACTION FUNCTION
// ============================================================================

/**
 * Extract product data from HTML content.
 */
export function extractProductFromHtml(html: string, sourceUrl?: string): ExtractionResult {
  const sources: string[] = [];
  const warnings: string[] = [];
  const field_scores: Record<string, number> = {};
  
  // Initialize extracted data
  const extracted: ExtractedProductData = {};
  const raw_data: ExtractionResult['raw_data'] = {};
  
  // =========================================================================
  // 1. Extract JSON-LD structured data (highest priority)
  // =========================================================================
  const jsonLd = extractJsonLd(html);
  raw_data.json_ld = jsonLd;
  
  if (jsonLd.length > 0) {
    sources.push('JSON-LD');
    extractFromJsonLd(jsonLd, extracted, field_scores);
  }
  
  // =========================================================================
  // 2. Extract meta tags
  // =========================================================================
  const metaTags = extractMetaTags(html);
  raw_data.meta_tags = metaTags;
  
  if (Object.keys(metaTags).length > 0) {
    sources.push('meta tags');
    extractFromMetaTags(metaTags, extracted, field_scores);
  }
  
  // =========================================================================
  // 3. Extract from tables (spec tables)
  // =========================================================================
  const tables = extractTables(html);
  raw_data.spec_tables = tables;
  
  if (tables.length > 0) {
    sources.push('spec tables');
    const specTable = extractFromTables(tables, extracted, field_scores);
    if (specTable) {
      extracted.spec_table = specTable;
    }
  }
  
  // =========================================================================
  // 4. Extract title
  // =========================================================================
  const pageTitle = extractTitle(html);
  if (pageTitle && !extracted.title) {
    extracted.title = cleanTitle(pageTitle);
    field_scores.title = 0.8;
    sources.push('page title');
  }
  
  // =========================================================================
  // 5. Heuristic extraction from text content
  // =========================================================================
  const textContent = extractTextContent(html);
  extractFromText(textContent, extracted, field_scores, warnings);

  // =========================================================================
  // 5a. Structured multi-size + manufacturer SKU extraction
  // =========================================================================
  const sizeExtraction = extractSizeOptionsFromHtml(html, textContent, sourceUrl);
  if (sizeExtraction.sizes.length > 0) {
    extracted.size_options = sizeExtraction.sizes;
    extracted.sizes_available = sizeExtraction.sizes.map((s) => s.rawLabel);
    warnings.push(...sizeExtraction.warnings);
    sources.push('size options');
    field_scores.sizes_available = Math.max(
      field_scores.sizes_available ?? 0,
      ...sizeExtraction.sizes.map((s) => s.confidence)
    );
    if (sizeExtraction.sizes.length === 1) {
      extracted.size = sizeExtraction.sizes[0]!.normalizedCode;
      field_scores.size = sizeExtraction.sizes[0]!.confidence;
    } else {
      const urlSize = sizeExtraction.sizes.find((s) => s.source === 'url_pattern');
      if (urlSize) {
        extracted.size = urlSize.normalizedCode;
        field_scores.size = urlSize.confidence;
      }
    }
  }

  // =========================================================================
  // 5b. Product gallery images (JSON-LD + HTML img tags)
  // =========================================================================
  const galleryImages = extractProductImages(html, jsonLd, sourceUrl);
  if (galleryImages.length > 0) {
    extracted.images = galleryImages;
    field_scores.images = Math.min(0.95, 0.7 + galleryImages.length * 0.05);
    sources.push('product images');
  }
  
  // =========================================================================
  // 6. Normalize and validate extracted data
  // =========================================================================
  normalizeExtractedData(extracted);
  
  // Calculate overall confidence
  const scores = Object.values(field_scores);
  const overallConfidence = scores.length > 0
    ? scores.reduce((a, b) => a + b, 0) / scores.length
    : 0;
  
  // Generate summary
  const extractedFields = Object.keys(extracted).filter(k => 
    extracted[k as keyof ExtractedProductData] !== undefined
  );
  
  const summary = extractedFields.length > 0
    ? `Extracted ${extractedFields.length} fields from ${sources.join(', ')}`
    : 'Failed to extract product data';

  const commerce_packaging = extractCommercePackagingFromHtml({
    html,
    pageText: textContent,
    url: sourceUrl,
    specTable: extracted.spec_table,
    jsonLd,
    metaTags,
  });
  
  return {
    success: extractedFields.length >= 2,
    extracted,
    commerce_packaging,
    confidence: {
      overall: overallConfidence,
      field_scores,
    },
    reasoning: {
      summary,
      sources,
      warnings,
    },
    raw_data,
  };
}

// ============================================================================
// JSON-LD EXTRACTION
// ============================================================================

function extractFromJsonLd(
  jsonLd: Record<string, unknown>[],
  extracted: ExtractedProductData,
  scores: Record<string, number>
): void {
  for (const item of jsonLd) {
    const type = String(item['@type'] || '').toLowerCase();
    
    if (type === 'product' || type.includes('product')) {
      // Product schema
      if (item.name && !extracted.title) {
        extracted.title = String(item.name);
        scores.title = 1.0;
      }
      
      if (item.description && !extracted.description) {
        extracted.description = String(item.description);
        scores.description = 1.0;
      }
      
      if (item.sku && !extracted.sku) {
        extracted.sku = String(item.sku);
        scores.sku = 1.0;
      }
      
      if (item.mpn && !extracted.mpn) {
        extracted.mpn = String(item.mpn);
        scores.mpn = 1.0;
      }
      
      if (item.gtin || item.gtin12 || item.gtin13 || item.gtin14) {
        extracted.upc = String(item.gtin || item.gtin12 || item.gtin13 || item.gtin14);
        scores.upc = 1.0;
      }
      
      if (item.brand) {
        const brand = typeof item.brand === 'object' 
          ? (item.brand as Record<string, unknown>).name 
          : item.brand;
        if (brand) {
          extracted.brand = String(brand);
          scores.brand = 1.0;
        }
      }
      
      if (item.manufacturer) {
        const mfr = typeof item.manufacturer === 'object'
          ? (item.manufacturer as Record<string, unknown>).name
          : item.manufacturer;
        if (mfr) {
          extracted.manufacturer = String(mfr);
          scores.manufacturer = 1.0;
        }
      }
      
      // Price
      if (item.offers) {
        const offers = Array.isArray(item.offers) ? item.offers[0] : item.offers;
        if (offers && typeof offers === 'object') {
          const offersObj = offers as Record<string, unknown>;
          if (offersObj.price) {
            extracted.price = parseFloat(String(offersObj.price));
            scores.price = 0.9;
          }
        }
      }

      appendJsonLdImages(item.image, extracted);
      
      // Additional properties
      if (item.additionalProperty && Array.isArray(item.additionalProperty)) {
        for (const prop of item.additionalProperty) {
          if (prop && typeof prop === 'object') {
            const propObj = prop as Record<string, unknown>;
            const name = String(propObj.name || '').toLowerCase();
            const value = propObj.value;
            
            if (name.includes('material') && value) {
              extracted.material = String(value);
              scores.material = 0.95;
            }
            if (name.includes('size') && value) {
              extracted.size = String(value);
              scores.size = 0.95;
            }
            if (name.includes('color') && value) {
              extracted.color = String(value);
              scores.color = 0.95;
            }
          }
        }
      }
    }
  }
}

// ============================================================================
// META TAG EXTRACTION
// ============================================================================

function extractFromMetaTags(
  meta: Record<string, string>,
  extracted: ExtractedProductData,
  scores: Record<string, number>
): void {
  // OG tags
  if (meta['og:title'] && !extracted.title) {
    extracted.title = cleanTitle(meta['og:title']);
    scores.title = Math.max(scores.title || 0, 0.85);
  }
  
  if (meta['og:description'] && !extracted.description) {
    extracted.description = meta['og:description'];
    scores.description = Math.max(scores.description || 0, 0.85);
  }
  
  // Product-specific meta tags
  if (meta['product:brand'] && !extracted.brand) {
    extracted.brand = meta['product:brand'];
    scores.brand = 0.9;
  }
  
  if (meta['product:price:amount'] && !extracted.price) {
    extracted.price = parseFloat(meta['product:price:amount']);
    scores.price = 0.85;
  }
  
  // Twitter cards
  if (meta['twitter:title'] && !extracted.title) {
    extracted.title = cleanTitle(meta['twitter:title']);
    scores.title = Math.max(scores.title || 0, 0.8);
  }
}

// ============================================================================
// TABLE EXTRACTION
// ============================================================================

function extractFromTables(
  tables: Array<{ headers: string[]; rows: string[][] }>,
  extracted: ExtractedProductData,
  scores: Record<string, number>
): Record<string, string> | null {
  const specTable: Record<string, string> = {};
  
  for (const table of tables) {
    // Look for key-value pairs in 2-column tables
    if (table.rows.length > 0) {
      for (const row of table.rows) {
        if (row.length >= 2) {
          const key = row[0].toLowerCase().trim();
          const value = row[1].trim();
          
          if (key && value) {
            specTable[key] = value;
            
            // Try to match against known fields
            for (const [field, aliases] of Object.entries(SPEC_TABLE_KEYS)) {
              if (aliases.some(alias => key.includes(alias))) {
                mapSpecValue(field, value, extracted, scores);
              }
            }
          }
        }
      }
    }
  }
  
  return Object.keys(specTable).length > 0 ? specTable : null;
}

function mapSpecValue(
  field: string,
  value: string,
  extracted: ExtractedProductData,
  scores: Record<string, number>
): void {
  switch (field) {
    case 'item_number':
      if (!extracted.item_number) {
        extracted.item_number = value;
        scores.item_number = 0.95;
      }
      break;
    case 'sku':
      if (!extracted.sku) {
        extracted.sku = value;
        scores.sku = 0.95;
      }
      break;
    case 'mpn':
      if (!extracted.mpn) {
        extracted.mpn = value;
        scores.mpn = 0.95;
      }
      break;
    case 'upc':
      if (!extracted.upc) {
        extracted.upc = value.replace(/[^0-9]/g, '');
        scores.upc = 0.95;
      }
      break;
    case 'brand':
      if (!extracted.brand) {
        extracted.brand = value;
        scores.brand = 0.9;
      }
      break;
    case 'manufacturer':
      if (!extracted.manufacturer) {
        extracted.manufacturer = value;
        scores.manufacturer = 0.9;
      }
      break;
    case 'material':
      if (!extracted.material) {
        extracted.material = normalizeMaterial(value);
        scores.material = 0.9;
      }
      break;
    case 'size':
      if (!extracted.size) {
        extracted.size = normalizeSize(value);
        scores.size = 0.9;
      }
      break;
    case 'color':
      if (!extracted.color) {
        extracted.color = extractColorPhrase(value) ?? value.trim();
        scores.color = 0.9;
      }
      break;
    case 'thickness':
      if (!extracted.thickness_mil) {
        const milMatch = value.match(/(\d+\.?\d*)\s*mil/i);
        if (milMatch) {
          extracted.thickness_mil = parseFloat(milMatch[1]);
          scores.thickness_mil = 0.95;
        }
      }
      break;
    case 'pack_size':
      if (!extracted.pack_size) {
        const numMatch = value.match(/(\d+)/);
        if (numMatch) {
          extracted.pack_size = parseInt(numMatch[1]);
          scores.pack_size = 0.9;
        }
      }
      break;
    case 'units_per_case':
      if (!extracted.total_units_per_case) {
        const numMatch = value.match(/(\d+)/);
        if (numMatch) {
          extracted.total_units_per_case = parseInt(numMatch[1]);
          scores.total_units_per_case = 0.9;
        }
      }
      break;
    case 'powder_free':
      extracted.powder_free = /yes|true|powder.?free/i.test(value);
      scores.powder_free = 0.95;
      break;
    case 'latex_free':
      extracted.latex_free = /yes|true|latex.?free/i.test(value);
      scores.latex_free = 0.95;
      break;
    case 'sterile':
      extracted.sterile = /yes|true|sterile/i.test(value);
      scores.sterile = 0.95;
      break;
    case 'exam_grade':
      extracted.exam_grade = /yes|true|exam|medical/i.test(value);
      scores.exam_grade = 0.9;
      break;
    case 'food_safe':
      extracted.food_safe = /yes|true|food/i.test(value);
      scores.food_safe = 0.9;
      break;
  }
}

// ============================================================================
// TEXT CONTENT EXTRACTION (HEURISTICS)
// ============================================================================

function extractFromText(
  text: string,
  extracted: ExtractedProductData,
  scores: Record<string, number>,
  warnings: string[]
): void {
  // Extract material if not already found
  if (!extracted.material) {
    for (const [material, patterns] of Object.entries(MATERIAL_PATTERNS)) {
      if (patterns.some(p => p.test(text))) {
        extracted.material = material;
        scores.material = 0.7;
        break;
      }
    }
  }
  
  // Extract sizes available
  const sizesFound: string[] = [];
  for (const [size, patterns] of Object.entries(SIZE_PATTERNS)) {
    if (patterns.some(p => p.test(text))) {
      sizesFound.push(size);
    }
  }
  if (sizesFound.length > 0) {
    extracted.sizes_available = sizesFound;
    if (!extracted.size && sizesFound.length === 1) {
      extracted.size = sizesFound[0];
      scores.size = 0.6;
    } else if (sizesFound.length > 1) {
      warnings.push('Multiple sizes detected - may need to specify');
    }
  }
  
  // Extract colors available
  const colorsFound: string[] = [];
  for (const [color, patterns] of Object.entries(COLOR_PATTERNS)) {
    if (patterns.some(p => p.test(text))) {
      colorsFound.push(color);
    }
  }
  if (colorsFound.length > 0) {
    extracted.colors_available = colorsFound;
    if (!extracted.color && colorsFound.length === 1) {
      extracted.color = colorsFound[0];
      scores.color = 0.6;
    }
  }
  
  // Extract thickness
  if (!extracted.thickness_mil) {
    const milMatch = text.match(/(\d+\.?\d*)\s*mil\b/i);
    if (milMatch) {
      extracted.thickness_mil = parseFloat(milMatch[1]);
      scores.thickness_mil = 0.7;
    }
  }
  
  // Extract pack size patterns — title patterns like "10x200" (10 boxes × 200 gloves)
  if (!extracted.pack_size || !extracted.boxes_per_case) {
    const caseBoxMatch = text.match(/\b(\d{1,3})\s*[x×]\s*(\d{2,5})\b/);
    if (caseBoxMatch) {
      const boxes = parseInt(caseBoxMatch[1]!, 10);
      const perBox = parseInt(caseBoxMatch[2]!, 10);
      if (Number.isFinite(boxes) && Number.isFinite(perBox) && boxes > 0 && perBox > 0) {
        extracted.boxes_per_case = boxes;
        extracted.pack_size = perBox;
        extracted.units_per_box = perBox;
        extracted.total_units_per_case = boxes * perBox;
        scores.pack_size = 0.9;
        scores.total_units_per_case = 0.9;
      }
    }
  }

  if (!extracted.pack_size) {
    const packPatterns = [
      /(\d+)\s*(?:ct|count|pcs|pieces|gloves)\s*(?:per|\/)\s*box/i,
      /(\d+)\s*(?:ct|count|per box)/i,
      /box\s*of\s*(\d+)/i,
    ];
    for (const pattern of packPatterns) {
      const match = text.match(pattern);
      if (match) {
        extracted.pack_size = parseInt(match[1]);
        scores.pack_size = 0.7;
        break;
      }
    }
  }
  
  // Extract case quantity
  if (!extracted.total_units_per_case) {
    const caseMatch = text.match(/(\d+)\s*(?:per case|\/case|gloves per case)/i);
    if (caseMatch) {
      extracted.total_units_per_case = parseInt(caseMatch[1]);
      scores.total_units_per_case = 0.7;
    }
  }
  
  // Detect product flags from text
  if (extracted.powder_free === undefined) {
    extracted.powder_free = /powder.?free/i.test(text);
    if (extracted.powder_free) scores.powder_free = 0.8;
  }
  
  if (extracted.latex_free === undefined) {
    extracted.latex_free = /latex.?free/i.test(text) || extracted.material === 'nitrile' || extracted.material === 'vinyl';
    if (extracted.latex_free) scores.latex_free = extracted.material === 'latex' ? 0 : 0.75;
  }
  
  if (extracted.exam_grade === undefined) {
    extracted.exam_grade = /exam(?:ination)?\s*(?:grade|quality)/i.test(text);
    if (extracted.exam_grade) scores.exam_grade = 0.75;
  }

  if (extracted.food_safe === undefined) {
    if (/FDA\s+CFR|Indirect\s+Food\s+Add|food[\s-]?contact/i.test(text)) {
      extracted.food_safe = true;
      scores.food_safe = 0.9;
    }
  }

  const certSlugs = new Set<string>(extracted.certifications ?? []);
  if (/ASTM\s+D6319/i.test(text)) certSlugs.add('astm_d6319');
  if (/ASTM\s+D3578/i.test(text)) certSlugs.add('astm_d3578');
  if (/ASTM\s+D5250/i.test(text)) certSlugs.add('astm_d5250');
  if (/FDA\s+CFR|Indirect\s+Food\s+Add|FDA\s+Food\s+Contact/i.test(text)) {
    certSlugs.add('fda_food_contact');
    extracted.food_safe = true;
  }
  if (certSlugs.size > 0) {
    extracted.certifications = Array.from(certSlugs);
    scores.certifications = 0.9;
  }
  
  // Extract item number patterns
  if (!extracted.item_number) {
    const itemPatterns = [
      /item\s*#?\s*[:.]?\s*([A-Z0-9-]+)/i,
      /part\s*#?\s*[:.]?\s*([A-Z0-9-]+)/i,
      /product\s*code\s*[:.]?\s*([A-Z0-9-]+)/i,
    ];
    for (const pattern of itemPatterns) {
      const match = text.match(pattern);
      if (match) {
        extracted.item_number = match[1].trim();
        scores.item_number = 0.6;
        break;
      }
    }
  }
}

// ============================================================================
// NORMALIZATION HELPERS
// ============================================================================

function cleanTitle(title: string): string {
  return title
    .replace(/\s*[-|]\s*.+$/, '') // Remove site name suffix
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeMaterial(value: string): string {
  const lower = value.toLowerCase();
  for (const [material, patterns] of Object.entries(MATERIAL_PATTERNS)) {
    if (patterns.some(p => p.test(lower))) {
      return material;
    }
  }
  return value;
}

function normalizeSize(value: string): string {
  const lower = value.toLowerCase().trim();
  
  // Check in order from most specific to least specific
  const sizeOrder = ['XXL', 'XL', 'XS', 'L', 'M', 'S'];
  for (const size of sizeOrder) {
    const patterns = SIZE_PATTERNS[size];
    if (patterns && patterns.some(p => p.test(lower))) {
      return size;
    }
  }
  return value.toUpperCase();
}

/** Infer brand from leading title tokens before product-type descriptors. */
export function inferBrandFromTitle(title: string): string | null {
  const cleaned = title
    .replace(/[®™©]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;

  const head = cleaned.split(/\s*[-–|]\s*/)[0] ?? cleaned;
  const tokens = head.split(/\s+/).filter(Boolean);
  const brandTokens: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]!;
    if (i > 0 && extractColorPhraseAtStart(tokens.slice(i).join(" "))) break;

    const normalized = tok.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!normalized || TITLE_BRAND_STOP_WORDS.has(normalized)) break;
    if (/^\d/.test(tok)) break;
    brandTokens.push(tok);
    if (brandTokens.length >= 4) break;
  }

  if (brandTokens.length === 0) return null;
  const brand = brandTokens
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
  return brand.length >= 2 ? brand : null;
}

function titleCasePhrase(phrase: string): string {
  return phrase
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/** Color phrase anchored at the start of text (for brand vs color boundary). */
export function extractColorPhraseAtStart(text: string): string | null {
  const t = text.trim();
  if (!t) return null;

  for (const phrase of COLOR_PHRASES) {
    const re = new RegExp(`^${phrase.replace(/\s+/g, "\\s+")}\\b`, "i");
    if (re.test(t)) return titleCasePhrase(phrase);
  }

  const first = t.split(/\s+/)[0] ?? "";
  for (const [slug, patterns] of Object.entries(COLOR_PATTERNS)) {
    if (patterns.some((p) => p.test(first))) {
      return slug === "purple" && /\bviolet\b/i.test(t) ? "Violet" : titleCasePhrase(slug);
    }
  }

  return null;
}

/** Extract multi-token or single color phrases from text (title, spec, meta). */
export function extractColorPhrase(text: string): string | null {
  if (!text.trim()) return null;

  for (const phrase of COLOR_PHRASES) {
    const re = new RegExp(`\\b${phrase.replace(/\s+/g, "\\s+")}\\b`, "i");
    if (re.test(text)) return titleCasePhrase(phrase);
  }

  for (const [slug, patterns] of Object.entries(COLOR_PATTERNS)) {
    if (patterns.some((p) => p.test(text))) {
      return slug === "purple" && /\bviolet\b/i.test(text) ? "Violet" : titleCasePhrase(slug);
    }
  }

  return null;
}

function normalizeExtractedData(extracted: ExtractedProductData): void {
  // Clean up strings
  if (extracted.title) {
    extracted.title = extracted.title.trim();
  }
  if (extracted.description) {
    extracted.description = extracted.description.trim().substring(0, 2000);
  }

  if (!extracted.brand && !extracted.manufacturer && extracted.title) {
    const inferred = inferBrandFromTitle(extracted.title);
    if (inferred) extracted.brand = inferred;
  }

  if (!extracted.color) {
    const colorBlob = [extracted.title, extracted.description, JSON.stringify(extracted.spec_table ?? {})].join(
      "\n"
    );
    const colorPhrase = extractColorPhrase(colorBlob);
    if (colorPhrase) extracted.color = colorPhrase;
  }

  // Normalize material
  if (extracted.material) {
    extracted.material = normalizeMaterial(extracted.material);
  }

  // Normalize size
  if (extracted.size) {
    extracted.size = normalizeSize(extracted.size);
  }
  
  // Calculate units_per_box and boxes_per_case if we have total
  if (extracted.total_units_per_case && extracted.pack_size && !extracted.boxes_per_case) {
    const boxes = extracted.total_units_per_case / extracted.pack_size;
    if (Number.isInteger(boxes)) {
      extracted.boxes_per_case = boxes;
      extracted.units_per_box = extracted.pack_size;
    }
  }
  
  // Set units_per_box from pack_size if not set
  if (!extracted.units_per_box && extracted.pack_size) {
    extracted.units_per_box = extracted.pack_size;
  }
  
  // Calculate price per unit
  if (extracted.price && extracted.pack_size) {
    extracted.price_per_unit = extracted.price / extracted.pack_size;
  }
  
  // Collect all attributes
  extracted.all_attributes = { ...extracted };
}

function appendJsonLdImages(raw: unknown, extracted: ExtractedProductData): void {
  if (!raw) return;
  const list = Array.isArray(raw) ? raw : [raw];
  for (const entry of list) {
    if (typeof entry === 'string' && entry.trim()) {
      const arr = extracted.images ?? [];
      if (!arr.includes(entry.trim())) arr.push(entry.trim());
      extracted.images = arr;
    } else if (entry && typeof entry === 'object') {
      const obj = entry as Record<string, unknown>;
      if (typeof obj.url === 'string') appendJsonLdImages(obj.url, extracted);
      if (typeof obj.contentUrl === 'string') appendJsonLdImages(obj.contentUrl, extracted);
    }
  }
}

const IMAGE_SKIP_RE = /logo|icon|badge|spinner|placeholder|payment|avatar|favicon/i;

function resolveImageUrl(raw: string, sourceUrl?: string): string | null {
  const t = raw.trim();
  if (!t || t.startsWith('data:')) return null;
  if (IMAGE_SKIP_RE.test(t)) return null;
  try {
    if (t.startsWith('//')) return `https:${t}`;
    if (t.startsWith('http://') || t.startsWith('https://')) return t;
    if (sourceUrl && t.startsWith('/')) return new URL(t, sourceUrl).toString();
  } catch {
    return null;
  }
  return null;
}

/** Extract deduped product gallery URLs from JSON-LD and HTML img/srcset tags. */
export function extractProductImages(
  html: string,
  jsonLd: Record<string, unknown>[] = [],
  sourceUrl?: string
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (raw: string | null | undefined) => {
    if (!raw) return;
    const resolved = resolveImageUrl(raw, sourceUrl);
    if (!resolved || seen.has(resolved)) return;
    if (/\.(svg|ico)(\?|$)/i.test(resolved)) return;
    seen.add(resolved);
    out.push(resolved);
  };

  for (const node of jsonLd) {
    const collect = (r: unknown) => {
      if (typeof r === 'string') add(r);
      else if (Array.isArray(r)) r.forEach(collect);
      else if (r && typeof r === 'object') {
        const o = r as Record<string, unknown>;
        if (typeof o.url === 'string') add(o.url);
        if (typeof o.contentUrl === 'string') add(o.contentUrl);
      }
    };
    collect((node as { image?: unknown }).image);
  }

  const ogMatch = html.match(/property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i)
    ?? html.match(/content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i);
  if (ogMatch) add(ogMatch[1]);

  const galleryChunks = html.match(
    /(?:product[_-]?(?:media|gallery|photos|images)|media-gallery|product__media)[\s\S]{0,20000}/gi
  );
  const searchIn = galleryChunks?.length ? galleryChunks : [html];

  for (const chunk of searchIn) {
    for (const m of chunk.matchAll(/<img[^>]+(?:src|data-src|data-zoom-src)=["']([^"']+)["']/gi)) {
      add(m[1]);
    }
    for (const m of chunk.matchAll(/\bsrcset=["']([^"']+)["']/gi)) {
      for (const part of m[1]!.split(',')) {
        const urlPart = part.trim().split(/\s+/)[0];
        add(urlPart);
      }
    }
  }

  if (out.length < 2) {
    for (const m of html.matchAll(/["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp)(?:\?[^"']*)?)["']/gi)) {
      add(m[1]);
      if (out.length >= 12) break;
    }
  }

  return out.slice(0, 12);
}
