/**
 * Build normalized_data from raw row + extracted attributes.
 * Normalized_data is the common shape used for matching and staging.
 */

import type { ParsedRow } from "./types";
import type { GloveAttributes, NormalizedData } from "./types";

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function num(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Build normalized_data and ensure attributes are attached for matching.
 */
export function buildNormalizedFromRaw(
  row: ParsedRow,
  attributes: GloveAttributes
): NormalizedData {
  const name = str(row.name ?? row.title ?? row.product_name ?? row.description);
  const sku = str(row.sku ?? row.item ?? row.item_number ?? row.product_id ?? row.id);
  const brand = str(row.brand ?? row.manufacturer ?? row.vendor);
  const description = str(row.description ?? row.desc ?? row.long_description);
  const upc = str(row.upc ?? row.gtin ?? row.ean ?? row.barcode);
  const imageUrl = str(row.image_url ?? row.image ?? row.primary_image ?? row.img);

  const cost = num(row.cost ?? row.price ?? row.unit_cost ?? row.list_price);

  return {
    name: name || undefined,
    sku: sku || undefined,
    brand: brand || undefined,
    description: description || undefined,
    upc: upc || undefined,
    image_url: imageUrl || undefined,
    cost: cost ?? undefined,
    attributes: Object.keys(attributes).length > 0 ? attributes : undefined,
  };
}
