import type { CommercePackagingV1 } from "./types";

/** Mirror legacy metadata fields for backward compatibility (storefront + publish). */
export function applyCommercePackagingToMetadata(
  meta: Record<string, unknown>,
  cp: CommercePackagingV1
): void {
  meta.commerce_packaging = cp;
  if (cp.units_per_case != null) meta.units_per_case = cp.units_per_case;
  if (cp.inners_per_case != null && cp.units_per_inner != null) {
    meta.case_pack = `${cp.inners_per_case}/${cp.units_per_inner}`;
  } else if (cp.case_label) {
    meta.packaging_summary = cp.case_label;
  }
}
