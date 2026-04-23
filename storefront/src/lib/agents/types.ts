/**
 * GloveCubs Agent Operations - Core Types
 */

// ============================================================================
// JOB TYPES
// ============================================================================

export const JOB_TYPES = [
  'supplier_discovery',
  'supplier_ingestion',
  'product_normalization',
  'product_match',
  'competitor_price_check',
  'pricing_recommendation',
  'daily_price_guard',
  'audit_run',
  'review_queue_builder',
  'system_event_processor',
] as const;

export type JobType = typeof JOB_TYPES[number];

export const JOB_STATUS = [
  'pending',
  'running',
  'completed',
  'failed',
  'blocked',
  'cancelled',
] as const;

export type JobStatus = typeof JOB_STATUS[number];

// ============================================================================
// AGENT TYPES
// ============================================================================

export const AGENT_NAMES = [
  'supplier_discovery',
  'product_intake',
  'product_matching',
  'competitive_pricing',
  'daily_price_guard',
  'audit_supervisor',
  'orchestrator',
] as const;

export type AgentName = typeof AGENT_NAMES[number];

// ============================================================================
// REVIEW TYPES
// ============================================================================

export const REVIEW_TYPES = [
  'supplier',
  'catalog',
  'product_match',
  'pricing',
  'audit',
  'system',
] as const;

export type ReviewType = typeof REVIEW_TYPES[number];

export const REVIEW_STATUS = [
  'open',
  'in_review',
  'approved',
  'rejected',
  'resolved',
] as const;

export type ReviewStatus = typeof REVIEW_STATUS[number];

export const REVIEW_PRIORITY = ['low', 'medium', 'high', 'critical'] as const;

export type ReviewPriority = typeof REVIEW_PRIORITY[number];

// ============================================================================
// DATABASE ROW TYPES
// ============================================================================

export interface JobQueueRow {
  id: string;
  job_type: JobType;
  status: JobStatus;
  priority: number;
  payload: Record<string, unknown>;
  source_table: string | null;
  source_id: string | null;
  dedupe_key: string | null;
  run_after: string | null;
  locked_at: string | null;
  locked_by: string | null;
  attempt_count: number;
  max_attempts: number;
  last_error: string | null;
  started_at: string | null;
  completed_at: string | null;
  blocked_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobRunRow {
  id: string;
  job_id: string;
  job_type: string;
  worker_name: string | null;
  status: 'started' | 'completed' | 'failed' | 'blocked';
  input_payload: Record<string, unknown>;
  output_payload: Record<string, unknown> | null;
  error_message: string | null;
  duration_ms: number | null;
  started_at: string;
  ended_at: string | null;
  created_at: string;
}

export interface ReviewQueueRow {
  id: string;
  review_type: ReviewType;
  status: ReviewStatus;
  priority: ReviewPriority;
  source_table: string | null;
  source_id: string | null;
  title: string;
  issue_category: string;
  issue_summary: string;
  recommended_action: string | null;
  agent_name: string | null;
  confidence: number | null;
  details: Record<string, unknown>;
  assigned_to: string | null;
  resolved_by: string | null;
  resolved_notes: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export interface AuditReportRow {
  id: string;
  run_type: string;
  status: 'completed' | 'failed';
  summary: AuditSummary;
  module_results: AuditModuleResult[];
  fixes: AuditFix[];
  review_items: AuditReviewItem[];
  blocked_actions: AuditBlockedAction[];
  systemic_issues: AuditSystemicIssue[];
  next_steps: string[];
  self_audit: AuditSelfAudit | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

export interface AgentConfigRow {
  id: string;
  agent_name: AgentName;
  is_enabled: boolean;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AgentRuleRow {
  id: string;
  agent_name: string;
  rule_key: string;
  rule_value: unknown;
  description: string | null;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface SystemEventRow {
  id: string;
  event_type: string;
  status: 'new' | 'processed' | 'ignored' | 'failed';
  source_table: string | null;
  source_id: string | null;
  payload: Record<string, unknown>;
  processed_at: string | null;
  error_message: string | null;
  created_at: string;
}

// ============================================================================
// JOB PAYLOADS
// ============================================================================

export interface SupplierDiscoveryPayload {
  search_terms?: string[];
  categories?: string[];
  max_results?: number;
}

export interface SupplierIngestionPayload {
  file_id?: string;
  file_url?: string;
  file_content?: string;
  supplier_id?: string;
  format?: 'csv' | 'json' | 'xlsx';
  column_mapping?: Record<string, string>;
}

export interface ProductNormalizationPayload {
  product_id?: string;
  raw_id?: string;
  raw_data?: Record<string, unknown>;
  supplier_id?: string;
  batch_id?: string;
  batch_ids?: string[];
  external_id?: string;
}

export interface ProductMatchPayload {
  product_id?: string;
  normalized_product_id?: string;
  normalized_data?: Record<string, unknown>;
  catalog_scope?: 'full' | 'category' | 'brand';
}

export interface CompetitorPriceCheckPayload {
  product_ids?: string[];
  sku_list?: string[];
  priority_tier?: 'high' | 'medium' | 'low';
}

export interface PricingRecommendationPayload {
  product_id: string;
  current_price?: number;
  current_cost?: number;
  map_price?: number;
  competitor_offers?: CompetitorOffer[];
  trigger_reason?: string;
}

export interface DailyPriceGuardPayload {
  include_long_tail?: boolean;
  product_ids?: string[];
  run_date?: string;
}

export interface AuditRunPayload {
  modules?: string[];
  full_audit?: boolean;
  since?: string;
  source_ids?: string[];
  dry_run?: boolean;
  review_only?: boolean;
}

export interface SystemEventProcessorPayload {
  event_ids?: string[];
  event_types?: string[];
  batch_size?: number;
}

/** Core job payloads; follow-up enqueue may add `_triggered_by` (see `enqueueFollowupJobs`). */
export type JobPayload = (
  | SupplierDiscoveryPayload
  | SupplierIngestionPayload
  | ProductNormalizationPayload
  | ProductMatchPayload
  | CompetitorPriceCheckPayload
  | PricingRecommendationPayload
  | DailyPriceGuardPayload
  | AuditRunPayload
  | SystemEventProcessorPayload
) & { _triggered_by?: string };

// ============================================================================
// JOB EXECUTION
// ============================================================================

export interface JobExecutionResult {
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
  reviewItems?: ReviewQueueCreateInput[];
  followupJobs?: EnqueueJobInput[];
  blocked?: boolean;
  blockReason?: string;
}

export interface EnqueueJobInput {
  job_type: JobType;
  payload: JobPayload;
  priority?: number;
  source_table?: string;
  source_id?: string;
  dedupe_key?: string;
  run_after?: Date;
  created_by?: string;
}

export interface ClaimedJob {
  job_id: string;
  job_type: JobType;
  payload: Record<string, unknown>;
  attempt_count: number;
}

// ============================================================================
// REVIEW QUEUE
// ============================================================================

export interface ReviewQueueCreateInput {
  review_type: ReviewType;
  priority: ReviewPriority;
  source_table?: string;
  source_id?: string;
  title: string;
  issue_category: string;
  issue_summary: string;
  recommended_action?: string;
  agent_name?: string;
  confidence?: number;
  details?: Record<string, unknown>;
}

export interface ReviewQueueUpdateInput {
  status?: ReviewStatus;
  priority?: ReviewPriority;
  assigned_to?: string | null;
  resolved_by?: string;
  resolved_notes?: string;
}

// ============================================================================
// AUDIT TYPES
// ============================================================================

export interface AuditSummary {
  records_audited: number;
  issues_found: number;
  safe_auto_fixes_applied: number;
  items_sent_to_review: number;
  items_blocked: number;
  systemic_issues_found: number;
}

export interface AuditModuleResult {
  module: string;
  records_checked: number;
  issues_found: number;
  fixes_applied: number;
  review_items_created: number;
  blocked_items: number;
  notes: string[];
}

export interface AuditFix {
  record_type: string;
  record_id: string;
  issue: string;
  fix_applied: string;
  confidence_after_fix: number;
  audit_note: string;
}

export interface AuditReviewItem {
  record_type: string;
  record_id: string;
  issue_category: string;
  issue_summary: string;
  recommended_action: string;
  priority: ReviewPriority;
}

export interface AuditBlockedAction {
  record_type: string;
  record_id: string;
  reason_blocked: string;
  priority: ReviewPriority;
}

export interface AuditSystemicIssue {
  issue: string;
  impact: string;
  recommended_fix: string;
}

export interface AuditSelfAudit {
  passed: boolean;
  guessed_anywhere: boolean;
  allowed_unsafe_automation: boolean;
  missed_confidence_downgrade: boolean;
  missed_duplicate_risk: boolean;
  missed_systemic_pattern: boolean;
  validation_notes: string[];
}

// ============================================================================
// COMPETITOR / PRICING
// ============================================================================

export interface CompetitorOffer {
  source_name: string;
  source_url?: string;
  visible_price: number;
  shipping_estimate?: number;
  effective_price?: number;
  availability?: string;
  offer_confidence: number;
  same_brand: boolean;
  same_pack: boolean;
  pack_size?: number;
  in_stock?: boolean;
  notes?: string;
  scraped_at?: string;
}

export interface PricingRecommendation {
  canonical_product_id: string;
  current_price: number;
  recommended_price: number;
  action: 'keep' | 'lower' | 'raise' | 'review' | 'suppress';
  reason: string;
  lowest_trusted_comparable_price: number | null;
  estimated_margin_percent_after_change: number;
  estimated_margin_dollars_after_change: number;
  confidence: number;
  auto_publish_eligible: boolean;
  review_reasons: string[];
}

// ============================================================================
// SYSTEM EVENTS
// ============================================================================

export const SYSTEM_EVENT_TYPES = [
  'supplier_file_uploaded',
  'supplier_ingestion_completed',
  'supplier_discovery_completed',
  'supplier_offer_created',
  'product_normalization_completed',
  'product_match_completed',
  'product_match_uncertain',
  'supplier_cost_changed',
  'competitor_price_check_completed',
  'pricing_recommendation_generated',
  'daily_guard_completed',
  'audit_completed',
  'manual_review_resolved',
] as const;

export type SystemEventType = typeof SYSTEM_EVENT_TYPES[number];

export interface SystemEventInput {
  event_type: SystemEventType;
  source_table?: string;
  source_id?: string;
  payload?: Record<string, unknown>;
}
