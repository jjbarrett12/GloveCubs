/**
 * Map url_import_products.normalized_payload (or OpenClaw NormalizedFamily) to ParsedRow
 * for the existing ingestion pipeline (extractContentFromRaw, runNormalization).
 */

import type { NormalizedFamily } from "@/lib/openclaw/normalize";

function num(v: string | number | undefined): number | undefined {
  if (v == null) return undefined;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isNaN(n) ? undefined : n;
}

/**
 * Convert OpenClaw NormalizedFamily + optional pricing to ParsedRow shape.
 */
export function normalizedFamilyToParsedRow(
  normalized: NormalizedFamily,
  options: { case_price?: number; box_price?: number; image_urls?: string[] } = {}
): Record<string, unknown> {
  const name = normalized.family_name ?? normalized.variant_name ?? "";
  const sku = normalized.sku ?? "";
  const cost = options.case_price ?? options.box_price ?? num(normalized.case_qty) ?? 0;
  return {
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
    case_qty: num(normalized.case_qty) ?? undefined,
    box_qty: num(normalized.box_qty) ?? undefined,
    gloves_per_box: num(normalized.box_qty) ?? undefined,
    boxes_per_case: num(normalized.case_qty) ?? undefined,
    source_url: normalized.source_url ?? undefined,
    image_url: Array.isArray(options.image_urls) && options.image_urls[0] ? options.image_urls[0] : undefined,
    images: options.image_urls ?? undefined,
  };
}

/**
 * Ensure a url_import_products.normalized_payload (already stored) is valid as ParsedRow.
 * Adds canonical keys if missing.
 */
export function urlImportPayloadToParsedRow(payload: Record<string, unknown>): Record<string, unknown> {
  const name =
    (payload.name ?? payload.title ?? payload.product_name ?? payload.canonical_title ?? payload.sku ?? "Untitled") as string;
  const skuRaw = payload.sku ?? payload.supplier_sku ?? payload.id ?? "";
  const sku = String(skuRaw).trim() || "UNKNOWN";
  const cost = Number(
    payload.cost ?? payload.supplier_cost ?? payload.price ?? payload.case_price ?? payload.box_price ?? 0
  );
  return {
    ...payload,
    name: name || sku || "Untitled",
    title: name || sku,
    product_name: name || sku,
    sku,
    supplier_sku: sku,
    cost: Number.isFinite(cost) ? cost : 0,
    supplier_cost: Number.isFinite(cost) ? cost : 0,
  };
}
