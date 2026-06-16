/**
 * Normalization utilities: extract content fields from raw supplier rows.
 * No schema changes; uses approved attribute dictionary types for output.
 * File: catalogos/src/lib/normalization/normalization-utils.ts
 */

import type { NormalizedProductContent } from "@/lib/catalogos/attribute-dictionary-types";

export function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

export function strLower(v: unknown): string {
  return str(v).toLowerCase();
}

export function num(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Canonical thickness (mil) parser: "12mil", "12-mil", "12 mil", "0.5 mil", ".5 mil" → numeric mil.
 * Preserves decimal values (e.g. 0.5); invalid/negative/out-of-range → undefined.
 */
export function parseThicknessFromRaw(v: unknown, fromText?: string): number | undefined {
  const parseMil = (raw: string): number | undefined => {
    const s = raw.trim();
    if (!s) return undefined;
    const m =
      s.match(/^(\d+(?:\.\d+)?|\.\d+)\s*[-]?\s*(?:mil|mm)?$/i) ??
      s.match(/(\d+(?:\.\d+)?|\.\d+)/);
    if (!m?.[1]) return undefined;
    const token = m[1].startsWith(".") ? `0${m[1]}` : m[1];
    const n = parseFloat(token);
    if (!Number.isFinite(n) || n <= 0 || n > 30) return undefined;
    return n;
  };

  if (v != null && typeof v === "number" && Number.isFinite(v)) {
    return v > 0 && v <= 30 ? v : undefined;
  }
  if (v != null) {
    const parsed = parseMil(String(v));
    if (parsed != null) return parsed;
  }
  if (fromText) {
    const milMatch = fromText.match(/(?:^|[^\d.])(\d+(?:\.\d+)?|\.\d+)\s*mil\b/i);
    if (milMatch?.[1]) {
      const parsed = parseMil(milMatch[1]);
      if (parsed != null) return parsed;
    }
  }
  return undefined;
}

export function arrStrings(v: unknown): string[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v.map((x) => str(x)).filter(Boolean);
  const s = str(v);
  if (!s) return [];
  return s.split(/[,;|\n]/).map((x) => x.trim()).filter(Boolean);
}

/** Pick first non-empty string from candidates (case-insensitive for keys). */
export function firstStr(row: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return "";
}

/** Combined searchable text from common title/description/spec fields. */
export function combinedText(row: Record<string, unknown>): string {
  return [
    row.name,
    row.title,
    row.product_name,
    row.description,
    row.desc,
    row.long_description,
    row.details,
    row.specifications,
    row.material,
    row.color,
    row.size,
    row.type,
    row.glove_type,
    row.variant_value,
  ]
    .map(str)
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/**
 * Extract normalized product content from a raw supplier row.
 * Does not set filter attributes; only content fields for ingestion/staging.
 */
export function extractContentFromRaw(row: Record<string, unknown>): Partial<NormalizedProductContent> & { canonical_title: string; supplier_sku: string; supplier_cost: number } {
  const title = firstStr(row, "name", "title", "product_name", "description", "product_description");
  const sku = firstStr(row, "sku", "item", "item_number", "product_id", "id", "supplier_sku");
  const cost = num(row.cost ?? row.price ?? row.unit_cost ?? row.list_price ?? row.supplier_cost) ?? 0;

  const images: string[] = [];
  const img = row.image_url ?? row.image ?? row.primary_image ?? row.img ?? row.images;
  const pushUrl = (url: string) => {
    const u = url.trim();
    if (u && (u.startsWith("http://") || u.startsWith("https://"))) images.push(u);
  };
  if (typeof img === "string") pushUrl(img);
  else if (Array.isArray(img)) arrStrings(img).forEach(pushUrl);

  const specUrls: string[] = [];
  const specRaw = row.spec_sheet_urls;
  const pushSpec = (url: string) => {
    const u = url.trim();
    if (u && (u.startsWith("http://") || u.startsWith("https://"))) specUrls.push(u);
  };
  if (typeof specRaw === "string") pushSpec(specRaw);
  else if (Array.isArray(specRaw)) arrStrings(specRaw).forEach(pushSpec);

  return {
    canonical_title: title || sku || "Untitled",
    short_description: firstStr(row, "short_description", "desc") || undefined,
    long_description: firstStr(row, "long_description", "description") || undefined,
    product_details: firstStr(row, "product_details", "details") || undefined,
    specifications: typeof row.specifications === "object" && row.specifications !== null && !Array.isArray(row.specifications)
      ? (row.specifications as Record<string, string>)
      : undefined,
    bullets: Array.isArray(row.bullets) ? (row.bullets as string[]).map(str).filter(Boolean) : undefined,
    brand: firstStr(row, "brand", "manufacturer", "vendor") || undefined,
    manufacturer_part_number: firstStr(row, "manufacturer_part_number", "mpn", "part_number", "manufacturer_sku") || undefined,
    manufacturer_sku: (() => {
      const mfr = firstStr(row, "manufacturer_sku");
      if (!mfr) return undefined;
      if (/\bGLV[-_]/i.test(mfr)) return undefined;
      return mfr;
    })(),
    supplier_sku: sku || "UNKNOWN",
    upc: firstStr(row, "upc", "gtin", "ean", "barcode") || undefined,
    supplier_cost: cost,
    images,
    ...(specUrls.length > 0 ? { spec_sheet_urls: [...new Set(specUrls)] } : {}),
    stock_status: firstStr(row, "stock_status", "availability") || undefined,
    case_qty: num(row.case_qty ?? row.caseqty ?? row.qty_per_case ?? row.pack_qty ?? row.pack_size),
    box_qty: num(row.box_qty ?? row.boxqty ?? row.qty_per_box ?? row.gloves_per_box ?? row.gloves_per_box_per_box ?? row.pack_size),
    lead_time_days: num(row.lead_time_days ?? row.lead_time),
    uom: firstStr(row, "uom", "unit_of_measure", "unit", "sell_uom", "um") || undefined,
    pack_size: firstStr(row, "pack_size", "case_pack", "pack", "packaging_size") || undefined,
    category_guess:
      firstStr(row, "category_guess", "product_category", "category", "family") || undefined,
  };
}
