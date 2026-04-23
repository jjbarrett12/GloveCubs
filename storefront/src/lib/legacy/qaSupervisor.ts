/**
 * TypeScript Adapter for lib/qaSupervisor.js
 * 
 * Provides typed interfaces for the legacy QA supervisor module.
 */

// Import legacy module
// eslint-disable-next-line @typescript-eslint/no-var-requires
const legacyModule = require('../../../../lib/qaSupervisor');

// ============================================================================
// TYPES
// ============================================================================

export interface LegacyAuditSummary {
  records_audited: number;
  issues_found: number;
  safe_auto_fixes_applied: number;
  items_sent_to_review: number;
  items_blocked: number;
  systemic_issues_found: number;
}

export interface LegacyModuleResult {
  module: string;
  records_checked: number;
  issues_found: number;
  fixes_applied: number;
  review_items_created: number;
  blocked_items: number;
  notes: string[];
}

export interface LegacyFix {
  record_type: string;
  record_id: string;
  issue: string;
  fix_applied: string;
  confidence_after_fix: number;
  audit_note: string;
}

export interface LegacyReviewItem {
  record_type: string;
  record_id: string;
  issue_category: string;
  issue_summary: string;
  recommended_action: string;
  priority: 'high' | 'medium' | 'low';
}

export interface LegacyBlockedAction {
  record_type: string;
  record_id: string;
  reason_blocked: string;
  priority: 'high' | 'medium' | 'low';
}

export interface LegacySystemicIssue {
  issue: string;
  impact: string;
  recommended_fix: string;
}

export interface LegacySelfAudit {
  guessed_anywhere: boolean;
  allowed_unsafe_automation: boolean;
  missed_confidence_downgrade: boolean;
  missed_duplicate_risk: boolean;
  missed_systemic_pattern: boolean;
  validation_notes: string[];
}

export interface LegacyAuditResult {
  run_type: string;
  run_timestamp: string;
  summary: LegacyAuditSummary;
  module_results: LegacyModuleResult[];
  fixes: LegacyFix[];
  review_queue: LegacyReviewItem[];
  blocked_actions: LegacyBlockedAction[];
  systemic_issues: LegacySystemicIssue[];
  next_steps: string[];
  self_audit: LegacySelfAudit | null;
}

export interface LegacyAuditData {
  suppliers?: SupplierData[];
  products?: ProductData[];
  matches?: MatchData[];
  pricing?: PricingData[];
  actions?: ActionData[];
}

export interface SupplierData {
  id?: string;
  name: string;
  type?: string;
  supplier_type?: string;
  website?: string;
  url?: string;
  contact_email?: string;
  phone?: string;
  trust_score?: number;
  minimum_order?: number;
  [key: string]: unknown;
}

export interface ProductData {
  id?: string;
  sku?: string;
  supplier_sku?: string;
  brand?: string;
  material?: string;
  color?: string;
  grade?: string;
  size?: string;
  thickness_mil?: number;
  thickness?: number;
  units_per_box?: number;
  boxes_per_case?: number;
  total_units_per_case?: number;
  title?: string;
  canonical_title?: string;
  parse_confidence?: number;
  review_required?: boolean;
  manufacturer_part_number?: string;
  [key: string]: unknown;
}

export interface MatchData {
  incoming_supplier_product_id: string;
  match_result: string;
  canonical_product_id?: string;
  match_confidence: number;
  matched_fields?: string[];
  conflicting_fields?: string[];
  reasoning?: string;
  [key: string]: unknown;
}

export interface PricingData {
  canonical_product_id: string;
  current_price?: number;
  recommended_price?: number;
  current_cost?: number;
  map_price?: number;
  estimated_margin_percent_after_change?: number;
  estimated_margin_dollars_after_change?: number;
  confidence?: number;
  auto_publish_eligible?: boolean;
  review_reasons?: string[];
  competitor_offers?: CompetitorOfferData[];
  last_competitor_update?: string;
  [key: string]: unknown;
}

export interface CompetitorOfferData {
  source_name: string;
  visible_price: number;
  shipping_estimate?: number;
  offer_confidence?: number;
  same_pack?: boolean;
  same_brand?: boolean;
  [key: string]: unknown;
}

export interface ActionData {
  product_id: string;
  sku?: string;
  action_type: string;
  recommended_change?: string;
  reason?: string;
  priority?: 'high' | 'medium' | 'low';
  details?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface QAConfig {
  min_confidence_auto_publish: number;
  min_confidence_auto_fix: number;
  confidence_downgrade_step: number;
  min_margin_percent: number;
  min_margin_dollars: number;
  max_auto_publish_price_change: number;
  max_price_swing_without_review: number;
  max_competitor_data_age_days: number;
  max_cost_data_age_days: number;
  color_normalize: Record<string, string>;
  material_normalize: Record<string, string>;
  grade_normalize: Record<string, string>;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const QA_CONFIG: QAConfig = legacyModule.QA_CONFIG;

/**
 * Run a full audit using the legacy supervisor
 */
export function runFullAudit(data: LegacyAuditData): LegacyAuditResult {
  return legacyModule.runFullAudit(data);
}

/**
 * Audit supplier discovery records
 */
export function auditSupplierDiscovery(
  suppliers: SupplierData[],
  result: LegacyAuditResult
): LegacyModuleResult {
  return legacyModule.auditSupplierDiscovery(suppliers, result);
}

/**
 * Audit product intake records
 */
export function auditProductIntake(
  products: ProductData[],
  result: LegacyAuditResult
): LegacyModuleResult {
  return legacyModule.auditProductIntake(products, result);
}

/**
 * Audit product matching records
 */
export function auditProductMatching(
  matches: MatchData[],
  result: LegacyAuditResult
): LegacyModuleResult {
  return legacyModule.auditProductMatching(matches, result);
}

/**
 * Audit competitive pricing records
 */
export function auditCompetitivePricing(
  recommendations: PricingData[],
  result: LegacyAuditResult
): LegacyModuleResult {
  return legacyModule.auditCompetitivePricing(recommendations, result);
}

/**
 * Audit daily price guard actions
 */
export function auditDailyPriceGuard(
  actions: ActionData[],
  result: LegacyAuditResult
): LegacyModuleResult {
  return legacyModule.auditDailyPriceGuard(actions, result);
}

/**
 * Perform self-audit
 */
export function performSelfAudit(result: LegacyAuditResult): LegacySelfAudit {
  return legacyModule.performSelfAudit(result);
}
