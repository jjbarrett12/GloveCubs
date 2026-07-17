/**
 * Homepage bulk builder + `/request-pricing` prefill (`type`, `material`, `size` query keys).
 * Disposable material slugs align with `MATERIAL_PATTERNS` in `productExtraction.ts`.
 */

export const BULK_GLOVE_TYPE_OPTIONS = [
  { value: "disposable", label: "Disposable" },
  { value: "reusable", label: "Reusable" },
  { value: "both", label: "Both disposable & reusable" },
] as const;

export type BulkGloveTypeValue = (typeof BULK_GLOVE_TYPE_OPTIONS)[number]["value"];

export const BULK_SIZE_OPTIONS = [
  { value: "xs", label: "XS" },
  { value: "s", label: "S" },
  { value: "m", label: "M" },
  { value: "l", label: "L" },
  { value: "xl", label: "XL" },
  { value: "xxl", label: "XXL" },
] as const;

export type BulkSizeValue = (typeof BULK_SIZE_OPTIONS)[number]["value"];

export const STORE_MATERIAL_BULK_OPTIONS = [
  { value: "nitrile", label: "Nitrile", group: "disposable" },
  { value: "latex", label: "Latex", group: "disposable" },
  { value: "vinyl", label: "Vinyl / PVC", group: "disposable" },
  { value: "neoprene", label: "Neoprene", group: "disposable" },
  { value: "poly", label: "Polyethylene (PE)", group: "disposable" },
  { value: "blend", label: "Blend / hybrid", group: "disposable" },
  { value: "leather", label: "Leather", group: "reusable" },
  { value: "cotton_canvas", label: "Cotton / canvas", group: "reusable" },
  { value: "coated_nitrile", label: "Coated — nitrile", group: "reusable" },
  { value: "coated_latex", label: "Coated — latex", group: "reusable" },
  { value: "pu", label: "Polyurethane (PU)", group: "reusable" },
  { value: "pvc_coating", label: "PVC coating", group: "reusable" },
  { value: "foam_nitrile", label: "Foam nitrile", group: "reusable" },
  { value: "hppe", label: "HPPE / cut-resistant", group: "reusable" },
  { value: "nylon_knit", label: "Nylon knit", group: "reusable" },
  { value: "aramid", label: "Aramid / cut-resistant", group: "reusable" },
] as const;

export type StoreMaterialBulkValue = (typeof STORE_MATERIAL_BULK_OPTIONS)[number]["value"];

const BULK_GLOVE_TYPE_LABELS = Object.fromEntries(
  BULK_GLOVE_TYPE_OPTIONS.map((o) => [o.value, o.label])
) as Record<string, string>;

/** Legacy glove-type slugs from older bulk builder links. */
const LEGACY_GLOVE_TYPE_LABELS: Record<string, string> = {
  exam_disposable: "Exam / disposable",
  industrial: "Industrial / mechanical",
  food_service: "Food service",
  cleanroom: "Cleanroom / critical",
  unsure: "Not sure — help me choose",
};

export function formatBulkGloveTypeParam(raw: string | null): string {
  if (!raw?.trim()) return "—";
  return BULK_GLOVE_TYPE_LABELS[raw] ?? LEGACY_GLOVE_TYPE_LABELS[raw] ?? raw;
}

export function formatBulkMultiParam(
  raw: string | null,
  options: readonly { value: string; label: string }[]
): string {
  if (!raw?.trim()) return "—";
  return raw
    .split(",")
    .map((v) => options.find((o) => o.value === v.trim())?.label ?? v.trim())
    .filter(Boolean)
    .join(", ");
}
