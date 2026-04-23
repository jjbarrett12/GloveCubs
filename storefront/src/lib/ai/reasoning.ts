/**
 * AI Reasoning Service
 * 
 * Generates structured reasoning and explanations for AI-assisted decisions.
 * Used by product normalization, matching, pricing, and supplier discovery.
 * 
 * Key principles:
 * - AI may recommend, infer, summarize, and score
 * - AI may NOT silently override hard business constraints
 * - All AI outputs must be auditable with reasoning text and confidence
 * - Low-confidence outcomes must route to review
 */

import { supabaseAdmin } from '../jobs/supabase';
import { logger } from '../jobs/logger';

// ============================================================================
// TYPES
// ============================================================================

export interface AIExtractionInput {
  raw_title: string;
  raw_description?: string;
  raw_specs?: Record<string, unknown>;
  supplier_id?: string;
}

export interface AIExtractionOutput {
  extracted_attributes: Record<string, unknown>;
  field_confidence: Record<string, number>;
  overall_confidence: number;
  reasoning_summary: string;
  inferred_fields: string[];
  synonym_resolutions: Record<string, string>;
  ambiguity_warnings: string[];
}

export interface AIMatchReasoningInput {
  supplier_product: {
    id: string;
    title?: string;
    brand?: string;
    material?: string;
    color?: string;
    size?: string;
    thickness_mil?: number;
    units_per_box?: number;
    total_units_per_case?: number;
    powder_free?: boolean;
    sterile?: boolean;
    exam_grade?: boolean;
    mpn?: string;
    upc?: string;
  };
  canonical_product: {
    id: string;
    title?: string;
    brand?: string;
    material?: string;
    color?: string;
    size?: string;
    thickness_mil?: number;
    units_per_box?: number;
    total_units_per_case?: number;
    powder_free?: boolean;
    sterile?: boolean;
    exam_grade?: boolean;
    mpn?: string;
    upc?: string;
  };
  rules_confidence: number;
  rules_recommendation: string;
}

export interface AIMatchReasoningOutput {
  match_recommendation: 'exact_match' | 'likely_match' | 'variant' | 'new_product' | 'review';
  confidence: number;
  evidence_summary: string;
  matched_attributes: Array<{
    field: string;
    supplier_value: unknown;
    canonical_value: unknown;
    match_score: number;
  }>;
  conflict_summary: string | null;
  conflicting_attributes: Array<{
    field: string;
    supplier_value: unknown;
    canonical_value: unknown;
    severity: 'critical' | 'major' | 'minor';
  }>;
  hard_constraints_passed: boolean;
  material_match: boolean;
  size_match: boolean;
  sterile_match: boolean;
  thickness_match: boolean;
  pack_qty_match: boolean;
  needs_review: boolean;
  review_reason: string | null;
}

export interface AIPricingAnalysisInput {
  offer: {
    id?: string;
    supplier_id: string;
    price: number;
    per_unit_price?: number;
    units_per_case?: number;
    source?: string;
    last_updated?: string;
  };
  product: {
    id: string;
    title?: string;
  };
  market_context: {
    avg_price?: number;
    min_price?: number;
    max_price?: number;
    competitor_count?: number;
    our_current_price?: number;
  };
}

export interface AIPricingAnalysisOutput {
  analysis_category: 'valid_best_price' | 'suspicious_outlier' | 'stale_offer' | 'unit_normalization_issue' | 'feed_error' | 'review_required';
  confidence: number;
  reasoning_summary: string;
  anomaly_indicators: Array<{
    indicator: string;
    value: number | string;
    threshold?: number | string;
    severity: 'low' | 'medium' | 'high';
  }>;
  is_suspicious: boolean;
  is_stale: boolean;
  has_normalization_issue: boolean;
  likely_feed_error: boolean;
  recommended_action: 'accept' | 'reject' | 'review' | 'flag_for_monitoring';
  action_reasoning: string;
}

export interface AISupplierAnalysisInput {
  supplier: {
    id?: string;
    name: string;
    website?: string;
    domain?: string;
    categories?: string[];
    lead_score?: number;
    catalog_signals?: Record<string, unknown>;
  };
  existing_suppliers?: Array<{
    id: string;
    name: string;
    website?: string;
  }>;
}

export interface AISupplierAnalysisOutput {
  relevance_score: number;
  category_fit_score: number;
  catalog_usefulness_score: number;
  priority_score: number;
  classification_reasoning: string;
  category_signals: Array<{ signal: string; confidence: number }>;
  red_flags: Array<{ flag: string; severity: 'low' | 'medium' | 'high'; detail: string }>;
  green_flags: Array<{ flag: string; confidence: number; detail: string }>;
  potential_duplicates: string[];
  duplicate_confidence: number;
  duplicate_reasoning: string | null;
  ingestion_recommended: boolean;
  ingestion_priority: 'high' | 'medium' | 'low' | 'skip';
  recommendation_reasoning: string;
}

// ============================================================================
// SYNONYM RESOLUTION
// ============================================================================

let synonymCache: Map<string, Map<string, string>> | null = null;
let synonymCacheExpiry: number = 0;

/**
 * Load synonym dictionary from database with caching
 */
export async function loadSynonyms(): Promise<Map<string, Map<string, string>>> {
  const now = Date.now();
  if (synonymCache && now < synonymCacheExpiry) {
    return synonymCache;
  }

  const { data, error } = await supabaseAdmin
    .from('ai_synonyms')
    .select('field_name, raw_term, normalized_term')
    .eq('verified', true)
    .order('confidence', { ascending: false });

  if (error) {
    logger.warn('Failed to load synonyms', { error: error.message });
    return synonymCache || new Map();
  }

  const cache = new Map<string, Map<string, string>>();
  for (const row of data || []) {
    if (!cache.has(row.field_name)) {
      cache.set(row.field_name, new Map());
    }
    cache.get(row.field_name)!.set(row.raw_term.toLowerCase(), row.normalized_term);
  }

  synonymCache = cache;
  synonymCacheExpiry = now + 5 * 60 * 1000; // 5 minute cache
  return cache;
}

/**
 * Resolve a term using synonym dictionary
 */
export async function resolveSynonym(
  field: string,
  term: string
): Promise<{ resolved: string; was_synonym: boolean }> {
  const synonyms = await loadSynonyms();
  const fieldSynonyms = synonyms.get(field);
  
  if (!fieldSynonyms) {
    return { resolved: term, was_synonym: false };
  }

  const normalized = fieldSynonyms.get(term.toLowerCase());
  if (normalized) {
    // Update usage count
    await supabaseAdmin
      .from('ai_synonyms')
      .update({ 
        usage_count: supabaseAdmin.rpc('increment', { x: 1 }),
        last_used_at: new Date().toISOString(),
      })
      .eq('field_name', field)
      .eq('raw_term', term.toLowerCase());

    return { resolved: normalized, was_synonym: true };
  }

  return { resolved: term, was_synonym: false };
}

// ============================================================================
// AI EXTRACTION REASONING
// ============================================================================

/**
 * Generate AI-assisted extraction with reasoning
 * 
 * Uses rules-first approach with AI reasoning for explanation.
 * Does NOT replace rules-based extraction, but augments it with explanations.
 */
export function generateExtractionReasoning(
  raw_input: AIExtractionInput,
  rules_output: Record<string, unknown>,
  rules_confidence: number
): AIExtractionOutput {
  const inferred_fields: string[] = [];
  const synonym_resolutions: Record<string, string> = {};
  const ambiguity_warnings: string[] = [];
  const field_confidence: Record<string, number> = {};

  // Analyze which fields were inferred vs explicit
  const title = raw_input.raw_title.toLowerCase();
  
  // Material analysis
  if (rules_output.material) {
    const materialInTitle = title.includes(String(rules_output.material).toLowerCase());
    field_confidence['material'] = materialInTitle ? 0.95 : 0.75;
    if (!materialInTitle) {
      inferred_fields.push('material');
    }
  }

  // Size analysis
  if (rules_output.size) {
    const sizePatterns = ['small', 'medium', 'large', 'xl', 'xxl', 'xs', 's', 'm', 'l'];
    const sizeInTitle = sizePatterns.some(p => title.includes(p));
    field_confidence['size'] = sizeInTitle ? 0.95 : 0.70;
    if (!sizeInTitle) {
      inferred_fields.push('size');
    }
  }

  // Pack quantity analysis
  if (rules_output.units_per_box || rules_output.total_units_per_case) {
    const qtyMatch = title.match(/(\d+)\s*(ct|count|pcs|pieces|\/bx|\/box|per box)/i);
    field_confidence['pack_qty'] = qtyMatch ? 0.90 : 0.60;
    if (!qtyMatch) {
      inferred_fields.push('pack_qty');
      ambiguity_warnings.push('Pack quantity was inferred - verify against source');
    }
  }

  // Color analysis
  if (rules_output.color) {
    const colorInTitle = title.includes(String(rules_output.color).toLowerCase());
    field_confidence['color'] = colorInTitle ? 0.95 : 0.80;
  }

  // Thickness analysis
  if (rules_output.thickness_mil) {
    const thickMatch = title.match(/(\d+\.?\d*)\s*mil/i);
    field_confidence['thickness_mil'] = thickMatch ? 0.95 : 0.65;
    if (!thickMatch) {
      inferred_fields.push('thickness_mil');
    }
  }

  // Check for ambiguous terms
  if (title.includes('assorted') || title.includes('variety')) {
    ambiguity_warnings.push('Title contains "assorted" or "variety" - may represent multiple products');
  }
  if (title.includes('or') && (title.includes('size') || title.includes('color'))) {
    ambiguity_warnings.push('Title suggests size/color variants - verify single product');
  }

  // Generate reasoning summary
  const reasoning_parts: string[] = [];
  
  if (inferred_fields.length === 0) {
    reasoning_parts.push('All attributes were explicitly found in title/description.');
  } else {
    reasoning_parts.push(`Inferred fields: ${inferred_fields.join(', ')}.`);
  }

  if (Object.keys(synonym_resolutions).length > 0) {
    reasoning_parts.push(`Applied synonym resolutions: ${Object.entries(synonym_resolutions).map(([k, v]) => `${k}→${v}`).join(', ')}.`);
  }

  if (ambiguity_warnings.length > 0) {
    reasoning_parts.push(`Warnings: ${ambiguity_warnings.join('; ')}.`);
  }

  const overall_confidence = Object.values(field_confidence).length > 0
    ? Object.values(field_confidence).reduce((a, b) => a + b, 0) / Object.values(field_confidence).length
    : rules_confidence;

  return {
    extracted_attributes: rules_output,
    field_confidence,
    overall_confidence: Math.min(overall_confidence, rules_confidence),
    reasoning_summary: reasoning_parts.join(' '),
    inferred_fields,
    synonym_resolutions,
    ambiguity_warnings,
  };
}

// ============================================================================
// AI MATCH REASONING
// ============================================================================

/**
 * Generate detailed match reasoning with hard constraint enforcement
 * 
 * CRITICAL: AI may NOT override hard constraints:
 * - Material mismatch
 * - Size mismatch  
 * - Sterile status mismatch
 * - Thickness mismatch (>2 mil difference)
 * - Pack quantity mismatch
 */
export function generateMatchReasoning(input: AIMatchReasoningInput): AIMatchReasoningOutput {
  const { supplier_product: sp, canonical_product: cp, rules_confidence, rules_recommendation } = input;
  
  const matched_attributes: AIMatchReasoningOutput['matched_attributes'] = [];
  const conflicting_attributes: AIMatchReasoningOutput['conflicting_attributes'] = [];
  
  // =========================================================================
  // HARD CONSTRAINT CHECKS - AI cannot override these
  // =========================================================================
  
  const normalizeValue = (v: unknown): string => 
    String(v ?? '').toLowerCase().trim();

  // Material match
  const material_match = !sp.material || !cp.material || 
    normalizeValue(sp.material) === normalizeValue(cp.material);
  if (!material_match) {
    conflicting_attributes.push({
      field: 'material',
      supplier_value: sp.material,
      canonical_value: cp.material,
      severity: 'critical',
    });
  }

  // Size match
  const size_match = !sp.size || !cp.size ||
    normalizeValue(sp.size) === normalizeValue(cp.size);
  if (!size_match) {
    conflicting_attributes.push({
      field: 'size',
      supplier_value: sp.size,
      canonical_value: cp.size,
      severity: 'critical',
    });
  }

  // Sterile status match
  const sterile_match = sp.sterile === undefined || cp.sterile === undefined ||
    sp.sterile === cp.sterile;
  if (!sterile_match) {
    conflicting_attributes.push({
      field: 'sterile',
      supplier_value: sp.sterile,
      canonical_value: cp.sterile,
      severity: 'critical',
    });
  }

  // Thickness match (allow 2 mil tolerance)
  const thickness_match = !sp.thickness_mil || !cp.thickness_mil ||
    Math.abs(sp.thickness_mil - cp.thickness_mil) <= 2;
  if (!thickness_match) {
    conflicting_attributes.push({
      field: 'thickness_mil',
      supplier_value: sp.thickness_mil,
      canonical_value: cp.thickness_mil,
      severity: 'critical',
    });
  }

  // Pack quantity match
  const pack_qty_match = !sp.total_units_per_case || !cp.total_units_per_case ||
    sp.total_units_per_case === cp.total_units_per_case;
  if (!pack_qty_match) {
    conflicting_attributes.push({
      field: 'total_units_per_case',
      supplier_value: sp.total_units_per_case,
      canonical_value: cp.total_units_per_case,
      severity: 'critical',
    });
  }

  const hard_constraints_passed = material_match && size_match && 
    sterile_match && thickness_match && pack_qty_match;

  // =========================================================================
  // SOFT ATTRIBUTE MATCHING
  // =========================================================================
  
  // Brand
  if (sp.brand && cp.brand) {
    const brandMatch = normalizeValue(sp.brand) === normalizeValue(cp.brand);
    matched_attributes.push({
      field: 'brand',
      supplier_value: sp.brand,
      canonical_value: cp.brand,
      match_score: brandMatch ? 1.0 : 0.0,
    });
    if (!brandMatch) {
      conflicting_attributes.push({
        field: 'brand',
        supplier_value: sp.brand,
        canonical_value: cp.brand,
        severity: 'major',
      });
    }
  }

  // Color
  if (sp.color && cp.color) {
    const colorMatch = normalizeValue(sp.color) === normalizeValue(cp.color);
    matched_attributes.push({
      field: 'color',
      supplier_value: sp.color,
      canonical_value: cp.color,
      match_score: colorMatch ? 1.0 : 0.0,
    });
    if (!colorMatch) {
      conflicting_attributes.push({
        field: 'color',
        supplier_value: sp.color,
        canonical_value: cp.color,
        severity: 'minor',
      });
    }
  }

  // UPC exact match
  if (sp.upc && cp.upc) {
    const upcMatch = sp.upc === cp.upc;
    matched_attributes.push({
      field: 'upc',
      supplier_value: sp.upc,
      canonical_value: cp.upc,
      match_score: upcMatch ? 1.0 : 0.0,
    });
  }

  // MPN exact match
  if (sp.mpn && cp.mpn) {
    const mpnMatch = normalizeValue(sp.mpn) === normalizeValue(cp.mpn);
    matched_attributes.push({
      field: 'mpn',
      supplier_value: sp.mpn,
      canonical_value: cp.mpn,
      match_score: mpnMatch ? 1.0 : 0.0,
    });
  }

  // =========================================================================
  // DETERMINE RECOMMENDATION
  // =========================================================================
  
  let match_recommendation: AIMatchReasoningOutput['match_recommendation'];
  let confidence: number;
  let needs_review = false;
  let review_reason: string | null = null;

  if (!hard_constraints_passed) {
    // Critical conflicts - cannot be same product
    const criticalConflicts = conflicting_attributes
      .filter(c => c.severity === 'critical')
      .map(c => c.field);
    
    if (rules_recommendation === 'exact_match' || rules_recommendation === 'likely_match') {
      // Rules suggested match but hard constraints failed - send to review
      match_recommendation = 'review';
      confidence = Math.min(rules_confidence, 0.5);
      needs_review = true;
      review_reason = `Hard constraint violations: ${criticalConflicts.join(', ')}. Rules suggested ${rules_recommendation} but conflicts detected.`;
    } else {
      match_recommendation = 'new_product';
      confidence = 0.8;
    }
  } else if (matched_attributes.some(a => a.field === 'upc' && a.match_score === 1.0)) {
    // UPC exact match - high confidence
    match_recommendation = 'exact_match';
    confidence = 0.98;
  } else if (matched_attributes.some(a => a.field === 'mpn' && a.match_score === 1.0)) {
    // MPN match - high confidence
    match_recommendation = 'exact_match';
    confidence = 0.95;
  } else if (rules_confidence >= 0.90) {
    match_recommendation = 'exact_match';
    confidence = rules_confidence;
  } else if (rules_confidence >= 0.75) {
    match_recommendation = 'likely_match';
    confidence = rules_confidence;
    needs_review = true;
    review_reason = 'Confidence below exact match threshold';
  } else if (rules_confidence >= 0.65) {
    match_recommendation = 'variant';
    confidence = rules_confidence;
    needs_review = true;
    review_reason = 'May be variant of existing product';
  } else {
    match_recommendation = 'new_product';
    confidence = 0.7;
  }

  // =========================================================================
  // GENERATE SUMMARIES
  // =========================================================================
  
  const evidence_parts: string[] = [];
  
  const exactMatches = matched_attributes.filter(a => a.match_score === 1.0);
  if (exactMatches.length > 0) {
    evidence_parts.push(`Exact matches: ${exactMatches.map(a => a.field).join(', ')}`);
  }

  const partialMatches = matched_attributes.filter(a => a.match_score > 0 && a.match_score < 1.0);
  if (partialMatches.length > 0) {
    evidence_parts.push(`Partial matches: ${partialMatches.map(a => `${a.field} (${(a.match_score * 100).toFixed(0)}%)`).join(', ')}`);
  }

  const evidence_summary = evidence_parts.length > 0 
    ? evidence_parts.join('. ')
    : 'No strong attribute matches found';

  const conflict_summary = conflicting_attributes.length > 0
    ? `Conflicts: ${conflicting_attributes.map(c => `${c.field} (${c.severity})`).join(', ')}`
    : null;

  return {
    match_recommendation,
    confidence,
    evidence_summary,
    matched_attributes,
    conflict_summary,
    conflicting_attributes,
    hard_constraints_passed,
    material_match,
    size_match,
    sterile_match,
    thickness_match,
    pack_qty_match,
    needs_review,
    review_reason,
  };
}

// ============================================================================
// AI PRICING ANALYSIS
// ============================================================================

/**
 * Analyze supplier offer for pricing anomalies
 */
export function generatePricingAnalysis(input: AIPricingAnalysisInput): AIPricingAnalysisOutput {
  const { offer, market_context } = input;
  const anomaly_indicators: AIPricingAnalysisOutput['anomaly_indicators'] = [];
  
  let is_suspicious = false;
  let is_stale = false;
  let has_normalization_issue = false;
  let likely_feed_error = false;

  // Check for stale offer
  if (offer.last_updated) {
    const daysSinceUpdate = (Date.now() - new Date(offer.last_updated).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceUpdate > 30) {
      is_stale = true;
      anomaly_indicators.push({
        indicator: 'stale_data',
        value: Math.round(daysSinceUpdate),
        threshold: 30,
        severity: daysSinceUpdate > 60 ? 'high' : 'medium',
      });
    }
  }

  // Check price against market context
  if (market_context.avg_price && offer.price > 0) {
    const priceRatio = offer.price / market_context.avg_price;
    
    // Suspiciously low (less than 50% of market avg)
    if (priceRatio < 0.5) {
      is_suspicious = true;
      anomaly_indicators.push({
        indicator: 'price_too_low',
        value: `${(priceRatio * 100).toFixed(0)}% of market avg`,
        threshold: '50%',
        severity: priceRatio < 0.3 ? 'high' : 'medium',
      });
      
      // Very low prices often indicate unit/case confusion
      if (priceRatio < 0.3 && offer.units_per_case) {
        has_normalization_issue = true;
        anomaly_indicators.push({
          indicator: 'possible_unit_price_listed_as_case',
          value: offer.price,
          severity: 'high',
        });
      }
    }
    
    // Suspiciously high (more than 200% of market avg)
    if (priceRatio > 2.0) {
      is_suspicious = true;
      anomaly_indicators.push({
        indicator: 'price_too_high',
        value: `${(priceRatio * 100).toFixed(0)}% of market avg`,
        threshold: '200%',
        severity: priceRatio > 3.0 ? 'high' : 'medium',
      });
    }
  }

  // Check for obvious feed errors
  if (offer.price <= 0) {
    likely_feed_error = true;
    anomaly_indicators.push({
      indicator: 'invalid_price',
      value: offer.price,
      severity: 'high',
    });
  }

  if (offer.price > 10000) {
    is_suspicious = true;
    anomaly_indicators.push({
      indicator: 'unusually_high_absolute_price',
      value: offer.price,
      threshold: 10000,
      severity: 'medium',
    });
  }

  // Determine category and recommendation
  let analysis_category: AIPricingAnalysisOutput['analysis_category'];
  let recommended_action: AIPricingAnalysisOutput['recommended_action'];
  let confidence: number;
  let reasoning_summary: string;
  let action_reasoning: string;

  if (likely_feed_error) {
    analysis_category = 'feed_error';
    recommended_action = 'reject';
    confidence = 0.95;
    reasoning_summary = 'Invalid price data detected - likely feed error';
    action_reasoning = 'Price is invalid or missing';
  } else if (is_stale && is_suspicious) {
    analysis_category = 'review_required';
    recommended_action = 'review';
    confidence = 0.60;
    reasoning_summary = 'Stale offer with suspicious pricing - requires human review';
    action_reasoning = 'Multiple risk factors present';
  } else if (has_normalization_issue) {
    analysis_category = 'unit_normalization_issue';
    recommended_action = 'review';
    confidence = 0.70;
    reasoning_summary = 'Price appears to be per-unit listed as per-case (or vice versa)';
    action_reasoning = 'Verify pack size and price relationship';
  } else if (is_suspicious) {
    analysis_category = 'suspicious_outlier';
    recommended_action = 'flag_for_monitoring';
    confidence = 0.75;
    reasoning_summary = `Price is ${anomaly_indicators.find(a => a.indicator.includes('price'))?.value} - flagged as outlier`;
    action_reasoning = 'Price is unusual but may be valid - monitor';
  } else if (is_stale) {
    analysis_category = 'stale_offer';
    recommended_action = 'flag_for_monitoring';
    confidence = 0.80;
    reasoning_summary = `Offer data is ${anomaly_indicators.find(a => a.indicator === 'stale_data')?.value} days old`;
    action_reasoning = 'Data may be outdated - verify before relying on it';
  } else {
    analysis_category = 'valid_best_price';
    recommended_action = 'accept';
    confidence = 0.90;
    reasoning_summary = 'Offer appears valid with no detected anomalies';
    action_reasoning = 'Price is within expected range and data is fresh';
  }

  return {
    analysis_category,
    confidence,
    reasoning_summary,
    anomaly_indicators,
    is_suspicious,
    is_stale,
    has_normalization_issue,
    likely_feed_error,
    recommended_action,
    action_reasoning,
  };
}

// ============================================================================
// AI SUPPLIER ANALYSIS
// ============================================================================

/**
 * Analyze discovered supplier for relevance and priority
 */
export function generateSupplierAnalysis(input: AISupplierAnalysisInput): AISupplierAnalysisOutput {
  const { supplier, existing_suppliers } = input;
  
  const category_signals: AISupplierAnalysisOutput['category_signals'] = [];
  const red_flags: AISupplierAnalysisOutput['red_flags'] = [];
  const green_flags: AISupplierAnalysisOutput['green_flags'] = [];
  
  // =========================================================================
  // RELEVANCE SCORING
  // =========================================================================
  
  let relevance_score = 0.5; // Start neutral
  
  // Check website/domain for relevance signals
  const domain = (supplier.domain || supplier.website || '').toLowerCase();
  
  // Positive signals
  const gloveKeywords = ['glove', 'safety', 'ppe', 'medical', 'industrial', 'supply', 'disposable'];
  const hasGloveKeyword = gloveKeywords.some(k => domain.includes(k) || supplier.name.toLowerCase().includes(k));
  if (hasGloveKeyword) {
    relevance_score += 0.2;
    green_flags.push({
      flag: 'relevant_keywords',
      confidence: 0.9,
      detail: 'Domain/name contains PPE-related keywords',
    });
  }

  // Check categories
  if (supplier.categories?.length) {
    const relevantCategories = ['disposable gloves', 'nitrile gloves', 'safety equipment', 'medical supplies', 'ppe'];
    const hasRelevant = supplier.categories.some(c => 
      relevantCategories.some(rc => c.toLowerCase().includes(rc))
    );
    if (hasRelevant) {
      relevance_score += 0.15;
      category_signals.push({ signal: 'relevant_category', confidence: 0.9 });
    }
  }

  // Red flags
  const marketplaces = ['amazon', 'ebay', 'alibaba', 'aliexpress', 'walmart.com', 'etsy'];
  if (marketplaces.some(m => domain.includes(m))) {
    relevance_score -= 0.3;
    red_flags.push({
      flag: 'marketplace_not_distributor',
      severity: 'high',
      detail: 'This is a retail marketplace, not a wholesale supplier',
    });
  }

  // =========================================================================
  // CATEGORY FIT SCORING
  // =========================================================================
  
  let category_fit_score = 0.5;
  
  if (supplier.catalog_signals) {
    const signals = supplier.catalog_signals;
    if (signals.has_gloves || signals.product_count_estimate) {
      category_fit_score += 0.2;
      category_signals.push({ signal: 'has_glove_products', confidence: 0.85 });
    }
    if (signals.has_wholesale_pricing || signals.minimum_order) {
      category_fit_score += 0.15;
      category_signals.push({ signal: 'wholesale_pricing', confidence: 0.8 });
    }
  }

  // =========================================================================
  // CATALOG USEFULNESS SCORING
  // =========================================================================
  
  let catalog_usefulness_score = 0.5;
  
  if (supplier.catalog_signals?.feed_url) {
    catalog_usefulness_score += 0.3;
    green_flags.push({
      flag: 'has_data_feed',
      confidence: 0.95,
      detail: 'Supplier provides product data feed',
    });
  }
  
  if (supplier.catalog_signals?.product_count_estimate) {
    const count = Number(supplier.catalog_signals.product_count_estimate);
    if (count >= 100) {
      catalog_usefulness_score += 0.2;
    }
  }

  // =========================================================================
  // DUPLICATE DETECTION
  // =========================================================================
  
  let potential_duplicates: string[] = [];
  let duplicate_confidence = 0;
  let duplicate_reasoning: string | null = null;

  if (existing_suppliers) {
    const normalizedName = supplier.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    for (const existing of existing_suppliers) {
      const existingNormalized = existing.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      
      // Name similarity check
      if (normalizedName === existingNormalized) {
        potential_duplicates.push(existing.id);
        duplicate_confidence = 0.95;
        duplicate_reasoning = `Exact name match with existing supplier: ${existing.name}`;
        break;
      }
      
      // Domain match check
      if (supplier.website && existing.website) {
        const newDomain = new URL(supplier.website).hostname.replace('www.', '');
        const existDomain = new URL(existing.website).hostname.replace('www.', '');
        if (newDomain === existDomain) {
          potential_duplicates.push(existing.id);
          duplicate_confidence = 0.90;
          duplicate_reasoning = `Same website domain as existing supplier: ${existing.name}`;
          break;
        }
      }
    }
  }

  // =========================================================================
  // OVERALL PRIORITY
  // =========================================================================
  
  const priority_score = (relevance_score + category_fit_score + catalog_usefulness_score) / 3;
  
  // Determine recommendation
  let ingestion_recommended = false;
  let ingestion_priority: AISupplierAnalysisOutput['ingestion_priority'];
  let recommendation_reasoning: string;

  if (duplicate_confidence > 0.8) {
    ingestion_priority = 'skip';
    recommendation_reasoning = `Likely duplicate: ${duplicate_reasoning}`;
  } else if (red_flags.some(f => f.severity === 'high')) {
    ingestion_priority = 'skip';
    recommendation_reasoning = `High-severity red flag: ${red_flags.find(f => f.severity === 'high')?.detail}`;
  } else if (priority_score >= 0.7) {
    ingestion_recommended = true;
    ingestion_priority = 'high';
    recommendation_reasoning = `High relevance (${(priority_score * 100).toFixed(0)}%) with ${green_flags.length} positive signals`;
  } else if (priority_score >= 0.5) {
    ingestion_recommended = true;
    ingestion_priority = 'medium';
    recommendation_reasoning = `Moderate relevance (${(priority_score * 100).toFixed(0)}%) - may be worth exploring`;
  } else {
    ingestion_priority = 'low';
    recommendation_reasoning = `Low relevance score (${(priority_score * 100).toFixed(0)}%) - limited expected value`;
  }

  // Generate classification reasoning
  const classification_parts: string[] = [];
  if (green_flags.length > 0) {
    classification_parts.push(`Positive: ${green_flags.map(f => f.flag).join(', ')}`);
  }
  if (red_flags.length > 0) {
    classification_parts.push(`Concerns: ${red_flags.map(f => f.flag).join(', ')}`);
  }
  classification_parts.push(`Relevance: ${(relevance_score * 100).toFixed(0)}%, Category fit: ${(category_fit_score * 100).toFixed(0)}%, Catalog value: ${(catalog_usefulness_score * 100).toFixed(0)}%`);

  return {
    relevance_score: Math.max(0, Math.min(1, relevance_score)),
    category_fit_score: Math.max(0, Math.min(1, category_fit_score)),
    catalog_usefulness_score: Math.max(0, Math.min(1, catalog_usefulness_score)),
    priority_score: Math.max(0, Math.min(1, priority_score)),
    classification_reasoning: classification_parts.join('. '),
    category_signals,
    red_flags,
    green_flags,
    potential_duplicates,
    duplicate_confidence,
    duplicate_reasoning,
    ingestion_recommended,
    ingestion_priority,
    recommendation_reasoning,
  };
}

// ============================================================================
// PERSIST AI REASONING
// ============================================================================

export async function persistExtractionResult(
  supplier_product_id: string,
  result: AIExtractionOutput,
  batch_id?: string
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('ai_extraction_results')
    .insert({
      supplier_product_id,
      batch_id,
      extracted_attributes: result.extracted_attributes,
      field_confidence: result.field_confidence,
      overall_confidence: result.overall_confidence,
      reasoning_summary: result.reasoning_summary,
      inferred_fields: result.inferred_fields,
      synonym_resolutions: result.synonym_resolutions,
      ambiguity_warnings: result.ambiguity_warnings,
    })
    .select('id')
    .single();

  if (error) {
    logger.warn('Failed to persist extraction result', { error: error.message });
    return null;
  }

  return data.id;
}

export async function persistMatchReasoning(
  supplier_product_id: string,
  canonical_product_id: string | null,
  result: AIMatchReasoningOutput
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('ai_match_reasoning')
    .insert({
      supplier_product_id,
      canonical_product_id,
      match_recommendation: result.match_recommendation,
      confidence: result.confidence,
      evidence_summary: result.evidence_summary,
      matched_attributes: result.matched_attributes,
      conflict_summary: result.conflict_summary,
      conflicting_attributes: result.conflicting_attributes,
      hard_constraints_passed: result.hard_constraints_passed,
      material_match: result.material_match,
      size_match: result.size_match,
      sterile_match: result.sterile_match,
      thickness_match: result.thickness_match,
      pack_qty_match: result.pack_qty_match,
      needs_review: result.needs_review,
      review_reason: result.review_reason,
    })
    .select('id')
    .single();

  if (error) {
    logger.warn('Failed to persist match reasoning', { error: error.message });
    return null;
  }

  return data.id;
}

export async function persistPricingAnalysis(
  canonical_product_id: string,
  result: AIPricingAnalysisOutput,
  offer_id?: string,
  supplier_id?: string
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('ai_pricing_analysis')
    .insert({
      canonical_product_id,
      supplier_offer_id: offer_id,
      supplier_id,
      analysis_category: result.analysis_category,
      confidence: result.confidence,
      reasoning_summary: result.reasoning_summary,
      anomaly_indicators: result.anomaly_indicators,
      is_suspicious: result.is_suspicious,
      is_stale: result.is_stale,
      has_normalization_issue: result.has_normalization_issue,
      likely_feed_error: result.likely_feed_error,
      recommended_action: result.recommended_action,
      action_reasoning: result.action_reasoning,
    })
    .select('id')
    .single();

  if (error) {
    logger.warn('Failed to persist pricing analysis', { error: error.message });
    return null;
  }

  return data.id;
}

export async function persistSupplierAnalysis(
  result: AISupplierAnalysisOutput,
  supplier_lead_id?: string,
  supplier_id?: string
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('ai_supplier_analysis')
    .insert({
      supplier_lead_id,
      supplier_id,
      relevance_score: result.relevance_score,
      category_fit_score: result.category_fit_score,
      catalog_usefulness_score: result.catalog_usefulness_score,
      priority_score: result.priority_score,
      classification_reasoning: result.classification_reasoning,
      category_signals: result.category_signals,
      red_flags: result.red_flags,
      green_flags: result.green_flags,
      potential_duplicate_of: result.potential_duplicates,
      duplicate_confidence: result.duplicate_confidence,
      duplicate_reasoning: result.duplicate_reasoning,
      ingestion_recommended: result.ingestion_recommended,
      ingestion_priority: result.ingestion_priority,
      recommendation_reasoning: result.recommendation_reasoning,
    })
    .select('id')
    .single();

  if (error) {
    logger.warn('Failed to persist supplier analysis', { error: error.message });
    return null;
  }

  return data.id;
}
