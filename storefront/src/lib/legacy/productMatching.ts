/**
 * TypeScript Adapter for lib/productMatching.js
 * 
 * Provides typed interfaces for the legacy matching module.
 */

// Import legacy module
// eslint-disable-next-line @typescript-eslint/no-var-requires
const legacyModule = require('../../../../lib/productMatching');

// ============================================================================
// TYPES
// ============================================================================

export type MatchResultType = 
  | 'exact_match' 
  | 'likely_match' 
  | 'variant' 
  | 'new_product' 
  | 'review';

export type RecommendedAction = 
  | 'link_to_existing'
  | 'create_variant'
  | 'create_new_canonical'
  | 'human_review';

export interface FieldComparison {
  field: string;
  incoming: unknown;
  catalog: unknown;
  score?: number;
  reason?: string;
}

export interface MatchComparison {
  confidence: number;
  matchedFields: FieldComparison[];
  conflictingFields: FieldComparison[];
  partialFields: FieldComparison[];
}

export interface ProductMatchResult {
  incoming_supplier_product_id: string;
  match_result: MatchResultType;
  canonical_product_id: string | null;
  canonical_product_name?: string;
  match_confidence: number;
  reasoning: string;
  matched_fields: string[];
  conflicting_fields: Array<{
    field: string;
    incoming: unknown;
    catalog: unknown;
  }>;
  recommended_action: RecommendedAction;
}

export interface ProductData {
  id?: string;
  sku?: string;
  supplier_sku?: string;
  name?: string;
  canonical_title?: string;
  brand?: string;
  manufacturer?: string;
  manufacturer_part_number?: string;
  mpn?: string;
  upc?: string;
  material?: string;
  color?: string;
  grade?: string;
  texture?: string;
  thickness_mil?: number;
  size?: string;
  units_per_box?: number;
  boxes_per_case?: number;
  total_units_per_case?: number;
  powder_free?: boolean;
  latex_free?: boolean;
  exam_grade?: boolean;
  medical_grade?: boolean;
  food_safe?: boolean;
  [key: string]: unknown;
}

export interface BatchMatchResult {
  processed: number;
  exact_matches: number;
  likely_matches: number;
  variants: number;
  new_products: number;
  reviews_required: number;
  matches: ProductMatchResult[];
}

export interface DuplicateGroup {
  index: number;
  product: ProductData;
  confidence?: number;
  conflicts?: FieldComparison[];
}

// ============================================================================
// THRESHOLDS (exported from legacy module)
// ============================================================================

export const THRESHOLDS: {
  exact_match: number;
  likely_match: number;
  variant: number;
  possible_match: number;
  review: number;
} = legacyModule.THRESHOLDS;

export const FIELD_WEIGHTS: Record<string, number> = legacyModule.FIELD_WEIGHTS;

// ============================================================================
// ADAPTER FUNCTIONS
// ============================================================================

/**
 * Find all potential matches for an incoming product
 */
export function findMatches(
  incomingProduct: ProductData,
  catalogProducts: ProductData[],
  options?: { minConfidence?: number; maxResults?: number }
): ProductMatchResult[] {
  return legacyModule.findMatches(incomingProduct, catalogProducts, options);
}

/**
 * Match a single product against catalog (returns best match)
 */
export function matchSingleProduct(
  incomingProduct: ProductData,
  catalogProducts: ProductData[]
): ProductMatchResult {
  return legacyModule.matchSingleProduct(incomingProduct, catalogProducts);
}

/**
 * Match a batch of products against catalog
 */
export function matchProductBatch(
  incomingProducts: ProductData[],
  catalogProducts: ProductData[],
  options?: Record<string, unknown>
): BatchMatchResult {
  return legacyModule.matchProductBatch(incomingProducts, catalogProducts, options);
}

/**
 * Generate a matching report
 */
export function generateMatchingReport(results: BatchMatchResult): string {
  return legacyModule.generateMatchingReport(results);
}

/**
 * Find potential duplicates within catalog
 */
export function findDuplicatesInCatalog(
  catalogProducts: ProductData[]
): DuplicateGroup[][] {
  return legacyModule.findDuplicatesInCatalog(catalogProducts);
}

/**
 * Compare two products
 */
export function matchProducts(
  incoming: ProductData,
  catalogProduct: ProductData
): MatchComparison {
  return legacyModule.matchProducts(incoming, catalogProduct);
}

/**
 * Determine match result from comparison
 */
export function determineMatchResult(comparison: MatchComparison): MatchResultType {
  return legacyModule.determineMatchResult(comparison);
}

/**
 * Compare a single field
 */
export function compareField(
  field: string,
  val1: unknown,
  val2: unknown
): { match: boolean; score: number; reason: string } {
  return legacyModule.compareField(field, val1, val2);
}

/**
 * Calculate string similarity
 */
export function stringSimilarity(str1: string, str2: string): number {
  return legacyModule.stringSimilarity(str1, str2);
}
