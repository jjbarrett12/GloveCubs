import { extractCommercePackagingFromHtml } from "./extract";
import { normalizeCommercePackaging } from "./labels";
import { applyCommercePackagingToMetadata } from "./metadata-mirror";
import type { CommercePackagingInput, CommercePackagingV1, InnerUnitType } from "./types";
import { COMMERCE_PACKAGING_SCHEMA_VERSION } from "./types";

export type BackfillRecommendation = "skip_has_commerce" | "safe_backfill" | "manual_review";

export type ProductBackfillPlan = {
  productId: string;
  internalSku: string | null;
  name: string;
  categorySlug: string | null;
  hasCommercePackaging: boolean;
  legacyUnitsPerCase: number | null;
  legacyCasePack: string | null;
  packagingSummary: string | null;
  inferredUnitsPerCase: number | null;
  inferredInnerUnitType: InnerUnitType | null;
  inferredUnitsPerInner: number | null;
  inferredInnersPerCase: number | null;
  recommendedAction: BackfillRecommendation;
  reason: string;
  commercePackaging: CommercePackagingV1 | null;
};

function numPositive(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function hasValidCommercePackaging(meta: Record<string, unknown>): boolean {
  const raw = meta.commerce_packaging;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  return (raw as { schema_version?: unknown }).schema_version === COMMERCE_PACKAGING_SCHEMA_VERSION;
}

/** Parse legacy case_pack strings: 10/100, 4/250, 6 dozen */
export function parseLegacyCasePack(raw: string): {
  inner_unit_type: InnerUnitType;
  units_per_inner: number;
  inners_per_case: number;
} | null {
  const s = raw.trim();
  const slash = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (slash) {
    const inners = parseInt(slash[1]!, 10);
    const perInner = parseInt(slash[2]!, 10);
    if (inners > 0 && perInner > 0) {
      return { inner_unit_type: "box", units_per_inner: perInner, inners_per_case: inners };
    }
  }
  const dozen = s.match(/^(\d+)\s+dozen\b/i);
  if (dozen) {
    const n = parseInt(dozen[1]!, 10);
    if (n > 0) {
      return { inner_unit_type: "dozen", units_per_inner: 12, inners_per_case: n };
    }
  }
  return null;
}

function categorySlugFromMeta(meta: Record<string, unknown>): string | null {
  if (typeof meta.category_slug === "string" && meta.category_slug.trim()) return meta.category_slug.trim();
  if (typeof meta.category === "string" && meta.category.trim()) return meta.category.trim();
  return null;
}

/** Infer backfill plan from catalog_v2 product metadata (read-only). */
export function inferProductBackfillPlan(
  product: {
    id: string;
    internal_sku?: string | null;
    name?: string | null;
    metadata?: Record<string, unknown> | null;
  },
  options?: { force?: boolean }
): ProductBackfillPlan {
  const meta = (product.metadata ?? {}) as Record<string, unknown>;
  const categorySlug = categorySlugFromMeta(meta);
  const legacyUnitsPerCase = numPositive(meta.units_per_case);
  const legacyCasePack = typeof meta.case_pack === "string" ? meta.case_pack.trim() || null : null;
  const packagingSummary =
    typeof meta.packaging_summary === "string" ? meta.packaging_summary.trim() || null : null;

  const hasCommerce = hasValidCommercePackaging(meta);

  const base: Omit<ProductBackfillPlan, "recommendedAction" | "reason" | "commercePackaging"> = {
    productId: product.id,
    internalSku: product.internal_sku?.trim() || null,
    name: (product.name ?? "").trim() || "—",
    categorySlug,
    hasCommercePackaging: hasCommerce,
    legacyUnitsPerCase,
    legacyCasePack,
    packagingSummary,
    inferredUnitsPerCase: null,
    inferredInnerUnitType: null,
    inferredUnitsPerInner: null,
    inferredInnersPerCase: null,
  };

  if (hasCommerce && !options?.force) {
    return {
      ...base,
      recommendedAction: "skip_has_commerce",
      reason: "metadata.commerce_packaging already present",
      commercePackaging: null,
    };
  }

  const input: CommercePackagingInput = {
    field_provenance: {},
    parse_warnings: [],
  };

  const parsedPack = legacyCasePack ? parseLegacyCasePack(legacyCasePack) : null;
  if (parsedPack) {
    input.inner_unit_type = parsedPack.inner_unit_type;
    input.units_per_inner = parsedPack.units_per_inner;
    input.inners_per_case = parsedPack.inners_per_case;
  }

  if (packagingSummary) {
    const fromSummary = extractCommercePackagingFromHtml({
      pageText: packagingSummary,
      categorySlug,
    });
    if (fromSummary.units_per_inner != null) input.units_per_inner = fromSummary.units_per_inner;
    if (fromSummary.inners_per_case != null) input.inners_per_case = fromSummary.inners_per_case;
    if (fromSummary.inner_unit_type != null) input.inner_unit_type = fromSummary.inner_unit_type;
    if (fromSummary.units_per_case != null) input.units_per_case = fromSummary.units_per_case;
    input.parse_warnings = [...(input.parse_warnings ?? []), ...fromSummary.parse_warnings];
  }

  if (legacyUnitsPerCase != null) {
    input.units_per_case = legacyUnitsPerCase;
  }

  const explicitCasePrice = numPositive(meta.case_price);
  if (explicitCasePrice != null) {
    input.case_price = explicitCasePrice;
  }

  const cp = normalizeCommercePackaging(input, categorySlug);

  const inferredUnitsPerCase = cp.units_per_case;
  const hasInner =
    cp.inner_unit_type != null && cp.units_per_inner != null && cp.inners_per_case != null;

  if (inferredUnitsPerCase == null) {
    return {
      ...base,
      inferredUnitsPerCase: null,
      inferredInnerUnitType: cp.inner_unit_type,
      inferredUnitsPerInner: cp.units_per_inner,
      inferredInnersPerCase: cp.inners_per_case,
      recommendedAction: "manual_review",
      reason: "No units_per_case inferable from legacy metadata",
      commercePackaging: null,
    };
  }

  const reason = hasInner
    ? parsedPack
      ? `Legacy case_pack ${legacyCasePack} → ${inferredUnitsPerCase} units/case`
      : `Legacy metadata → ${inferredUnitsPerCase} units/case with inner breakdown`
    : legacyUnitsPerCase != null
      ? "Legacy units_per_case only; inner packaging unknown"
      : "Inferred units per case from packaging summary";

  return {
    ...base,
    inferredUnitsPerCase,
    inferredInnerUnitType: cp.inner_unit_type,
    inferredUnitsPerInner: cp.units_per_inner,
    inferredInnersPerCase: cp.inners_per_case,
    recommendedAction: "safe_backfill",
    reason,
    commercePackaging: cp,
  };
}

/** Merge commerce_packaging into metadata without removing existing keys. */
export function mergeMetadataForBackfill(
  existingMeta: Record<string, unknown>,
  cp: CommercePackagingV1
): Record<string, unknown> {
  const merged = { ...existingMeta };
  applyCommercePackagingToMetadata(merged, cp);
  return merged;
}

export function summarizeBackfillPlans(plans: ProductBackfillPlan[]): {
  total: number;
  withCommercePackaging: number;
  missingCommercePackaging: number;
  withLegacyUnitsPerCase: number;
  withLegacyCasePack: number;
  withPackagingSummary: number;
  safeBackfill: number;
  manualReview: number;
  skipHasCommerce: number;
} {
  return {
    total: plans.length,
    withCommercePackaging: plans.filter((p) => p.hasCommercePackaging).length,
    missingCommercePackaging: plans.filter((p) => !p.hasCommercePackaging).length,
    withLegacyUnitsPerCase: plans.filter((p) => p.legacyUnitsPerCase != null).length,
    withLegacyCasePack: plans.filter((p) => p.legacyCasePack != null).length,
    withPackagingSummary: plans.filter((p) => p.packagingSummary != null).length,
    safeBackfill: plans.filter((p) => p.recommendedAction === "safe_backfill").length,
    manualReview: plans.filter((p) => p.recommendedAction === "manual_review").length,
    skipHasCommerce: plans.filter((p) => p.recommendedAction === "skip_has_commerce").length,
  };
}
