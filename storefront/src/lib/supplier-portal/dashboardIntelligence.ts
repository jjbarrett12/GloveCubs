/**
 * Supplier Portal Dashboard Intelligence
 * 
 * Extended analytics, lost opportunities, action items, and upload history
 * for the enhanced supplier intelligence dashboard.
 */

import { supabaseAdmin, getSupabaseCatalogos } from '../jobs/supabase';

// ============================================================================
// TYPES
// ============================================================================

export interface UploadHistoryItem {
  id: string;
  filename: string;
  file_type: string;
  status: string;
  total_rows: number;
  processed_rows: number;
  error_rows: number;
  created_at: string;
  completed_at?: string;
  summary: {
    created: number;
    updated: number;
    skipped: number;
    warnings: number;
    errors: number;
  };
}

export interface FeedUploadMetrics {
  last_upload_at?: string;
  last_upload_filename?: string;
  last_upload_summary?: {
    created: number;
    updated: number;
    skipped: number;
  };
  total_uploads_30d: number;
  total_rows_processed_30d: number;
  avg_error_rate: number;
}

export interface ExtractionConfidenceDistribution {
  high_confidence: number; // >= 0.9
  medium_confidence: number; // 0.7-0.9
  low_confidence: number; // < 0.7
  total_extractions: number;
  fields_by_confidence: Record<string, number>;
}

export interface ValidationWarningCounts {
  price_anomaly: number;
  pack_mismatch: number;
  duplicate: number;
  low_confidence: number;
  total: number;
}

export interface CorrectionMetrics {
  total_corrections_30d: number;
  rows_with_multiple_corrections: number;
  most_corrected_fields: Array<{ field: string; count: number }>;
  correction_rate_trend: Array<{ week: string; rate: number }>;
}

export interface LostOpportunity {
  type: 'low_trust' | 'stale_offer' | 'anomaly_penalty' | 'missing_fields' | 'price_uncompetitive';
  product_id: string;
  product_name?: string;
  offer_id: string;
  current_rank: number;
  potential_rank: number;
  impact_score: number;
  reason: string;
  details: Record<string, unknown>;
  recommended_action: string;
}

export interface NearWinOpportunity {
  product_id: string;
  product_name?: string;
  offer_id: string;
  current_rank: number;
  rank_1_supplier_id: string;
  gap_to_rank_1: {
    price_gap: number;
    trust_gap: number;
    freshness_gap_days: number;
  };
  blocking_factors: string[];
  improvement_suggestions: string[];
}

export interface ActionItem {
  id: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  category: 'stale' | 'correction' | 'data_quality' | 'pricing' | 'trust';
  title: string;
  description: string;
  affected_offers: number;
  potential_impact: string;
  action_url?: string;
  action_label?: string;
}

export interface CompetitivenessMetrics {
  avg_rank: number;
  rank_1_count: number;
  rank_2_3_count: number;
  low_rank_count: number;
  low_trust_count: number;
  trust_adjusted_position: number;
  products_close_to_winning: number;
}

// ============================================================================
// UPLOAD HISTORY
// ============================================================================

export async function getUploadHistory(
  supplier_id: string,
  limit: number = 20
): Promise<UploadHistoryItem[]> {
  const { data: uploads } = await supabaseAdmin
    .from('supplier_feed_uploads')
    .select('*')
    .eq('supplier_id', supplier_id)
    .order('created_at', { ascending: false })
    .limit(limit);
    
  if (!uploads) return [];
  
  const items: UploadHistoryItem[] = [];
  
  for (const upload of uploads) {
    // Get row summary
    const { data: rows } = await supabaseAdmin
      .from('supplier_feed_upload_rows')
      .select('status')
      .eq('upload_id', upload.id);
      
    const statusCounts = {
      valid: 0,
      warning: 0,
      error: 0,
    };
    
    if (rows) {
      for (const row of rows) {
        if (row.status in statusCounts) {
          statusCounts[row.status as keyof typeof statusCounts]++;
        }
      }
    }
    
    items.push({
      id: upload.id,
      filename: upload.filename,
      file_type: upload.file_type,
      status: upload.status,
      total_rows: upload.total_rows,
      processed_rows: upload.processed_rows,
      error_rows: upload.error_rows,
      created_at: upload.created_at,
      completed_at: upload.completed_at,
      summary: {
        created: statusCounts.valid,
        updated: 0,
        skipped: statusCounts.error,
        warnings: statusCounts.warning,
        errors: statusCounts.error,
      },
    });
  }
  
  return items;
}

export async function getFeedUploadMetrics(supplier_id: string): Promise<FeedUploadMetrics> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  
  // Get last upload
  const { data: lastUpload } = await supabaseAdmin
    .from('supplier_feed_uploads')
    .select('*')
    .eq('supplier_id', supplier_id)
    .eq('status', 'committed')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
    
  // Get 30-day stats
  const { data: uploads } = await supabaseAdmin
    .from('supplier_feed_uploads')
    .select('total_rows, error_rows')
    .eq('supplier_id', supplier_id)
    .gte('created_at', thirtyDaysAgo);
    
  const totalUploads = uploads?.length || 0;
  const totalRows = uploads?.reduce((sum, u) => sum + u.total_rows, 0) || 0;
  const totalErrors = uploads?.reduce((sum, u) => sum + u.error_rows, 0) || 0;
  const avgErrorRate = totalRows > 0 ? totalErrors / totalRows : 0;
  
  return {
    last_upload_at: lastUpload?.created_at,
    last_upload_filename: lastUpload?.filename,
    last_upload_summary: lastUpload ? {
      created: lastUpload.processed_rows - lastUpload.error_rows,
      updated: 0,
      skipped: lastUpload.error_rows,
    } : undefined,
    total_uploads_30d: totalUploads,
    total_rows_processed_30d: totalRows,
    avg_error_rate: avgErrorRate,
  };
}

// ============================================================================
// EXTRACTION CONFIDENCE
// ============================================================================

export async function getExtractionConfidenceDistribution(
  supplier_id: string
): Promise<ExtractionConfidenceDistribution> {
  // Get recent upload rows
  const { data: uploads } = await supabaseAdmin
    .from('supplier_feed_uploads')
    .select('id')
    .eq('supplier_id', supplier_id)
    .order('created_at', { ascending: false })
    .limit(5);
    
  if (!uploads || uploads.length === 0) {
    return {
      high_confidence: 0,
      medium_confidence: 0,
      low_confidence: 0,
      total_extractions: 0,
      fields_by_confidence: {},
    };
  }
  
  const uploadIds = uploads.map(u => u.id);
  
  const { data: rows } = await supabaseAdmin
    .from('supplier_feed_upload_rows')
    .select('extracted')
    .in('upload_id', uploadIds);
    
  if (!rows || rows.length === 0) {
    return {
      high_confidence: 0,
      medium_confidence: 0,
      low_confidence: 0,
      total_extractions: 0,
      fields_by_confidence: {},
    };
  }
  
  let high = 0;
  let medium = 0;
  let low = 0;
  const fieldConfidences: Record<string, number[]> = {};
  
  for (const row of rows) {
    const extracted = row.extracted as { confidence?: Record<string, number> };
    if (!extracted?.confidence) continue;
    
    for (const [field, confidence] of Object.entries(extracted.confidence)) {
      if (!fieldConfidences[field]) fieldConfidences[field] = [];
      fieldConfidences[field].push(confidence);
      
      if (confidence >= 0.9) high++;
      else if (confidence >= 0.7) medium++;
      else low++;
    }
  }
  
  const fieldAvgConfidence: Record<string, number> = {};
  for (const [field, values] of Object.entries(fieldConfidences)) {
    fieldAvgConfidence[field] = values.reduce((a, b) => a + b, 0) / values.length;
  }
  
  return {
    high_confidence: high,
    medium_confidence: medium,
    low_confidence: low,
    total_extractions: high + medium + low,
    fields_by_confidence: fieldAvgConfidence,
  };
}

// ============================================================================
// VALIDATION WARNING COUNTS
// ============================================================================

export async function getValidationWarningCounts(
  supplier_id: string
): Promise<ValidationWarningCounts> {
  // Get recent upload rows
  const { data: uploads } = await supabaseAdmin
    .from('supplier_feed_uploads')
    .select('id')
    .eq('supplier_id', supplier_id)
    .order('created_at', { ascending: false })
    .limit(10);
    
  if (!uploads || uploads.length === 0) {
    return { price_anomaly: 0, pack_mismatch: 0, duplicate: 0, low_confidence: 0, total: 0 };
  }
  
  const uploadIds = uploads.map(u => u.id);
  
  const { data: rows } = await supabaseAdmin
    .from('supplier_feed_upload_rows')
    .select('validation')
    .in('upload_id', uploadIds)
    .eq('status', 'warning');
    
  const counts = {
    price_anomaly: 0,
    pack_mismatch: 0,
    duplicate: 0,
    low_confidence: 0,
    total: 0,
  };
  
  if (rows) {
    for (const row of rows) {
      const validation = row.validation as { warnings?: Array<{ type: string }> };
      if (validation?.warnings) {
        for (const warning of validation.warnings) {
          if (warning.type in counts) {
            counts[warning.type as keyof typeof counts]++;
          }
          counts.total++;
        }
      }
    }
  }
  
  return counts;
}

// ============================================================================
// CORRECTION METRICS
// ============================================================================

export async function getCorrectionMetrics(
  supplier_id: string
): Promise<CorrectionMetrics> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  
  // Get corrections from audit log
  const { data: auditLogs } = await supabaseAdmin
    .from('supplier_audit_log')
    .select('entity_id, action, details, created_at')
    .eq('supplier_id', supplier_id)
    .eq('action', 'update_offer')
    .gte('created_at', thirtyDaysAgo);
    
  const totalCorrections = auditLogs?.length || 0;
  
  // Count by entity to find rows with multiple corrections
  const correctionsByEntity: Record<string, number> = {};
  const fieldCorrectionCounts: Record<string, number> = {};
  
  if (auditLogs) {
    for (const log of auditLogs) {
      correctionsByEntity[log.entity_id] = (correctionsByEntity[log.entity_id] || 0) + 1;
      
      const details = log.details as { changed_fields?: string[] };
      if (details?.changed_fields) {
        for (const field of details.changed_fields) {
          fieldCorrectionCounts[field] = (fieldCorrectionCounts[field] || 0) + 1;
        }
      }
    }
  }
  
  const rowsWithMultiple = Object.values(correctionsByEntity).filter(c => c > 1).length;
  
  const mostCorrectedFields = Object.entries(fieldCorrectionCounts)
    .map(([field, count]) => ({ field, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
    
  return {
    total_corrections_30d: totalCorrections,
    rows_with_multiple_corrections: rowsWithMultiple,
    most_corrected_fields: mostCorrectedFields,
    correction_rate_trend: [],
  };
}

// ============================================================================
// LOST OPPORTUNITIES
// ============================================================================

export async function getLostOpportunities(
  supplier_id: string,
  limit: number = 20
): Promise<LostOpportunity[]> {
  const opportunities: LostOpportunity[] = [];
  
  // Get offers with low trust that could rank higher
  const { data: lowTrustOffers } = await supabaseAdmin
    .from('offer_trust_scores')
    .select('offer_id, product_id, trust_score, trust_band')
    .eq('supplier_id', supplier_id)
    .in('trust_band', ['low_trust', 'review_sensitive'])
    .gte('calculated_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
    
  if (lowTrustOffers) {
    for (const offer of lowTrustOffers.slice(0, 5)) {
      // Get current rank
      const { data: rec } = await supabaseAdmin
        .from('supplier_recommendations')
        .select('recommended_rank')
        .eq('supplier_id', supplier_id)
        .eq('product_id', offer.product_id)
        .order('calculated_at', { ascending: false })
        .limit(1)
        .single();
        
      // Get product name
      const { data: product } = await getSupabaseCatalogos()
        .from('products')
        .select('name')
        .eq('id', offer.product_id)
        .single();
        
      opportunities.push({
        type: 'low_trust',
        product_id: offer.product_id,
        product_name: product?.name,
        offer_id: offer.offer_id,
        current_rank: rec?.recommended_rank || 99,
        potential_rank: Math.max(1, (rec?.recommended_rank || 3) - 2),
        impact_score: (1 - Number(offer.trust_score)) * 100,
        reason: `Trust score is ${(Number(offer.trust_score) * 100).toFixed(0)}% (${offer.trust_band})`,
        details: { trust_score: offer.trust_score, trust_band: offer.trust_band },
        recommended_action: 'Update pricing regularly and ensure data accuracy',
      });
    }
  }
  
  // Get stale offers
  const { data: staleOffers } = await supabaseAdmin
    .from('supplier_offers')
    .select('id, product_id, price, updated_at')
    .eq('supplier_id', supplier_id)
    .eq('is_active', true)
    .lt('updated_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .limit(10);
    
  if (staleOffers) {
    for (const offer of staleOffers.slice(0, 5)) {
      const daysSinceUpdate = Math.floor((Date.now() - new Date(offer.updated_at).getTime()) / (24 * 60 * 60 * 1000));
      
      const { data: product } = await getSupabaseCatalogos()
        .from('products')
        .select('name')
        .eq('id', offer.product_id)
        .single();
        
      const { data: rec } = await supabaseAdmin
        .from('supplier_recommendations')
        .select('recommended_rank')
        .eq('supplier_id', supplier_id)
        .eq('product_id', offer.product_id)
        .order('calculated_at', { ascending: false })
        .limit(1)
        .single();
        
      opportunities.push({
        type: 'stale_offer',
        product_id: offer.product_id,
        product_name: product?.name,
        offer_id: offer.id,
        current_rank: rec?.recommended_rank || 99,
        potential_rank: Math.max(1, (rec?.recommended_rank || 4) - 2),
        impact_score: Math.min(100, daysSinceUpdate * 2),
        reason: `Offer not updated in ${daysSinceUpdate} days`,
        details: { days_since_update: daysSinceUpdate, last_updated: offer.updated_at },
        recommended_action: 'Refresh offer with current pricing',
      });
    }
  }
  
  // Get offers with missing fields
  const { data: incompleteOffers } = await supabaseAdmin
    .from('supplier_offers')
    .select('id, product_id, price, case_pack, box_quantity, lead_time_days, moq')
    .eq('supplier_id', supplier_id)
    .eq('is_active', true)
    .or('case_pack.is.null,box_quantity.is.null,lead_time_days.is.null')
    .limit(10);
    
  if (incompleteOffers) {
    for (const offer of incompleteOffers.slice(0, 5)) {
      const missingFields: string[] = [];
      if (!offer.case_pack) missingFields.push('case_pack');
      if (!offer.box_quantity) missingFields.push('box_quantity');
      if (!offer.lead_time_days) missingFields.push('lead_time');
      if (!offer.moq) missingFields.push('moq');
      
      const { data: product } = await getSupabaseCatalogos()
        .from('products')
        .select('name')
        .eq('id', offer.product_id)
        .single();
        
      opportunities.push({
        type: 'missing_fields',
        product_id: offer.product_id,
        product_name: product?.name,
        offer_id: offer.id,
        current_rank: 99,
        potential_rank: 3,
        impact_score: missingFields.length * 20,
        reason: `Missing: ${missingFields.join(', ')}`,
        details: { missing_fields: missingFields },
        recommended_action: 'Add missing product data to improve trust score',
      });
    }
  }
  
  return opportunities
    .sort((a, b) => b.impact_score - a.impact_score)
    .slice(0, limit);
}

// ============================================================================
// NEAR WIN OPPORTUNITIES
// ============================================================================

export async function getNearWinOpportunities(
  supplier_id: string,
  limit: number = 10
): Promise<NearWinOpportunity[]> {
  // Get products where supplier is rank 2-3
  const { data: closeRankings } = await supabaseAdmin
    .from('supplier_recommendations')
    .select('product_id, recommended_rank, recommendation_score')
    .eq('supplier_id', supplier_id)
    .gte('recommended_rank', 2)
    .lte('recommended_rank', 3)
    .gte('calculated_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
    
  if (!closeRankings || closeRankings.length === 0) return [];
  
  const opportunities: NearWinOpportunity[] = [];
  const processedProducts = new Set<string>();
  
  for (const ranking of closeRankings) {
    if (processedProducts.has(ranking.product_id)) continue;
    processedProducts.add(ranking.product_id);
    
    // Get rank 1 supplier
    const { data: rank1 } = await supabaseAdmin
      .from('supplier_recommendations')
      .select('supplier_id, recommendation_score')
      .eq('product_id', ranking.product_id)
      .eq('recommended_rank', 1)
      .order('calculated_at', { ascending: false })
      .limit(1)
      .single();
      
    if (!rank1) continue;
    
    // Get supplier's offer
    const { data: ourOffer } = await supabaseAdmin
      .from('supplier_offers')
      .select('id, price, updated_at')
      .eq('supplier_id', supplier_id)
      .eq('product_id', ranking.product_id)
      .eq('is_active', true)
      .single();
      
    // Get rank 1 offer
    const { data: rank1Offer } = await supabaseAdmin
      .from('supplier_offers')
      .select('price, updated_at')
      .eq('supplier_id', rank1.supplier_id)
      .eq('product_id', ranking.product_id)
      .eq('is_active', true)
      .single();
      
    // Get trust scores
    const { data: ourTrust } = await supabaseAdmin
      .from('offer_trust_scores')
      .select('trust_score')
      .eq('supplier_id', supplier_id)
      .eq('product_id', ranking.product_id)
      .order('calculated_at', { ascending: false })
      .limit(1)
      .single();
      
    const { data: rank1Trust } = await supabaseAdmin
      .from('offer_trust_scores')
      .select('trust_score')
      .eq('supplier_id', rank1.supplier_id)
      .eq('product_id', ranking.product_id)
      .order('calculated_at', { ascending: false })
      .limit(1)
      .single();
      
    const { data: product } = await getSupabaseCatalogos()
      .from('products')
      .select('name')
      .eq('id', ranking.product_id)
      .single();
      
    const priceGap = ourOffer && rank1Offer 
      ? Number(ourOffer.price) - Number(rank1Offer.price) 
      : 0;
    const trustGap = (ourTrust ? Number(ourTrust.trust_score) : 0) - (rank1Trust ? Number(rank1Trust.trust_score) : 0);
    const freshnessGap = ourOffer && rank1Offer
      ? Math.floor((new Date(rank1Offer.updated_at).getTime() - new Date(ourOffer.updated_at).getTime()) / (24 * 60 * 60 * 1000))
      : 0;
      
    const blockingFactors: string[] = [];
    const suggestions: string[] = [];
    
    if (priceGap > 0) {
      blockingFactors.push('Price higher than #1');
      suggestions.push(`Reduce price by $${priceGap.toFixed(2)} to match leader`);
    }
    if (trustGap < -0.1) {
      blockingFactors.push('Lower trust score');
      suggestions.push('Improve data quality and freshness for higher trust');
    }
    if (freshnessGap > 7) {
      blockingFactors.push('Offer is less fresh');
      suggestions.push('Update offer more frequently');
    }
    
    opportunities.push({
      product_id: ranking.product_id,
      product_name: product?.name,
      offer_id: ourOffer?.id || '',
      current_rank: ranking.recommended_rank,
      rank_1_supplier_id: rank1.supplier_id,
      gap_to_rank_1: {
        price_gap: priceGap,
        trust_gap: trustGap,
        freshness_gap_days: freshnessGap,
      },
      blocking_factors: blockingFactors,
      improvement_suggestions: suggestions,
    });
  }
  
  return opportunities.slice(0, limit);
}

// ============================================================================
// ACTION ITEMS
// ============================================================================

export async function getActionItems(supplier_id: string): Promise<ActionItem[]> {
  const actions: ActionItem[] = [];
  
  // 1. Stale offers
  const { data: staleOffers } = await supabaseAdmin
    .from('supplier_offers')
    .select('id')
    .eq('supplier_id', supplier_id)
    .eq('is_active', true)
    .lt('updated_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
    
  const staleCount = staleOffers?.length || 0;
  if (staleCount > 0) {
    actions.push({
      id: 'stale-offers',
      priority: staleCount > 10 ? 'critical' : staleCount > 5 ? 'high' : 'medium',
      category: 'stale',
      title: 'Refresh Stale Offers',
      description: `${staleCount} offers haven't been updated in 30+ days`,
      affected_offers: staleCount,
      potential_impact: 'Improving freshness can boost trust score by 10-20%',
      action_url: '/supplier-portal/offers?filter=stale',
      action_label: 'View Stale Offers',
    });
  }
  
  // 2. Missing data
  const { data: missingDataOffers } = await supabaseAdmin
    .from('supplier_offers')
    .select('id')
    .eq('supplier_id', supplier_id)
    .eq('is_active', true)
    .or('case_pack.is.null,lead_time_days.is.null');
    
  const missingDataCount = missingDataOffers?.length || 0;
  if (missingDataCount > 0) {
    actions.push({
      id: 'missing-data',
      priority: missingDataCount > 20 ? 'high' : 'medium',
      category: 'data_quality',
      title: 'Complete Product Data',
      description: `${missingDataCount} offers missing case pack or lead time`,
      affected_offers: missingDataCount,
      potential_impact: 'Complete data improves recommendation ranking',
      action_url: '/supplier-portal/offers',
      action_label: 'Update Offers',
    });
  }
  
  // 3. Low trust offers
  const { data: lowTrustOffers } = await supabaseAdmin
    .from('offer_trust_scores')
    .select('offer_id')
    .eq('supplier_id', supplier_id)
    .eq('trust_band', 'low_trust')
    .gte('calculated_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
    
  const lowTrustCount = lowTrustOffers?.length || 0;
  if (lowTrustCount > 0) {
    actions.push({
      id: 'low-trust',
      priority: lowTrustCount > 5 ? 'high' : 'medium',
      category: 'trust',
      title: 'Address Low Trust Offers',
      description: `${lowTrustCount} offers have low trust scores`,
      affected_offers: lowTrustCount,
      potential_impact: 'Higher trust = higher recommendation ranking',
      action_url: '/supplier-portal/competitiveness',
      action_label: 'View Details',
    });
  }
  
  // 4. Price anomalies
  const { data: anomalies } = await supabaseAdmin
    .from('ai_pricing_analysis')
    .select('id')
    .eq('supplier_id', supplier_id)
    .eq('is_suspicious', true)
    .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
    
  const anomalyCount = anomalies?.length || 0;
  if (anomalyCount > 0) {
    actions.push({
      id: 'price-anomalies',
      priority: anomalyCount > 3 ? 'high' : 'medium',
      category: 'pricing',
      title: 'Review Price Anomalies',
      description: `${anomalyCount} pricing anomalies detected this week`,
      affected_offers: anomalyCount,
      potential_impact: 'Fixing anomalies improves trust score',
      action_url: '/supplier-portal/feed-health',
      action_label: 'Review Anomalies',
    });
  }
  
  // 5. Upload suggestion
  const { data: lastUpload } = await supabaseAdmin
    .from('supplier_feed_uploads')
    .select('created_at')
    .eq('supplier_id', supplier_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
    
  const daysSinceUpload = lastUpload 
    ? Math.floor((Date.now() - new Date(lastUpload.created_at).getTime()) / (24 * 60 * 60 * 1000))
    : 999;
    
  if (daysSinceUpload > 14) {
    actions.push({
      id: 'upload-reminder',
      priority: 'low',
      category: 'data_quality',
      title: 'Upload Fresh Data',
      description: `No feed upload in ${daysSinceUpload} days`,
      affected_offers: 0,
      potential_impact: 'Regular uploads keep pricing competitive',
      action_url: '/supplier-portal/upload',
      action_label: 'Upload Now',
    });
  }
  
  return actions.sort((a, b) => {
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
}

// ============================================================================
// COMPETITIVENESS METRICS
// ============================================================================

export async function getCompetitivenessMetrics(
  supplier_id: string
): Promise<CompetitivenessMetrics> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  
  // Get recommendations
  const { data: recommendations } = await supabaseAdmin
    .from('supplier_recommendations')
    .select('recommended_rank, product_id')
    .eq('supplier_id', supplier_id)
    .gte('calculated_at', thirtyDaysAgo);
    
  // Deduplicate by product (take most recent)
  const byProduct = new Map<string, number>();
  if (recommendations) {
    for (const r of recommendations) {
      byProduct.set(r.product_id, r.recommended_rank);
    }
  }
  
  const ranks = Array.from(byProduct.values());
  const avgRank = ranks.length > 0 ? ranks.reduce((a, b) => a + b, 0) / ranks.length : 0;
  const rank1Count = ranks.filter(r => r === 1).length;
  const rank2_3Count = ranks.filter(r => r >= 2 && r <= 3).length;
  const lowRankCount = ranks.filter(r => r > 3).length;
  
  // Get low trust count
  const { data: trustScores } = await supabaseAdmin
    .from('offer_trust_scores')
    .select('trust_band')
    .eq('supplier_id', supplier_id)
    .gte('calculated_at', thirtyDaysAgo);
    
  const lowTrustCount = trustScores?.filter(t => t.trust_band === 'low_trust').length || 0;
  
  // Calculate trust-adjusted position (weighted avg considering trust)
  const { data: trustedRecs } = await supabaseAdmin
    .from('supplier_recommendations')
    .select('recommended_rank, recommendation_score')
    .eq('supplier_id', supplier_id)
    .gte('calculated_at', thirtyDaysAgo);
    
  let trustAdjustedPosition = avgRank;
  if (trustedRecs && trustedRecs.length > 0) {
    const weightedSum = trustedRecs.reduce((sum, r) => 
      sum + (r.recommended_rank * Number(r.recommendation_score || 1)), 0
    );
    const scoreSum = trustedRecs.reduce((sum, r) => 
      sum + Number(r.recommendation_score || 1), 0
    );
    trustAdjustedPosition = scoreSum > 0 ? weightedSum / scoreSum : avgRank;
  }
  
  // Near wins
  const productsCloseToWinning = rank2_3Count;
  
  return {
    avg_rank: avgRank,
    rank_1_count: rank1Count,
    rank_2_3_count: rank2_3Count,
    low_rank_count: lowRankCount,
    low_trust_count: lowTrustCount,
    trust_adjusted_position: trustAdjustedPosition,
    products_close_to_winning: productsCloseToWinning,
  };
}
