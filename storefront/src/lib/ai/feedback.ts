/**
 * AI Feedback Capture Service
 * 
 * Captures human corrections and confirmations of AI decisions for learning.
 * 
 * Key principles:
 * - Store feedback cleanly for future model improvement
 * - Do not build experimental self-training loops that mutate live rules
 * - Use feedback as advisory intelligence first
 * - Support future learning without breaking current deterministic behavior
 */

import { supabaseAdmin } from '../jobs/supabase';
import { logger } from '../jobs/logger';

// ============================================================================
// TYPES
// ============================================================================

export type FeedbackType = 'extraction' | 'matching' | 'pricing' | 'supplier';
export type CorrectionType = 'confirmed' | 'partially_corrected' | 'fully_corrected' | 'rejected';

export interface FeedbackInput {
  feedback_type: FeedbackType;
  source_table: string;
  source_id: string;
  original_output: Record<string, unknown>;
  original_confidence?: number;
  was_correct: boolean;
  corrected_output?: Record<string, unknown>;
  correction_type: CorrectionType;
  correction_reason?: string;
  additional_context?: string;
  corrected_by?: string;
}

export interface SynonymFeedback {
  field_name: string;
  raw_term: string;
  normalized_term: string;
  verified_by?: string;
}

// ============================================================================
// FEEDBACK CAPTURE
// ============================================================================

/**
 * Capture feedback on an AI extraction decision
 */
export async function captureExtractionFeedback(
  supplier_product_id: string,
  original_extraction: Record<string, unknown>,
  was_correct: boolean,
  corrections?: Record<string, unknown>,
  notes?: string,
  corrected_by?: string
): Promise<string | null> {
  // Determine correction type
  let correction_type: CorrectionType = 'confirmed';
  if (!was_correct && corrections) {
    const changedFields = Object.keys(corrections).filter(
      k => JSON.stringify(corrections[k]) !== JSON.stringify(original_extraction[k])
    );
    correction_type = changedFields.length > 3 ? 'fully_corrected' : 'partially_corrected';
  } else if (!was_correct) {
    correction_type = 'rejected';
  }

  return captureFeedback({
    feedback_type: 'extraction',
    source_table: 'supplier_products',
    source_id: supplier_product_id,
    original_output: original_extraction,
    was_correct,
    corrected_output: corrections,
    correction_type,
    correction_reason: notes,
    corrected_by,
  });
}

/**
 * Capture feedback on an AI match decision
 */
export async function captureMatchFeedback(
  supplier_product_id: string,
  original_match: {
    recommendation: string;
    canonical_product_id?: string;
    confidence: number;
  },
  was_correct: boolean,
  correct_canonical_id?: string,
  notes?: string,
  corrected_by?: string
): Promise<string | null> {
  // Update the ai_match_reasoning record if exists
  if (!was_correct || correct_canonical_id) {
    await supabaseAdmin
      .from('ai_match_reasoning')
      .update({
        human_decision: was_correct ? 'approved' : 'corrected',
        correct_canonical_id: correct_canonical_id || null,
        decision_notes: notes,
        decided_by: corrected_by,
        decided_at: new Date().toISOString(),
      })
      .eq('supplier_product_id', supplier_product_id);
  }

  return captureFeedback({
    feedback_type: 'matching',
    source_table: 'supplier_products',
    source_id: supplier_product_id,
    original_output: original_match,
    original_confidence: original_match.confidence,
    was_correct,
    corrected_output: correct_canonical_id ? { canonical_product_id: correct_canonical_id } : undefined,
    correction_type: was_correct ? 'confirmed' : correct_canonical_id ? 'fully_corrected' : 'rejected',
    correction_reason: notes,
    corrected_by,
  });
}

/**
 * Capture feedback on an AI pricing analysis
 */
export async function capturePricingFeedback(
  analysis_id: string,
  original_analysis: {
    category: string;
    confidence: number;
    recommended_action: string;
  },
  was_correct: boolean,
  correct_action?: string,
  notes?: string,
  corrected_by?: string
): Promise<string | null> {
  return captureFeedback({
    feedback_type: 'pricing',
    source_table: 'ai_pricing_analysis',
    source_id: analysis_id,
    original_output: original_analysis,
    original_confidence: original_analysis.confidence,
    was_correct,
    corrected_output: correct_action ? { recommended_action: correct_action } : undefined,
    correction_type: was_correct ? 'confirmed' : correct_action ? 'partially_corrected' : 'rejected',
    correction_reason: notes,
    corrected_by,
  });
}

/**
 * Capture feedback on supplier analysis
 */
export async function captureSupplierFeedback(
  supplier_lead_id: string,
  original_analysis: {
    ingestion_recommended: boolean;
    priority: string;
    relevance_score: number;
  },
  was_correct: boolean,
  correct_recommendation?: boolean,
  notes?: string,
  corrected_by?: string
): Promise<string | null> {
  return captureFeedback({
    feedback_type: 'supplier',
    source_table: 'supplier_leads',
    source_id: supplier_lead_id,
    original_output: original_analysis,
    original_confidence: original_analysis.relevance_score,
    was_correct,
    corrected_output: correct_recommendation !== undefined 
      ? { ingestion_recommended: correct_recommendation } 
      : undefined,
    correction_type: was_correct ? 'confirmed' : correct_recommendation !== undefined 
      ? 'fully_corrected' 
      : 'rejected',
    correction_reason: notes,
    corrected_by,
  });
}

/**
 * Core feedback capture function
 */
async function captureFeedback(input: FeedbackInput): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('ai_feedback')
      .insert({
        feedback_type: input.feedback_type,
        source_table: input.source_table,
        source_id: input.source_id,
        original_output: input.original_output,
        original_confidence: input.original_confidence,
        was_correct: input.was_correct,
        corrected_output: input.corrected_output,
        correction_type: input.correction_type,
        correction_reason: input.correction_reason,
        additional_context: input.additional_context,
        corrected_by: input.corrected_by,
      })
      .select('id')
      .single();

    if (error) {
      logger.warn('Failed to capture feedback', { error: error.message });
      return null;
    }

    logger.info('Feedback captured', {
      id: data.id,
      type: input.feedback_type,
      was_correct: input.was_correct,
      correction_type: input.correction_type,
    });

    // If extraction was corrected, learn new synonyms
    if (input.feedback_type === 'extraction' && input.corrected_output && !input.was_correct) {
      await learnFromCorrection(input.original_output, input.corrected_output);
    }

    return data.id;

  } catch (error) {
    logger.error('Error capturing feedback', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

// ============================================================================
// SYNONYM LEARNING
// ============================================================================

/**
 * Learn potential synonyms from human corrections
 */
async function learnFromCorrection(
  original: Record<string, unknown>,
  corrected: Record<string, unknown>
): Promise<void> {
  const learnableFields = ['material', 'color', 'grade', 'texture', 'brand'];
  
  for (const field of learnableFields) {
    const originalVal = String(original[field] || '').trim().toLowerCase();
    const correctedVal = String(corrected[field] || '').trim();
    
    // If field was corrected and values differ
    if (originalVal && correctedVal && originalVal !== correctedVal.toLowerCase()) {
      // Check if this synonym already exists
      const { data: existing } = await supabaseAdmin
        .from('ai_synonyms')
        .select('id, usage_count')
        .eq('field_name', field)
        .eq('raw_term', originalVal)
        .single();

      if (!existing) {
        // Create new synonym (unverified, AI-inferred)
        await supabaseAdmin
          .from('ai_synonyms')
          .insert({
            field_name: field,
            raw_term: originalVal,
            normalized_term: correctedVal,
            confidence: 0.7, // Lower confidence for AI-inferred
            source: 'ai_inferred',
            verified: false,
          });

        logger.info('Learned new synonym candidate', {
          field,
          raw: originalVal,
          normalized: correctedVal,
        });
      }
    }
  }
}

/**
 * Verify a synonym learned from corrections
 */
export async function verifySynonym(
  synonym_id: string,
  verified: boolean,
  verified_by?: string
): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('ai_synonyms')
    .update({
      verified,
      verified_by,
      verified_at: new Date().toISOString(),
      confidence: verified ? 0.95 : 0.3, // Boost or reduce confidence
    })
    .eq('id', synonym_id);

  if (error) {
    logger.warn('Failed to verify synonym', { error: error.message });
    return false;
  }

  return true;
}

/**
 * Add a manual synonym
 */
export async function addSynonym(input: SynonymFeedback): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('ai_synonyms')
    .insert({
      field_name: input.field_name,
      raw_term: input.raw_term.toLowerCase(),
      normalized_term: input.normalized_term,
      confidence: 0.99,
      source: 'manual',
      verified: true,
      verified_by: input.verified_by,
      verified_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    logger.warn('Failed to add synonym', { error: error.message });
    return null;
  }

  return data.id;
}

// ============================================================================
// FEEDBACK STATISTICS
// ============================================================================

export interface FeedbackStats {
  total_feedback: number;
  by_type: Record<FeedbackType, number>;
  accuracy_by_type: Record<FeedbackType, number>;
  common_corrections: Array<{
    feedback_type: FeedbackType;
    field: string;
    from_value: string;
    to_value: string;
    count: number;
  }>;
  unused_for_training: number;
}

/**
 * Get feedback statistics for monitoring AI quality
 */
export async function getFeedbackStats(since?: Date): Promise<FeedbackStats> {
  const sinceDate = since || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default 30 days

  // Get all feedback
  const { data: feedback } = await supabaseAdmin
    .from('ai_feedback')
    .select('*')
    .gte('corrected_at', sinceDate.toISOString());

  if (!feedback || feedback.length === 0) {
    return {
      total_feedback: 0,
      by_type: { extraction: 0, matching: 0, pricing: 0, supplier: 0 },
      accuracy_by_type: { extraction: 0, matching: 0, pricing: 0, supplier: 0 },
      common_corrections: [],
      unused_for_training: 0,
    };
  }

  // Count by type
  const by_type: Record<FeedbackType, number> = {
    extraction: 0,
    matching: 0,
    pricing: 0,
    supplier: 0,
  };

  const correct_by_type: Record<FeedbackType, number> = {
    extraction: 0,
    matching: 0,
    pricing: 0,
    supplier: 0,
  };

  for (const fb of feedback) {
    const type = fb.feedback_type as FeedbackType;
    by_type[type]++;
    if (fb.was_correct) {
      correct_by_type[type]++;
    }
  }

  // Calculate accuracy
  const accuracy_by_type: Record<FeedbackType, number> = {
    extraction: by_type.extraction > 0 ? correct_by_type.extraction / by_type.extraction : 0,
    matching: by_type.matching > 0 ? correct_by_type.matching / by_type.matching : 0,
    pricing: by_type.pricing > 0 ? correct_by_type.pricing / by_type.pricing : 0,
    supplier: by_type.supplier > 0 ? correct_by_type.supplier / by_type.supplier : 0,
  };

  // Find common corrections
  const corrections = feedback.filter(fb => !fb.was_correct && fb.corrected_output);
  // Group and count - simplified for now
  const common_corrections: FeedbackStats['common_corrections'] = [];

  const unused_for_training = feedback.filter(fb => !fb.used_for_training).length;

  return {
    total_feedback: feedback.length,
    by_type,
    accuracy_by_type,
    common_corrections,
    unused_for_training,
  };
}

// ============================================================================
// CAPTURE FROM REVIEW RESOLUTION
// ============================================================================

// ============================================================================
// LEARNING CANDIDATES GENERATION
// ============================================================================

export interface LearningCandidate {
  id: string;
  type: 'synonym' | 'rule_adjustment' | 'threshold_change' | 'new_pattern';
  field_name?: string;
  original_value?: string;
  corrected_value?: string;
  occurrence_count: number;
  confidence: number;
  evidence: string[];
  recommended_action: string;
  created_from_feedback_ids: string[];
}

/**
 * Generate learning candidates from operator corrections
 * Identifies patterns in corrections that could improve AI performance
 */
export async function generateLearningCandidates(
  since?: Date,
  min_occurrences: number = 2
): Promise<LearningCandidate[]> {
  const sinceDate = since || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const candidates: LearningCandidate[] = [];
  
  // Get all corrections
  const { data: corrections } = await supabaseAdmin
    .from('ai_feedback')
    .select('*')
    .eq('was_correct', false)
    .not('corrected_output', 'is', null)
    .gte('corrected_at', sinceDate.toISOString());
    
  if (!corrections || corrections.length === 0) {
    return candidates;
  }
  
  // -------------------------------------------------------------------------
  // 1. FIND SYNONYM CANDIDATES
  // -------------------------------------------------------------------------
  const synonymPatterns: Map<string, {
    field: string;
    from: string;
    to: string;
    count: number;
    feedback_ids: string[];
  }> = new Map();
  
  for (const fb of corrections) {
    if (fb.feedback_type !== 'extraction') continue;
    
    const original = fb.original_output as Record<string, unknown> || {};
    const corrected = fb.corrected_output as Record<string, unknown> || {};
    
    const synonymFields = ['material', 'color', 'grade', 'texture', 'brand'];
    
    for (const field of synonymFields) {
      const origVal = String(original[field] || '').toLowerCase().trim();
      const corrVal = String(corrected[field] || '').toLowerCase().trim();
      
      if (origVal && corrVal && origVal !== corrVal) {
        const key = `${field}:${origVal}:${corrVal}`;
        const existing = synonymPatterns.get(key) || {
          field,
          from: origVal,
          to: corrVal,
          count: 0,
          feedback_ids: [],
        };
        existing.count++;
        existing.feedback_ids.push(fb.id);
        synonymPatterns.set(key, existing);
      }
    }
  }
  
  // Convert to candidates
  for (const [key, pattern] of Array.from(synonymPatterns.entries())) {
    if (pattern.count >= min_occurrences) {
      candidates.push({
        id: `syn_${key.replace(/:/g, '_')}`,
        type: 'synonym',
        field_name: pattern.field,
        original_value: pattern.from,
        corrected_value: pattern.to,
        occurrence_count: pattern.count,
        confidence: Math.min(0.5 + (pattern.count * 0.1), 0.95),
        evidence: [`Corrected ${pattern.count} times from "${pattern.from}" to "${pattern.to}"`],
        recommended_action: `Add synonym: ${pattern.field} "${pattern.from}" -> "${pattern.to}"`,
        created_from_feedback_ids: pattern.feedback_ids,
      });
    }
  }
  
  // -------------------------------------------------------------------------
  // 2. FIND MATCHING RULE CANDIDATES
  // -------------------------------------------------------------------------
  const matchCorrections = corrections.filter(c => c.feedback_type === 'matching');
  
  // Group by what type of correction was made
  const falsePositives = matchCorrections.filter(c => {
    const orig = c.original_output as Record<string, unknown> || {};
    return ['exact_match', 'likely_match'].includes(String(orig.recommendation || ''));
  });
  
  const falseNegatives = matchCorrections.filter(c => {
    const orig = c.original_output as Record<string, unknown> || {};
    return ['new_product', 'review'].includes(String(orig.recommendation || ''));
  });
  
  if (falsePositives.length >= min_occurrences) {
    candidates.push({
      id: 'rule_match_fp',
      type: 'rule_adjustment',
      occurrence_count: falsePositives.length,
      confidence: Math.min(0.5 + (falsePositives.length * 0.05), 0.85),
      evidence: [
        `${falsePositives.length} false positive matches corrected`,
        'Products were incorrectly merged that should be separate',
      ],
      recommended_action: 'Consider tightening matching criteria or adding more hard constraints',
      created_from_feedback_ids: falsePositives.map(c => c.id),
    });
  }
  
  if (falseNegatives.length >= min_occurrences) {
    candidates.push({
      id: 'rule_match_fn',
      type: 'rule_adjustment',
      occurrence_count: falseNegatives.length,
      confidence: Math.min(0.5 + (falseNegatives.length * 0.05), 0.85),
      evidence: [
        `${falseNegatives.length} false negative matches corrected`,
        'Products that should have matched were not recognized',
      ],
      recommended_action: 'Consider relaxing non-critical matching criteria or improving normalization',
      created_from_feedback_ids: falseNegatives.map(c => c.id),
    });
  }
  
  // -------------------------------------------------------------------------
  // 3. FIND CONFIDENCE THRESHOLD CANDIDATES
  // -------------------------------------------------------------------------
  const confidenceGroups: Record<string, { low_accuracy: number; total: number; ids: string[] }> = {};
  
  for (const fb of corrections) {
    const orig = fb.original_output as Record<string, unknown> || {};
    const conf = fb.original_confidence || (orig.confidence as number) || 0.5;
    const band = conf >= 0.9 ? 'very_high' : conf >= 0.75 ? 'high' : conf >= 0.6 ? 'medium' : 'low';
    const key = `${fb.feedback_type}_${band}`;
    
    if (!confidenceGroups[key]) {
      confidenceGroups[key] = { low_accuracy: 0, total: 0, ids: [] };
    }
    confidenceGroups[key].total++;
    if (!fb.was_correct) {
      confidenceGroups[key].low_accuracy++;
    }
    confidenceGroups[key].ids.push(fb.id);
  }
  
  for (const [key, group] of Object.entries(confidenceGroups)) {
    if (group.total >= min_occurrences) {
      const accuracy = 1 - (group.low_accuracy / group.total);
      const [type, band] = key.split('_');
      
      // If high confidence decisions have low accuracy, suggest threshold change
      if ((band === 'high' || band === 'very_high') && accuracy < 0.8) {
        candidates.push({
          id: `threshold_${key}`,
          type: 'threshold_change',
          occurrence_count: group.total,
          confidence: 0.7,
          evidence: [
            `${type} ${band} confidence decisions only ${(accuracy * 100).toFixed(0)}% accurate`,
            `${group.low_accuracy} of ${group.total} decisions were corrected`,
          ],
          recommended_action: `Lower auto-approval threshold for ${type} or increase review routing`,
          created_from_feedback_ids: group.ids,
        });
      }
    }
  }
  
  // Sort by occurrence count
  candidates.sort((a, b) => b.occurrence_count - a.occurrence_count);
  
  return candidates;
}

/**
 * Apply a learning candidate (synonym only for now)
 */
export async function applyLearningCandidate(
  candidate: LearningCandidate,
  applied_by?: string
): Promise<boolean> {
  if (candidate.type !== 'synonym') {
    logger.warn('Only synonym candidates can be auto-applied', { type: candidate.type });
    return false;
  }
  
  if (!candidate.field_name || !candidate.original_value || !candidate.corrected_value) {
    return false;
  }
  
  // Add the synonym
  const result = await addSynonym({
    field_name: candidate.field_name,
    raw_term: candidate.original_value,
    normalized_term: candidate.corrected_value,
    verified_by: applied_by,
  });
  
  if (result) {
    // Mark feedback as used for training
    await supabaseAdmin
      .from('ai_feedback')
      .update({ used_for_training: true })
      .in('id', candidate.created_from_feedback_ids);
      
    logger.info('Applied learning candidate', {
      candidate_id: candidate.id,
      type: candidate.type,
      applied_by,
    });
    
    return true;
  }
  
  return false;
}

// ============================================================================
// STRUCTURED CORRECTION CAPTURE
// ============================================================================

export interface StructuredCorrection {
  corrected_field: string;
  original_prediction: unknown;
  corrected_value: unknown;
  confidence_delta: number;
}

/**
 * Capture structured correction data for detailed learning analysis
 */
export async function captureStructuredCorrections(
  feedback_id: string,
  original: Record<string, unknown>,
  corrected: Record<string, unknown>,
  original_confidence: number = 0.5
): Promise<StructuredCorrection[]> {
  const corrections: StructuredCorrection[] = [];
  
  for (const [field, correctedValue] of Object.entries(corrected)) {
    const originalValue = original[field];
    
    if (JSON.stringify(originalValue) !== JSON.stringify(correctedValue)) {
      corrections.push({
        corrected_field: field,
        original_prediction: originalValue,
        corrected_value: correctedValue,
        confidence_delta: -original_confidence, // Negative because we were wrong
      });
    }
  }
  
  // Store corrections in feedback record
  if (corrections.length > 0) {
    await supabaseAdmin
      .from('ai_feedback')
      .update({
        structured_corrections: corrections,
      })
      .eq('id', feedback_id);
  }
  
  return corrections;
}

// ============================================================================
// CAPTURE FROM REVIEW RESOLUTION
// ============================================================================

/**
 * Auto-capture feedback when a review item is resolved
 * Called by updateReviewStatus when reviews are approved/rejected
 */
export async function captureReviewResolutionFeedback(
  review_id: string,
  review_type: string,
  source_table: string,
  source_id: string,
  decision: 'approved' | 'rejected' | 'resolved',
  resolution_notes?: string,
  resolved_by?: string
): Promise<void> {
  // Map review type to feedback type
  const feedbackTypeMap: Record<string, FeedbackType> = {
    catalog: 'extraction',
    product_match: 'matching',
    pricing: 'pricing',
    supplier: 'supplier',
  };

  const feedback_type = feedbackTypeMap[review_type];
  if (!feedback_type) {
    return; // Skip review types we don't track
  }

  // Load original AI output if available
  let original_output: Record<string, unknown> = { review_id, decision };
  let original_confidence: number | undefined;

  switch (feedback_type) {
    case 'extraction':
      const { data: extraction } = await supabaseAdmin
        .from('ai_extraction_results')
        .select('*')
        .eq('supplier_product_id', source_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (extraction) {
        original_output = extraction.extracted_attributes as Record<string, unknown>;
        original_confidence = extraction.overall_confidence;
      }
      break;

    case 'matching':
      const { data: match } = await supabaseAdmin
        .from('ai_match_reasoning')
        .select('*')
        .eq('supplier_product_id', source_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (match) {
        original_output = {
          recommendation: match.match_recommendation,
          canonical_product_id: match.canonical_product_id,
          evidence_summary: match.evidence_summary,
        };
        original_confidence = match.confidence;
      }
      break;
  }

  // Capture the feedback
  await captureFeedback({
    feedback_type,
    source_table,
    source_id,
    original_output,
    original_confidence,
    was_correct: decision === 'approved',
    correction_type: decision === 'approved' ? 'confirmed' : 'rejected',
    correction_reason: resolution_notes,
    corrected_by: resolved_by,
  });
}
