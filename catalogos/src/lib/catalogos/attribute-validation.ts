/**
 * Validation rules for required vs optional attributes by category.
 * Used by stage_safe and publish_safe (see validation-modes.ts).
 * Drives review queue and ingestion quality checks.
 */

import type { CategorySlug } from "./attribute-dictionary-types";
import type { NormalizedDisposableGloveAttributes, NormalizedWorkGloveAttributes } from "./attribute-dictionary-types";
import { getAttributeRequirementsLists, isImplementedProductTypeKey, GLOBAL_MULTI_SELECT_ATTRIBUTE_KEYS } from "@/lib/product-types";

export type RequirementLevel = "required" | "strongly_preferred";

export interface AttributeRequirement {
  attribute_key: string;
  requirement_level: RequirementLevel;
}

function listsForCategory(categorySlug: CategorySlug): {
  required: AttributeRequirement[];
  stronglyPreferred: AttributeRequirement[];
} {
  const { required, stronglyPreferred } = getAttributeRequirementsLists(categorySlug);
  return { required, stronglyPreferred };
}

/** @deprecated Use getAttributeRequirementsLists("disposable_gloves") from @/lib/product-types */
export const DISPOSABLE_REQUIRED: AttributeRequirement[] = listsForCategory("disposable_gloves").required;

/** @deprecated Use getAttributeRequirementsLists("disposable_gloves") from @/lib/product-types */
export const DISPOSABLE_STRONGLY_PREFERRED: AttributeRequirement[] = listsForCategory("disposable_gloves").stronglyPreferred;

/** @deprecated Use getAttributeRequirementsLists("reusable_work_gloves") from @/lib/product-types */
export const WORK_GLOVE_REQUIRED: AttributeRequirement[] = listsForCategory("reusable_work_gloves").required;

/** @deprecated Use getAttributeRequirementsLists("reusable_work_gloves") from @/lib/product-types */
export const WORK_GLOVE_STRONGLY_PREFERRED: AttributeRequirement[] = listsForCategory("reusable_work_gloves").stronglyPreferred;

export interface ValidationResult {
  valid: boolean;
  missing_required: string[];
  missing_strongly_preferred: string[];
  errors: string[];
}

function getValue(attrs: Record<string, unknown>, key: string): unknown {
  const v = attrs[key];
  if (Array.isArray(v)) return v.length > 0 ? v : undefined;
  if (v === "" || v === null) return undefined;
  return v;
}

/**
 * Validate filter attributes against category requirements.
 * Returns missing required and strongly_preferred keys and error messages.
 * Used by stage_safe (for flags) and publish_safe (for blocking) in validation-modes.ts.
 */
export function validateAttributesByCategory(
  categorySlug: CategorySlug,
  filterAttributes: NormalizedDisposableGloveAttributes | NormalizedWorkGloveAttributes | Record<string, unknown>
): ValidationResult {
  const missing_required: string[] = [];
  const missing_strongly_preferred: string[] = [];
  const errors: string[] = [];

  const { required, stronglyPreferred } = isImplementedProductTypeKey(categorySlug)
    ? listsForCategory(categorySlug)
    : { required: [] as AttributeRequirement[], stronglyPreferred: [] as AttributeRequirement[] };

  for (const { attribute_key } of required) {
    const v = getValue(filterAttributes as Record<string, unknown>, attribute_key);
    if (v === undefined || v === null) missing_required.push(attribute_key);
  }
  for (const { attribute_key } of stronglyPreferred) {
    const v = getValue(filterAttributes as Record<string, unknown>, attribute_key);
    if (v === undefined || v === null) missing_strongly_preferred.push(attribute_key);
  }

  if (missing_required.length > 0) {
    errors.push(`Missing required attributes for ${categorySlug}: ${missing_required.join(", ")}`);
  }
  if (missing_strongly_preferred.length > 0) {
    errors.push(`Missing strongly preferred attributes: ${missing_strongly_preferred.join(", ")}`);
  }

  return {
    valid: missing_required.length === 0,
    missing_required,
    missing_strongly_preferred,
    errors,
  };
}

/**
 * Rules for single-select vs multi-select:
 * - single: category, material, size, color, brand, price_range, thickness_mil, powder, grade, texture, cuff_style, hand_orientation, packaging, sterility, cut_level_ansi, puncture_level, abrasion_level, flame_resistant, arc_rating, warm_cold_weather
 * - multi: industries, compliance_certifications
 */
export const MULTI_SELECT_ATTRIBUTE_KEYS = GLOBAL_MULTI_SELECT_ATTRIBUTE_KEYS;

export function isMultiSelectAttribute(attributeKey: string): boolean {
  return (GLOBAL_MULTI_SELECT_ATTRIBUTE_KEYS as readonly string[]).includes(attributeKey);
}
