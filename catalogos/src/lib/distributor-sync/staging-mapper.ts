/**
 * Map OpenClaw extracted + normalized output to distributor_product_staging row shape.
 * Stores raw_payload (extracted), normalized_payload (normalized), and scalar columns.
 */

import type { NormalizedFamily } from "@/lib/openclaw/normalize";
import type { ExtractedProductFamily } from "@/lib/openclaw/types";

function num(v: string | number | undefined): number | undefined {
  if (v == null) return undefined;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isNaN(n) ? undefined : n;
}

function powderFree(status: string | undefined): boolean | undefined {
  if (!status) return undefined;
  const s = status.toLowerCase();
  if (s.includes("powder") && (s.includes("free") || s === "pf")) return true;
  if (s.includes("powdered") || s.includes("with powder")) return false;
  return undefined;
}

export interface StagingRowInsert {
  crawl_job_id: string;
  distributor_source_id: string;
  source_url: string;
  supplier_sku: string | null;
  manufacturer_sku: string | null;
  product_name: string | null;
  brand: string | null;
  description: string | null;
  material: string | null;
  thickness_mil: string | null;
  color: string | null;
  size: string | null;
  powder_free: boolean | null;
  grade: string | null;
  gloves_per_box: number | null;
  boxes_per_case: number | null;
  case_price: number | null;
  image_urls: string[];
  raw_payload: Record<string, unknown>;
  normalized_payload: Record<string, unknown>;
  fingerprint: string | null;
  status: "pending";
}

/**
 * Build staging row from normalized family (and optional extracted for raw_payload).
 * Does not set id, created_at, updated_at (DB defaults).
 */
export function buildStagingRow(
  crawlJobId: string,
  distributorSourceId: string,
  normalized: NormalizedFamily,
  extracted?: ExtractedProductFamily,
  imageUrls: string[] = []
): StagingRowInsert {
  const raw: Record<string, unknown> = extracted
    ? {
        source_url: extracted.source_url,
        family_name: extracted.family_name,
        variant_name: extracted.variant_name,
        sku: extracted.sku?.raw_value,
        mpn: extracted.mpn?.raw_value,
        brand: extracted.brand?.raw_value,
        material: extracted.material?.raw_value,
        size: extracted.size?.raw_value,
        color: extracted.color?.raw_value,
        thickness_mil: extracted.thickness_mil?.raw_value,
        powder_status: extracted.powder_status?.raw_value,
        box_qty: extracted.box_qty?.raw_value,
        case_qty: extracted.case_qty?.raw_value,
      }
    : {};

  const norm: Record<string, unknown> = {
    source_url: normalized.source_url,
    family_name: normalized.family_name,
    variant_name: normalized.variant_name,
    sku: normalized.sku,
    brand: normalized.brand,
    material: normalized.material,
    size: normalized.size,
    color: normalized.color,
    thickness_mil: normalized.thickness_mil,
    powder_status: normalized.powder_status,
    box_qty: normalized.box_qty,
    case_qty: normalized.case_qty,
    glove_type: normalized.glove_type,
  };

  const sku = normalized.sku ?? (extracted?.sku?.normalized_value ?? extracted?.sku?.raw_value);
  const name = normalized.family_name ?? normalized.variant_name ?? (extracted?.family_name ?? extracted?.variant_name);

  const fingerprint =
    [normalized.source_url, sku, name, normalized.material, normalized.thickness_mil]
      .filter(Boolean)
      .map(String)
      .join("|") || null;

  return {
    crawl_job_id: crawlJobId,
    distributor_source_id: distributorSourceId,
    source_url: normalized.source_url,
    supplier_sku: sku != null ? String(sku) : null,
    manufacturer_sku: extracted?.mpn ? String(extracted.mpn.normalized_value ?? extracted.mpn.raw_value) : null,
    product_name: name != null ? String(name) : null,
    brand: normalized.brand ?? null,
    description: (extracted?.description_clean?.raw_value ?? extracted?.description_clean?.normalized_value) != null
      ? String(extracted!.description_clean!.raw_value ?? extracted!.description_clean!.normalized_value)
      : null,
    material: normalized.material ?? null,
    thickness_mil: normalized.thickness_mil ?? null,
    color: normalized.color ?? null,
    size: normalized.size ?? null,
    powder_free: powderFree(normalized.powder_status ?? undefined) ?? null,
    grade: normalized.glove_type ?? null,
    gloves_per_box: num(normalized.box_qty) ?? null,
    boxes_per_case: num(normalized.case_qty) ?? null,
    case_price: null,
    image_urls: imageUrls,
    raw_payload: raw,
    normalized_payload: norm,
    fingerprint,
    status: "pending",
  };
}
