import type { CommercePackagingInput, CommercePackagingV1, InnerUnitType, UnitNoun } from "./types";
import { COMMERCE_PACKAGING_SCHEMA_VERSION } from "./types";

const INNER_LABELS: Record<InnerUnitType, string> = {
  box: "boxes",
  bag: "bags",
  pack: "packs",
  dozen: "dozen",
  pair: "pairs",
  each: "each",
  roll: "rolls",
  sleeve: "sleeves",
  carton: "cartons",
};

export function deriveUnitNoun(
  categorySlug: string | null | undefined,
  innerUnitType: InnerUnitType | null | undefined
): UnitNoun {
  if (innerUnitType === "pair" || innerUnitType === "dozen") return "pairs";
  if (categorySlug === "reusable_work_gloves") return "pairs";
  if (categorySlug === "disposable_gloves") return "gloves";
  return "units";
}

export function calculateUnitsPerCase(
  unitsPerInner: number | null | undefined,
  innersPerCase: number | null | undefined
): number | null {
  if (unitsPerInner == null || innersPerCase == null) return null;
  if (!Number.isFinite(unitsPerInner) || !Number.isFinite(innersPerCase)) return null;
  if (unitsPerInner <= 0 || innersPerCase <= 0) return null;
  return unitsPerInner * innersPerCase;
}

export function calculateUnitsPerPallet(
  unitsPerCase: number | null | undefined,
  casesPerPallet: number | null | undefined
): number | null {
  if (unitsPerCase == null || casesPerPallet == null) return null;
  if (!Number.isFinite(unitsPerCase) || !Number.isFinite(casesPerPallet)) return null;
  if (unitsPerCase <= 0 || casesPerPallet <= 0) return null;
  return unitsPerCase * casesPerPallet;
}

function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

export function deriveCaseLabel(cp: Pick<
  CommercePackagingV1,
  "inner_unit_type" | "units_per_inner" | "inners_per_case" | "units_per_case" | "unit_noun"
>): string | null {
  const { inner_unit_type, units_per_inner, inners_per_case, units_per_case, unit_noun } = cp;
  if (units_per_case == null || units_per_case <= 0) return null;

  if (inner_unit_type === "dozen" && inners_per_case != null && inners_per_case > 0) {
    if (inners_per_case === 1 && units_per_inner === 12) {
      return `${formatCount(units_per_case)} ${unit_noun} per case`;
    }
    return `${inners_per_case} dozen = ${formatCount(units_per_case)} ${unit_noun}`;
  }

  if (
    inner_unit_type &&
    units_per_inner != null &&
    inners_per_case != null &&
    units_per_inner > 0 &&
    inners_per_case > 0
  ) {
    const innerLabel = INNER_LABELS[inner_unit_type] ?? inner_unit_type;
    const unitWord = unit_noun === "pairs" ? "pairs" : unit_noun;
    return `${inners_per_case} ${innerLabel} × ${formatCount(units_per_inner)} ${unitWord} = ${formatCount(units_per_case)} ${unit_noun}`;
  }

  return `${formatCount(units_per_case)} ${unit_noun} per case`;
}

export function derivePalletLabel(cp: Pick<
  CommercePackagingV1,
  "cases_per_pallet" | "units_per_pallet" | "unit_noun"
>): string | null {
  const { cases_per_pallet, units_per_pallet, unit_noun } = cp;
  if (cases_per_pallet == null || cases_per_pallet <= 0) return null;
  if (units_per_pallet != null && units_per_pallet > 0) {
    return `${formatCount(cases_per_pallet)} cases = ${formatCount(units_per_pallet)} ${unit_noun}`;
  }
  return `${formatCount(cases_per_pallet)} cases per pallet`;
}

export function emptyCommercePackaging(categorySlug?: string | null): CommercePackagingV1 {
  return normalizeCommercePackaging({}, categorySlug);
}

export function normalizeCommercePackaging(
  input: CommercePackagingInput = {},
  categorySlug?: string | null
): CommercePackagingV1 {
  const innerUnitType = input.inner_unit_type ?? null;
  const derivedNoun = deriveUnitNoun(categorySlug, innerUnitType);
  const unitNoun =
    categorySlug === "disposable_gloves" || categorySlug === "reusable_work_gloves"
      ? derivedNoun
      : (input.unit_noun ?? derivedNoun);

  let unitsPerCase = input.units_per_case ?? null;
  let unitsPerCaseOverridden = input.units_per_case_overridden ?? false;
  const unitsPerInner = input.units_per_inner ?? null;
  const innersPerCase = input.inners_per_case ?? null;

  const computedCase = calculateUnitsPerCase(unitsPerInner, innersPerCase);
  if (!unitsPerCaseOverridden && computedCase != null) {
    unitsPerCase = computedCase;
  }

  let unitsPerPallet = input.units_per_pallet ?? null;
  let unitsPerPalletOverridden = input.units_per_pallet_overridden ?? false;
  const casesPerPallet = input.cases_per_pallet ?? null;

  const computedPallet = calculateUnitsPerPallet(unitsPerCase, casesPerPallet);
  if (!unitsPerPalletOverridden && computedPallet != null) {
    unitsPerPallet = computedPallet;
  }

  const base: CommercePackagingV1 = {
    schema_version: COMMERCE_PACKAGING_SCHEMA_VERSION,
    sell_by_case_enabled: true,
    sell_by_pallet_enabled: input.sell_by_pallet_enabled ?? true,
    minimum_sell_unit: "case",
    bulk_sell_unit: "pallet",
    inner_unit_type: innerUnitType,
    units_per_inner: unitsPerInner,
    inners_per_case: innersPerCase,
    units_per_case: unitsPerCase,
    units_per_case_overridden: unitsPerCaseOverridden,
    unit_noun: unitNoun,
    case_label: null,
    cases_per_pallet: casesPerPallet,
    units_per_pallet: unitsPerPallet,
    units_per_pallet_overridden: unitsPerPalletOverridden,
    pallet_label: null,
    standard_cost_per_case: input.standard_cost_per_case ?? null,
    compare_at_case_price: input.compare_at_case_price ?? input.msrp_per_case ?? null,
    case_price: input.case_price ?? null,
    compare_at_pallet_price: input.compare_at_pallet_price ?? null,
    pallet_price: input.pallet_price ?? null,
    pallet_discount_percent: input.pallet_discount_percent ?? null,
    msrp_per_case: input.msrp_per_case ?? input.compare_at_case_price ?? null,
    field_provenance: { ...(input.field_provenance ?? {}) },
    parse_warnings: [...(input.parse_warnings ?? [])],
  };

  base.case_label = deriveCaseLabel(base);
  base.pallet_label = derivePalletLabel(base);
  return base;
}

export function hasPackagingMathConflict(cp: CommercePackagingV1): boolean {
  const computed = calculateUnitsPerCase(cp.units_per_inner, cp.inners_per_case);
  if (computed == null || cp.units_per_case == null) return false;
  return computed !== cp.units_per_case;
}
