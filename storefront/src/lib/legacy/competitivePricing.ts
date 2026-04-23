/**
 * TypeScript Adapter for lib/competitivePricing.js
 * 
 * Provides typed interfaces for the legacy pricing module.
 */

// Import legacy module
// eslint-disable-next-line @typescript-eslint/no-var-requires
const legacyModule = require('../../../../lib/competitivePricing');

// ============================================================================
// TYPES
// ============================================================================

export type PricingAction = 'keep' | 'lower' | 'raise' | 'review' | 'suppress';

export interface PricingConfig {
  minimum_margin_percent: number;
  minimum_margin_dollars: number;
  map_violation_allowed: boolean;
  max_price_decrease_percent: number;
  max_price_increase_percent: number;
  price_swing_review_threshold: number;
  undercut_tolerance: number;
  overpriced_threshold: number;
  suspicious_low_price_percent: number;
  min_offer_confidence: number;
  stale_offer_days: number;
  auto_publish_confidence: number;
}

export interface CompetitorOffer {
  source_name: string;
  source_url?: string;
  visible_price: number;
  shipping_estimate?: number | null;
  availability?: string;
  offer_confidence: number;
  same_brand: boolean;
  same_pack: boolean;
  notes?: string;
  scraped_at?: string;
}

export interface OfferValidation {
  valid: boolean;
  confidence: number;
  issues: string[];
}

export interface Margin {
  percent: number;
  dollars: number;
}

export interface PricingProduct {
  canonical_product_id: string;
  current_price: number;
  current_cost: number;
  map_price?: number;
  minimum_margin_percent?: number;
  minimum_margin_dollars?: number;
  shipping_cost_estimate?: number;
  competitor_offers: CompetitorOffer[];
}

export interface PricingRecommendation {
  canonical_product_id: string;
  current_price: number;
  recommended_price: number;
  action: PricingAction;
  reason: string;
  lowest_trusted_comparable_price: number | null;
  estimated_margin_percent_after_change: number;
  estimated_margin_dollars_after_change: number;
  confidence: number;
  auto_publish_eligible: boolean;
  review_reasons: string[];
  _debug?: {
    valid_offers: number;
    effective_cost: number;
    min_price: number;
    current_margin: Margin;
  };
}

export interface BatchPricingResult {
  processed: number;
  keep: number;
  lower: number;
  raise: number;
  review: number;
  suppress: number;
  auto_publish_ready: number;
  recommendations: PricingRecommendation[];
}

// ============================================================================
// CONSTANTS (exported from legacy module)
// ============================================================================

export const DEFAULT_CONFIG: PricingConfig = legacyModule.DEFAULT_CONFIG;
export const TRUSTED_SOURCES: string[] = legacyModule.TRUSTED_SOURCES;
export const UNTRUSTED_SOURCES: string[] = legacyModule.UNTRUSTED_SOURCES;

// ============================================================================
// ADAPTER FUNCTIONS
// ============================================================================

/**
 * Generate a pricing recommendation for a single product
 */
export function generateRecommendation(
  product: PricingProduct,
  config?: Partial<PricingConfig>
): PricingRecommendation {
  return legacyModule.generateRecommendation(product, { ...DEFAULT_CONFIG, ...config });
}

/**
 * Process a batch of products
 */
export function processPricingBatch(
  products: PricingProduct[],
  config?: Partial<PricingConfig>
): BatchPricingResult {
  return legacyModule.processPricingBatch(products, { ...DEFAULT_CONFIG, ...config });
}

/**
 * Generate a pricing report
 */
export function generatePricingReport(results: BatchPricingResult): string {
  return legacyModule.generatePricingReport(results);
}

/**
 * Validate a competitor offer
 */
export function validateOffer(
  offer: CompetitorOffer,
  product: { current_cost?: number },
  config?: Partial<PricingConfig>
): OfferValidation {
  return legacyModule.validateOffer(offer, product, { ...DEFAULT_CONFIG, ...config });
}

/**
 * Normalize and filter offers
 */
export function normalizeOffers(
  offers: CompetitorOffer[],
  product: { current_cost?: number },
  config?: Partial<PricingConfig>
): Array<CompetitorOffer & { 
  effective_price: number;
  validation: OfferValidation;
  weighted_price: number;
}> {
  return legacyModule.normalizeOffers(offers, product, { ...DEFAULT_CONFIG, ...config });
}

/**
 * Calculate margin
 */
export function calculateMargin(price: number, cost: number): Margin {
  return legacyModule.calculateMargin(price, cost);
}

/**
 * Check if price meets margin floor
 */
export function meetsMarginFloor(
  price: number,
  cost: number,
  config?: Partial<PricingConfig>
): boolean {
  return legacyModule.meetsMarginFloor(price, cost, { ...DEFAULT_CONFIG, ...config });
}

/**
 * Calculate minimum price given cost
 */
export function calculateMinimumPrice(
  cost: number,
  config?: Partial<PricingConfig>
): number {
  return legacyModule.calculateMinimumPrice(cost, { ...DEFAULT_CONFIG, ...config });
}

/**
 * Create pricing input from product and competitor data
 */
export function createPricingInput(
  product: {
    id?: string;
    sku?: string;
    price?: number;
    msrp?: number;
    cost?: number;
    wholesale_cost?: number;
    map_price?: number;
    shipping_cost?: number;
  },
  competitorData: Array<{
    source?: string;
    retailer?: string;
    url?: string;
    price?: number;
    shipping?: number | null;
    availability?: string;
    confidence?: number;
    same_brand?: boolean;
    same_pack?: boolean;
    notes?: string;
  }>
): PricingProduct {
  return legacyModule.createPricingInput(product, competitorData);
}
