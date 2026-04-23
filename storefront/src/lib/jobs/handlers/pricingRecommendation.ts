/**
 * Pricing Recommendation Job Handler
 * 
 * Generates pricing recommendations using lib/competitivePricing.js
 * 
 * Triggered by: competitor_price_check, cost changes, new supplier links
 * Output: Recommendation persisted to pricing_recommendations, review items for manual approval
 * 
 * Legacy Module Mapping:
 * - generateRecommendation() -> Compute optimal price based on competitors
 * - validateOffer() -> Filter and weight competitor offers
 * - calculateMargin() -> Ensure margin floors are met
 */

import { supabaseAdmin, getSupabaseCatalogos } from '../supabase';
import { logger } from '../logger';
import { getAgentRule } from '../../agents/config';
import { emitSystemEvent } from '../../events/emit';
import { qaAfterPricing } from '../../qa/triggers';
import { createReviewItem } from '../../review/createReviewItem';
import { 
  generateRecommendation,
  calculateMargin,
  PRICING_CONFIG,
  type PricingProduct,
  type PricingRecommendation,
  type PricingCompetitorOffer,
} from '../../legacy';
import type { 
  JobExecutionResult, 
  PricingRecommendationPayload,
  ReviewQueueCreateInput,
} from '../../agents/types';

// ============================================================================
// HANDLER
// ============================================================================

export async function handlePricingRecommendation(
  payload: Record<string, unknown>
): Promise<JobExecutionResult> {
  const input = payload as unknown as PricingRecommendationPayload;
  const reviewItems: ReviewQueueCreateInput[] = [];

  // Load rules from database
  const minMarginPercent = await getAgentRule<number>('competitive_pricing', 'minimum_margin_percent', PRICING_CONFIG.minimum_margin_percent);
  const minMarginDollars = await getAgentRule<number>('competitive_pricing', 'minimum_margin_dollars', PRICING_CONFIG.minimum_margin_dollars);
  const maxAutoPublishSwing = await getAgentRule<number>('competitive_pricing', 'max_auto_publish_swing_percent', 0.05);
  const maxSwingWithoutReview = await getAgentRule<number>('competitive_pricing', 'max_swing_without_review', PRICING_CONFIG.price_swing_review_threshold);
  const autoPublishConfidence = await getAgentRule<number>('competitive_pricing', 'auto_publish_confidence', PRICING_CONFIG.auto_publish_confidence);
  const blockOnMapRisk = await getAgentRule<boolean>('competitive_pricing', 'block_on_map_risk', true);

  // Validate input
  if (!input.product_id) {
    return {
      success: false,
      error: 'Missing required input: product_id',
    };
  }

  try {
    logger.info('Starting pricing recommendation', {
      product_id: input.product_id,
      trigger: input.trigger_reason,
    });

    // =========================================================================
    // LOAD PRODUCT DATA
    // =========================================================================
    let currentPrice = input.current_price;
    let currentCost = input.current_cost;
    let mapPrice: number | undefined;
    let productName: string | undefined;
    const shippingCostEstimate = 2.5;

    const cat = getSupabaseCatalogos();
    const { data: product, error: productError } = await cat
      .from('products')
      .select('id, sku, name, attributes')
      .eq('id', input.product_id)
      .eq('is_active', true)
      .single();

    const { data: bestRow } = await cat
      .from('product_best_offer_price')
      .select('best_price')
      .eq('product_id', input.product_id)
      .maybeSingle();

    if (productError || !product) {
      return {
        success: false,
        error: 'Product not found in catalogos.products',
      };
    }

    const attrs = (product.attributes ?? {}) as Record<string, unknown>;
    const best = bestRow?.best_price != null ? Number(bestRow.best_price) : null;
    currentPrice = currentPrice ?? best ?? undefined;
    currentCost = currentCost ?? best ?? undefined;
    mapPrice = attrs.map_price != null ? Number(attrs.map_price) : undefined;
    productName = (product.name as string) || undefined;

    if (!currentPrice || !currentCost) {
      return {
        success: false,
        error: 'Could not determine current price or cost',
      };
    }

    // =========================================================================
    // LOAD COMPETITOR OFFERS
    // =========================================================================
    let offers: PricingCompetitorOffer[] = [];

    if (input.competitor_offers && input.competitor_offers.length > 0) {
      offers = input.competitor_offers as PricingCompetitorOffer[];
    } else {
      // Load from competitor_offers table
      const { data: dbOffers } = await supabaseAdmin
        .from('competitor_offers')
        .select('*')
        .eq('canonical_product_id', input.product_id)
        .gte('scraped_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
        .order('scraped_at', { ascending: false })
        .limit(20);

      if (dbOffers) {
        offers = dbOffers.map(o => ({
          source_name: o.source_name || o.competitor_name || 'Unknown',
          source_url: o.source_url || o.url,
          visible_price: o.price || o.visible_price || 0,
          shipping_estimate: o.shipping_estimate ?? null,
          availability: o.availability || 'in_stock',
          offer_confidence: o.confidence || o.match_confidence || 0.7,
          same_brand: o.same_brand !== false,
          same_pack: o.same_pack !== false,
          notes: o.notes,
          scraped_at: o.scraped_at,
        }));
      }
    }

    // =========================================================================
    // CALL LEGACY PRICING LOGIC
    // =========================================================================
    const pricingInput: PricingProduct = {
      canonical_product_id: input.product_id,
      current_price: currentPrice,
      current_cost: currentCost,
      map_price: mapPrice,
      minimum_margin_percent: minMarginPercent,
      minimum_margin_dollars: minMarginDollars,
      shipping_cost_estimate: shippingCostEstimate,
      competitor_offers: offers,
    };

    const recommendation = generateRecommendation(pricingInput, {
      minimum_margin_percent: minMarginPercent,
      minimum_margin_dollars: minMarginDollars,
      auto_publish_confidence: autoPublishConfidence,
      price_swing_review_threshold: maxSwingWithoutReview,
    });

    // =========================================================================
    // APPLY BUSINESS RULES
    // =========================================================================
    const additionalReviewReasons: string[] = [];

    // MAP violation check
    if (blockOnMapRisk && mapPrice && recommendation.recommended_price < mapPrice) {
      additionalReviewReasons.push(`Recommended price $${recommendation.recommended_price.toFixed(2)} below MAP $${mapPrice.toFixed(2)}`);
      recommendation.auto_publish_eligible = false;
    }

    // Price swing check
    const priceSwing = Math.abs(recommendation.recommended_price - currentPrice) / currentPrice;
    if (priceSwing > maxAutoPublishSwing && recommendation.auto_publish_eligible) {
      additionalReviewReasons.push(`Price swing ${(priceSwing * 100).toFixed(1)}% exceeds auto-publish limit`);
      recommendation.auto_publish_eligible = false;
    }

    // Add additional reasons to recommendation
    if (additionalReviewReasons.length > 0) {
      recommendation.review_reasons = [...recommendation.review_reasons, ...additionalReviewReasons];
    }

    // Calculate margin for output
    const margin = calculateMargin(recommendation.recommended_price, currentCost);

    // =========================================================================
    // PERSIST RECOMMENDATION
    // =========================================================================
    const { error: upsertError } = await supabaseAdmin
      .from('pricing_recommendations')
      .upsert({
        canonical_product_id: input.product_id,
        current_price: currentPrice,
        recommended_price: recommendation.recommended_price,
        action: recommendation.action,
        reason: recommendation.reason,
        lowest_competitor_price: recommendation.lowest_trusted_comparable_price,
        margin_percent_after: recommendation.estimated_margin_percent_after_change,
        margin_dollars_after: recommendation.estimated_margin_dollars_after_change,
        confidence: recommendation.confidence,
        auto_publish_eligible: recommendation.auto_publish_eligible,
        review_reasons: recommendation.review_reasons,
        competitor_offer_count: offers.length,
        trigger_reason: input.trigger_reason || 'manual',
        created_at: new Date().toISOString(),
      }, { onConflict: 'canonical_product_id' });

    if (upsertError) {
      logger.warn('Failed to persist recommendation', { error: upsertError.message });
    }

    // =========================================================================
    // CREATE REVIEW ITEM IF NEEDED
    // =========================================================================
    if (recommendation.review_reasons.length > 0 || recommendation.action === 'review') {
      const isHighPriority = recommendation.review_reasons.some(r => 
        r.toLowerCase().includes('map') || 
        r.toLowerCase().includes('margin') ||
        r.toLowerCase().includes('below')
      );

      const reviewInput: ReviewQueueCreateInput = {
        review_type: 'pricing',
        priority: isHighPriority ? 'high' : 'medium',
        source_table: 'catalogos.products',
        source_id: input.product_id,
        title: `Pricing Review: ${productName || input.product_id}`,
        issue_category: recommendation.action === 'review' ? 'pricing_review_required' : 'large_price_swing',
        issue_summary: recommendation.review_reasons.join('; ') || recommendation.reason,
        recommended_action: `${recommendation.action.toUpperCase()}: $${currentPrice.toFixed(2)} → $${recommendation.recommended_price.toFixed(2)} (${(priceSwing * 100).toFixed(1)}% change)`,
        agent_name: 'competitive_pricing',
        confidence: recommendation.confidence,
        details: {
          current_price: currentPrice,
          recommended_price: recommendation.recommended_price,
          action: recommendation.action,
          margin_percent: margin.percent,
          margin_dollars: margin.dollars,
          map_price: mapPrice,
          competitor_offers: offers.length,
          lowest_competitor: recommendation.lowest_trusted_comparable_price,
        },
      };

      const created = await createReviewItem(reviewInput);
      if (created) {
        reviewItems.push(reviewInput);
      }
    }

    // =========================================================================
    // EMIT EVENT
    // =========================================================================
    await emitSystemEvent({
      event_type: 'pricing_recommendation_generated',
      source_table: 'catalogos.products',
      source_id: input.product_id,
      payload: {
        action: recommendation.action,
        current_price: currentPrice,
        recommended_price: recommendation.recommended_price,
        auto_publish_eligible: recommendation.auto_publish_eligible,
        confidence: recommendation.confidence,
      },
    });

    // =========================================================================
    // RUN QA CHECK
    // =========================================================================
    const qaResult = await qaAfterPricing([{
      canonical_product_id: input.product_id,
      current_price: currentPrice,
      recommended_price: recommendation.recommended_price,
      current_cost: currentCost,
      map_price: mapPrice,
      estimated_margin_percent_after_change: recommendation.estimated_margin_percent_after_change,
      estimated_margin_dollars_after_change: recommendation.estimated_margin_dollars_after_change,
      confidence: recommendation.confidence,
      auto_publish_eligible: recommendation.auto_publish_eligible,
      review_reasons: recommendation.review_reasons,
      competitor_offers: offers as any,
    }]);

    // Handle QA blocking
    if (qaResult && qaResult.summary.items_blocked > 0) {
      recommendation.auto_publish_eligible = false;
      recommendation.review_reasons.push('Blocked by QA supervisor');
      
      // Update persisted recommendation
      await supabaseAdmin
        .from('pricing_recommendations')
        .update({
          auto_publish_eligible: false,
          review_reasons: recommendation.review_reasons,
        })
        .eq('canonical_product_id', input.product_id);
    }

    // Merge QA review items
    if (qaResult?.review_items) {
      for (const qaItem of qaResult.review_items) {
        const qaReviewInput: ReviewQueueCreateInput = {
          review_type: 'pricing',
          priority: qaItem.priority,
          source_table: 'catalogos.products',
          source_id: input.product_id,
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
        product_id: input.product_id,
        recommendation: {
          current_price: currentPrice,
          recommended_price: recommendation.recommended_price,
          action: recommendation.action,
          reason: recommendation.reason,
          margin_percent: margin.percent,
          margin_dollars: margin.dollars,
          confidence: recommendation.confidence,
          auto_publish_eligible: recommendation.auto_publish_eligible,
        },
        competitor_offers_analyzed: offers.length,
        lowest_competitor_price: recommendation.lowest_trusted_comparable_price,
        review_required: recommendation.review_reasons.length > 0,
        review_reasons: recommendation.review_reasons,
        persisted: !upsertError,
        review_items_created: reviewItems.length,
        qa_issues: qaResult?.summary.issues_found ?? 0,
        qa_blocked: qaResult?.summary.items_blocked ?? 0,
      },
      reviewItems,
    };

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Pricing recommendation failed', { 
      error: message,
      product_id: input.product_id,
    });
    return {
      success: false,
      error: message,
    };
  }
}
