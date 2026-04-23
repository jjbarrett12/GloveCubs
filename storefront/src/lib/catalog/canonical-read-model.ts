/**
 * Customer-facing / search read model for catalog rows.
 * Maps catalogos.products (+ embedded relations) or denormalized legacy rows into a stable shape for APIs and UI.
 */

export type JsonPrimitive = string | number | boolean | null;

/** Facets exposed to search results and filters — not glove-specific naming in keys */
export interface CatalogSearchFacets {
  material?: string;
  /** Hand-protection line: maps DB glove_type; other lines may use attributes.primary_use */
  primaryVariantStyle?: string;
  size?: string;
  color?: string;
  pack_size?: number;
  category?: string;
  product_line_code?: string;
  /** Additional facets from attributes JSON (machine keys) */
  extra?: Record<string, JsonPrimitive>;
}

export function categorySlugFromCatalogosProductRow(row: Record<string, unknown>): string | null {
  const cats = row.categories as { slug?: string } | { slug?: string }[] | null | undefined;
  if (Array.isArray(cats)) return cats[0]?.slug ?? null;
  return cats?.slug ?? null;
}

/** Map catalogos.products (+ embedded categories) to the denormalized shape used by mapCanonicalRowToSearchFacets. */
export function flattenCatalogosProductRow(row: Record<string, unknown>): Record<string, unknown> {
  const attrs =
    row.attributes && typeof row.attributes === "object" && !Array.isArray(row.attributes)
      ? (row.attributes as Record<string, unknown>)
      : {};
  const str = (v: unknown): string | undefined => (v == null ? undefined : String(v));
  const num = (v: unknown): number | undefined => {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  return {
    id: row.id,
    name: row.name,
    title: row.name,
    sku: row.sku,
    material: str(attrs.material),
    glove_type: str(attrs.glove_type),
    size: str(attrs.size),
    color: str(attrs.color),
    pack_size: num(attrs.pack_size),
    category: categorySlugFromCatalogosProductRow(row),
    product_line_code: row.product_line_code,
    attributes: row.attributes,
    is_active: row.is_active,
    family_id: row.family_id,
  };
}

export interface CanonicalProductReadRow {
  id: string;
  name: string;
  title?: string | null;
  sku: string;
  material?: string | null;
  glove_type?: string | null;
  size?: string | null;
  color?: string | null;
  pack_size?: number | null;
  category?: string | null;
  product_line_code?: string | null;
  attributes?: Record<string, unknown> | null;
  is_active?: boolean | null;
}

/**
 * Build search facets from a DB row. `glove_type` is surfaced as primaryVariantStyle for API clarity.
 */
export function mapCanonicalRowToSearchFacets(row: Record<string, unknown>): CatalogSearchFacets {
  const attrs = row.attributes && typeof row.attributes === "object" && !Array.isArray(row.attributes)
    ? (row.attributes as Record<string, unknown>)
    : {};

  const str = (v: unknown): string | undefined => (v == null ? undefined : String(v));
  const num = (v: unknown): number | undefined => {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };

  const line = str(row.product_line_code);
  const primaryVariantStyle = str(row.glove_type) ?? str(attrs.glove_type) ?? str(attrs.product_type);

  const extra: Record<string, JsonPrimitive> = {};
  const skip = new Set([
    "material",
    "glove_type",
    "size",
    "color",
    "pack_size",
    "product_type",
    "category",
  ]);
  for (const [k, v] of Object.entries(attrs)) {
    if (skip.has(k)) continue;
    if (v == null || typeof v === "object") continue;
    extra[k] = v as JsonPrimitive;
  }

  return {
    material: str(row.material) ?? str(attrs.material),
    primaryVariantStyle,
    size: str(row.size) ?? str(attrs.size),
    color: str(row.color) ?? str(attrs.color),
    pack_size: num(row.pack_size) ?? num(attrs.pack_size),
    category: str(row.category),
    product_line_code: line,
    extra: Object.keys(extra).length ? extra : undefined,
  };
}

/** Backward-compatible attribute bag for clients expecting { glove_type } */
export function searchFacetsToLegacyAttributes(f: CatalogSearchFacets): {
  material?: string;
  glove_type?: string;
  size?: string;
  color?: string;
  pack_size?: number;
  category?: string;
  product_line_code?: string;
} {
  return {
    material: f.material,
    glove_type: f.primaryVariantStyle,
    size: f.size,
    color: f.color,
    pack_size: f.pack_size,
    category: f.category,
    product_line_code: f.product_line_code,
  };
}
