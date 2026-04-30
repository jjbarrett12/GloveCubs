/**
 * CatalogOS validation in three explicit levels:
 *
 * - parse_safe:   Validates structure and allowed dictionary values only.
 *                 Does not require required attributes to be present.
 * - stage_safe:   Allows missing required attributes; generates blocking review flags.
 *                 Always stageable; status stays pending when required are missing.
 * - publish_safe: Blocks publish when required attributes are missing or invalid.
 */

import type { CategorySlug } from "./attribute-dictionary-types";
import { IMPLEMENTED_PRODUCT_TYPE_KEYS } from "@/lib/product-types";
import { isImplementedProductTypeKey } from "@/lib/product-types";
import {
  MATERIAL_VALUES,
  SIZE_VALUES,
  COLOR_VALUES,
  THICKNESS_MIL_VALUES,
  POWDER_VALUES,
  GRADE_VALUES,
  INDUSTRIES_VALUES,
  CERTIFICATION_VALUES,
  USES_VALUES,
  PROTECTION_TAGS_VALUES,
  TEXTURE_VALUES,
  CUFF_STYLE_VALUES,
  HAND_ORIENTATION_VALUES,
  PACKAGING_VALUES,
  STERILITY_VALUES,
  CUT_LEVEL_ANSI_VALUES,
  PUNCTURE_LEVEL_VALUES,
  ABRASION_LEVEL_VALUES,
  FLAME_RESISTANT_VALUES,
  ARC_RATING_VALUES,
  WARM_COLD_WEATHER_VALUES,
} from "./attribute-dictionary-types";
import { validateAttributesByCategory, isMultiSelectAttribute, normalizeFilterAttributesKeys } from "./attribute-validation";

export interface ParseSafeInput {
  content: { canonical_title?: string; supplier_sku?: string; supplier_cost?: number };
  category_slug: string;
  filter_attributes: Record<string, unknown>;
}

export interface ParseSafeResult {
  valid: boolean;
  errors: string[];
}

export interface StageSafeResult {
  /** Always true: staging is allowed; missing_required generate blocking review flags, status stays pending. */
  stageable: true;
  missing_required: string[];
  missing_strongly_preferred: string[];
}

export interface PublishSafeResult {
  publishable: boolean;
  error?: string;
}

/** Allowed value sets by attribute key (for parse_safe). Brand is free text. */
const ALLOWED_BY_KEY: Record<string, readonly string[]> = {
  category: [...IMPLEMENTED_PRODUCT_TYPE_KEYS] as unknown as string[],
  material: MATERIAL_VALUES as unknown as string[],
  size: SIZE_VALUES as unknown as string[],
  color: COLOR_VALUES as unknown as string[],
  thickness_mil: THICKNESS_MIL_VALUES as unknown as string[],
  powder: POWDER_VALUES as unknown as string[],
  grade: GRADE_VALUES as unknown as string[],
  industries: INDUSTRIES_VALUES as unknown as string[],
  certifications: CERTIFICATION_VALUES as unknown as string[],
  uses: USES_VALUES as unknown as string[],
  protection_tags: PROTECTION_TAGS_VALUES as unknown as string[],
  texture: TEXTURE_VALUES as unknown as string[],
  cuff_style: CUFF_STYLE_VALUES as unknown as string[],
  hand_orientation: HAND_ORIENTATION_VALUES as unknown as string[],
  packaging: PACKAGING_VALUES as unknown as string[],
  sterility: STERILITY_VALUES as unknown as string[],
  cut_level_ansi: CUT_LEVEL_ANSI_VALUES as unknown as string[],
  puncture_level: PUNCTURE_LEVEL_VALUES as unknown as string[],
  abrasion_level: ABRASION_LEVEL_VALUES as unknown as string[],
  flame_resistant: FLAME_RESISTANT_VALUES as unknown as string[],
  arc_rating: ARC_RATING_VALUES as unknown as string[],
  warm_cold_weather: WARM_COLD_WEATHER_VALUES as unknown as string[],
};

/**
 * parse_safe: Validates structure and allowed dictionary values only.
 * Does not require required attributes to be present; fails if structure is wrong or any value is not in the dictionary.
 */
export function parseSafe(input: ParseSafeInput): ParseSafeResult {
  const errors: string[] = [];

  if (!input.content?.canonical_title || String(input.content.canonical_title).trim() === "") {
    errors.push("content.canonical_title is required and non-empty");
  }
  if (!input.content?.supplier_sku || String(input.content.supplier_sku).trim() === "") {
    errors.push("content.supplier_sku is required and non-empty");
  }
  if (input.content?.supplier_cost == null || !Number.isFinite(Number(input.content.supplier_cost))) {
    errors.push("content.supplier_cost is required and must be a number");
  }
  if (!isImplementedProductTypeKey(input.category_slug)) {
    errors.push(`category_slug must be one of: ${IMPLEMENTED_PRODUCT_TYPE_KEYS.join(", ")}`);
  }
  if (typeof input.filter_attributes !== "object" || input.filter_attributes === null || Array.isArray(input.filter_attributes)) {
    errors.push("filter_attributes must be an object");
  }

  const attrs = normalizeFilterAttributesKeys((input.filter_attributes ?? {}) as Record<string, unknown>);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null) continue;
    if (key === "brand") {
      if (typeof value !== "string" || value.trim() === "") errors.push("filter_attributes.brand must be non-empty string when present");
      continue;
    }
    if (key === "price_range") continue;
    const allowed = ALLOWED_BY_KEY[key];
    if (!allowed) {
      errors.push(`Unknown attribute key: ${key}`);
      continue;
    }
    const set = new Set(allowed);
    if (isMultiSelectAttribute(key)) {
      const arr = Array.isArray(value) ? value : [value];
      for (const v of arr) {
        const s = String(v).trim();
        if (s && !set.has(s)) errors.push(`Value "${s}" for ${key} is not in allowed dictionary`);
      }
    } else {
      const s = String(value).trim();
      if (s && !set.has(s)) errors.push(`Value "${s}" for ${key} is not in allowed dictionary`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * stage_safe: Allows missing required attributes; returns missing lists for generating blocking review flags.
 * Always stageable; status stays pending when missing_required.length > 0.
 */
export function stageSafe(categorySlug: CategorySlug, filterAttributes: Record<string, unknown>): StageSafeResult {
  const v = validateAttributesByCategory(categorySlug, filterAttributes);
  return {
    stageable: true,
    missing_required: v.missing_required,
    missing_strongly_preferred: v.missing_strongly_preferred,
  };
}

/**
 * publish_safe: Blocks publish when required attributes are missing or invalid.
 */
export function publishSafe(categorySlug: CategorySlug, filterAttributes: Record<string, unknown>): PublishSafeResult {
  const v = validateAttributesByCategory(categorySlug, filterAttributes);
  if (v.missing_required.length > 0) {
    return {
      publishable: false,
      error: `Cannot publish: missing required attributes for ${categorySlug}: ${v.missing_required.join(", ")}. Set them in review before publishing.`,
    };
  }
  return { publishable: true };
}
