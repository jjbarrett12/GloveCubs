/**
 * Product type registry — structural types for configurable catalog lines.
 * Implemented keys today: glove categories only; add new entries to extend the platform.
 */

import type { StorefrontFilterParams } from "@/lib/catalog/types";

/** Keys with full registry definitions (DB categories + ingestion + storefront). */
export type ProductTypeKey = "disposable_gloves" | "reusable_work_gloves";

export type ProductTypeFamily = "gloves";

/** Sort values exposed in storefront for a product type (subset of global catalog sorts). */
export type CatalogSortValue = NonNullable<StorefrontFilterParams["sort"]>;

export interface SortOptionDef {
  value: CatalogSortValue;
  label: string;
}

export type AdminFieldWidget = "text" | "select" | "multiselect" | "number";

export interface AdminFormFieldDef {
  attributeKey: string;
  widget: AdminFieldWidget;
  /** Grid columns in admin form (12-col grid). */
  colSpan?: 1 | 2;
}

export interface AdminFormSectionDef {
  id: string;
  title: string;
  fields: readonly AdminFormFieldDef[];
}

/** Which dictionary extractor runNormalization should invoke after category is known. */
export type IngestionExtractorId = "disposable_glove_dictionary" | "work_glove_dictionary";

/**
 * Normalization wiring: versioned rule set, extractor, and pairwise disambiguation keywords
 * when multiple product types share a family (e.g. disposable vs work gloves).
 */
export interface NormalizationRulesConfig {
  ruleSetId: string;
  extractorId: IngestionExtractorId;
  disambiguationGroupId: string;
  inferenceSignals: {
    strong: readonly string[];
    weak: readonly string[];
  };
}

export interface AttributeRequirementDef {
  attributeKey: string;
  level: "required" | "strongly_preferred";
}

/**
 * Validation: required / strongly preferred lists; enum keys are still enforced in
 * validation-modes (ALLOWED_BY_KEY) — registry documents which keys apply per type.
 */
export interface ValidationRulesConfig {
  /** Attribute keys that must pass dictionary enums in parse_safe when present. */
  dictionaryValidatedKeys: readonly string[];
}

export interface ProductTypeDefinition {
  key: ProductTypeKey;
  displayName: string;
  family: ProductTypeFamily;
  /** Nav / SEO short line */
  navLabel: string;
  /** Keys that define SKU / variant grain for this line */
  variantDimensions: readonly string[];
  attributeRequirements: readonly AttributeRequirementDef[];
  /** Keys that may be present but are not required for publish */
  optionalAttributeKeys: readonly string[];
  /** Facet keys used in storefront filters + low-confidence review scan */
  filterableFacets: readonly string[];
  sortOptions: readonly SortOptionDef[];
  normalization: NormalizationRulesConfig;
  validation: ValidationRulesConfig;
  adminFormLayout: {
    sections: readonly AdminFormSectionDef[];
  };
  /** Minimum filter keys for review_flags missing_required_filter */
  reviewRequiredFilterKeys: readonly string[];
}
