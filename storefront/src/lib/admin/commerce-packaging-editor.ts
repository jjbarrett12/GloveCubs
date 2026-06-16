import type { CommercePackagingV1 } from "@commerce-packaging/types";
import { resolveEffectiveCasePriceFromPackaging } from "@commerce-packaging/pricing";

import { emptyCommercePackaging, normalizeCommercePackaging } from "@commerce-packaging/labels";

import {

  commercePackagingToFilterAttributes,

  UNITS_PER_CASE_BUCKETS,

  CASES_PER_PALLET_BUCKETS,

} from "@commerce-packaging/filter-sync";

import type { ImportDraftProductV1 } from "@/lib/admin/import-draft-types";



export { commercePackagingToFilterAttributes, UNITS_PER_CASE_BUCKETS, CASES_PER_PALLET_BUCKETS };



export function initCommercePackagingFromEditor(input: {

  metadata?: Record<string, unknown> | null;

  importDraft?: ImportDraftProductV1 | null;

  categorySlug?: string | null;

}): CommercePackagingV1 {

  const { metadata, importDraft, categorySlug } = input;

  const slug = categorySlug ?? importDraft?.category_hint ?? null;

  const raw = metadata?.commerce_packaging;

  if (raw && typeof raw === "object" && !Array.isArray(raw)) {

    return normalizeCommercePackaging(raw as CommercePackagingV1, slug);

  }

  if (importDraft?.commerce_packaging) {

    return normalizeCommercePackaging(importDraft.commerce_packaging, slug);

  }

  const legacyUnits =

    typeof metadata?.units_per_case === "number"

      ? metadata.units_per_case

      : importDraft?.units_per_case ?? null;

  const legacyCasePack =

    typeof metadata?.case_pack === "string"

      ? metadata.case_pack

      : importDraft?.case_pack ?? null;

  if (legacyUnits != null || legacyCasePack) {

    let inners: number | null = null;

    let perInner: number | null = null;

    if (legacyCasePack?.includes("/")) {

      const [a, b] = legacyCasePack.split("/");

      inners = parseInt(a ?? "", 10);

      perInner = parseInt(b ?? "", 10);

      if (!Number.isFinite(inners!) || inners! <= 0) inners = null;

      if (!Number.isFinite(perInner!) || perInner! <= 0) perInner = null;

    }

    return normalizeCommercePackaging(

      {

        units_per_case: legacyUnits,

        inners_per_case: inners,

        units_per_inner: perInner,

        inner_unit_type: inners != null && perInner != null ? "box" : null,

      },

      slug

    );

  }

  return emptyCommercePackaging(slug);

}



/** Mirror legacy metadata fields for backward compatibility. */

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



export function hasVariantListPriceFallback(variants: { listPrice: string }[]): boolean {

  return variants.some((v) => {

    const n = parseFloat(v.listPrice);

    return Number.isFinite(n) && n > 0;

  });

}



export function resolveEffectiveCasePrice(cp: CommercePackagingV1, variants: { listPrice: string }[]): number | null {
  const fromPackaging = resolveEffectiveCasePriceFromPackaging(cp);
  if (fromPackaging != null) return fromPackaging;

  for (const v of variants) {
    const n = parseFloat(v.listPrice);
    if (Number.isFinite(n) && n > 0) return n;
  }

  return null;
}


