import type { CommercePackagingV1 } from "./types";
import { hasPackagingMathConflict } from "./labels";
import {
  resolveEffectiveCasePriceFromPackaging,
  resolveEffectivePalletPriceFromPackaging,
} from "./pricing";

export type CommerceReadinessItem = {
  code: string;
  label: string;
  severity: "blocker" | "warning";
};

export function evaluateCommercePackagingReadiness(
  cp: CommercePackagingV1 | null | undefined,
  options: {
    casePriceFallback?: number | null;
    publishIntent?: boolean;
  } = {}
): { blockers: CommerceReadinessItem[]; warnings: CommerceReadinessItem[] } {
  const blockers: CommerceReadinessItem[] = [];
  const warnings: CommerceReadinessItem[] = [];
  const publishIntent = options.publishIntent !== false;

  if (!cp) {
    if (publishIntent) {
      blockers.push({
        code: "missing_units_per_case",
        label: "Case & Pallet Setup required — units per case missing",
        severity: "blocker",
      });
      if (options.casePriceFallback == null || options.casePriceFallback <= 0) {
        blockers.push({
          code: "missing_case_price",
          label: "Case price required to publish",
          severity: "blocker",
        });
      }
    }
    return { blockers, warnings };
  }

  const casePrice = resolveEffectiveCasePriceFromPackaging(cp) ?? options.casePriceFallback ?? null;

  if (publishIntent && (casePrice == null || casePrice <= 0)) {
    blockers.push({
      code: "missing_case_price",
      label: "Case product or sale price required to publish (or variant list price)",
      severity: "blocker",
    });
  }
  if (publishIntent && (cp.units_per_case == null || cp.units_per_case <= 0)) {
    blockers.push({
      code: "missing_units_per_case",
      label: "Units per case required to publish",
      severity: "blocker",
    });
  }

  if (cp.sell_by_pallet_enabled && resolveEffectivePalletPriceFromPackaging(cp) == null) {
    warnings.push({
      code: "missing_pallet_price",
      label: "Pallet product or sale price not set",
      severity: "warning",
    });
  }
  if (cp.sell_by_pallet_enabled && (cp.cases_per_pallet == null || cp.cases_per_pallet <= 0)) {
    warnings.push({
      code: "missing_cases_per_pallet",
      label: "Cases per pallet not set",
      severity: "warning",
    });
  }
  if (cp.units_per_case_overridden) {
    warnings.push({
      code: "units_per_case_overridden",
      label: "Units per case manually overridden",
      severity: "warning",
    });
  }
  if (cp.units_per_pallet_overridden) {
    warnings.push({
      code: "units_per_pallet_overridden",
      label: "Units per pallet manually overridden",
      severity: "warning",
    });
  }
  for (const prov of Object.values(cp.field_provenance ?? {})) {
    if (prov && prov.confidence < 0.7) {
      warnings.push({
        code: "packaging_low_confidence",
        label: "Packaging field parsed with low confidence — verify before publish",
        severity: "warning",
      });
      break;
    }
  }
  if (hasPackagingMathConflict(cp)) {
    warnings.push({
      code: "packaging_math_conflict",
      label: "Case packaging math conflict — inner units × inners ≠ units per case",
      severity: "warning",
    });
  }
  if ((cp.parse_warnings ?? []).some((w) => /inner packaging/i.test(w))) {
    warnings.push({
      code: "packaging_inner_unknown",
      label: "Parser found case quantity but inner packaging is incomplete",
      severity: "warning",
    });
  }

  return { blockers, warnings };
}
