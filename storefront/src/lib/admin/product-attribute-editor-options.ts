import {
  CASES_PER_PALLET_BUCKETS,
  UNITS_PER_CASE_BUCKETS,
} from "@/lib/admin/commerce-packaging-editor";
import type { AttributeDefinitionRow } from "@/lib/admin/product-attribute-sync";

/** Legacy or packaging fields not edited in the attribute panel. */
export const EDITOR_HIDDEN_ATTRIBUTE_KEYS = new Set([
  "powder_free",
  "latex_free",
  "medical_grade",
  "food_safe",
  "grip_texture",
  "case_qty",
  "case_quantity",
  "box_quantity",
  "pack_quantity",
  "units_per_case",
  "cases_per_pallet",
  "pallet_pricing_available",
  "price_range",
]);

/** When DB allowed values are missing, keep dropdowns usable in local/dev. */
export const EDITOR_FALLBACK_ALLOWED_VALUES: Record<string, string[]> = {
  grip_texture: ["smooth", "textured", "grip", "micro_roughened"],
  powder_free: ["true", "false"],
  latex_free: ["true", "false"],
  medical_grade: ["true", "false"],
  food_safe: ["true", "false"],
  case_qty: UNITS_PER_CASE_BUCKETS,
  case_quantity: UNITS_PER_CASE_BUCKETS,
  units_per_case: UNITS_PER_CASE_BUCKETS,
  cases_per_pallet: CASES_PER_PALLET_BUCKETS,
  pallet_pricing_available: ["yes", "no"],
  powder: ["powder_free", "powdered"],
};

export function isEditorHiddenAttributeKey(key: string): boolean {
  return EDITOR_HIDDEN_ATTRIBUTE_KEYS.has(key);
}

export function resolveEditorAllowedValues(def: AttributeDefinitionRow): string[] {
  if (def.allowedValues.length > 0) return def.allowedValues;
  return EDITOR_FALLBACK_ALLOWED_VALUES[def.attributeKey] ?? [];
}
