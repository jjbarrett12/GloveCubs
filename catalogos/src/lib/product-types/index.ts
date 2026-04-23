/**
 * Product type registry — public API for CatalogOS storefront, ingestion, and admin.
 */

export type {
  ProductTypeKey,
  ProductTypeFamily,
  ProductTypeDefinition,
  SortOptionDef,
  AdminFormFieldDef,
  AdminFormSectionDef,
  NormalizationRulesConfig,
  ValidationRulesConfig,
  AttributeRequirementDef,
  IngestionExtractorId,
  CatalogSortValue,
  AdminFieldWidget,
} from "./types";

export {
  PRODUCT_TYPE_DEFINITIONS,
  IMPLEMENTED_PRODUCT_TYPE_KEYS,
  DEFAULT_PRODUCT_TYPE_KEY,
  GLOBAL_MULTI_SELECT_ATTRIBUTE_KEYS,
  getProductTypeDefinition,
  isImplementedProductTypeKey,
  listProductTypesByFamily,
  getDisambiguationGroupMembers,
  getIngestionExtractorId,
  getFilterableFacets,
  getSortOptionsForProductType,
  getSortValuesForProductType,
  getAllFilterableFacetKeys,
  getStorefrontNavCategories,
  getDisplayNameForProductType,
  getAttributeRequirementsLists,
} from "./registry";
