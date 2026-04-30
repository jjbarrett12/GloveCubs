/**
 * Competitor Price Check Job Handler
 * 
 * Collects and normalizes competitor pricing data from various sources.
 * 
 * Source Mechanisms:
 * 1. Database (existing competitor_offers from prior scraping)
 * 2. API Providers (third-party price monitoring services)
 * 3. Scraper Results (webhook-delivered scraped data)
 * 4. Manual Entry (admin-provided competitor prices)
 * 
 * Processing Flow:
 * 1. Identify products to check
 * 2. Collect offers from all available sources
 * 3. Validate and normalize offers (pack size, shipping, confidence)
 * 4. Persist to competitor_offers table
 * 5. Create review items for ambiguous cases
 * 6. Trigger pricing recommendation jobs
 * 
 * Schedule: Daily for top SKUs, weekly for long-tail
 */

import { supabaseAdmin, getSupabaseCatalogos } from '../supabase';
import {
  loadCompetitorCatalogRowsByProductIds,
  loadCompetitorCatalogRowsBySkus,
  type CompetitorCatalogRow,
} from '../../catalog/v2-ingestion-catalog';
import { logger } from '../logger';
import { getAgentRule } from '../../agents/config';
import { emitSystemEvent } from '../../events/emit';
import { createReviewItem } from '../../review/createReviewItem';
import type { 
  JobExecutionResult, 
  CompetitorPriceCheckPayload,
  ReviewQueueCreateInput,
  EnqueueJobInput,
  CompetitorOffer
} from '../../agents/types';

// ============================================================================
// TYPES
// ============================================================================

interface ProductToCheck {
  id: string;
  sku: string;
  title?: string;
  current_price: number;
  current_cost: number;
  map_price?: number;
  upc?: string;
  mpn?: string;
}

interface RawOffer {
  source: string;
  source_name: string;
  source_url?: string;
  visible_price: number;
  shipping_estimate?: number;
  shipping_known: boolean;
  pack_size?: number;
  pack_description?: string;
  same_pack?: boolean;
  same_brand?: boolean;
  in_stock?: boolean;
  scraped_at: string;
  raw_data?: Record<string, unknown>;
}

interface ValidatedOffer {
  canonical_product_id: string;
  source_name: string;
  source_url?: string;
  visible_price: number;
  shipping_estimate?: number;
  effective_price: number;
  offer_confidence: number;
  same_pack: boolean;
  same_brand: boolean;
  pack_size?: number;
  in_stock?: boolean;
  scraped_at?: string;
  validation_issues: string[];
  is_valid: boolean;
}

interface CheckResult {
  product_id: string;
  sku: string;
  offers_collected: number;
  valid_offers: number;
  stale_offers: number;
  invalid_offers: number;
  review_required: boolean;
}

// ============================================================================
// HANDLER
// ============================================================================

export async function handleCompetitorPriceCheck(
  payload: Record<string, unknown>
): Promise<JobExecutionResult> {
  const input = payload as CompetitorPriceCheckPayload;
  const reviewItems: ReviewQueueCreateInput[] = [];
  const followupJobs: EnqueueJobInput[] = [];

  // Load rules from database
  const requireShipping = await getAgentRule<boolean>('competitive_pricing', 'require_shipping_for_close_comparison', true);
  const staleDataDays = await getAgentRule<number>('competitive_pricing', 'stale_data_days', 7);
  const minOfferConfidence = await getAgentRule<number>('competitive_pricing', 'min_offer_confidence', 0.7);
  const maxPriceVariance = await getAgentRule<number>('competitive_pricing', 'max_price_variance_percent', 0.5);

  const runDate = new Date().toISOString().split('T')[0];

  try {
    logger.info('Starting competitor price check', {
      product_count: input.product_ids?.length ?? 0,
      sku_count: input.sku_list?.length ?? 0,
      priority_tier: input.priority_tier,
    });

    // =========================================================================
    // STEP 1: GET PRODUCTS TO CHECK
    // =========================================================================
    const productsToCheck = await loadProductsToCheck(input);
    
    if (productsToCheck.length === 0) {
      return {
        success: true,
        output: {
          message: 'No products to check',
          products_checked: 0,
        },
      };
    }

    logger.info('Products loaded for price check', { count: productsToCheck.length });

    // =========================================================================
    // STEP 2: COLLECT OFFERS FROM ALL SOURCES
    // =========================================================================
    const results: CheckResult[] = [];
    const now = new Date();
    const staleThreshold = new Date(now.getTime() - staleDataDays * 24 * 60 * 60 * 1000);
    let totalValidOffers = 0;
    let totalOffersCollected = 0;

    for (const product of productsToCheck) {
      const rawOffers = await collectOffersForProduct(product);
      totalOffersCollected += rawOffers.length;

      // =========================================================================
      // STEP 3: VALIDATE AND NORMALIZE OFFERS
      // =========================================================================
      const validatedOffers: ValidatedOffer[] = [];
      let staleCount = 0;
      let invalidCount = 0;

      for (const rawOffer of rawOffers) {
        const validated = validateAndNormalizeOffer(
          rawOffer, 
          product, 
          staleThreshold,
          minOfferConfidence,
          maxPriceVariance,
          requireShipping
        );

        if (validated.is_stale) {
          staleCount++;
          continue;
        }

        if (!validated.is_valid) {
          invalidCount++;
          
          // Create review item for problematic offers
          if (validated.validation_issues.length > 0) {
            const shouldReview = validated.validation_issues.some(i => 
              i.includes('pack') || i.includes('shipping') || i.includes('variance')
            );

            if (shouldReview) {
              reviewItems.push({
                review_type: 'pricing',
                priority: 'low',
                source_table: 'catalogos.products',
                source_id: product.id,
                title: `Competitor offer issue: ${validated.source_name}`,
                issue_category: validated.validation_issues.includes('pack') ? 'pack_mismatch' : 'offer_quality',
                issue_summary: validated.validation_issues.join('; '),
                recommended_action: 'VERIFY - Check if offer is comparable',
                agent_name: 'competitive_pricing',
                details: {
                  offer: validated,
                  product_sku: product.sku,
                  current_price: product.current_price,
                  run_date: runDate,
                },
              });
            }
          }
          continue;
        }

        validatedOffers.push(validated);
      }

      // =========================================================================
      // STEP 4: PERSIST VALID OFFERS
      // =========================================================================
      for (const offer of validatedOffers) {
        const { error } = await supabaseAdmin
          .from('competitor_offers')
          .upsert({
            canonical_product_id: product.id,
            source_name: offer.source_name,
            source_url: offer.source_url,
            visible_price: offer.visible_price,
            shipping_estimate: offer.shipping_estimate,
            effective_price: offer.effective_price,
            confidence: offer.offer_confidence,
            same_pack: offer.same_pack,
            same_brand: offer.same_brand,
            pack_size: offer.pack_size,
            in_stock: offer.in_stock ?? true,
            scraped_at: offer.scraped_at,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'canonical_product_id,source_name' });

        if (error) {
          logger.warn('Failed to persist competitor offer', {
            error: error.message,
            product_id: product.id,
            source: offer.source_name,
          });
        } else {
          totalValidOffers++;
        }
      }

      // Record result
      const needsReview = invalidCount > validatedOffers.length || validatedOffers.length === 0;
      results.push({
        product_id: product.id,
        sku: product.sku,
        offers_collected: rawOffers.length,
        valid_offers: validatedOffers.length,
        stale_offers: staleCount,
        invalid_offers: invalidCount,
        review_required: needsReview,
      });

      // =========================================================================
      // STEP 5: CREATE FOLLOWUP JOBS
      // =========================================================================
      if (validatedOffers.length > 0) {
        followupJobs.push({
          job_type: 'pricing_recommendation',
          payload: {
            product_id: product.id,
            current_price: product.current_price,
            current_cost: product.current_cost,
            map_price: product.map_price,
            competitor_offers: validatedOffers.map(o => ({
              source_name: o.source_name,
              visible_price: o.visible_price,
              shipping_estimate: o.shipping_estimate,
              effective_price: o.effective_price,
              offer_confidence: o.offer_confidence,
              same_pack: o.same_pack,
              same_brand: o.same_brand,
            })),
            trigger_reason: 'competitor_price_check',
          },
          dedupe_key: `pricing_recommendation:${product.id}:${runDate}`,
          priority: input.priority_tier === 'high' ? 30 : 50,
        });
      }
    }

    // =========================================================================
    // STEP 6: PERSIST REVIEW ITEMS
    // =========================================================================
    for (const item of reviewItems) {
      await createReviewItem(item);
    }

    // =========================================================================
    // STEP 7: EMIT COMPLETION EVENT
    // =========================================================================
    await emitSystemEvent({
      event_type: 'competitor_price_check_completed',
      payload: {
        run_date: runDate,
        products_checked: results.length,
        total_offers_collected: totalOffersCollected,
        valid_offers_persisted: totalValidOffers,
        products_needing_review: results.filter(r => r.review_required).length,
        pricing_jobs_created: followupJobs.length,
      },
    });

    // =========================================================================
    // RETURN RESULT
    // =========================================================================
    return {
      success: true,
      output: {
        run_date: runDate,
        products_checked: results.length,
        total_offers_collected: totalOffersCollected,
        valid_offers_persisted: totalValidOffers,
        stale_offers_skipped: results.reduce((sum, r) => sum + r.stale_offers, 0),
        invalid_offers_rejected: results.reduce((sum, r) => sum + r.invalid_offers, 0),
        review_items_created: reviewItems.length,
        pricing_jobs_created: followupJobs.length,
        config_used: {
          stale_data_days: staleDataDays,
          min_offer_confidence: minOfferConfidence,
          require_shipping_for_close: requireShipping,
          max_price_variance: maxPriceVariance,
        },
        sample_results: results.slice(0, 10),
      },
      reviewItems,
      followupJobs,
    };

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Competitor price check failed', { error: message });
    return {
      success: false,
      error: message,
    };
  }
}

// ============================================================================
// DATA LOADING
// ============================================================================

async function loadProductsToCheck(input: CompetitorPriceCheckPayload): Promise<ProductToCheck[]> {
  const products: ProductToCheck[] = [];
  const cat = getSupabaseCatalogos();

  const fetchBestPrices = async (ids: string[]) => {
    if (ids.length === 0) return new Map<string, number>();
    const { data } = await cat.from('product_best_offer_price').select('product_id, best_price').in('product_id', ids);
    return new Map(
      (data ?? []).map((r: { product_id: string; best_price: number }) => [r.product_id, Number(r.best_price)])
    );
  };

  const mapRows = (rows: CompetitorCatalogRow[], bestById: Map<string, number>): ProductToCheck[] =>
    rows.map((p) => {
      const price = bestById.get(p.id) ?? 0;
      return {
        id: p.id,
        sku: p.sku,
        title: p.name,
        current_price: price,
        current_cost: price,
        map_price: undefined,
        upc: p.upc,
        mpn: p.mpn,
      };
    });

  if (input.product_ids && input.product_ids.length > 0) {
    const rows = await loadCompetitorCatalogRowsByProductIds(input.product_ids);
    if (rows.length) {
      const best = await fetchBestPrices(rows.map((p) => p.id));
      products.push(...mapRows(rows, best));
    }
    return products;
  }

  if (input.sku_list && input.sku_list.length > 0) {
    const rows = await loadCompetitorCatalogRowsBySkus(input.sku_list);
    if (rows.length) {
      const best = await fetchBestPrices(rows.map((p) => p.id));
      for (const row of mapRows(rows, best)) {
        if (!products.find((e) => e.id === row.id)) products.push(row);
      }
    }
    return products;
  }

  if (products.length === 0 && !input.product_ids && !input.sku_list) {
    const limit = input.priority_tier === 'high' ? 50 : 200;
    const { data: bestList } = await cat
      .from('product_best_offer_price')
      .select('product_id, best_price')
      .not('best_price', 'is', null)
      .order('best_price', { ascending: false })
      .limit(limit);
    const best = new Map(
      (bestList ?? []).map((r: { product_id: string; best_price: number }) => [r.product_id, Number(r.best_price)])
    );
    const ids = Array.from(best.keys());
    if (ids.length) {
      const rows = await loadCompetitorCatalogRowsByProductIds(ids);
      products.push(...mapRows(rows, best));
    }
  }

  return products;
}

// ============================================================================
// OFFER COLLECTION
// ============================================================================

/**
 * Collect competitor offers from all available sources
 * 
 * Sources (in priority order):
 * 1. Recent scraper results (competitor_scraper_results table if exists)
 * 2. Third-party API providers (would integrate with Prisync, Competera, etc.)
 * 3. Existing competitor_offers (for products without fresh data)
 * 
 * In production, this would integrate with actual price monitoring services.
 * For now, we use existing competitor_offers as the primary source.
 */
async function collectOffersForProduct(product: ProductToCheck): Promise<RawOffer[]> {
  const offers: RawOffer[] = [];

  // Source 1: Check for recent scraper results
  const { data: scraperResults } = await supabaseAdmin
    .from('competitor_scraper_results')
    .select('*')
    .or(`upc.eq.${product.upc},mpn.eq.${product.mpn},sku.eq.${product.sku}`)
    .gte('scraped_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .order('scraped_at', { ascending: false });

  if (scraperResults && scraperResults.length > 0) {
    for (const result of scraperResults) {
      offers.push({
        source: 'scraper',
        source_name: result.source_name || result.competitor_name,
        source_url: result.source_url || result.product_url,
        visible_price: result.price || result.visible_price,
        shipping_estimate: result.shipping_estimate,
        shipping_known: result.shipping_estimate !== null,
        pack_size: result.pack_size,
        pack_description: result.pack_description,
        same_pack: result.same_pack,
        same_brand: result.same_brand ?? true,
        in_stock: result.in_stock ?? true,
        scraped_at: result.scraped_at,
        raw_data: result,
      });
    }
  }

  // Source 2: Fallback to existing competitor_offers
  if (offers.length === 0) {
    const { data: existingOffers } = await supabaseAdmin
      .from('competitor_offers')
      .select('*')
      .eq('canonical_product_id', product.id)
      .gte('scraped_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
      .order('scraped_at', { ascending: false });

    if (existingOffers) {
      for (const offer of existingOffers) {
        offers.push({
          source: 'existing',
          source_name: offer.source_name,
          source_url: offer.source_url,
          visible_price: offer.visible_price || offer.price,
          shipping_estimate: offer.shipping_estimate,
          shipping_known: offer.shipping_estimate !== null,
          pack_size: offer.pack_size,
          same_pack: offer.same_pack,
          same_brand: offer.same_brand,
          in_stock: offer.in_stock,
          scraped_at: offer.scraped_at || offer.updated_at,
          raw_data: offer,
        });
      }
    }
  }

  // Source 3: Generate bounded placeholder offers for testing
  // DISABLED in production - only used in development when no real data exists
  // To enable for testing, set ENABLE_PLACEHOLDER_OFFERS=true
  const enablePlaceholders = process.env.ENABLE_PLACEHOLDER_OFFERS === 'true';
  if (offers.length === 0 && enablePlaceholders && process.env.NODE_ENV !== 'production') {
    offers.push(...generatePlaceholderOffers(product));
    logger.warn('Using placeholder competitor offers for testing', { 
      product_id: product.id,
      warning: 'This should never appear in production',
    });
  }

  return offers;
}

/**
 * Generate bounded placeholder offers for testing
 * 
 * Uses deterministic values based on product ID for consistent testing.
 * Prices are bounded to realistic ranges around the product's current price.
 */
function generatePlaceholderOffers(product: ProductToCheck): RawOffer[] {
  const PLACEHOLDER_SOURCES = [
    { name: 'Amazon', confidence: 0.85 },
    { name: 'Staples', confidence: 0.90 },
    { name: 'Uline', confidence: 0.88 },
    { name: 'Grainger', confidence: 0.92 },
  ];

  // Use product ID hash for deterministic but varied values
  const hash = simpleHash(product.id);
  const priceBase = product.current_price;
  
  // Generate 1-3 competitor offers
  const offerCount = (hash % 3) + 1;
  const offers: RawOffer[] = [];

  for (let i = 0; i < offerCount; i++) {
    const source = PLACEHOLDER_SOURCES[i % PLACEHOLDER_SOURCES.length];
    const variance = ((hash + i * 17) % 30 - 15) / 100; // -15% to +15%
    const competitorPrice = Math.round(priceBase * (1 + variance) * 100) / 100;
    const hasShipping = (hash + i) % 3 !== 0;
    const shippingEstimate = hasShipping ? Math.round((hash % 10) + 5) : undefined;

    offers.push({
      source: 'placeholder',
      source_name: `${source.name} (Placeholder)`,
      visible_price: competitorPrice,
      shipping_estimate: shippingEstimate,
      shipping_known: hasShipping,
      same_pack: true,
      same_brand: true,
      in_stock: (hash + i) % 10 !== 0,
      scraped_at: new Date(Date.now() - ((hash % 5) * 24 * 60 * 60 * 1000)).toISOString(),
    });
  }

  return offers;
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash);
}

// ============================================================================
// OFFER VALIDATION
// ============================================================================

interface ValidationResult extends ValidatedOffer {
  is_stale: boolean;
}

function validateAndNormalizeOffer(
  rawOffer: RawOffer,
  product: ProductToCheck,
  staleThreshold: Date,
  minConfidence: number,
  maxPriceVariance: number,
  requireShippingForClose: boolean
): ValidationResult {
  const issues: string[] = [];
  let confidence = rawOffer.source === 'placeholder' ? 0.6 : 0.85;
  
  // Check staleness
  const scrapedAt = new Date(rawOffer.scraped_at);
  if (scrapedAt < staleThreshold) {
    return {
      ...createBaseOffer(rawOffer, product.id),
      validation_issues: ['Offer is stale'],
      is_valid: false,
      is_stale: true,
    };
  }

  // Pack size validation
  if (rawOffer.same_pack === false) {
    issues.push('Different pack size - not directly comparable');
    confidence *= 0.5;
  } else if (rawOffer.same_pack === undefined && rawOffer.pack_size) {
    // Try to infer pack comparability from description
    issues.push('Pack comparability unknown');
    confidence *= 0.8;
  }

  // Shipping validation
  const effectivePrice = rawOffer.visible_price + (rawOffer.shipping_estimate || 0);
  const priceDiff = Math.abs(effectivePrice - product.current_price) / product.current_price;

  if (!rawOffer.shipping_known) {
    if (priceDiff < 0.10 && requireShippingForClose) {
      issues.push('Unknown shipping on close price comparison');
      confidence *= 0.7;
    }
  }

  // Price variance validation
  if (priceDiff > maxPriceVariance) {
    issues.push(`Extreme price variance (${Math.round(priceDiff * 100)}%)`);
    confidence *= 0.6;
  }

  // Stock status
  if (rawOffer.in_stock === false) {
    issues.push('Item out of stock');
    confidence *= 0.8;
  }

  // Brand matching
  if (rawOffer.same_brand === false) {
    issues.push('Different brand - may not be comparable');
    confidence *= 0.7;
  }

  // Final confidence check
  const isValid = confidence >= minConfidence && issues.length < 3;

  return {
    ...createBaseOffer(rawOffer, product.id),
    offer_confidence: Math.round(confidence * 100) / 100,
    effective_price: effectivePrice,
    validation_issues: issues,
    is_valid: isValid,
    is_stale: false,
  };
}

function createBaseOffer(rawOffer: RawOffer, productId: string): ValidatedOffer {
  return {
    canonical_product_id: productId,
    source_name: rawOffer.source_name,
    source_url: rawOffer.source_url,
    visible_price: rawOffer.visible_price,
    shipping_estimate: rawOffer.shipping_estimate,
    effective_price: rawOffer.visible_price + (rawOffer.shipping_estimate || 0),
    offer_confidence: 0.85,
    same_pack: rawOffer.same_pack ?? true,
    same_brand: rawOffer.same_brand ?? true,
    pack_size: rawOffer.pack_size,
    in_stock: rawOffer.in_stock,
    scraped_at: rawOffer.scraped_at,
    validation_issues: [],
    is_valid: true,
  };
}
