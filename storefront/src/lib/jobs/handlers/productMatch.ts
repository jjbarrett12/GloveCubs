/**
 * Product Match Job Handler
 * 
 * Matches normalized products against canonical catalog using lib/productMatching.js
 * 
 * Triggered by: product_normalization jobs
 * Output: Match result persisted to product_matches, links or new products created
 * 
 * Legacy Module Mapping:
 * - matchSingleProduct() -> Find best match in catalog
 * - findMatches() -> Find all potential matches
 * - determineMatchResult() -> Classify as exact/likely/variant/new/review
 */

import { supabaseAdmin, getSupabaseCatalogos } from '../supabase';
import { buildSupplierOfferUpsertRow } from '../../../../../lib/supplier-offer-normalization';
import { flattenCatalogosProductRow } from '../../catalog/canonical-read-model';
import { logger } from '../logger';
import { getAgentRule } from '../../agents/config';
import { emitSystemEvent } from '../../events/emit';
import { qaAfterMatching } from '../../qa/triggers';
import { createReviewItem } from '../../review/createReviewItem';
import { 
  matchSingleProduct,
  findMatches,
  MATCH_THRESHOLDS,
  type ProductData,
  type ProductMatchResult,
} from '../../legacy';
import { 
  generateMatchReasoning, 
  persistMatchReasoning,
  type AIMatchReasoningInput,
} from '../../ai/reasoning';
import type { 
  JobExecutionResult, 
  ProductMatchPayload,
  ReviewQueueCreateInput,
  EnqueueJobInput 
} from '../../agents/types';

// ============================================================================
// HANDLER
// ============================================================================

export async function handleProductMatch(
  payload: Record<string, unknown>
): Promise<JobExecutionResult> {
  const input = payload as ProductMatchPayload;
  const reviewItems: ReviewQueueCreateInput[] = [];
  const followupJobs: EnqueueJobInput[] = [];

  // Load rules from database
  const exactMatchThreshold = await getAgentRule<number>('product_matching', 'exact_match_confidence_threshold', MATCH_THRESHOLDS.exact_match);
  const likelyMatchThreshold = await getAgentRule<number>('product_matching', 'likely_match_threshold', MATCH_THRESHOLDS.likely_match);
  const reviewThreshold = await getAgentRule<number>('product_matching', 'review_threshold', MATCH_THRESHOLDS.review);
  const blockOnPackMismatch = await getAgentRule<boolean>('product_matching', 'block_on_pack_mismatch', true);
  const blockOnGradeMismatch = await getAgentRule<boolean>('product_matching', 'block_on_grade_mismatch', true);
  const autoLinkExactMatches = await getAgentRule<boolean>('product_matching', 'auto_link_exact_matches', true);

  // Validate input
  if (!input.normalized_product_id && !input.normalized_data) {
    return {
      success: false,
      error: 'Missing required input: normalized_product_id or normalized_data',
    };
  }

  try {
    logger.info('Starting product match', {
      product_id: input.normalized_product_id,
      has_normalized_data: !!input.normalized_data,
    });

    // =========================================================================
    // LOAD INCOMING PRODUCT DATA
    // =========================================================================
    let incomingProduct: ProductData;

    if (input.normalized_data) {
      incomingProduct = input.normalized_data as ProductData;
    } else {
      const { data: existing, error } = await supabaseAdmin
        .from('supplier_products')
        .select('*')
        .eq('id', input.normalized_product_id)
        .single();

      if (error || !existing) {
        return {
          success: false,
          error: `Product not found: ${input.normalized_product_id}`,
        };
      }
      incomingProduct = existing as ProductData;
    }

    // Ensure we have an ID
    const productId = input.normalized_product_id || incomingProduct.id || crypto.randomUUID();
    incomingProduct.id = productId;

    // =========================================================================
    // LOAD CANONICAL CATALOG
    // =========================================================================
    const { data: catalogRaw, error: catalogError } = await getSupabaseCatalogos()
      .from('products')
      .select('id, sku, name, description, attributes, is_active, categories(slug)')
      .eq('is_active', true)
      .limit(1000);

    if (catalogError) {
      logger.warn('Failed to load catalog', { error: catalogError.message });
    }

    const catalog: ProductData[] = (catalogRaw || []).map((row) => {
      const f = flattenCatalogosProductRow(row as Record<string, unknown>);
      const attrs =
        row.attributes && typeof row.attributes === 'object' && !Array.isArray(row.attributes)
          ? (row.attributes as Record<string, unknown>)
          : {};
      return {
        id: f.id as string,
        sku: f.sku as string,
        name: (f.name as string) || '',
        canonical_title: (f.title as string) || String(f.name),
        material: f.material != null ? String(f.material) : undefined,
        color: f.color != null ? String(f.color) : undefined,
        size: f.size != null ? String(f.size) : undefined,
        grade: attrs.grade as string | undefined,
        texture: attrs.texture as string | undefined,
        thickness_mil: attrs.thickness_mil as number | undefined,
        units_per_box: attrs.units_per_box as number | undefined,
        boxes_per_case: attrs.boxes_per_case as number | undefined,
        total_units_per_case: attrs.total_units_per_case as number | undefined,
        powder_free: attrs.powder_free as boolean | undefined,
        latex_free: attrs.latex_free as boolean | undefined,
        exam_grade: attrs.exam_grade as boolean | undefined,
        medical_grade: attrs.medical_grade as boolean | undefined,
        food_safe: attrs.food_safe as boolean | undefined,
      };
    });

    // =========================================================================
    // CALL LEGACY MATCHING LOGIC
    // =========================================================================
    let matchResult: ProductMatchResult;

    if (catalog.length === 0) {
      // No catalog - this is a new product
      matchResult = {
        incoming_supplier_product_id: productId,
        match_result: 'new_product',
        canonical_product_id: null,
        match_confidence: 0,
        reasoning: 'No canonical products in catalog - creating new product',
        matched_fields: [],
        conflicting_fields: [],
        recommended_action: 'create_new_canonical',
      };
    } else {
      // Find matches using legacy logic
      matchResult = matchSingleProduct(incomingProduct, catalog);
      matchResult.incoming_supplier_product_id = productId;
    }

    // =========================================================================
    // APPLY BUSINESS RULES
    // =========================================================================
    const criticalConflicts: string[] = [];
    
    // Check for pack mismatch
    if (blockOnPackMismatch) {
      const packConflict = matchResult.conflicting_fields.find(f => 
        f.field === 'units_per_box' || f.field === 'total_units_per_case'
      );
      if (packConflict) {
        criticalConflicts.push('pack_size');
      }
    }
    
    // Check for grade mismatch  
    if (blockOnGradeMismatch) {
      const gradeConflict = matchResult.conflicting_fields.find(f => f.field === 'grade');
      if (gradeConflict) {
        criticalConflicts.push('grade');
      }
    }

    // Downgrade match if critical conflicts exist
    if (criticalConflicts.length > 0 && matchResult.match_result === 'exact_match') {
      matchResult.match_result = 'review';
      matchResult.match_confidence = Math.min(matchResult.match_confidence, reviewThreshold);
      matchResult.reasoning = `Downgraded from exact_match due to conflicts: ${criticalConflicts.join(', ')}`;
      matchResult.recommended_action = 'human_review';
    }

    // =========================================================================
    // DETERMINE ACTION AND PERSIST
    // =========================================================================
    let action: string;
    let canonicalProductId: string | null = matchResult.canonical_product_id;

    switch (matchResult.match_result) {
      case 'exact_match':
        if (matchResult.match_confidence >= exactMatchThreshold && autoLinkExactMatches) {
          action = 'link_to_existing';
          
          // Create link in supplier_product_links
          await supabaseAdmin
            .from('supplier_product_links')
            .upsert({
              supplier_product_id: productId,
              canonical_product_id: matchResult.canonical_product_id,
              match_confidence: matchResult.match_confidence,
              match_type: 'exact_match',
              auto_linked: true,
              linked_at: new Date().toISOString(),
            }, { onConflict: 'supplier_product_id' });

        } else {
          action = 'human_review';
          await createMatchReviewItem(productId, matchResult, 'Near exact match needs confirmation', reviewItems);
        }
        break;

      case 'likely_match':
        action = 'human_review';
        await createMatchReviewItem(productId, matchResult, 'Likely match requires verification', reviewItems);
        break;

      case 'variant':
        action = 'create_variant';
        // Create as variant (linked but flagged as variant)
        await supabaseAdmin
          .from('supplier_product_links')
          .upsert({
            supplier_product_id: productId,
            canonical_product_id: matchResult.canonical_product_id,
            match_confidence: matchResult.match_confidence,
            match_type: 'variant',
            auto_linked: false,
            linked_at: new Date().toISOString(),
          }, { onConflict: 'supplier_product_id' });
        
        // Also create review item for variant confirmation
        await createMatchReviewItem(productId, matchResult, 'Variant detected - confirm relationship', reviewItems);
        break;

      case 'new_product':
        action = 'create_new_canonical';
        
        // Create new canonical product from supplier product
        const newCanonical = await createCanonicalProduct(productId, incomingProduct);
        if (newCanonical) {
          canonicalProductId = newCanonical;
          
          // Link supplier product to new canonical
          await supabaseAdmin
            .from('supplier_product_links')
            .upsert({
              supplier_product_id: productId,
              canonical_product_id: newCanonical,
              match_confidence: 1.0,
              match_type: 'new_product',
              auto_linked: true,
              linked_at: new Date().toISOString(),
            }, { onConflict: 'supplier_product_id' });
        }
        break;

      case 'review':
      default:
        action = 'human_review';
        await createMatchReviewItem(productId, matchResult, 
          criticalConflicts.length > 0 
            ? `Critical conflicts: ${criticalConflicts.join(', ')}` 
            : 'Unable to determine match automatically',
          reviewItems
        );
        break;
    }

    // =========================================================================
    // GENERATE AI MATCH REASONING
    // =========================================================================
    let aiReasoning;
    if (matchResult.canonical_product_id && catalog.length > 0) {
      const canonicalMatch = catalog.find(p => p.id === matchResult.canonical_product_id);
      if (canonicalMatch) {
        const reasoningInput: AIMatchReasoningInput = {
          supplier_product: {
            id: productId,
            title: incomingProduct.canonical_title || incomingProduct.name,
            brand: incomingProduct.brand,
            material: incomingProduct.material,
            color: incomingProduct.color,
            size: incomingProduct.size,
            thickness_mil: incomingProduct.thickness_mil,
            units_per_box: incomingProduct.units_per_box,
            total_units_per_case: incomingProduct.total_units_per_case,
            powder_free: incomingProduct.powder_free,
            sterile: (incomingProduct as any).sterile,
            exam_grade: incomingProduct.exam_grade,
            mpn: incomingProduct.manufacturer_part_number,
            upc: incomingProduct.upc,
          },
          canonical_product: {
            id: canonicalMatch.id!,
            title: canonicalMatch.canonical_title || canonicalMatch.name,
            brand: canonicalMatch.brand,
            material: canonicalMatch.material,
            color: canonicalMatch.color,
            size: canonicalMatch.size,
            thickness_mil: canonicalMatch.thickness_mil,
            units_per_box: canonicalMatch.units_per_box,
            total_units_per_case: canonicalMatch.total_units_per_case,
            powder_free: canonicalMatch.powder_free,
            sterile: (canonicalMatch as any).sterile,
            exam_grade: canonicalMatch.exam_grade,
            mpn: canonicalMatch.manufacturer_part_number,
            upc: canonicalMatch.upc,
          },
          rules_confidence: matchResult.match_confidence,
          rules_recommendation: matchResult.match_result,
        };

        aiReasoning = generateMatchReasoning(reasoningInput);

        // Persist AI reasoning
        await persistMatchReasoning(productId, canonicalProductId, aiReasoning);

        // If AI reasoning suggests review but rules didn't, escalate
        if (aiReasoning.needs_review && !reviewItems.length) {
          await createMatchReviewItem(
            productId, 
            matchResult, 
            aiReasoning.review_reason || 'AI reasoning suggests review needed',
            reviewItems
          );
          action = 'human_review';
        }

        // If hard constraints failed, block the match
        if (!aiReasoning.hard_constraints_passed && action === 'link_to_existing') {
          action = 'human_review';
          await createMatchReviewItem(
            productId,
            matchResult,
            `Hard constraint violations: ${aiReasoning.conflict_summary}`,
            reviewItems
          );
        }
      }
    }

    // =========================================================================
    // PERSIST MATCH RESULT
    // =========================================================================
    await supabaseAdmin
      .from('product_matches')
      .upsert({
        supplier_product_id: productId,
        canonical_product_id: canonicalProductId,
        match_result: matchResult.match_result,
        match_confidence: matchResult.match_confidence,
        matched_fields: matchResult.matched_fields,
        conflicting_fields: matchResult.conflicting_fields,
        reasoning: aiReasoning?.evidence_summary || matchResult.reasoning,
        recommended_action: action,
        critical_conflicts: criticalConflicts,
        ai_reasoning_id: aiReasoning ? undefined : undefined, // Will be linked via ai_match_reasoning table
        processed_at: new Date().toISOString(),
      }, { onConflict: 'supplier_product_id' });

    // =========================================================================
    // EMIT EVENTS
    // =========================================================================
    if (reviewItems.length > 0) {
      await emitSystemEvent({
        event_type: 'product_match_uncertain',
        source_table: 'supplier_products',
        source_id: productId,
        payload: { 
          match_result: matchResult.match_result,
          confidence: matchResult.match_confidence,
          action,
          critical_conflicts: criticalConflicts,
        },
      });
    } else {
      await emitSystemEvent({
        event_type: 'product_match_completed',
        source_table: 'supplier_products',
        source_id: productId,
        payload: { 
          match_result: matchResult.match_result,
          confidence: matchResult.match_confidence,
          action,
          canonical_product_id: canonicalProductId,
        },
      });

      // If linked to existing or new product, create/update supplier offer
      if (canonicalProductId && (action === 'link_to_existing' || action === 'create_new_canonical')) {
        const offerCreated = await createOrUpdateSupplierOffer(
          productId,
          canonicalProductId,
          incomingProduct
        );
        
        if (offerCreated) {
          // Trigger pricing check after offer created
          followupJobs.push({
            job_type: 'pricing_recommendation',
            payload: {
              product_id: canonicalProductId,
              trigger_reason: action === 'link_to_existing' ? 'new_supplier_linked' : 'new_product_offer',
            },
            dedupe_key: `pricing_recommendation:${canonicalProductId}`,
            priority: 60,
          });
        }
      }
    }

    // =========================================================================
    // RUN QA CHECK
    // =========================================================================
    const qaResult = await qaAfterMatching([{
      incoming_supplier_product_id: productId,
      match_result: matchResult.match_result,
      canonical_product_id: canonicalProductId ?? undefined,
      match_confidence: matchResult.match_confidence,
      matched_fields: matchResult.matched_fields,
      conflicting_fields: matchResult.conflicting_fields.map(f => f.field),
      reasoning: matchResult.reasoning,
    }]);

    // Merge QA review items
    if (qaResult?.review_items) {
      for (const qaItem of qaResult.review_items) {
        const qaReviewInput: ReviewQueueCreateInput = {
          review_type: 'product_match',
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
        match_result: matchResult.match_result,
        match_confidence: matchResult.match_confidence,
        canonical_product_id: canonicalProductId,
        action,
        matched_fields: matchResult.matched_fields.length,
        conflicting_fields: matchResult.conflicting_fields.length,
        critical_conflicts: criticalConflicts,
        reasoning: matchResult.reasoning,
        persisted: true,
        review_items_created: reviewItems.length,
        qa_issues: qaResult?.summary.issues_found ?? 0,
      },
      reviewItems,
      followupJobs,
    };

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Product match failed', { 
      error: message,
      product_id: input.normalized_product_id,
    });
    return {
      success: false,
      error: message,
    };
  }
}

// ============================================================================
// HELPERS
// ============================================================================

async function createMatchReviewItem(
  productId: string,
  matchResult: ProductMatchResult,
  title: string,
  reviewItems: ReviewQueueCreateInput[]
): Promise<void> {
  const reviewInput: ReviewQueueCreateInput = {
    review_type: 'product_match',
    priority: matchResult.conflicting_fields.length >= 2 ? 'high' : 'medium',
    source_table: 'supplier_products',
    source_id: productId,
    title,
    issue_category: matchResult.match_result === 'review' ? 'critical_conflict' : 'ambiguous_match',
    issue_summary: `${Math.round(matchResult.match_confidence * 100)}% confidence - ${matchResult.reasoning}`,
    recommended_action: `VERIFY - ${matchResult.recommended_action === 'human_review' ? 'Manual match decision required' : matchResult.recommended_action}`,
    agent_name: 'product_matching',
    confidence: matchResult.match_confidence,
    details: { 
      match_result: matchResult.match_result,
      canonical_product_id: matchResult.canonical_product_id,
      matched_fields: matchResult.matched_fields,
      conflicting_fields: matchResult.conflicting_fields,
    },
  };

  const created = await createReviewItem(reviewInput);
  if (created) {
    reviewItems.push(reviewInput);
  }
}

/**
 * Create or update supplier offer for a matched product
 * 
 * This creates the actual supplier_offers record that enables pricing comparison.
 * The offer links a specific supplier's pricing to the canonical product.
 */
async function createOrUpdateSupplierOffer(
  supplierProductId: string,
  canonicalProductId: string,
  product: ProductData
): Promise<boolean> {
  try {
    // Get supplier_id from the supplier_products record
    const { data: supplierProduct } = await supabaseAdmin
      .from('supplier_products')
      .select('supplier_id, supplier_sku, cost, price, lead_time_days')
      .eq('id', supplierProductId)
      .single();

    if (!supplierProduct?.supplier_id) {
      logger.warn('Cannot create offer - supplier_id not found', { supplierProductId });
      return false;
    }

    const unitsPerCaseRaw =
      product.total_units_per_case ||
      ((product.units_per_box || 1) * (product.boxes_per_case || 1));
    const rawCost = Number(supplierProduct.cost ?? (product as { cost?: number }).cost ?? 0);
    if (!Number.isFinite(rawCost)) {
      logger.warn('Cannot create offer - invalid cost', { supplierProductId, rawCost });
      return false;
    }
    const unitsPer =
      typeof unitsPerCaseRaw === 'number' && Number.isFinite(unitsPerCaseRaw) && unitsPerCaseRaw > 0
        ? Math.trunc(unitsPerCaseRaw)
        : null;
    const skuRaw = supplierProduct.supplier_sku || product.supplier_sku || product.sku || '';
    const supplierSku =
      String(skuRaw).trim().length > 0 ? String(skuRaw).trim() : `MATCH-${canonicalProductId.slice(0, 8)}`;

    const offerRow = buildSupplierOfferUpsertRow(
      {
        supplier_id: supplierProduct.supplier_id,
        product_id: canonicalProductId,
        supplier_sku: supplierSku,
        cost: rawCost,
        sell_price: rawCost,
        units_per_case: unitsPer,
        lead_time_days: supplierProduct.lead_time_days ?? null,
        raw_id: null,
        normalized_id: supplierProductId,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { currency_code: 'USD', cost_basis: 'per_case', cost: rawCost, units_per_case: unitsPer ?? undefined }
    );

    const perUnitCostUsd =
      offerRow.normalized_unit_cost_minor != null && typeof offerRow.normalized_unit_cost_minor === 'number'
        ? offerRow.normalized_unit_cost_minor / 100
        : null;

    const { error } = await getSupabaseCatalogos()
      .from('supplier_offers')
      .upsert(offerRow, {
        onConflict: 'supplier_id,product_id,supplier_sku',
        ignoreDuplicates: false,
      });

    if (error) {
      logger.warn('Failed to create/update supplier offer', { 
        error: error.message,
        supplierProductId,
        canonicalProductId,
      });
      return false;
    }

    logger.info('Supplier offer created/updated', {
      supplier_id: supplierProduct.supplier_id,
      canonical_product_id: canonicalProductId,
      supplier_sku: supplierSku,
      cost: rawCost,
      per_unit_cost: perUnitCostUsd,
    });

    // Emit event for downstream processing
    await emitSystemEvent({
      event_type: 'supplier_cost_changed',
      source_table: 'supplier_offers',
      source_id: supplierProductId,
      payload: {
        canonical_product_id: canonicalProductId,
        supplier_id: supplierProduct.supplier_id,
        new_cost: rawCost,
        per_unit_cost: perUnitCostUsd,
      },
    });

    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Error creating supplier offer', { error: message });
    return false;
  }
}

async function createCanonicalProduct(
  supplierProductId: string,
  product: ProductData
): Promise<string | null> {
  void supplierProductId;
  void product;
  logger.warn(
    'createCanonicalProduct skipped: catalog rows must be created via CatalogOS publish (catalogos.products).'
  );
  return null;
}
