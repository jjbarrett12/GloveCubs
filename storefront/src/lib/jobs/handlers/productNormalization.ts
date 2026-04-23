/**
 * Product Normalization Job Handler
 * 
 * Normalizes raw product data into standardized format using lib/productNormalization.js
 * 
 * Triggered by: supplier_ingestion jobs
 * Output: Normalized product persisted to supplier_products, followup job to product_match
 * 
 * Legacy Module Mapping:
 * - normalizeProduct() -> Transforms raw supplier data to normalized format
 * - validateAndScore() -> Computes parse_confidence and review_required
 * - generateCanonicalTitle() -> Creates standardized product title
 */

import { supabaseAdmin } from '../supabase';
import { logger } from '../logger';
import { getAgentRule } from '../../agents/config';
import { emitSystemEvent } from '../../events/emit';
import { qaAfterNormalization } from '../../qa/triggers';
import { createReviewItem } from '../../review/createReviewItem';
import { 
  normalizeProduct,
  validateAndScore,
  type RawProductData,
  type NormalizedProduct,
} from '../../legacy';
import type { 
  JobExecutionResult, 
  ProductNormalizationPayload,
  ReviewQueueCreateInput,
  EnqueueJobInput 
} from '../../agents/types';

// ============================================================================
// HANDLER
// ============================================================================

export async function handleProductNormalization(
  payload: Record<string, unknown>
): Promise<JobExecutionResult> {
  const input = payload as ProductNormalizationPayload;
  const reviewItems: ReviewQueueCreateInput[] = [];
  const followupJobs: EnqueueJobInput[] = [];

  // Load rules from database
  const minPublishConfidence = await getAgentRule<number>('product_intake', 'min_publish_confidence', 0.90);
  const requireBrand = await getAgentRule<boolean>('product_intake', 'require_brand', true);
  const requireMaterial = await getAgentRule<boolean>('product_intake', 'require_material', true);
  const requirePackQuantity = await getAgentRule<boolean>('product_intake', 'require_pack_quantity', true);

  // Validate input
  if (!input.product_id && !input.raw_data) {
    return {
      success: false,
      error: 'Missing required input: product_id or raw_data',
    };
  }

  try {
    logger.info('Starting product normalization', {
      product_id: input.product_id,
      supplier_id: input.supplier_id,
      has_raw_data: !!input.raw_data,
    });

    // Load raw data if not provided
    let rawData: RawProductData = input.raw_data || {};
    
    if (input.product_id && !input.raw_data) {
      const { data: existing, error } = await supabaseAdmin
        .from('supplier_products')
        .select('*')
        .eq('id', input.product_id)
        .single();

      if (error || !existing) {
        return {
          success: false,
          error: `Product not found: ${input.product_id}`,
        };
      }
      rawData = existing as RawProductData;
    }

    // =========================================================================
    // CALL LEGACY NORMALIZATION LOGIC
    // =========================================================================
    const normalized = normalizeProduct(rawData, input.supplier_id);

    // Apply additional validation based on database rules
    const additionalIssues: string[] = [];
    
    if (requireBrand && !normalized.brand) {
      additionalIssues.push('Missing brand');
    }
    
    if (requireMaterial && (!normalized.material || normalized.material === 'unknown')) {
      additionalIssues.push('Missing or unknown material');
    }
    
    if (requirePackQuantity && !normalized.units_per_box) {
      additionalIssues.push('Missing pack quantity');
    }

    // Merge additional issues into review_reasons
    if (additionalIssues.length > 0) {
      normalized.review_reasons = [...normalized.review_reasons, ...additionalIssues];
      // Re-score with additional issues
      const revalidation = validateAndScore(normalized);
      normalized.parse_confidence = revalidation.parse_confidence;
      normalized.review_required = revalidation.review_required;
    }

    // Determine if review is required based on confidence and issues
    const needsReview = normalized.review_required || normalized.parse_confidence < minPublishConfidence;

    // =========================================================================
    // PERSIST NORMALIZED PRODUCT
    // =========================================================================
    const productId = input.product_id || crypto.randomUUID();
    
    const { error: upsertError } = await supabaseAdmin
      .from('supplier_products')
      .upsert({
        id: productId,
        supplier_id: input.supplier_id || normalized.supplier_id,
        supplier_sku: normalized.supplier_sku,
        brand: normalized.brand,
        manufacturer: normalized.manufacturer,
        manufacturer_part_number: normalized.manufacturer_part_number,
        upc: normalized.upc,
        product_name_raw: normalized.product_name_raw,
        material: normalized.material,
        grade: normalized.grade,
        color: normalized.color,
        texture: normalized.texture,
        thickness_mil: normalized.thickness_mil,
        size: normalized.size,
        sizes_available: normalized.sizes_available,
        units_per_box: normalized.units_per_box,
        boxes_per_case: normalized.boxes_per_case,
        total_units_per_case: normalized.total_units_per_case,
        exam_grade: normalized.exam_grade,
        medical_grade: normalized.medical_grade,
        food_safe: normalized.food_safe,
        latex_free: normalized.latex_free,
        powder_free: normalized.powder_free,
        chemo_rated: normalized.chemo_rated,
        current_cost: normalized.current_cost,
        map_price: normalized.map_price,
        msrp: normalized.msrp,
        canonical_title: normalized.canonical_title,
        category: normalized.category,
        subcategory: normalized.subcategory,
        description_short: normalized.description_short,
        bullet_points: normalized.bullet_points,
        keywords: normalized.keywords,
        parse_confidence: normalized.parse_confidence,
        review_required: needsReview,
        review_reasons: normalized.review_reasons,
        normalized_at: new Date().toISOString(),
      }, { onConflict: 'id' });

    if (upsertError) {
      logger.error('Failed to persist normalized product', { error: upsertError.message });
      return {
        success: false,
        error: `Failed to persist: ${upsertError.message}`,
      };
    }

    // =========================================================================
    // CREATE REVIEW ITEM IF NEEDED
    // =========================================================================
    if (needsReview) {
      const reviewInput: ReviewQueueCreateInput = {
        review_type: 'catalog',
        priority: normalized.review_reasons.length >= 3 ? 'high' : 'medium',
        source_table: 'supplier_products',
        source_id: productId,
        title: `Normalization Review: ${normalized.canonical_title || normalized.product_name_raw || 'Unknown Product'}`,
        issue_category: 'low_confidence_normalization',
        issue_summary: normalized.review_reasons.join('; ') || 'Below confidence threshold',
        recommended_action: 'VERIFY - Check and correct product data before matching',
        agent_name: 'product_intake',
        confidence: normalized.parse_confidence,
        details: { 
          normalized_fields: {
            brand: normalized.brand,
            material: normalized.material,
            color: normalized.color,
            grade: normalized.grade,
            units_per_box: normalized.units_per_box,
            boxes_per_case: normalized.boxes_per_case,
          },
          missing_fields: normalized.review_reasons.filter(r => r.includes('Missing')),
          issues: normalized.review_reasons,
        },
      };

      // Persist review item
      const created = await createReviewItem(reviewInput);
      if (created) {
        reviewItems.push(reviewInput);
      }
    } else {
      // =========================================================================
      // CREATE FOLLOWUP JOB FOR MATCHING
      // =========================================================================
      followupJobs.push({
        job_type: 'product_match',
        payload: {
          normalized_product_id: productId,
          normalized_data: normalized as unknown as Record<string, unknown>,
        },
        dedupe_key: `product_match:${productId}`,
        priority: 50,
      });
    }

    // =========================================================================
    // EMIT COMPLETION EVENT
    // =========================================================================
    await emitSystemEvent({
      event_type: 'product_normalization_completed',
      source_table: 'supplier_products',
      source_id: productId,
      payload: {
        confidence: normalized.parse_confidence,
        review_required: needsReview,
        missing_fields: normalized.review_reasons.filter(r => r.includes('Missing')),
      },
    });

    // =========================================================================
    // RUN QA CHECK
    // =========================================================================
    const qaResult = await qaAfterNormalization([{
      id: productId,
      sku: normalized.supplier_sku ?? undefined,
      supplier_sku: normalized.supplier_sku ?? undefined,
      brand: normalized.brand ?? undefined,
      material: normalized.material,
      color: normalized.color,
      grade: normalized.grade,
      thickness_mil: normalized.thickness_mil ?? undefined,
      units_per_box: normalized.units_per_box ?? undefined,
      boxes_per_case: normalized.boxes_per_case ?? undefined,
      total_units_per_case: normalized.total_units_per_case ?? undefined,
      title: normalized.canonical_title,
      canonical_title: normalized.canonical_title,
      parse_confidence: normalized.parse_confidence,
      review_required: needsReview,
    }]);

    // Merge QA review items
    if (qaResult?.review_items) {
      for (const qaItem of qaResult.review_items) {
        const qaReviewInput: ReviewQueueCreateInput = {
          review_type: 'catalog',
          priority: qaItem.priority,
          source_table: qaItem.source_table || 'supplier_products',
          source_id: qaItem.source_id || productId,
          title: qaItem.issue_summary,
          issue_category: qaItem.issue_category,
          issue_summary: qaItem.issue_summary,
          recommended_action: qaItem.recommended_action,
          agent_name: 'audit_supervisor',
          details: qaItem.details,
        };
        
        const created = await createReviewItem(qaReviewInput);
        if (created) {
          reviewItems.push(qaReviewInput);
        }
      }
    }

    // =========================================================================
    // RETURN RESULT
    // =========================================================================
    return {
      success: true,
      output: {
        product_id: productId,
        confidence: normalized.parse_confidence,
        review_required: needsReview,
        canonical_title: normalized.canonical_title,
        material: normalized.material,
        grade: normalized.grade,
        units_per_box: normalized.units_per_box,
        boxes_per_case: normalized.boxes_per_case,
        issues: normalized.review_reasons,
        qa_issues: qaResult?.summary.issues_found ?? 0,
        qa_fixes_logged: qaResult?.summary.safe_auto_fixes_applied ?? 0,
        persisted: true,
        review_items_created: reviewItems.length,
      },
      reviewItems,
      followupJobs,
    };

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Product normalization failed', { 
      error: message,
      product_id: input.product_id,
    });
    return {
      success: false,
      error: message,
    };
  }
}
