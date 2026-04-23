/**
 * TypeScript Adapter for lib/dailyPriceGuard.js
 * 
 * Provides typed interfaces for the legacy daily price guard module.
 */

// Import legacy module
// eslint-disable-next-line @typescript-eslint/no-var-requires
const legacyModule = require('../../../../lib/dailyPriceGuard');

// ============================================================================
// TYPES
// ============================================================================

export interface GuardConfig {
  high_traffic_threshold: number;
  high_revenue_threshold: number;
  price_sensitive_margin: number;
  stale_pricing_days: number;
  very_stale_pricing_days: number;
  stale_cost_days: number;
  cost_change_threshold: number;
  competitor_change_threshold: number;
  max_auto_publish_change: number;
  min_auto_publish_confidence: number;
  long_tail_traffic_threshold: number;
  long_tail_check_day: string;
}

export interface ProductMetrics {
  daily_views?: number;
  daily_revenue?: number;
  current_margin_percent?: number;
  days_since_last_sale?: number;
}

export interface PriorityInfo {
  score: number;
  priority: 'high' | 'medium' | 'low';
  factors: string[];
}

export interface CostChange {
  type: 'cost_increase' | 'cost_decrease';
  previous: number;
  current: number;
  change_percent: number;
  significant: boolean;
}

export interface CompetitorChange {
  type: 'competitor_increase' | 'competitor_decrease';
  previous: number;
  current: number;
  change_percent: number;
  significant: boolean;
}

export interface StalenessIssue {
  type: 'very_stale_pricing' | 'stale_pricing' | 'no_pricing_data' | 'stale_cost';
  days: number | null;
}

export interface CompetitorOffer {
  source_name: string;
  visible_price: number;
  shipping_estimate?: number;
  offer_confidence: number;
  same_brand: boolean;
  same_pack: boolean;
}

export interface GuardProduct {
  id: string;
  sku?: string;
  name?: string;
  canonical_title?: string;
  current_price?: number;
  price?: number;
  current_cost?: number;
  cost?: number;
  map_price?: number;
  shipping_cost?: number;
  previous_cost?: number;
  previous_lowest_competitor?: number;
  current_lowest_competitor?: number;
  last_pricing_update?: string;
  last_cost_update?: string;
  competitor_offers?: CompetitorOffer[];
  metrics?: ProductMetrics;
}

export interface ActionItem {
  product_id: string;
  sku?: string;
  title?: string;
  action_type: 'auto_publish' | 'pricing_review' | 'supplier_review' | 'catalog_review';
  recommended_change: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
  details?: Record<string, unknown>;
}

export interface DailyGuardSummary {
  products_checked: number;
  products_skipped: number;
  cost_changes_detected: number;
  competitor_price_changes_detected: number;
  overpriced_detected: number;
  underpriced_detected: number;
  stale_pricing_detected: number;
  auto_publish_candidates: number;
  manual_review_count: number;
}

export interface DailyGuardResult {
  run_date: string;
  run_timestamp: string;
  config: GuardConfig & { included_long_tail: boolean };
  summary: DailyGuardSummary;
  actions: ActionItem[];
}

// ============================================================================
// CONSTANTS (exported from legacy module)
// ============================================================================

export const GUARD_CONFIG: GuardConfig = legacyModule.GUARD_CONFIG;

// ============================================================================
// ADAPTER FUNCTIONS
// ============================================================================

/**
 * Run daily price guard on products
 */
export function runDailyPriceGuard(
  products: GuardProduct[],
  options?: { includeLongTail?: boolean }
): DailyGuardResult {
  return legacyModule.runDailyPriceGuard(products, options);
}

/**
 * Generate a daily report
 */
export function generateDailyReport(results: DailyGuardResult): string {
  return legacyModule.generateDailyReport(results);
}

/**
 * Calculate product priority
 */
export function calculatePriority(
  product: GuardProduct,
  metrics?: ProductMetrics
): PriorityInfo {
  return legacyModule.calculatePriority(product, metrics);
}

/**
 * Detect cost changes
 */
export function detectCostChange(
  product: GuardProduct,
  previousCost: number,
  currentCost: number
): CostChange | null {
  return legacyModule.detectCostChange(product, previousCost, currentCost);
}

/**
 * Detect competitor price changes
 */
export function detectCompetitorPriceChange(
  product: GuardProduct,
  previousLowest: number,
  currentLowest: number
): CompetitorChange | null {
  return legacyModule.detectCompetitorPriceChange(product, previousLowest, currentLowest);
}

/**
 * Detect staleness issues
 */
export function detectStaleness(
  product: GuardProduct,
  lastPricingUpdate?: string,
  lastCostUpdate?: string
): StalenessIssue[] {
  return legacyModule.detectStaleness(product, lastPricingUpdate, lastCostUpdate);
}

/**
 * Check if product is long-tail
 */
export function isLongTailProduct(
  product: GuardProduct,
  metrics?: ProductMetrics
): boolean {
  return legacyModule.isLongTailProduct(product, metrics);
}

/**
 * Check if should check long-tail today
 */
export function shouldCheckLongTail(): boolean {
  return legacyModule.shouldCheckLongTail();
}
