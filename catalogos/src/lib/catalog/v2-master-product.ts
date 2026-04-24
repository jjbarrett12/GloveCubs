/**
 * Map catalog_v2.catalog_products rows to legacy "master product" shapes used by matching / resolution.
 */

export type MasterProductShape = {
  id: string;
  sku: string;
  name: string;
  category_id: string;
  attributes: Record<string, unknown>;
};

export function flattenV2Metadata(metadata: unknown): Record<string, unknown> {
  const meta = metadata && typeof metadata === "object" ? { ...(metadata as Record<string, unknown>) } : {};
  const facet =
    meta.facet_attributes && typeof meta.facet_attributes === "object"
      ? { ...(meta.facet_attributes as Record<string, unknown>) }
      : {};
  delete meta.facet_attributes;
  return { ...meta, ...facet };
}

export function v2RowToMasterShape(row: {
  id: string;
  internal_sku: string | null;
  name: string;
  metadata: unknown;
}): MasterProductShape {
  const flat = flattenV2Metadata(row.metadata);
  const category_id = flat.category_id != null ? String(flat.category_id) : "";
  return {
    id: row.id,
    sku: row.internal_sku ?? "",
    name: row.name,
    category_id,
    attributes: flat,
  };
}
