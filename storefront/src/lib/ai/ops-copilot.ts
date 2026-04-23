/**
 * AI Ops Copilot
 * 
 * Generates intelligent operational summaries for pipeline runs.
 * Highlights risks, critical items, and actionable insights for operators.
 */

import { supabaseAdmin } from '../jobs/supabase';
import { logger } from '../jobs/logger';

// ============================================================================
// TYPES
// ============================================================================

export interface OpsSummaryHighlight {
  category: 'critical' | 'warning' | 'info' | 'success';
  title: string;
  detail: string;
  action_link?: string;
  severity: number; // 1-10
}

export interface OpsSummary {
  run_type: string;
  run_id?: string;
  run_date: string;
  summary_text: string;
  highlights: OpsSummaryHighlight[];
  highest_risk_failures: FailureItem[];
  critical_review_items: ReviewItem[];
  margin_affecting_anomalies: PricingAnomaly[];
  suppliers_needing_attention: SupplierIssue[];
  metrics: RunMetrics;
}

interface FailureItem {
  job_id: string;
  job_type: string;
  error: string;
  impact: string;
  suggested_action: string;
}

interface ReviewItem {
  id: string;
  title: string;
  issue_category: string;
  priority: string;
  age_hours: number;
  recommended_action: string;
}

interface PricingAnomaly {
  product_id: string;
  product_name?: string;
  anomaly_type: string;
  current_price: number;
  issue_detail: string;
  margin_impact: string;
}

interface SupplierIssue {
  supplier_id: string;
  supplier_name?: string;
  issue_type: string;
  detail: string;
  recommendation: string;
}

interface RunMetrics {
  total_processed: number;
  successful: number;
  failed: number;
  sent_to_review: number;
  auto_approved: number;
  duration_ms?: number;
}

// ============================================================================
// SUMMARY GENERATORS
// ============================================================================

/**
 * Generate ops summary for an ingestion run
 */
export async function generateIngestionSummary(
  run_id: string,
  batch_id?: string
): Promise<OpsSummary> {
  const run_date = new Date().toISOString().split('T')[0];
  const highlights: OpsSummaryHighlight[] = [];
  const highest_risk_failures: FailureItem[] = [];
  const critical_review_items: ReviewItem[] = [];

  // Load recent job runs for this batch
  const { data: jobRuns } = await supabaseAdmin
    .from('job_runs')
    .select('*')
    .in('job_type', ['supplier_ingestion', 'product_normalization', 'product_match'])
    .gte('started_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order('started_at', { ascending: false })
    .limit(100);

  // Analyze failures
  const failures = (jobRuns || []).filter(j => j.status === 'failed');
  for (const failure of failures.slice(0, 5)) {
    highest_risk_failures.push({
      job_id: failure.job_id,
      job_type: failure.job_type,
      error: failure.error_message || 'Unknown error',
      impact: determineFailureImpact(failure.job_type, failure.input_payload),
      suggested_action: suggestFailureAction(failure.job_type, failure.error_message),
    });
  }

  if (failures.length > 0) {
    highlights.push({
      category: 'critical',
      title: `${failures.length} ingestion failures`,
      detail: `${failures.length} jobs failed in the last 24 hours`,
      action_link: '/admin/jobs?status=failed',
      severity: Math.min(failures.length * 2, 10),
    });
  }

  // Load critical review items
  const { data: reviews } = await supabaseAdmin
    .from('review_queue')
    .select('*')
    .eq('status', 'open')
    .in('priority', ['critical', 'high'])
    .order('created_at', { ascending: true })
    .limit(10);

  for (const review of reviews || []) {
    const ageMs = Date.now() - new Date(review.created_at).getTime();
    critical_review_items.push({
      id: review.id,
      title: review.title,
      issue_category: review.issue_category,
      priority: review.priority,
      age_hours: Math.round(ageMs / (1000 * 60 * 60)),
      recommended_action: review.recommended_action || 'Review and resolve',
    });
  }

  if (critical_review_items.length > 0) {
    const oldestAge = Math.max(...critical_review_items.map(r => r.age_hours));
    highlights.push({
      category: critical_review_items.some(r => r.priority === 'critical') ? 'critical' : 'warning',
      title: `${critical_review_items.length} critical review items pending`,
      detail: oldestAge > 24 ? `Oldest item is ${oldestAge} hours old` : 'Review items need attention',
      action_link: '/admin/review?priority=high',
      severity: Math.min(critical_review_items.length + (oldestAge > 24 ? 3 : 0), 10),
    });
  }

  // Calculate metrics
  const completed = (jobRuns || []).filter(j => j.status === 'completed').length;
  const failed = failures.length;
  const metrics: RunMetrics = {
    total_processed: (jobRuns || []).length,
    successful: completed,
    failed,
    sent_to_review: critical_review_items.length,
    auto_approved: completed - critical_review_items.length,
  };

  // Generate summary text
  const summary_parts: string[] = [];
  
  if (completed > 0) {
    summary_parts.push(`${completed} jobs completed successfully.`);
  }
  if (failed > 0) {
    summary_parts.push(`${failed} jobs failed and need attention.`);
  }
  if (critical_review_items.length > 0) {
    summary_parts.push(`${critical_review_items.length} items require manual review.`);
  }
  if (highlights.length === 0) {
    summary_parts.push('Pipeline is operating normally with no critical issues.');
  }

  const summary: OpsSummary = {
    run_type: 'ingestion',
    run_id,
    run_date,
    summary_text: summary_parts.join(' '),
    highlights,
    highest_risk_failures,
    critical_review_items,
    margin_affecting_anomalies: [],
    suppliers_needing_attention: [],
    metrics,
  };

  // Persist summary
  await persistOpsSummary(summary);

  return summary;
}

/**
 * Generate ops summary for daily price guard run
 */
export async function generatePriceGuardSummary(run_id?: string): Promise<OpsSummary> {
  const run_date = new Date().toISOString().split('T')[0];
  const highlights: OpsSummaryHighlight[] = [];
  const margin_affecting_anomalies: PricingAnomaly[] = [];

  // Load recent pricing anomalies
  const { data: anomalies } = await supabaseAdmin
    .from('ai_pricing_analysis')
    .select('*')
    .eq('is_suspicious', true)
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(20);

  for (const anomaly of anomalies || []) {
    margin_affecting_anomalies.push({
      product_id: anomaly.canonical_product_id,
      anomaly_type: anomaly.analysis_category,
      current_price: anomaly.offer_price || 0,
      issue_detail: anomaly.reasoning_summary,
      margin_impact: anomaly.is_suspicious ? 'Potential margin risk' : 'Monitor',
    });
  }

  if (margin_affecting_anomalies.length > 0) {
    highlights.push({
      category: 'warning',
      title: `${margin_affecting_anomalies.length} pricing anomalies detected`,
      detail: 'Review suspicious prices before they affect margin',
      action_link: '/admin/review?type=pricing',
      severity: Math.min(margin_affecting_anomalies.length, 8),
    });
  }

  // Load daily actions summary
  const { data: dailyActions } = await supabaseAdmin
    .from('daily_actions')
    .select('action_type')
    .eq('run_date', run_date);

  const actionCounts: Record<string, number> = {};
  for (const action of dailyActions || []) {
    actionCounts[action.action_type] = (actionCounts[action.action_type] || 0) + 1;
  }

  if (actionCounts['pricing_review']) {
    highlights.push({
      category: 'info',
      title: `${actionCounts['pricing_review']} products need pricing review`,
      detail: 'Price changes detected that require approval',
      severity: 5,
    });
  }

  if (actionCounts['auto_publish']) {
    highlights.push({
      category: 'success',
      title: `${actionCounts['auto_publish']} prices auto-updated`,
      detail: 'Safe price changes applied automatically',
      severity: 2,
    });
  }

  const metrics: RunMetrics = {
    total_processed: (dailyActions || []).length,
    successful: actionCounts['auto_publish'] || 0,
    failed: 0,
    sent_to_review: actionCounts['pricing_review'] || 0,
    auto_approved: actionCounts['auto_publish'] || 0,
  };

  const summary_parts: string[] = [];
  if (metrics.total_processed > 0) {
    summary_parts.push(`Processed ${metrics.total_processed} pricing actions.`);
  }
  if (margin_affecting_anomalies.length > 0) {
    summary_parts.push(`${margin_affecting_anomalies.length} anomalies detected.`);
  }
  if (highlights.length === 0) {
    summary_parts.push('Price guard completed with no issues.');
  }

  const summary: OpsSummary = {
    run_type: 'daily_guard',
    run_id,
    run_date,
    summary_text: summary_parts.join(' '),
    highlights,
    highest_risk_failures: [],
    critical_review_items: [],
    margin_affecting_anomalies,
    suppliers_needing_attention: [],
    metrics,
  };

  await persistOpsSummary(summary);

  return summary;
}

/**
 * Generate ops summary for audit run
 */
export async function generateAuditSummary(audit_report_id?: string): Promise<OpsSummary> {
  const run_date = new Date().toISOString().split('T')[0];
  const highlights: OpsSummaryHighlight[] = [];

  // Load latest audit report
  let auditData: Record<string, unknown> | null = null;
  
  if (audit_report_id) {
    const { data } = await supabaseAdmin
      .from('audit_reports')
      .select('*')
      .eq('id', audit_report_id)
      .single();
    auditData = data;
  } else {
    const { data } = await supabaseAdmin
      .from('audit_reports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    auditData = data;
  }

  if (!auditData) {
    return {
      run_type: 'audit',
      run_date,
      summary_text: 'No audit report available',
      highlights: [],
      highest_risk_failures: [],
      critical_review_items: [],
      margin_affecting_anomalies: [],
      suppliers_needing_attention: [],
      metrics: { total_processed: 0, successful: 0, failed: 0, sent_to_review: 0, auto_approved: 0 },
    };
  }

  const summary = auditData.summary as Record<string, number> || {};
  const systemic_issues = (auditData.systemic_issues as unknown[]) || [];
  const blocked_actions = (auditData.blocked_actions as unknown[]) || [];

  if (systemic_issues.length > 0) {
    highlights.push({
      category: 'critical',
      title: `${systemic_issues.length} systemic issues identified`,
      detail: 'Patterns detected that may indicate broader problems',
      action_link: `/admin/audit-reports/${auditData.id}`,
      severity: 9,
    });
  }

  if (blocked_actions.length > 0) {
    highlights.push({
      category: 'warning',
      title: `${blocked_actions.length} actions blocked`,
      detail: 'Unsafe operations were prevented',
      severity: 6,
    });
  }

  if (summary.safe_auto_fixes_applied > 0) {
    highlights.push({
      category: 'success',
      title: `${summary.safe_auto_fixes_applied} safe fixes applied`,
      detail: 'Automatic corrections improved data quality',
      severity: 2,
    });
  }

  const metrics: RunMetrics = {
    total_processed: summary.records_audited || 0,
    successful: summary.safe_auto_fixes_applied || 0,
    failed: summary.items_blocked || 0,
    sent_to_review: summary.items_sent_to_review || 0,
    auto_approved: summary.safe_auto_fixes_applied || 0,
  };

  const summary_parts: string[] = [];
  summary_parts.push(`Audited ${metrics.total_processed} records.`);
  if (summary.issues_found > 0) {
    summary_parts.push(`Found ${summary.issues_found} issues.`);
  }
  if (metrics.successful > 0) {
    summary_parts.push(`Applied ${metrics.successful} safe fixes.`);
  }

  const opsSummary: OpsSummary = {
    run_type: 'audit',
    run_id: audit_report_id,
    run_date,
    summary_text: summary_parts.join(' '),
    highlights,
    highest_risk_failures: [],
    critical_review_items: [],
    margin_affecting_anomalies: [],
    suppliers_needing_attention: [],
    metrics,
  };

  await persistOpsSummary(opsSummary);

  return opsSummary;
}

/**
 * Generate supplier discovery summary
 */
export async function generateDiscoverySummary(run_id?: string): Promise<OpsSummary> {
  const run_date = new Date().toISOString().split('T')[0];
  const highlights: OpsSummaryHighlight[] = [];
  const suppliers_needing_attention: SupplierIssue[] = [];

  // Load recent supplier analyses
  const { data: analyses } = await supabaseAdmin
    .from('ai_supplier_analysis')
    .select('*')
    .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .order('priority_score', { ascending: false })
    .limit(20);

  // High priority suppliers
  const highPriority = (analyses || []).filter(a => a.ingestion_priority === 'high');
  if (highPriority.length > 0) {
    highlights.push({
      category: 'info',
      title: `${highPriority.length} high-priority suppliers discovered`,
      detail: 'New suppliers ready for ingestion',
      severity: 4,
    });
  }

  // Suppliers with red flags
  for (const analysis of analyses || []) {
    const redFlags = (analysis.red_flags as unknown[]) || [];
    if (redFlags.length > 0) {
      suppliers_needing_attention.push({
        supplier_id: analysis.supplier_lead_id || analysis.supplier_id,
        issue_type: 'red_flags',
        detail: `${redFlags.length} concerns identified`,
        recommendation: analysis.recommendation_reasoning,
      });
    }
  }

  // Potential duplicates
  const duplicates = (analyses || []).filter(a => a.duplicate_confidence > 0.8);
  if (duplicates.length > 0) {
    highlights.push({
      category: 'warning',
      title: `${duplicates.length} potential duplicate suppliers`,
      detail: 'Review before creating new supplier records',
      action_link: '/admin/review?type=supplier',
      severity: 5,
    });
  }

  const metrics: RunMetrics = {
    total_processed: (analyses || []).length,
    successful: highPriority.length,
    failed: 0,
    sent_to_review: suppliers_needing_attention.length,
    auto_approved: (analyses || []).filter(a => a.ingestion_recommended).length,
  };

  const summary_parts: string[] = [];
  summary_parts.push(`Analyzed ${metrics.total_processed} supplier leads.`);
  if (highPriority.length > 0) {
    summary_parts.push(`${highPriority.length} ready for ingestion.`);
  }
  if (duplicates.length > 0) {
    summary_parts.push(`${duplicates.length} potential duplicates found.`);
  }

  const summary: OpsSummary = {
    run_type: 'discovery',
    run_id,
    run_date,
    summary_text: summary_parts.join(' '),
    highlights,
    highest_risk_failures: [],
    critical_review_items: [],
    margin_affecting_anomalies: [],
    suppliers_needing_attention,
    metrics,
  };

  await persistOpsSummary(summary);

  return summary;
}

// ============================================================================
// HELPERS
// ============================================================================

function determineFailureImpact(job_type: string, payload: unknown): string {
  switch (job_type) {
    case 'supplier_ingestion':
      return 'New products may not be available in catalog';
    case 'product_normalization':
      return 'Product data may be incomplete or incorrect';
    case 'product_match':
      return 'Product may be miscategorized or duplicated';
    case 'pricing_recommendation':
      return 'Pricing may not be competitive';
    default:
      return 'Pipeline processing incomplete';
  }
}

function suggestFailureAction(job_type: string, error: string | null): string {
  if (error?.includes('timeout')) {
    return 'Retry job - likely transient timeout';
  }
  if (error?.includes('not found')) {
    return 'Check source data availability';
  }
  if (error?.includes('validation')) {
    return 'Review input data for errors';
  }
  
  switch (job_type) {
    case 'supplier_ingestion':
      return 'Verify supplier feed is accessible and correctly formatted';
    case 'product_normalization':
      return 'Check raw product data for missing required fields';
    case 'product_match':
      return 'Review product attributes for matching issues';
    default:
      return 'Investigate error logs and retry';
  }
}

async function persistOpsSummary(summary: OpsSummary): Promise<void> {
  try {
    await supabaseAdmin
      .from('ai_ops_summaries')
      .insert({
        run_type: summary.run_type,
        run_id: summary.run_id,
        run_date: summary.run_date,
        summary_text: summary.summary_text,
        highlights: summary.highlights,
        highest_risk_failures: summary.highest_risk_failures,
        critical_review_items: summary.critical_review_items,
        margin_affecting_anomalies: summary.margin_affecting_anomalies,
        suppliers_needing_attention: summary.suppliers_needing_attention,
        metrics: summary.metrics,
      });
  } catch (error) {
    logger.warn('Failed to persist ops summary', { 
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ============================================================================
// GET LATEST SUMMARIES
// ============================================================================

export async function getLatestSummaries(limit: number = 5): Promise<OpsSummary[]> {
  const { data, error } = await supabaseAdmin
    .from('ai_ops_summaries')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    logger.warn('Failed to load ops summaries', { error: error.message });
    return [];
  }

  return (data || []).map(row => ({
    run_type: row.run_type,
    run_id: row.run_id,
    run_date: row.run_date,
    summary_text: row.summary_text,
    highlights: row.highlights || [],
    highest_risk_failures: row.highest_risk_failures || [],
    critical_review_items: row.critical_review_items || [],
    margin_affecting_anomalies: row.margin_affecting_anomalies || [],
    suppliers_needing_attention: row.suppliers_needing_attention || [],
    metrics: row.metrics || { total_processed: 0, successful: 0, failed: 0, sent_to_review: 0, auto_approved: 0 },
  }));
}

export async function getTodaySummary(): Promise<OpsSummary | null> {
  const today = new Date().toISOString().split('T')[0];
  
  const { data } = await supabaseAdmin
    .from('ai_ops_summaries')
    .select('*')
    .eq('run_date', today)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!data) return null;

  return {
    run_type: data.run_type,
    run_id: data.run_id,
    run_date: data.run_date,
    summary_text: data.summary_text,
    highlights: data.highlights || [],
    highest_risk_failures: data.highest_risk_failures || [],
    critical_review_items: data.critical_review_items || [],
    margin_affecting_anomalies: data.margin_affecting_anomalies || [],
    suppliers_needing_attention: data.suppliers_needing_attention || [],
    metrics: data.metrics || { total_processed: 0, successful: 0, failed: 0, sent_to_review: 0, auto_approved: 0 },
  };
}

// ============================================================================
// DAILY INTELLIGENCE REPORT
// ============================================================================

export interface DailyOpsReport {
  report_date: string;
  generated_at: string;
  executive_summary: string;
  
  // Top anomalies
  top_anomalies: Array<{
    type: string;
    count: number;
    severity: 'critical' | 'high' | 'medium' | 'low';
    examples: string[];
  }>;
  
  // Pricing intelligence
  largest_price_spreads: Array<{
    product_id: string;
    product_name: string;
    spread_percentage: number;
    min_price: number;
    max_price: number;
    savings_opportunity: number;
  }>;
  
  // AI performance
  most_corrected_ai_decisions: Array<{
    decision_type: string;
    correction_count: number;
    correction_rate: number;
    examples: string[];
  }>;
  
  // Supplier issues
  suppliers_with_most_errors: Array<{
    supplier_id: string;
    supplier_name: string;
    error_count: number;
    error_types: string[];
  }>;
  
  // Synonym corrections
  frequent_synonym_corrections: Array<{
    field_name: string;
    raw_term: string;
    corrected_to: string;
    occurrence_count: number;
  }>;
  
  // Actionable insights
  recommendations: string[];
  
  // Performance metrics
  ai_accuracy_summary: {
    extraction_accuracy: number;
    match_accuracy: number;
    pricing_precision: number;
    overall_health: 'healthy' | 'degraded' | 'critical';
  };
}

export async function generateDailyOpsReport(): Promise<DailyOpsReport> {
  const report_date = new Date().toISOString().split('T')[0];
  const generated_at = new Date().toISOString();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  
  // -------------------------------------------------------------------------
  // 1. TOP ANOMALIES
  // -------------------------------------------------------------------------
  const { data: pricingAnomalies } = await supabaseAdmin
    .from('ai_pricing_analysis')
    .select('analysis_category, is_suspicious')
    .gte('created_at', yesterday)
    .eq('is_suspicious', true);
    
  const anomalyCounts: Record<string, number> = {};
  for (const a of pricingAnomalies || []) {
    anomalyCounts[a.analysis_category] = (anomalyCounts[a.analysis_category] || 0) + 1;
  }
  
  const top_anomalies = Object.entries(anomalyCounts)
    .map(([type, count]) => ({
      type,
      count,
      severity: count > 10 ? 'critical' as const : count > 5 ? 'high' as const : 'medium' as const,
      examples: [],
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  
  // -------------------------------------------------------------------------
  // 2. LARGEST PRICE SPREADS
  // -------------------------------------------------------------------------
  const { data: priceData } = await supabaseAdmin
    .from('ai_pricing_analysis')
    .select('canonical_product_id, offer_price, market_avg, reasoning_summary')
    .gte('created_at', yesterday)
    .limit(100);
    
  const productPrices: Record<string, { prices: number[]; name: string }> = {};
  for (const p of priceData || []) {
    if (!productPrices[p.canonical_product_id]) {
      productPrices[p.canonical_product_id] = { prices: [], name: '' };
    }
    if (p.offer_price) {
      productPrices[p.canonical_product_id].prices.push(p.offer_price);
    }
  }
  
  const largest_price_spreads = Object.entries(productPrices)
    .filter(([_, v]) => v.prices.length >= 2)
    .map(([product_id, v]) => {
      const min_price = Math.min(...v.prices);
      const max_price = Math.max(...v.prices);
      const spread_percentage = ((max_price - min_price) / min_price) * 100;
      return {
        product_id,
        product_name: '',
        spread_percentage: Math.round(spread_percentage * 10) / 10,
        min_price,
        max_price,
        savings_opportunity: max_price - min_price,
      };
    })
    .sort((a, b) => b.spread_percentage - a.spread_percentage)
    .slice(0, 10);
  
  // -------------------------------------------------------------------------
  // 3. MOST CORRECTED AI DECISIONS
  // -------------------------------------------------------------------------
  const { data: feedback } = await supabaseAdmin
    .from('ai_feedback')
    .select('feedback_type, decision, corrected_decision')
    .gte('created_at', yesterday)
    .not('corrected_decision', 'is', null);
    
  const correctionsByType: Record<string, { count: number; total: number }> = {};
  for (const f of feedback || []) {
    if (!correctionsByType[f.feedback_type]) {
      correctionsByType[f.feedback_type] = { count: 0, total: 0 };
    }
    correctionsByType[f.feedback_type].total++;
    if (f.corrected_decision && f.corrected_decision !== f.decision) {
      correctionsByType[f.feedback_type].count++;
    }
  }
  
  const most_corrected_ai_decisions = Object.entries(correctionsByType)
    .map(([decision_type, { count, total }]) => ({
      decision_type,
      correction_count: count,
      correction_rate: total > 0 ? Math.round((count / total) * 100) / 100 : 0,
      examples: [],
    }))
    .sort((a, b) => b.correction_count - a.correction_count)
    .slice(0, 5);
  
  // -------------------------------------------------------------------------
  // 4. SUPPLIERS WITH MOST ERRORS
  // -------------------------------------------------------------------------
  const { data: failedJobs } = await supabaseAdmin
    .from('job_runs')
    .select('input_payload, error_message')
    .eq('status', 'failed')
    .gte('started_at', yesterday);
    
  const supplierErrors: Record<string, { count: number; types: Set<string> }> = {};
  for (const j of failedJobs || []) {
    const payload = j.input_payload as Record<string, unknown> || {};
    const supplierId = (payload.supplier_id || payload.supplierId || 'unknown') as string;
    if (!supplierErrors[supplierId]) {
      supplierErrors[supplierId] = { count: 0, types: new Set() };
    }
    supplierErrors[supplierId].count++;
    if (j.error_message) {
      supplierErrors[supplierId].types.add(extractErrorType(j.error_message));
    }
  }
  
  const suppliers_with_most_errors = Object.entries(supplierErrors)
    .map(([supplier_id, { count, types }]) => ({
      supplier_id,
      supplier_name: '',
      error_count: count,
      error_types: Array.from(types),
    }))
    .sort((a, b) => b.error_count - a.error_count)
    .slice(0, 5);
  
  // -------------------------------------------------------------------------
  // 5. FREQUENT SYNONYM CORRECTIONS
  // -------------------------------------------------------------------------
  const { data: synonymFeedback } = await supabaseAdmin
    .from('ai_synonyms')
    .select('field_name, raw_term, normalized_term')
    .eq('source', 'learned')
    .gte('created_at', yesterday);
    
  const synonymCounts: Record<string, { field_name: string; raw_term: string; corrected_to: string; count: number }> = {};
  for (const s of synonymFeedback || []) {
    const key = `${s.field_name}:${s.raw_term}`;
    if (!synonymCounts[key]) {
      synonymCounts[key] = {
        field_name: s.field_name,
        raw_term: s.raw_term,
        corrected_to: s.normalized_term,
        count: 0,
      };
    }
    synonymCounts[key].count++;
  }
  
  const frequent_synonym_corrections = Object.values(synonymCounts)
    .map(v => ({
      field_name: v.field_name,
      raw_term: v.raw_term,
      corrected_to: v.corrected_to,
      occurrence_count: v.count,
    }))
    .sort((a, b) => b.occurrence_count - a.occurrence_count)
    .slice(0, 10);
  
  // -------------------------------------------------------------------------
  // 6. AI ACCURACY SUMMARY
  // -------------------------------------------------------------------------
  const { data: metrics } = await supabaseAdmin
    .from('ai_performance_metrics')
    .select('metric_type, metric_value, sample_size')
    .gte('created_at', yesterday);
    
  const metricAverages: Record<string, { sum: number; count: number }> = {};
  for (const m of metrics || []) {
    if (!metricAverages[m.metric_type]) {
      metricAverages[m.metric_type] = { sum: 0, count: 0 };
    }
    metricAverages[m.metric_type].sum += Number(m.metric_value);
    metricAverages[m.metric_type].count++;
  }
  
  const getAvg = (type: string) => {
    const entry = metricAverages[type];
    return entry ? Math.round((entry.sum / entry.count) * 100) / 100 : 0;
  };
  
  const extraction_accuracy = getAvg('extraction_accuracy');
  const match_accuracy = getAvg('match_accuracy');
  const pricing_precision = getAvg('pricing_anomaly_precision');
  
  const overallScore = (extraction_accuracy + match_accuracy + pricing_precision) / 3;
  const overall_health = overallScore >= 0.8 ? 'healthy' : overallScore >= 0.6 ? 'degraded' : 'critical';
  
  // -------------------------------------------------------------------------
  // 7. RECOMMENDATIONS
  // -------------------------------------------------------------------------
  const recommendations: string[] = [];
  
  if (top_anomalies.length > 0 && top_anomalies[0].count > 10) {
    recommendations.push(`High volume of ${top_anomalies[0].type} anomalies - investigate root cause`);
  }
  
  if (largest_price_spreads.length > 0 && largest_price_spreads[0].spread_percentage > 30) {
    recommendations.push(`Large price spread detected (${largest_price_spreads[0].spread_percentage}%) - review supplier pricing`);
  }
  
  if (most_corrected_ai_decisions.length > 0 && most_corrected_ai_decisions[0].correction_rate > 0.3) {
    recommendations.push(`High correction rate for ${most_corrected_ai_decisions[0].decision_type} - consider model retraining`);
  }
  
  if (suppliers_with_most_errors.length > 0 && suppliers_with_most_errors[0].error_count > 5) {
    recommendations.push(`Supplier ${suppliers_with_most_errors[0].supplier_id} causing multiple errors - review feed quality`);
  }
  
  if (frequent_synonym_corrections.length > 3) {
    recommendations.push(`Multiple synonym corrections detected - review and approve pending synonyms`);
  }
  
  if (recommendations.length === 0) {
    recommendations.push('All systems operating normally - no immediate action required');
  }
  
  // -------------------------------------------------------------------------
  // 8. EXECUTIVE SUMMARY
  // -------------------------------------------------------------------------
  const summaryParts: string[] = [];
  summaryParts.push(`Daily report for ${report_date}.`);
  
  if (top_anomalies.length > 0) {
    const totalAnomalies = top_anomalies.reduce((s, a) => s + a.count, 0);
    summaryParts.push(`${totalAnomalies} pricing anomalies detected.`);
  }
  
  if (most_corrected_ai_decisions.length > 0) {
    const totalCorrections = most_corrected_ai_decisions.reduce((s, d) => s + d.correction_count, 0);
    summaryParts.push(`${totalCorrections} AI decisions corrected by operators.`);
  }
  
  summaryParts.push(`Overall AI health: ${overall_health}.`);
  
  const report: DailyOpsReport = {
    report_date,
    generated_at,
    executive_summary: summaryParts.join(' '),
    top_anomalies,
    largest_price_spreads,
    most_corrected_ai_decisions,
    suppliers_with_most_errors,
    frequent_synonym_corrections,
    recommendations,
    ai_accuracy_summary: {
      extraction_accuracy,
      match_accuracy,
      pricing_precision,
      overall_health,
    },
  };
  
  // Persist as ops summary
  await persistOpsSummary({
    run_type: 'daily_intelligence',
    run_date: report_date,
    summary_text: report.executive_summary,
    highlights: recommendations.map((rec, i) => ({
      category: i === 0 && overall_health === 'critical' ? 'critical' as const : 'info' as const,
      title: rec.slice(0, 50),
      detail: rec,
      severity: 5,
    })),
    highest_risk_failures: [],
    critical_review_items: [],
    margin_affecting_anomalies: largest_price_spreads.slice(0, 5).map(s => ({
      product_id: s.product_id,
      product_name: s.product_name,
      anomaly_type: 'price_spread',
      current_price: s.min_price,
      issue_detail: `${s.spread_percentage}% spread`,
      margin_impact: `$${s.savings_opportunity.toFixed(2)} potential savings`,
    })),
    suppliers_needing_attention: suppliers_with_most_errors.map(s => ({
      supplier_id: s.supplier_id,
      supplier_name: s.supplier_name,
      issue_type: 'ingestion_errors',
      detail: `${s.error_count} errors`,
      recommendation: 'Review feed quality',
    })),
    metrics: {
      total_processed: (pricingAnomalies || []).length,
      successful: Math.round(extraction_accuracy * 100),
      failed: suppliers_with_most_errors.reduce((s, e) => s + e.error_count, 0),
      sent_to_review: most_corrected_ai_decisions.reduce((s, d) => s + d.correction_count, 0),
      auto_approved: 0,
    },
  });
  
  return report;
}

function extractErrorType(errorMessage: string): string {
  if (errorMessage.includes('timeout')) return 'timeout';
  if (errorMessage.includes('validation')) return 'validation';
  if (errorMessage.includes('not found')) return 'not_found';
  if (errorMessage.includes('parse')) return 'parse_error';
  if (errorMessage.includes('connection')) return 'connection';
  return 'unknown';
}
