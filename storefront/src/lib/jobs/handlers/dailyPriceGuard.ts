/**
 * Daily Price Guard Job Handler
 * 
 * Generates daily action queue using lib/dailyPriceGuard.js
 * 
 * Triggered by: Daily cron schedule
 * Output: Actions persisted to daily_actions, followup jobs for pricing/competitor checks
 * 
 * Legacy Module Mapping:
 * - runDailyPriceGuard() -> Analyze products and generate action queue
 * - calculatePriority() -> Determine product priority (high/medium/low)
 * - detectCostChange() -> Detect significant cost changes
 * - detectCompetitorPriceChange() -> Detect competitor price shifts
 * - detectStaleness() -> Find products with stale pricing data
 */

import { supabaseAdmin, getSupabaseCatalogos } from '../supabase';
import { resolveOrderItemCatalogProductId } from '@/lib/commerce/resolve-catalog-product-id';
import { logger } from '../logger';
import { getAgentRule } from '../../agents/config';
import { emitSystemEvent } from '../../events/emit';
import { createReviewItem } from '../../review/createReviewItem';
import { 
  runDailyPriceGuard,
  calculatePriority,
  shouldCheckLongTail,
  GUARD_CONFIG,
  type GuardProduct,
  type DailyGuardResult,
  type ActionItem,
} from '../../legacy';
import type { 
  JobExecutionResult, 
  DailyPriceGuardPayload,
  ReviewQueueCreateInput,
  EnqueueJobInput
} from '../../agents/types';

// ============================================================================
// HANDLER
// ============================================================================

export async function handleDailyPriceGuard(
  payload: Record<string, unknown>
): Promise<JobExecutionResult> {
  const input = payload as DailyPriceGuardPayload;
  const reviewItems: ReviewQueueCreateInput[] = [];
  const followupJobs: EnqueueJobInput[] = [];

  // Load rules from database
  const highTrafficThreshold = await getAgentRule<number>('daily_price_guard', 'high_traffic_threshold', GUARD_CONFIG.high_traffic_threshold);
  const highRevenueThreshold = await getAgentRule<number>('daily_price_guard', 'high_revenue_threshold', GUARD_CONFIG.high_revenue_threshold);
  const longTailThreshold = await getAgentRule<number>('daily_price_guard', 'long_tail_traffic_threshold', GUARD_CONFIG.long_tail_traffic_threshold);
  const maxAutoPublishChange = await getAgentRule<number>('daily_price_guard', 'max_auto_publish_change', GUARD_CONFIG.max_auto_publish_change);
  const minAutoPublishConfidence = await getAgentRule<number>('daily_price_guard', 'min_auto_publish_confidence', GUARD_CONFIG.min_auto_publish_confidence);

  const runDate = input.run_date || new Date().toISOString().split('T')[0];
  const includeLongTail = input.include_long_tail ?? shouldCheckLongTail();

  try {
    logger.info('Starting daily price guard', {
      run_date: runDate,
      include_long_tail: includeLongTail,
    });

    // =========================================================================
    // LOAD PRODUCTS WITH METRICS
    // =========================================================================
    const products = await loadProductsWithMetrics(
      longTailThreshold,
      highTrafficThreshold,
      includeLongTail
    );

    if (products.length === 0) {
      return {
        success: true,
        output: { 
          message: 'No products to check', 
          run_date: runDate,
          products_checked: 0,
        },
      };
    }

    // =========================================================================
    // CALL LEGACY DAILY GUARD LOGIC
    // =========================================================================
    const result: DailyGuardResult = runDailyPriceGuard(products, { 
      includeLongTail 
    });

    // =========================================================================
    // PERSIST ACTIONS TO DATABASE
    // =========================================================================
    let actionsPersisted = 0;
    const seenActions = new Set<string>();

    for (const action of result.actions) {
      // Dedupe by product + action type
      const dedupeKey = `${action.product_id}:${action.action_type}`;
      if (seenActions.has(dedupeKey)) {
        continue;
      }
      seenActions.add(dedupeKey);

      // Persist action to daily_actions table
      const { error } = await supabaseAdmin
        .from('daily_actions')
        .upsert({
          product_id: action.product_id,
          sku: action.sku,
          title: action.title,
          action_type: action.action_type,
          recommended_change: action.recommended_change,
          reason: action.reason,
          priority: action.priority,
          details: action.details,
          run_date: runDate,
          status: action.action_type === 'auto_publish' ? 'pending_publish' : 'pending_review',
          created_at: new Date().toISOString(),
        }, { onConflict: 'product_id,run_date,action_type' });

      if (!error) {
        actionsPersisted++;
      }

      // =========================================================================
      // CREATE REVIEW ITEMS FOR NON-AUTO ACTIONS
      // =========================================================================
      if (action.action_type !== 'auto_publish') {
        const reviewInput: ReviewQueueCreateInput = {
          review_type: action.action_type === 'supplier_review' ? 'supplier' : 'pricing',
          priority: action.priority,
          source_table: 'catalogos.products',
          source_id: action.product_id,
          title: `Daily Guard: ${action.sku || action.product_id}`,
          issue_category: mapActionTypeToCategory(action.action_type),
          issue_summary: action.reason,
          recommended_action: action.recommended_change,
          agent_name: 'daily_price_guard',
          details: {
            action_type: action.action_type,
            run_date: runDate,
            ...action.details,
          },
        };

        const created = await createReviewItem(reviewInput);
        if (created) {
          reviewItems.push(reviewInput);
        }
      }

      // =========================================================================
      // CREATE FOLLOWUP JOBS
      // =========================================================================
      if (action.priority === 'high' || action.action_type === 'catalog_review') {
        // Queue competitor price check for high-priority products
        followupJobs.push({
          job_type: 'competitor_price_check',
          payload: {
            product_ids: [action.product_id],
            priority_tier: action.priority,
          },
          dedupe_key: `competitor_price_check:${action.product_id}:${runDate}`,
          priority: action.priority === 'high' ? 30 : 50,
        });
      }

      if (action.action_type === 'pricing_review' || action.action_type === 'auto_publish') {
        // Queue pricing recommendation
        followupJobs.push({
          job_type: 'pricing_recommendation',
          payload: {
            product_id: action.product_id,
            trigger_reason: 'daily_guard',
          },
          dedupe_key: `pricing_recommendation:${action.product_id}:${runDate}`,
          priority: action.priority === 'high' ? 35 : 55,
        });
      }
    }

    // =========================================================================
    // EMIT COMPLETION EVENT
    // =========================================================================
    await emitSystemEvent({
      event_type: 'daily_guard_completed',
      payload: {
        run_date: runDate,
        summary: result.summary,
        action_count: result.actions.length,
        actions_persisted: actionsPersisted,
        review_items_created: reviewItems.length,
        followup_jobs_queued: followupJobs.length,
      },
    });

    // =========================================================================
    // RETURN RESULT
    // =========================================================================
    return {
      success: true,
      output: {
        run_date: runDate,
        run_timestamp: result.run_timestamp,
        summary: {
          ...result.summary,
          actions_persisted: actionsPersisted,
          review_items_created: reviewItems.length,
          followup_jobs_queued: followupJobs.length,
        },
        action_breakdown: {
          auto_publish: result.actions.filter(a => a.action_type === 'auto_publish').length,
          pricing_review: result.actions.filter(a => a.action_type === 'pricing_review').length,
          supplier_review: result.actions.filter(a => a.action_type === 'supplier_review').length,
          catalog_review: result.actions.filter(a => a.action_type === 'catalog_review').length,
        },
        config_used: {
          high_traffic_threshold: highTrafficThreshold,
          high_revenue_threshold: highRevenueThreshold,
          long_tail_threshold: longTailThreshold,
          included_long_tail: includeLongTail,
        },
        // Limit output size for large result sets
        sample_actions: result.actions.slice(0, 20).map(a => ({
          product_id: a.product_id,
          sku: a.sku,
          action_type: a.action_type,
          priority: a.priority,
          reason: a.reason,
        })),
      },
      reviewItems,
      followupJobs,
    };

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Daily price guard failed', { 
      error: message,
      run_date: runDate,
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

/**
 * Load products with REAL metrics from database
 * 
 * Metrics Sources:
 * - daily_views: product_favorites count (proxy for interest) + order_items count
 * - daily_revenue: SUM of order_items.unit_price * quantity for last 30 days
 * - days_since_last_sale: DAYS since most recent order_item for product
 * - current_margin_percent: (price - cost) / price
 * 
 * Fallback Strategy:
 * - If no order data exists, use deterministic hash-based values for stable testing
 * - Products with no sales in 30 days get days_since_last_sale = 31+
 */
async function loadProductsWithMetrics(
  longTailThreshold: number,
  highTrafficThreshold: number,
  includeLongTail: boolean
): Promise<GuardProduct[]> {
  const cat = getSupabaseCatalogos();
  const { data: bestRows, error: bestErr } = await cat
    .from('product_best_offer_price')
    .select('product_id, best_price')
    .not('best_price', 'is', null)
    .limit(1000);

  if (bestErr || !bestRows?.length) {
    logger.warn('Failed to load catalog offer prices', { error: bestErr?.message });
    return [];
  }

  const ids = bestRows.map((r) => r.product_id as string).filter(Boolean);
  const { data: metaRows, error: metaErr } = await cat
    .from('products')
    .select('id, sku, name')
    .in('id', ids)
    .eq('is_active', true);

  if (metaErr) {
    logger.warn('Failed to load catalog products', { error: metaErr.message });
  }

  const metaBy = new Map(
    (metaRows ?? []).map((m: { id: string; sku?: string; name?: string }) => [m.id, m])
  );

  const products = bestRows.map((r) => {
    const id = r.product_id as string;
    const m = metaBy.get(id);
    const price = Number(r.best_price);
    return {
      id,
      sku: m?.sku,
      name: m?.name,
      title: m?.name,
      price,
      cost: price,
      map_price: undefined,
      shipping_cost: undefined,
    };
  });

  const productIds = products.map((p) => p.id);
  const uuidSet = new Set(productIds);
  const now = Date.now();
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

  const liveToCatalogUuid = new Map<number, string>();
  try {
    const catalogos = getSupabaseCatalogos();
    const { data: links } = await catalogos
      .from('products')
      .select('id, live_product_id')
      .not('live_product_id', 'is', null)
      .limit(20000);
    for (const row of links ?? []) {
      if (row.live_product_id != null && row.id != null) {
        liveToCatalogUuid.set(Number(row.live_product_id), String(row.id));
      }
    }
  } catch (e) {
    logger.warn('Could not load catalogos.products live_product_id map; order metrics may miss legacy rows', {
      error: e instanceof Error ? e.message : String(e),
    });
  }

  // ==========================================================================
  // LOAD REAL METRICS FROM DATABASE
  // ==========================================================================

  // 1. Order metrics (revenue, last sale date) — align legacy BIGINT product_id to catalog UUIDs
  const { data: orderMetrics } = await supabaseAdmin
    .from('order_items')
    .select(`
      product_id,
      canonical_product_id,
      quantity,
      unit_price,
      created_at,
      order:orders!inner(status)
    `)
    .gte('created_at', thirtyDaysAgo);

  // Group order metrics by product
  const revenueByProduct = new Map<string, number>();
  const lastSaleByProduct = new Map<string, Date>();
  const salesCountByProduct = new Map<string, number>();

  if (orderMetrics) {
    for (const item of orderMetrics) {
      // Only count completed/processing orders, not cancelled
      const orderData = item.order as { status: string } | { status: string }[] | null;
      const orderStatus = Array.isArray(orderData) ? orderData[0]?.status : orderData?.status;
      if (orderStatus === 'cancelled') continue;

      const catalogId = resolveOrderItemCatalogProductId(
        {
          canonical_product_id: (item as { canonical_product_id?: string | null }).canonical_product_id,
          product_id: (item as { product_id?: number | string }).product_id,
        },
        liveToCatalogUuid
      );
      if (!catalogId || !uuidSet.has(catalogId)) continue;

      const revenue = (item.unit_price || 0) * (item.quantity || 1);

      revenueByProduct.set(catalogId, (revenueByProduct.get(catalogId) || 0) + revenue);
      salesCountByProduct.set(catalogId, (salesCountByProduct.get(catalogId) || 0) + item.quantity);

      const saleDate = new Date(item.created_at);
      const existingLast = lastSaleByProduct.get(catalogId);
      if (!existingLast || saleDate > existingLast) {
        lastSaleByProduct.set(catalogId, saleDate);
      }
    }
  }

  // 2. Product favorites (proxy for views/interest)
  const { data: favorites } = await supabaseAdmin
    .from('product_favorites')
    .select('product_id')
    .in('product_id', productIds);

  const favoriteCountByProduct = new Map<string, number>();
  if (favorites) {
    for (const fav of favorites) {
      const productId = String(fav.product_id);
      favoriteCountByProduct.set(productId, (favoriteCountByProduct.get(productId) || 0) + 1);
    }
  }

  // 3. Competitor offers (for pricing analysis)
  const { data: recentOffers } = await supabaseAdmin
    .from('competitor_offers')
    .select('canonical_product_id, visible_price, shipping_estimate, confidence, same_pack, same_brand, scraped_at')
    .in('canonical_product_id', productIds)
    .gte('scraped_at', sevenDaysAgo);

  const offersByProduct = new Map<string, typeof recentOffers>();
  if (recentOffers) {
    for (const offer of recentOffers) {
      const productId = offer.canonical_product_id;
      if (!offersByProduct.has(productId)) {
        offersByProduct.set(productId, []);
      }
      offersByProduct.get(productId)!.push(offer);
    }
  }

  // 4. Previous pricing recommendations (for change detection)
  const { data: previousRecommendations } = await supabaseAdmin
    .from('pricing_recommendations')
    .select('canonical_product_id, lowest_competitor_price, created_at')
    .in('canonical_product_id', productIds)
    .order('created_at', { ascending: false });

  const prevByProduct = new Map<string, number>();
  if (previousRecommendations) {
    for (const rec of previousRecommendations) {
      if (!prevByProduct.has(rec.canonical_product_id) && rec.lowest_competitor_price) {
        prevByProduct.set(rec.canonical_product_id, rec.lowest_competitor_price);
      }
    }
  }

  // ==========================================================================
  // BUILD GUARD PRODUCTS WITH REAL METRICS
  // ==========================================================================
  const guardProducts: GuardProduct[] = [];

  for (const product of products) {
    const productId = String(product.id);

    // Get competitor offers for this product
    const offers = offersByProduct.get(productId) || [];
    const trustedOffers = offers.filter(o => 
      o.confidence >= 0.7 && o.same_pack && o.same_brand
    );

    const currentLowest = trustedOffers.length > 0
      ? Math.min(...trustedOffers.map(o => (o.visible_price || 0) + (o.shipping_estimate || 0)))
      : undefined;

    const previousLowest = prevByProduct.get(productId);

    // ==========================================================================
    // COMPUTE METRICS FROM REAL DATA (with deterministic fallback)
    // ==========================================================================
    const actualRevenue = revenueByProduct.get(productId) || 0;
    const actualSalesCount = salesCountByProduct.get(productId) || 0;
    const actualFavorites = favoriteCountByProduct.get(productId) || 0;
    const lastSaleDate = lastSaleByProduct.get(productId);

    // daily_views: Use favorites + sales count as proxy; fallback to hash-based value
    // Hash-based fallback provides stable, repeatable values for testing
    let dailyViews = actualFavorites * 10 + actualSalesCount * 5;
    if (dailyViews === 0) {
      // Deterministic fallback: use product ID hash for stable values
      dailyViews = hashToRange(productId, 5, 100);
    }

    // daily_revenue: Use actual revenue over 30 days, divided by 30
    // Fallback: derive from price * estimated daily sales
    let dailyRevenue = actualRevenue / 30;
    if (dailyRevenue === 0) {
      // Fallback: estimate based on price tier and position
      dailyRevenue = hashToRange(productId, 10, product.price * 2);
    }

    // days_since_last_sale: Calculate from actual last sale date
    let daysSinceLastSale: number;
    if (lastSaleDate) {
      daysSinceLastSale = Math.floor((now - lastSaleDate.getTime()) / (24 * 60 * 60 * 1000));
    } else {
      // No sales in 30 days - use deterministic value between 31-60
      daysSinceLastSale = hashToRange(productId, 31, 60);
    }

    // current_margin_percent: Pure calculation from price/cost
    const currentMarginPercent = product.price > 0 
      ? (product.price - product.cost) / product.price 
      : 0;

    const metrics = {
      daily_views: Math.round(dailyViews),
      daily_revenue: Math.round(dailyRevenue * 100) / 100,
      current_margin_percent: currentMarginPercent,
      days_since_last_sale: daysSinceLastSale,
      // Additional context for debugging
      _source: {
        actual_30d_revenue: actualRevenue,
        actual_sales_count: actualSalesCount,
        actual_favorites: actualFavorites,
        has_recent_sales: lastSaleDate !== undefined,
      },
    };

    // Skip long-tail if not included
    const priority = calculatePriority(product as any, metrics);
    if (!includeLongTail && priority.priority === 'low' && metrics.daily_views < longTailThreshold) {
      continue;
    }

    guardProducts.push({
      id: product.id,
      sku: product.sku,
      name: product.name || product.title,
      current_price: product.price,
      price: product.price,
      current_cost: product.cost,
      cost: product.cost,
      map_price: product.map_price,
      shipping_cost: product.shipping_cost,
      previous_lowest_competitor: previousLowest,
      current_lowest_competitor: currentLowest,
      last_pricing_update: offers[0]?.scraped_at,
      competitor_offers: trustedOffers.map(o => ({
        source_name: 'Competitor',
        visible_price: o.visible_price || 0,
        shipping_estimate: o.shipping_estimate,
        offer_confidence: o.confidence || 0.7,
        same_brand: o.same_brand,
        same_pack: o.same_pack,
      })),
      metrics,
    });
  }

  logger.info('Loaded products with metrics', {
    total_products: guardProducts.length,
    with_real_sales: Array.from(lastSaleByProduct.keys()).length,
    with_favorites: Array.from(favoriteCountByProduct.keys()).length,
    with_competitor_offers: Array.from(offersByProduct.keys()).length,
  });

  return guardProducts;
}

/**
 * Deterministic hash function for stable fallback values
 * Returns a value in range [min, max] based on string input
 */
function hashToRange(input: string, min: number, max: number): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  // Normalize to 0-1 range then scale to min-max
  const normalized = (Math.abs(hash) % 10000) / 10000;
  return Math.floor(min + normalized * (max - min));
}

function mapActionTypeToCategory(actionType: string): string {
  const mapping: Record<string, string> = {
    'pricing_review': 'pricing_review_required',
    'supplier_review': 'supplier_cost_change',
    'catalog_review': 'stale_pricing_data',
    'auto_publish': 'auto_publish_candidate',
  };
  return mapping[actionType] || 'daily_guard_action';
}
