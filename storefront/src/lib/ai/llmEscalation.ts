/**
 * Selective LLM Escalation Service
 * 
 * Only escalates to LLM when confidence is low.
 * LLM is advisory, not authoritative - never overrides hard constraints.
 */

import { getOpenAIClient } from './openai';
import { supabaseAdmin } from '../jobs/supabase';

// ============================================================================
// TYPES
// ============================================================================

export interface LLMDecision {
  decision: string;
  confidence: number;
  reasoning: string;
  recommended_action: string;
  escalated: boolean;
  tokens_used?: number;
}

interface ExtractionContext {
  raw_title: string;
  raw_description?: string;
  current_extraction: Record<string, unknown>;
  confidence: number;
  ambiguous_fields: string[];
}

interface MatchContext {
  supplier_product: Record<string, unknown>;
  canonical_product: Record<string, unknown>;
  current_confidence: number;
  conflicting_fields: string[];
}

interface PricingContext {
  offer_price: number;
  market_avg: number;
  market_min: number;
  market_max: number;
  current_analysis: string;
  confidence: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

interface EscalationConfig {
  extraction_threshold: number;
  matching_threshold: number;
  pricing_threshold: number;
  enabled: boolean;
  daily_cost_limit: number;
  rate_limit_per_minute: number;
}

let cachedConfig: EscalationConfig | null = null;
let configLoadedAt = 0;
const CONFIG_TTL = 60000; // 1 minute

// FIX: Add rate limit caching to reduce DB queries
let cachedRateLimitCount = 0;
let cachedRateLimitTime = 0;
const RATE_LIMIT_CACHE_TTL = 5000; // 5 seconds

async function getEscalationConfig(): Promise<EscalationConfig> {
  if (cachedConfig && Date.now() - configLoadedAt < CONFIG_TTL) {
    return cachedConfig;
  }
  
  const supabase = supabaseAdmin;
  
  const { data: rules } = await supabase
    .from('agent_rules')
    .select('rule_key, rule_value')
    .eq('agent_name', 'ai_system')
    .eq('is_enabled', true);
    
  const ruleMap = new Map<string, string>(
    (rules || []).map((r: { rule_key: string; rule_value: unknown }) => 
      [r.rule_key, String(r.rule_value ?? '')]
    )
  );
  
  cachedConfig = {
    extraction_threshold: parseFloat(ruleMap.get('extraction_confidence_threshold') || '0.65'),
    matching_threshold: parseFloat(ruleMap.get('matching_confidence_threshold') || '0.70'),
    pricing_threshold: parseFloat(ruleMap.get('pricing_confidence_threshold') || '0.65'),
    enabled: ruleMap.get('llm_escalation_enabled') === 'true',
    daily_cost_limit: parseFloat(ruleMap.get('daily_llm_cost_limit') || '10.00'),
    rate_limit_per_minute: parseInt(ruleMap.get('llm_rate_limit_per_minute') || '60', 10),
  };
  
  configLoadedAt = Date.now();
  return cachedConfig;
}

// ============================================================================
// COST AND RATE LIMITING
// ============================================================================

async function checkCostLimit(): Promise<boolean> {
  const config = await getEscalationConfig();
  const supabase = supabaseAdmin;
  
  const today = new Date().toISOString().split('T')[0];
  
  const { data } = await supabase
    .from('ai_llm_usage')
    .select('cost_estimate')
    .gte('created_at', today);
    
  const dailyCost = (data || []).reduce(
    (sum: number, row: { cost_estimate: unknown }) => sum + Number(row.cost_estimate || 0), 0
  );
  
  return dailyCost < config.daily_cost_limit;
}

async function checkRateLimit(): Promise<boolean> {
  const config = await getEscalationConfig();
  const now = Date.now();
  
  // FIX: Use cached rate limit count to reduce DB queries
  if (now - cachedRateLimitTime < RATE_LIMIT_CACHE_TTL) {
    return cachedRateLimitCount < config.rate_limit_per_minute;
  }
  
  const supabase = supabaseAdmin;
  const oneMinuteAgo = new Date(now - 60000).toISOString();
  
  const { count } = await supabase
    .from('ai_llm_usage')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', oneMinuteAgo);
  
  cachedRateLimitCount = count || 0;
  cachedRateLimitTime = now;
    
  return cachedRateLimitCount < config.rate_limit_per_minute;
}

async function recordLLMUsage(
  request_type: string,
  tokens_input: number,
  tokens_output: number,
  latency_ms: number,
  success: boolean,
  error_message?: string,
  pipeline_run_id?: string
): Promise<void> {
  const supabase = supabaseAdmin;
  
  // Approximate cost calculation (GPT-4o-mini pricing)
  const INPUT_COST_PER_1K = 0.00015;
  const OUTPUT_COST_PER_1K = 0.0006;
  
  const cost_estimate = 
    (tokens_input / 1000) * INPUT_COST_PER_1K +
    (tokens_output / 1000) * OUTPUT_COST_PER_1K;
    
  await supabase.from('ai_llm_usage').insert({
    request_type,
    model: 'gpt-4o-mini',
    tokens_input,
    tokens_output,
    tokens_total: tokens_input + tokens_output,
    cost_estimate,
    latency_ms,
    success,
    error_message,
    pipeline_run_id,
  });
}

// ============================================================================
// ESCALATION CHECK
// ============================================================================

async function shouldEscalate(
  escalation_type: 'extraction' | 'matching' | 'pricing',
  current_confidence: number
): Promise<boolean> {
  const config = await getEscalationConfig();
  
  if (!config.enabled) {
    return false;
  }
  
  const thresholds = {
    extraction: config.extraction_threshold,
    matching: config.matching_threshold,
    pricing: config.pricing_threshold,
  };
  
  if (current_confidence >= thresholds[escalation_type]) {
    return false;
  }
  
  // Check limits
  const withinCost = await checkCostLimit();
  const withinRate = await checkRateLimit();
  
  return withinCost && withinRate;
}

// ============================================================================
// EXTRACTION ESCALATION
// ============================================================================

export async function resolveExtractionAmbiguity(
  context: ExtractionContext,
  pipeline_run_id?: string
): Promise<LLMDecision> {
  const needsEscalation = await shouldEscalate('extraction', context.confidence);
  
  if (!needsEscalation) {
    return {
      decision: 'no_escalation',
      confidence: context.confidence,
      reasoning: 'Confidence above threshold or escalation disabled',
      recommended_action: 'use_rules_output',
      escalated: false,
    };
  }
  
  const startTime = Date.now();
  
  try {
    const client = getOpenAIClient();
    if (!client) {
      throw new Error('OpenAI client not configured');
    }
    
    const prompt = buildExtractionPrompt(context);
    
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a PPE product attribute extraction specialist.
Your task is to resolve ambiguities in product attribute extraction.
Focus on: material, color, size, brand, grade, thickness, pack quantity.
Output valid JSON only.`,
        },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 500,
      temperature: 0.1,
    });
    
    const latency = Date.now() - startTime;
    const usage = response.usage;
    
    await recordLLMUsage(
      'extraction_ambiguity',
      usage?.prompt_tokens || 0,
      usage?.completion_tokens || 0,
      latency,
      true,
      undefined,
      pipeline_run_id
    );
    
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty LLM response');
    }
    
    const parsed = JSON.parse(content);
    
    // FIX: Validate LLM response structure
    const resolution = typeof parsed.resolution === 'string' ? parsed.resolution : 'uncertain';
    const llmConfidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.6;
    const reasoning = typeof parsed.reasoning === 'string' ? parsed.reasoning : 'LLM analysis';
    const action = typeof parsed.recommended_action === 'string' ? parsed.recommended_action : 'review';
    
    return {
      decision: resolution,
      // FIX: Cap LLM confidence at 0.75 to prevent auto-approval bypass
      // Auto-approval typically requires >= 0.85; LLM should not reach that threshold
      confidence: Math.min(llmConfidence, 0.75),
      reasoning,
      recommended_action: action,
      escalated: true,
      tokens_used: (usage?.prompt_tokens || 0) + (usage?.completion_tokens || 0),
    };
    
  } catch (error) {
    const latency = Date.now() - startTime;
    
    await recordLLMUsage(
      'extraction_ambiguity',
      0,
      0,
      latency,
      false,
      error instanceof Error ? error.message : 'Unknown error',
      pipeline_run_id
    );
    
    return {
      decision: 'escalation_failed',
      confidence: context.confidence,
      reasoning: `LLM escalation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      recommended_action: 'review',
      escalated: true,
    };
  }
}

function buildExtractionPrompt(context: ExtractionContext): string {
  return `Product extraction needs resolution.

Raw Title: ${context.raw_title}
${context.raw_description ? `Description: ${context.raw_description}` : ''}

Current extraction (confidence ${(context.confidence * 100).toFixed(0)}%):
${JSON.stringify(context.current_extraction, null, 2)}

Ambiguous fields requiring resolution: ${context.ambiguous_fields.join(', ')}

Analyze the raw text and resolve ambiguities for the listed fields.
For each ambiguous field, provide your best interpretation.

Respond with JSON:
{
  "resolution": "resolved" | "partial" | "uncertain",
  "resolved_fields": {
    "field_name": "resolved_value",
    ...
  },
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation of your resolution logic",
  "recommended_action": "accept" | "review" | "reject"
}`;
}

// ============================================================================
// MATCHING ESCALATION
// ============================================================================

export async function resolveMatchAmbiguity(
  context: MatchContext,
  pipeline_run_id?: string
): Promise<LLMDecision> {
  const needsEscalation = await shouldEscalate('matching', context.current_confidence);
  
  if (!needsEscalation) {
    return {
      decision: 'no_escalation',
      confidence: context.current_confidence,
      reasoning: 'Confidence above threshold or escalation disabled',
      recommended_action: 'use_rules_output',
      escalated: false,
    };
  }
  
  const startTime = Date.now();
  
  try {
    const client = getOpenAIClient();
    if (!client) {
      throw new Error('OpenAI client not configured');
    }
    
    const prompt = buildMatchingPrompt(context);
    
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a product matching specialist for PPE (gloves).
Your task is to determine if two products are the same or different.

CRITICAL: You cannot override hard constraints. If material, size, sterile status, thickness, or pack quantity differ, they are DIFFERENT products regardless of semantic similarity.

Output valid JSON only.`,
        },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 500,
      temperature: 0.1,
    });
    
    const latency = Date.now() - startTime;
    const usage = response.usage;
    
    await recordLLMUsage(
      'match_ambiguity',
      usage?.prompt_tokens || 0,
      usage?.completion_tokens || 0,
      latency,
      true,
      undefined,
      pipeline_run_id
    );
    
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty LLM response');
    }
    
    const parsed = JSON.parse(content);
    
    // SAFETY: LLM cannot recommend match if hard constraints fail
    // FIX: Complete list of hard constraint fields (including sterility, grade, powder)
    const HARD_CONSTRAINT_FIELDS = [
      'material', 'size', 'sterile', 'sterility', 'thickness_mil', 
      'units_per_box', 'units_per_case', 'grade', 'powder', 'powder_free'
    ];
    const hasHardConflicts = context.conflicting_fields.some(f =>
      HARD_CONSTRAINT_FIELDS.includes(f.toLowerCase())
    );
    
    if (hasHardConflicts && parsed.match_recommendation === 'match') {
      return {
        decision: 'forced_review',
        confidence: context.current_confidence,
        reasoning: 'LLM suggested match but hard constraints conflict - forcing review',
        recommended_action: 'review',
        escalated: true,
        tokens_used: (usage?.prompt_tokens || 0) + (usage?.completion_tokens || 0),
      };
    }
    
    return {
      decision: parsed.match_recommendation || 'uncertain',
      confidence: Math.min(parsed.confidence || 0.6, 0.85),
      reasoning: parsed.reasoning || 'LLM analysis',
      recommended_action: parsed.recommended_action || 'review',
      escalated: true,
      tokens_used: (usage?.prompt_tokens || 0) + (usage?.completion_tokens || 0),
    };
    
  } catch (error) {
    const latency = Date.now() - startTime;
    
    await recordLLMUsage(
      'match_ambiguity',
      0,
      0,
      latency,
      false,
      error instanceof Error ? error.message : 'Unknown error',
      pipeline_run_id
    );
    
    return {
      decision: 'escalation_failed',
      confidence: context.current_confidence,
      reasoning: `LLM escalation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      recommended_action: 'review',
      escalated: true,
    };
  }
}

function buildMatchingPrompt(context: MatchContext): string {
  return `Product matching evaluation needed.

Supplier Product:
${JSON.stringify(context.supplier_product, null, 2)}

Canonical Product:
${JSON.stringify(context.canonical_product, null, 2)}

Current confidence: ${(context.current_confidence * 100).toFixed(0)}%
Conflicting fields: ${context.conflicting_fields.join(', ') || 'none identified'}

IMPORTANT: If material, size, sterile status, thickness, or pack quantity differ, 
these are DIFFERENT products - do not recommend a match.

Analyze these products and determine:
1. Are they the same product?
2. Are they variants of the same base product?
3. Are they completely different products?

Respond with JSON:
{
  "match_recommendation": "exact_match" | "likely_match" | "variant" | "different" | "uncertain",
  "confidence": 0.0-1.0,
  "key_evidence": ["evidence point 1", "evidence point 2"],
  "conflicts_found": ["conflict 1", "conflict 2"],
  "reasoning": "brief explanation",
  "recommended_action": "auto_link" | "review" | "create_new"
}`;
}

// ============================================================================
// PRICING ESCALATION
// ============================================================================

export async function resolvePricingAnomaly(
  context: PricingContext,
  pipeline_run_id?: string
): Promise<LLMDecision> {
  const needsEscalation = await shouldEscalate('pricing', context.confidence);
  
  if (!needsEscalation) {
    return {
      decision: 'no_escalation',
      confidence: context.confidence,
      reasoning: 'Confidence above threshold or escalation disabled',
      recommended_action: 'use_rules_output',
      escalated: false,
    };
  }
  
  const startTime = Date.now();
  
  try {
    const client = getOpenAIClient();
    if (!client) {
      throw new Error('OpenAI client not configured');
    }
    
    const prompt = buildPricingPrompt(context);
    
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a pricing anomaly analyst for a B2B procurement platform.
Your task is to analyze price offers and identify anomalies.
Consider: feed errors, stale data, unit/pack normalization issues, suspicious outliers.
Output valid JSON only.`,
        },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 400,
      temperature: 0.1,
    });
    
    const latency = Date.now() - startTime;
    const usage = response.usage;
    
    await recordLLMUsage(
      'pricing_anomaly',
      usage?.prompt_tokens || 0,
      usage?.completion_tokens || 0,
      latency,
      true,
      undefined,
      pipeline_run_id
    );
    
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty LLM response');
    }
    
    const parsed = JSON.parse(content);
    
    // FIX: Validate LLM response structure for pricing
    const anomalyType = typeof parsed.anomaly_type === 'string' ? parsed.anomaly_type : 'uncertain';
    const pricingConf = typeof parsed.confidence === 'number' ? parsed.confidence : 0.6;
    const pricingReasoning = typeof parsed.reasoning === 'string' ? parsed.reasoning : 'LLM analysis';
    const pricingAction = typeof parsed.recommended_action === 'string' ? parsed.recommended_action : 'review';
    
    return {
      decision: anomalyType,
      // FIX: Cap at 0.75 to prevent auto-approval bypass
      confidence: Math.min(pricingConf, 0.75),
      reasoning: pricingReasoning,
      recommended_action: pricingAction,
      escalated: true,
      tokens_used: (usage?.prompt_tokens || 0) + (usage?.completion_tokens || 0),
    };
    
  } catch (error) {
    const latency = Date.now() - startTime;
    
    await recordLLMUsage(
      'pricing_anomaly',
      0,
      0,
      latency,
      false,
      error instanceof Error ? error.message : 'Unknown error',
      pipeline_run_id
    );
    
    return {
      decision: 'escalation_failed',
      confidence: context.confidence,
      reasoning: `LLM escalation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      recommended_action: 'review',
      escalated: true,
    };
  }
}

function buildPricingPrompt(context: PricingContext): string {
  const deviation = ((context.offer_price - context.market_avg) / context.market_avg * 100).toFixed(1);
  
  return `Pricing anomaly analysis needed.

Offer Price: $${context.offer_price.toFixed(2)}
Market Average: $${context.market_avg.toFixed(2)}
Market Range: $${context.market_min.toFixed(2)} - $${context.market_max.toFixed(2)}
Deviation from Average: ${deviation}%

Current Analysis: ${context.current_analysis}
Current Confidence: ${(context.confidence * 100).toFixed(0)}%

Determine:
1. Is this price legitimate?
2. Is this likely a data/feed error?
3. Is this a unit normalization issue?
4. Is this an outlier that needs investigation?

Respond with JSON:
{
  "anomaly_type": "valid_price" | "feed_error" | "unit_issue" | "suspicious_low" | "suspicious_high" | "uncertain",
  "confidence": 0.0-1.0,
  "likely_cause": "brief explanation of likely cause",
  "reasoning": "analysis reasoning",
  "recommended_action": "accept" | "reject" | "review" | "flag"
}`;
}

// ============================================================================
// STATUS CHECK
// ============================================================================

export async function getLLMEscalationStatus(): Promise<{
  enabled: boolean;
  within_cost_limit: boolean;
  within_rate_limit: boolean;
  daily_cost: number;
  daily_limit: number;
  requests_last_minute: number;
  rate_limit: number;
}> {
  const config = await getEscalationConfig();
  const supabase = supabaseAdmin;
  
  const today = new Date().toISOString().split('T')[0];
  const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
  
  const { data: todayUsage } = await supabase
    .from('ai_llm_usage')
    .select('cost_estimate')
    .gte('created_at', today);
    
  const { count: recentCount } = await supabase
    .from('ai_llm_usage')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', oneMinuteAgo);
    
  const dailyCost = (todayUsage || []).reduce(
    (sum: number, u: { cost_estimate: unknown }) => sum + Number(u.cost_estimate || 0), 0
  );
  
  return {
    enabled: config.enabled,
    within_cost_limit: dailyCost < config.daily_cost_limit,
    within_rate_limit: (recentCount || 0) < config.rate_limit_per_minute,
    daily_cost: dailyCost,
    daily_limit: config.daily_cost_limit,
    requests_last_minute: recentCount || 0,
    rate_limit: config.rate_limit_per_minute,
  };
}
