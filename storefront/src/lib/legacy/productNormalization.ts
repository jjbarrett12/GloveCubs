/**
 * TypeScript Adapter for lib/productNormalization.js
 * 
 * Provides typed interfaces for the legacy normalization module.
 */

// Import legacy module
// eslint-disable-next-line @typescript-eslint/no-var-requires
const legacyModule = require('../../../../lib/productNormalization');

// ============================================================================
// INPUT TYPES
// ============================================================================

export interface RawProductData {
  product_name_raw?: string;
  name?: string;
  title?: string;
  description?: string;
  desc?: string;
  category?: string;
  material?: string;
  specs?: string;
  brand?: string;
  manufacturer?: string;
  manufacturer_part_number?: string;
  mpn?: string;
  part_number?: string;
  upc?: string;
  gtin?: string;
  supplier_sku?: string;
  sku?: string;
  item_number?: string;
  supplier_id?: string;
  color?: string;
  grade?: string;
  texture?: string;
  thickness?: string | number;
  thickness_mil?: number;
  size?: string;
  sizes_available?: string;
  sizes?: string;
  size_range?: string;
  units_per_box?: string | number;
  pack_qty?: string | number;
  box_count?: string | number;
  boxes_per_case?: string | number;
  case_pack?: string | number;
  total_units_per_case?: string | number;
  case_qty?: string | number;
  current_cost?: number;
  cost?: number;
  wholesale_price?: number;
  map_price?: number;
  map?: number;
  msrp?: number;
  retail_price?: number;
  price?: number;
  stock_status?: string;
  availability?: string;
  lead_time_days?: string | number;
  lead_time?: string | number;
  [key: string]: unknown;
}

// ============================================================================
// OUTPUT TYPES
// ============================================================================

export interface NormalizedProduct {
  supplier_id: string | null;
  supplier_sku: string | null;
  brand: string | null;
  manufacturer: string | null;
  manufacturer_part_number: string | null;
  upc: string | null;
  product_name_raw: string;
  
  // Normalized fields
  material: string;
  grade: string;
  color: string;
  texture: string;
  thickness_mil: number | null;
  size: string | null;
  sizes_available: string[];
  
  // Pack quantities
  units_per_box: number | null;
  boxes_per_case: number | null;
  total_units_per_case: number | null;
  case_pack_notes?: string;
  
  // Compliance flags
  exam_grade: boolean;
  medical_grade: boolean;
  food_safe: boolean;
  latex_free: boolean;
  powder_free: boolean;
  chemo_rated: boolean;
  fentanyl_resistant: boolean;
  
  // Pricing
  current_cost: number | null;
  map_price: number | null;
  msrp: number | null;
  
  // Inventory
  stock_status: string;
  lead_time_days: number | null;
  
  // Generated content
  canonical_title: string;
  category: string;
  subcategory: string | null;
  description_short: string;
  bullet_points: string[];
  keywords: string[];
  
  // Validation
  parse_confidence: number;
  review_required: boolean;
  review_reasons: string[];
}

export interface NormalizationReport {
  total_products: number;
  approved_count: number;
  review_required_count: number;
  approval_rate: number;
  average_confidence: number;
  issue_frequency: Record<string, number>;
  review_queue: Array<{
    sku: string;
    name: string;
    confidence: number;
    issues: string[];
  }>;
}

// ============================================================================
// ADAPTER FUNCTIONS
// ============================================================================

/**
 * Normalize a single product
 */
export function normalizeProduct(
  rawData: RawProductData,
  supplierId?: string | null
): NormalizedProduct {
  return legacyModule.normalizeProduct(rawData, supplierId);
}

/**
 * Normalize multiple products
 */
export function normalizeProducts(
  rawProducts: RawProductData[],
  supplierId?: string | null
): NormalizedProduct[] {
  return legacyModule.normalizeProducts(rawProducts, supplierId);
}

/**
 * Generate a normalization report
 */
export function generateNormalizationReport(
  products: NormalizedProduct[]
): NormalizationReport {
  return legacyModule.generateNormalizationReport(products);
}

/**
 * Normalize individual fields
 */
export const normalizeMaterial = (raw: string): string => 
  legacyModule.normalizeMaterial(raw);

export const normalizeColor = (raw: string): string => 
  legacyModule.normalizeColor(raw);

export const normalizeGrade = (raw: string): string => 
  legacyModule.normalizeGrade(raw);

export const normalizeThickness = (raw: string | number): number | null => 
  legacyModule.normalizeThickness(raw);

export const normalizeSize = (raw: string): string | null => 
  legacyModule.normalizeSize(raw);

/**
 * Generate content from normalized product
 */
export const generateCanonicalTitle = (product: NormalizedProduct): string =>
  legacyModule.generateCanonicalTitle(product);

export const generateBulletPoints = (product: NormalizedProduct): string[] =>
  legacyModule.generateBulletPoints(product);

export const generateKeywords = (product: NormalizedProduct): string[] =>
  legacyModule.generateKeywords(product);

/**
 * Validate and score product
 */
export const validateAndScore = (product: NormalizedProduct): {
  parse_confidence: number;
  review_required: boolean;
  review_reasons: string[];
} => legacyModule.validateAndScore(product);
