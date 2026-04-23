/**
 * QA Supervisor - Types
 * 
 * Type definitions for the production QA supervisor service.
 */

// ============================================================================
// EXECUTION MODES
// ============================================================================

export type QAExecutionMode = 'dry_run' | 'apply_safe_fixes' | 'review_only';

export type QAAuditScope = 'full' | 'targeted';

export type QAAuditModule = 
  | 'supplier_discovery'
  | 'product_intake'
  | 'product_matching'
  | 'competitive_pricing'
  | 'daily_price_guard'
  | 'job_queue'
  | 'review_queue';

// ============================================================================
// CONFIG
// ============================================================================

export interface QAConfig {
  // Confidence thresholds
  min_confidence_auto_publish: number;
  min_confidence_auto_fix: number;
  confidence_downgrade_step: number;
  
  // Margin protection
  min_margin_percent: number;
  min_margin_dollars: number;
  
  // Price change limits
  max_auto_publish_price_change: number;
  max_price_swing_without_review: number;
  
  // Data staleness
  max_competitor_data_age_days: number;
  max_cost_data_age_days: number;
  
  // Fix behavior
  enable_safe_auto_fixes: boolean;
  systemic_issue_threshold: number;
  
  // Normalization maps
  color_normalize: Record<string, string>;
  material_normalize: Record<string, string>;
  grade_normalize: Record<string, string>;
}

// ============================================================================
// INPUT TYPES
// ============================================================================

export interface QAAuditInput {
  mode: QAExecutionMode;
  scope: QAAuditScope;
  modules?: QAAuditModule[];
  since?: Date;
  
  // Optional pre-loaded data for targeted audits
  suppliers?: SupplierRecord[];
  products?: ProductRecord[];
  matches?: MatchRecord[];
  pricing?: PricingRecord[];
  actions?: ActionRecord[];
  
  // Metadata
  triggered_by?: string;
  job_id?: string;
}

export interface SupplierRecord {
  id: string;
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

export interface ProductRecord {
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
  canonical_title?: string;
  title?: string;
  parse_confidence?: number;
  review_required?: boolean;
  manufacturer_part_number?: string;
  [key: string]: unknown;
}

export interface MatchRecord {
  incoming_supplier_product_id: string;
  match_result: string;
  canonical_product_id?: string;
  match_confidence: number;
  matched_fields?: string[];
  conflicting_fields?: string[];
  reasoning?: string;
  [key: string]: unknown;
}

export interface PricingRecord {
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
  competitor_offers?: CompetitorOffer[];
  last_competitor_update?: string;
  [key: string]: unknown;
}

export interface CompetitorOffer {
  source_name: string;
  visible_price: number;
  shipping_estimate?: number;
  offer_confidence: number;
  same_pack: boolean;
  same_brand: boolean;
  source_url?: string;
  availability?: string;
  notes?: string;
  scraped_at?: string;
  [key: string]: unknown;
}

export interface ActionRecord {
  product_id: string;
  sku?: string;
  action_type: string;
  recommended_change?: string;
  reason?: string;
  priority?: string;
  details?: Record<string, unknown>;
  [key: string]: unknown;
}

// ============================================================================
// OUTPUT TYPES
// ============================================================================

export interface QAAuditResult {
  run_id: string;
  run_type: 'audit_and_fix' | 'dry_run' | 'review_only';
  run_timestamp: string;
  mode: QAExecutionMode;
  scope: QAAuditScope;
  status: 'completed' | 'failed';
  
  summary: QAAuditSummary;
  module_results: QAModuleResult[];
  fixes: QAFix[];
  review_items: QAReviewItem[];
  blocked_actions: QABlockedAction[];
  systemic_issues: QASystemicIssue[];
  next_steps: string[];
  self_audit: QASelfAudit;
  
  // Persistence tracking
  persisted: {
    audit_report_id?: string;
    fix_logs_created: number;
    blocked_actions_created: number;
    review_items_created: number;
  };
}

export interface QAAuditSummary {
  records_audited: number;
  issues_found: number;
  /** Fixes logged to fix_logs - does NOT mean source tables were updated */
  safe_auto_fixes_applied: number;
  safe_auto_fixes_skipped: number;
  /** Fixes that would be applied but weren't (dry_run or review_only mode) */
  suggested_fixes: number;
  items_sent_to_review: number;
  items_blocked: number;
  systemic_issues_found: number;
}

export interface QAModuleResult {
  module: string;
  records_checked: number;
  issues_found: number;
  fixes_applied: number;
  fixes_skipped: number;
  review_items_created: number;
  blocked_items: number;
  notes: string[];
}

export interface QAFix {
  module: string;
  record_type: string;
  record_id: string;
  source_table?: string;
  source_id?: string;
  dedupe_key?: string;
  issue_found: string;
  fix_applied: string;
  prior_values: Record<string, unknown>;
  new_values: Record<string, unknown>;
  confidence_before?: number;
  confidence_after: number;
  fix_level: 1 | 2 | 3;
  audit_note: string;
  /** 
   * WARNING: was_applied=true means fix was LOGGED to fix_logs table.
   * It does NOT mean the source table was actually updated.
   * To apply fixes to source tables, implement table-specific update logic.
   */
  was_applied: boolean;
  skipped_reason?: string;
}

export interface QAReviewItem {
  module: string;
  record_type: string;
  record_id: string;
  source_table?: string;
  source_id?: string;
  dedupe_key?: string;
  issue_category: string;
  issue_summary: string;
  recommended_action: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  details?: Record<string, unknown>;
}

export interface QABlockedAction {
  module: string;
  record_type: string;
  record_id: string;
  source_table?: string;
  source_id?: string;
  dedupe_key?: string;
  reason_blocked: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  details?: Record<string, unknown>;
}

export interface QASystemicIssue {
  issue: string;
  impact: string;
  recommended_fix: string;
  occurrence_count: number;
  affected_module?: string;
}

export interface QASelfAudit {
  passed: boolean;
  guessed_anywhere: boolean;
  allowed_unsafe_automation: boolean;
  missed_confidence_downgrade: boolean;
  missed_duplicate_risk: boolean;
  missed_systemic_pattern: boolean;
  validation_notes: string[];
}

// ============================================================================
// DATABASE ROW TYPES
// ============================================================================

export interface FixLogRow {
  id: string;
  audit_report_id: string | null;
  module: string;
  record_type: string;
  record_id: string;
  source_table: string | null;
  source_id: string | null;
  issue_found: string;
  fix_applied: string;
  prior_values: Record<string, unknown>;
  new_values: Record<string, unknown>;
  confidence_before: number | null;
  confidence_after: number | null;
  fix_level: number;
  was_applied: boolean;
  applied_at: string | null;
  created_by: string;
  created_at: string;
}

export interface BlockedActionRow {
  id: string;
  audit_report_id: string | null;
  module: string;
  record_type: string;
  record_id: string;
  source_table: string | null;
  source_id: string | null;
  reason_blocked: string;
  severity: string;
  details: Record<string, unknown>;
  status: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolved_notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}
