/**
 * Material values for homepage bulk builder + `/request-pricing` prefill (`material` query).
 * Slugs align with catalog store facet values and `MATERIAL_PATTERNS` keys in
 * `src/lib/admin/productExtraction.ts` — keep lists consistent when adding materials.
 */
export const STORE_MATERIAL_BULK_OPTIONS = [
  { value: "nitrile", label: "Nitrile" },
  { value: "latex", label: "Latex" },
  { value: "vinyl", label: "Vinyl / PVC" },
  { value: "neoprene", label: "Neoprene" },
  { value: "poly", label: "Polyethylene (PE)" },
  { value: "blend", label: "Blend / hybrid" },
] as const;

export type StoreMaterialBulkValue = (typeof STORE_MATERIAL_BULK_OPTIONS)[number]["value"];
