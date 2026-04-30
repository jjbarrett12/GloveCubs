/**
 * Product type registry — single configuration source for glove lines.
 * Add a new `ProductTypeDefinition` + DB category to onboard another line with minimal code changes.
 */

import type {
  ProductTypeDefinition,
  ProductTypeKey,
  ProductTypeFamily,
  IngestionExtractorId,
  CatalogSortValue,
} from "./types";

const WORK_STRONG = [
  "cut resistant",
  "cut-resistant",
  "cut resistance",
  "ansi a",
  "ansi a1",
  "ansi a2",
  "ansi a3",
  "ansi a4",
  "puncture",
  "abrasion",
  "work glove",
  "work gloves",
  "reusable",
  "flame resistant",
  "arc rating",
  "insulated",
  "winter glove",
  "cold weather",
  "cal 8",
  "cal 12",
  "cal 20",
  "category 1",
  "category 2",
  "category 3",
  "category 4",
] as const;

const WORK_WEAK = ["level 1", "level 2", "level 3", "level 4"] as const;

const DISPOSABLE_STRONG = [
  "nitrile",
  "vinyl",
  "latex",
  "exam glove",
  "exam grade",
  "medical grade",
  "powder free",
  "powder-free",
  "disposable",
  "sterile",
  "non-sterile",
  "food safe",
  "food service",
  "1000/case",
  "1000/cs",
  "1000 per case",
] as const;

const DISPOSABLE_WEAK = ["powdered", "100/box", "100/ct", "mil"] as const;

const DISPOSABLE_FILTER_KEYS = [
  "material",
  "color",
  "brand",
  "thickness_mil",
  "powder",
  "grade",
  "industries",
  "certifications",
  "uses",
  "protection_tags",
  "texture",
  "cuff_style",
  "hand_orientation",
  "packaging",
  "sterility",
] as const;

const WORK_FILTER_KEYS = [
  "material",
  "color",
  "brand",
  "cut_level_ansi",
  "puncture_level",
  "abrasion_level",
  "flame_resistant",
  "arc_rating",
  "warm_cold_weather",
] as const;

const SORT_DISPOSABLE: { value: CatalogSortValue; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "price_per_glove_asc", label: "Price per glove" },
  { value: "relevance", label: "Relevance" },
];

const SORT_WORK: { value: CatalogSortValue; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "relevance", label: "Relevance" },
];

const DISPOSABLE_DICTIONARY_KEYS = [
  "category",
  "material",
  "size",
  "color",
  "thickness_mil",
  "powder",
  "grade",
  "industries",
  "certifications",
  "uses",
  "protection_tags",
  "texture",
  "cuff_style",
  "hand_orientation",
  "packaging",
  "sterility",
] as const;

const WORK_DICTIONARY_KEYS = [
  "category",
  "material",
  "size",
  "color",
  "cut_level_ansi",
  "puncture_level",
  "abrasion_level",
  "flame_resistant",
  "arc_rating",
  "warm_cold_weather",
] as const;

export const GLOBAL_MULTI_SELECT_ATTRIBUTE_KEYS = [
  "industries",
  "certifications",
  "uses",
  "protection_tags",
] as const;

/** Storefront facets backed by catalog_v2.catalog_variants (not catalogos.product_attributes). */
export const CATALOG_VARIANT_FACET_KEYS = ["size"] as const;

export function getCatalogVariantFacetKeys(): readonly string[] {
  return CATALOG_VARIANT_FACET_KEYS;
}

export const PRODUCT_TYPE_DEFINITIONS: Record<ProductTypeKey, ProductTypeDefinition> = {
  disposable_gloves: {
    key: "disposable_gloves",
    displayName: "Disposable gloves",
    family: "gloves",
    navLabel: "Disposable gloves",
    variantDimensions: ["material", "size", "color", "packaging"],
    attributeRequirements: [
      { attributeKey: "category", level: "required" },
      { attributeKey: "material", level: "required" },
      { attributeKey: "color", level: "required" },
      { attributeKey: "brand", level: "required" },
      { attributeKey: "packaging", level: "required" },
      { attributeKey: "powder", level: "required" },
      { attributeKey: "grade", level: "required" },
      { attributeKey: "thickness_mil", level: "strongly_preferred" },
      { attributeKey: "texture", level: "strongly_preferred" },
      { attributeKey: "cuff_style", level: "strongly_preferred" },
      { attributeKey: "sterility", level: "strongly_preferred" },
      { attributeKey: "industries", level: "strongly_preferred" },
      { attributeKey: "certifications", level: "strongly_preferred" },
      { attributeKey: "uses", level: "strongly_preferred" },
      { attributeKey: "protection_tags", level: "strongly_preferred" },
    ],
    optionalAttributeKeys: ["hand_orientation"],
    filterableFacets: [...DISPOSABLE_FILTER_KEYS],
    sortOptions: SORT_DISPOSABLE,
    normalization: {
      ruleSetId: "gloves_dictionary_v1",
      extractorId: "disposable_glove_dictionary",
      disambiguationGroupId: "gloves",
      inferenceSignals: { strong: DISPOSABLE_STRONG, weak: DISPOSABLE_WEAK },
    },
    validation: { dictionaryValidatedKeys: [...DISPOSABLE_DICTIONARY_KEYS] },
    adminFormLayout: {
      sections: [
        {
          id: "core",
          title: "Core",
          fields: [
            { attributeKey: "canonical_title", widget: "text", colSpan: 2 },
            { attributeKey: "supplier_sku", widget: "text" },
            { attributeKey: "supplier_cost", widget: "number" },
            { attributeKey: "brand", widget: "text" },
          ],
        },
        {
          id: "classification",
          title: "Classification",
          fields: [
            { attributeKey: "material", widget: "select" },
            { attributeKey: "size", widget: "select" },
            { attributeKey: "color", widget: "select" },
            { attributeKey: "grade", widget: "select" },
            { attributeKey: "powder", widget: "select" },
            { attributeKey: "packaging", widget: "select" },
          ],
        },
        {
          id: "disposable_specs",
          title: "Disposable specs",
          fields: [
            { attributeKey: "thickness_mil", widget: "select" },
            { attributeKey: "texture", widget: "select" },
            { attributeKey: "cuff_style", widget: "select" },
            { attributeKey: "sterility", widget: "select" },
            { attributeKey: "hand_orientation", widget: "select" },
            { attributeKey: "industries", widget: "multiselect", colSpan: 2 },
            { attributeKey: "certifications", widget: "multiselect", colSpan: 2 },
            { attributeKey: "uses", widget: "multiselect", colSpan: 2 },
            { attributeKey: "protection_tags", widget: "multiselect", colSpan: 2 },
          ],
        },
      ],
    },
    reviewRequiredFilterKeys: ["material", "size", "color"],
  },
  reusable_work_gloves: {
    key: "reusable_work_gloves",
    displayName: "Reusable work gloves",
    family: "gloves",
    navLabel: "Work gloves",
    variantDimensions: ["material", "size", "color", "cut_level_ansi"],
    attributeRequirements: [
      { attributeKey: "category", level: "required" },
      { attributeKey: "color", level: "required" },
      { attributeKey: "brand", level: "required" },
      { attributeKey: "cut_level_ansi", level: "strongly_preferred" },
      { attributeKey: "puncture_level", level: "strongly_preferred" },
      { attributeKey: "abrasion_level", level: "strongly_preferred" },
      { attributeKey: "flame_resistant", level: "strongly_preferred" },
      { attributeKey: "arc_rating", level: "strongly_preferred" },
      { attributeKey: "warm_cold_weather", level: "strongly_preferred" },
    ],
    optionalAttributeKeys: ["material"],
    filterableFacets: [...WORK_FILTER_KEYS],
    sortOptions: SORT_WORK,
    normalization: {
      ruleSetId: "gloves_dictionary_v1",
      extractorId: "work_glove_dictionary",
      disambiguationGroupId: "gloves",
      inferenceSignals: { strong: WORK_STRONG, weak: WORK_WEAK },
    },
    validation: { dictionaryValidatedKeys: [...WORK_DICTIONARY_KEYS] },
    adminFormLayout: {
      sections: [
        {
          id: "core",
          title: "Core",
          fields: [
            { attributeKey: "canonical_title", widget: "text", colSpan: 2 },
            { attributeKey: "supplier_sku", widget: "text" },
            { attributeKey: "supplier_cost", widget: "number" },
            { attributeKey: "brand", widget: "text" },
          ],
        },
        {
          id: "classification",
          title: "Classification",
          fields: [
            { attributeKey: "material", widget: "select" },
            { attributeKey: "size", widget: "select" },
            { attributeKey: "color", widget: "select" },
          ],
        },
        {
          id: "work_protection",
          title: "Protection",
          fields: [
            { attributeKey: "cut_level_ansi", widget: "select" },
            { attributeKey: "puncture_level", widget: "select" },
            { attributeKey: "abrasion_level", widget: "select" },
            { attributeKey: "flame_resistant", widget: "select" },
            { attributeKey: "arc_rating", widget: "select" },
            { attributeKey: "warm_cold_weather", widget: "select" },
          ],
        },
      ],
    },
    reviewRequiredFilterKeys: ["material", "size", "color"],
  },
};

/** Implemented product types (storefront + ingestion + DB category slug). */
export const IMPLEMENTED_PRODUCT_TYPE_KEYS = ["disposable_gloves", "reusable_work_gloves"] as const;

export const DEFAULT_PRODUCT_TYPE_KEY: ProductTypeKey = "disposable_gloves";

export function getProductTypeDefinition(key: string): ProductTypeDefinition | undefined {
  return PRODUCT_TYPE_DEFINITIONS[key as ProductTypeKey];
}

export function isImplementedProductTypeKey(key: string): key is ProductTypeKey {
  return key in PRODUCT_TYPE_DEFINITIONS;
}

export function listProductTypesByFamily(family: ProductTypeFamily): ProductTypeDefinition[] {
  return Object.values(PRODUCT_TYPE_DEFINITIONS).filter((d) => d.family === family);
}

export function getDisambiguationGroupMembers(groupId: string): Array<{
  key: ProductTypeKey;
  strong: readonly string[];
  weak: readonly string[];
}> {
  return Object.values(PRODUCT_TYPE_DEFINITIONS)
    .filter((d) => d.normalization.disambiguationGroupId === groupId)
    .map((d) => ({
      key: d.key,
      strong: d.normalization.inferenceSignals.strong,
      weak: d.normalization.inferenceSignals.weak,
    }));
}

export function getIngestionExtractorId(categorySlug: ProductTypeKey): IngestionExtractorId {
  return PRODUCT_TYPE_DEFINITIONS[categorySlug].normalization.extractorId;
}

export function getFilterableFacets(categorySlug: ProductTypeKey): readonly string[] {
  return PRODUCT_TYPE_DEFINITIONS[categorySlug].filterableFacets;
}

export function getSortOptionsForProductType(categorySlug: ProductTypeKey): readonly { value: CatalogSortValue; label: string }[] {
  return PRODUCT_TYPE_DEFINITIONS[categorySlug].sortOptions;
}

export function getSortValuesForProductType(categorySlug: ProductTypeKey): CatalogSortValue[] {
  return [...PRODUCT_TYPE_DEFINITIONS[categorySlug].sortOptions.map((s) => s.value)];
}

/** Union of all facet keys across implemented types (storefront aggregation). */
export function getAllFilterableFacetKeys(): string[] {
  const set = new Set<string>();
  for (const def of Object.values(PRODUCT_TYPE_DEFINITIONS)) {
    for (const k of def.filterableFacets) set.add(k);
  }
  return Array.from(set);
}

/** All facet keys for URL parsing, chips, and facet counts (PA + variant-backed). */
export function getAllCatalogFacetKeys(): string[] {
  const out = new Set<string>();
  for (const k of getAllFilterableFacetKeys()) out.add(k);
  for (const k of CATALOG_VARIANT_FACET_KEYS) out.add(k);
  return Array.from(out);
}

export function getStorefrontNavCategories(): readonly { slug: ProductTypeKey; label: string }[] {
  return Object.values(PRODUCT_TYPE_DEFINITIONS).map((d) => ({
    slug: d.key,
    label: d.navLabel,
  }));
}

export function getDisplayNameForProductType(categorySlug: string): string {
  const d = getProductTypeDefinition(categorySlug);
  return d?.displayName ?? categorySlug.replace(/_/g, " ");
}

export function getAttributeRequirementsLists(categorySlug: ProductTypeKey): {
  required: { attribute_key: string; requirement_level: "required" }[];
  stronglyPreferred: { attribute_key: string; requirement_level: "strongly_preferred" }[];
} {
  const def = PRODUCT_TYPE_DEFINITIONS[categorySlug];
  const required = def.attributeRequirements
    .filter((r) => r.level === "required")
    .map((r) => ({ attribute_key: r.attributeKey, requirement_level: "required" as const }));
  const stronglyPreferred = def.attributeRequirements
    .filter((r) => r.level === "strongly_preferred")
    .map((r) => ({ attribute_key: r.attributeKey, requirement_level: "strongly_preferred" as const }));
  return { required, stronglyPreferred };
}
