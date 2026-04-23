/**
 * Review-queue logic: create review_flags for missing required filter attributes,
 * conflicting data, and incomplete extraction. Drives admin review queue.
 */

import { getSupabaseCatalogos } from "@/lib/db/client";
import type { FilterAttributes } from "./normalized-product-types";
import { getFilterableFacets, getProductTypeDefinition, isImplementedProductTypeKey } from "@/lib/product-types";
import type { ProductTypeKey } from "@/lib/product-types";

export type ReviewFlagType =
  | "missing_required_filter"
  | "low_confidence_attribute"
  | "conflicting_value"
  | "missing_core_field"
  | "incomplete_extraction";

export interface ReviewFlagInput {
  normalized_id: string;
  flag_type: ReviewFlagType;
  attribute_key?: string;
  message: string;
  severity: "warning" | "error";
  payload?: Record<string, unknown>;
}

export async function createReviewFlag(input: ReviewFlagInput): Promise<void> {
  const supabase = getSupabaseCatalogos(true);
  await supabase.from("review_flags").insert({
    normalized_id: input.normalized_id,
    flag_type: input.flag_type,
    attribute_key: input.attribute_key ?? null,
    message: input.message,
    severity: input.severity,
    payload: input.payload ?? null,
  });
}

/**
 * Generate and persist review flags for a staged normalized row.
 * Call after normalization + extraction; flags missing required filters and low-confidence attributes.
 */
export async function evaluateReviewFlags(params: {
  normalizedId: string;
  categorySlug: string;
  filterAttributes: FilterAttributes;
  confidenceByKey: Record<string, number>;
  core: { canonical_title?: string; supplier_sku?: string; supplier_cost?: number };
}): Promise<number> {
  const { normalizedId, categorySlug, filterAttributes, confidenceByKey, core } = params;
  const supabase = getSupabaseCatalogos(true);
  let count = 0;

  const def = isImplementedProductTypeKey(categorySlug) ? getProductTypeDefinition(categorySlug) : undefined;
  const requiredKeys = (def?.reviewRequiredFilterKeys ?? []) as (keyof FilterAttributes)[];

  for (const key of requiredKeys) {
    const value = filterAttributes[key];
    if (value == null || (typeof value === "string" && !value.trim())) {
      await createReviewFlag({
        normalized_id: normalizedId,
        flag_type: "missing_required_filter",
        attribute_key: key,
        message: `Missing required filter attribute: ${key}. Product may not be filterable on storefront.`,
        severity: "warning",
      });
      count++;
    }
  }

  const threshold = 0.6;
  const keys =
    isImplementedProductTypeKey(categorySlug) ? getFilterableFacets(categorySlug as ProductTypeKey) : [];
  const attrsRecord = filterAttributes as Record<string, unknown>;
  for (const key of keys) {
    const conf = confidenceByKey[key];
    if (conf != null && conf > 0 && conf < threshold) {
      await createReviewFlag({
        normalized_id: normalizedId,
        flag_type: "low_confidence_attribute",
        attribute_key: key,
        message: `Low confidence (${(conf * 100).toFixed(0)}%) for ${key}. Verify before publish.`,
        severity: "warning",
        payload: { value: attrsRecord[key], confidence: conf },
      });
      count++;
    }
  }

  if (!core.canonical_title?.trim()) {
    await createReviewFlag({
      normalized_id: normalizedId,
      flag_type: "missing_core_field",
      message: "Missing canonical title.",
      severity: "error",
    });
    count++;
  }
  if (core.supplier_cost != null && (Number.isNaN(core.supplier_cost) || core.supplier_cost < 0)) {
    await createReviewFlag({
      normalized_id: normalizedId,
      flag_type: "conflicting_value",
      attribute_key: "supplier_cost",
      message: "Invalid or negative supplier cost.",
      severity: "error",
    });
    count++;
  }

  return count;
}
