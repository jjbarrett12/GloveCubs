/**
 * Normalize product.attributes for compare table columns (keys aligned with ComparisonTable).
 */

const COMPARE_KEYS = [
  "material",
  "thickness_mil",
  "color",
  "powder",
  "texture",
  "grade",
  "box_qty",
] as const;

/** Map packaging / case fields into box_qty for compare row when box_qty missing. */
export function normalizeCompareAttributes(attrs: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const a = attrs ?? {};
  const out: Record<string, unknown> = {};
  for (const k of COMPARE_KEYS) {
    const v = a[k];
    if (v != null && v !== "") out[k] = v;
  }
  if (out.box_qty == null) {
    const pack = a.packaging ?? a.case_qty ?? a.packs_per_case;
    if (pack != null && pack !== "") out.box_qty = pack;
  }
  return out;
}
