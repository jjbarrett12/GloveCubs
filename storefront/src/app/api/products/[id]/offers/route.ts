/**
 * Product Offers API
 * 
 * Returns supplier offers for a product with full supplier identity.
 * 
 * GET /api/products/[id]/offers
 * 
 * Response includes:
 * - supplier_id
 * - supplier_name
 * - supplier_reliability_score
 * - trust_score
 * - price
 * - offer_freshness
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

interface OfferWithSupplier {
  offer_id: string;
  supplier_id: string;
  supplier_name: string;
  supplier_logo_url?: string;
  supplier_reliability_score: number;
  supplier_reliability_band: string;
  sku: string;
  price: number;
  price_per_unit?: number;
  units_per_case?: number;
  lead_time_days?: number;
  moq?: number;
  trust_score: number;
  trust_band: string;
  freshness_score: number;
  freshness_status: 'fresh' | 'recent' | 'stale' | 'very_stale';
  recommendation_rank?: number;
  is_recommended: boolean;
  updated_at: string;
  days_since_update: number;
}

interface OffersResponse {
  product_id: string;
  product_name: string;
  offers: OfferWithSupplier[];
  market_summary: {
    offer_count: number;
    supplier_count: number;
    price_min: number;
    price_max: number;
    price_avg: number;
    trusted_best_price?: number;
    trusted_best_supplier?: string;
  };
}

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: productId } = await params;
    const supabase = await getSupabase();
    
    // Get product info
    const { data: product } = await supabase
      .schema('catalogos')
      .from('products')
      .select('id, name')
      .eq('id', productId)
      .eq('is_active', true)
      .single();
      
    if (!product) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      );
    }
    
    // Get offers with supplier info
    const { data: offers } = await supabase
      .from('supplier_offers')
      .select(`
        id,
        supplier_id,
        sku,
        product_name,
        price,
        price_per_unit,
        units_per_case,
        lead_time_days,
        moq,
        is_active,
        updated_at,
        suppliers!inner(
          id,
          name,
          logo_url
        )
      `)
      .eq('product_id', productId)
      .eq('is_active', true)
      .order('price', { ascending: true });
      
    if (!offers || offers.length === 0) {
      return NextResponse.json({
        product_id: productId,
        product_name: product.name,
        offers: [],
        market_summary: {
          offer_count: 0,
          supplier_count: 0,
          price_min: 0,
          price_max: 0,
          price_avg: 0,
        },
      });
    }
    
    // Get supplier IDs for reliability lookup
    const supplierIds = offers.map(o => o.supplier_id);
    
    // Get supplier reliability scores
    const { data: reliabilityScores } = await supabase
      .from('supplier_reliability_scores')
      .select('supplier_id, reliability_score, reliability_band')
      .in('supplier_id', supplierIds)
      .order('calculated_at', { ascending: false });
      
    const reliabilityMap = new Map<string, { score: number; band: string }>();
    if (reliabilityScores) {
      for (const r of reliabilityScores) {
        if (!reliabilityMap.has(r.supplier_id)) {
          reliabilityMap.set(r.supplier_id, {
            score: Number(r.reliability_score),
            band: r.reliability_band,
          });
        }
      }
    }
    
    // Get offer trust scores
    const offerIds = offers.map(o => o.id);
    const { data: trustScores } = await supabase
      .from('offer_trust_scores')
      .select('offer_id, supplier_id, trust_score, trust_band, freshness_score')
      .in('offer_id', offerIds)
      .order('calculated_at', { ascending: false });
      
    const trustMap = new Map<string, { score: number; band: string; freshness: number }>();
    if (trustScores) {
      for (const t of trustScores) {
        if (!trustMap.has(t.offer_id)) {
          trustMap.set(t.offer_id, {
            score: Number(t.trust_score),
            band: t.trust_band,
            freshness: Number(t.freshness_score),
          });
        }
      }
    }
    
    // Get recommendations
    const { data: recommendations } = await supabase
      .from('supplier_recommendations')
      .select('supplier_id, recommended_rank')
      .eq('product_id', productId)
      .order('calculated_at', { ascending: false });
      
    const recMap = new Map<string, number>();
    if (recommendations) {
      for (const r of recommendations) {
        if (!recMap.has(r.supplier_id)) {
          recMap.set(r.supplier_id, r.recommended_rank);
        }
      }
    }
    
    const now = Date.now();
    
    // Map offers to response format
    const mappedOffers: OfferWithSupplier[] = offers.map(offer => {
      const supplier = offer.suppliers as unknown as { id: string; name: string; logo_url?: string };
      const reliability = reliabilityMap.get(offer.supplier_id);
      const trust = trustMap.get(offer.id);
      const recommendationRank = recMap.get(offer.supplier_id);
      
      const daysSinceUpdate = Math.floor(
        (now - new Date(offer.updated_at).getTime()) / (24 * 60 * 60 * 1000)
      );
      
      const freshnessScore = trust?.freshness ?? calculateFreshnessScore(daysSinceUpdate);
      const freshnessStatus = getFreshnessStatus(freshnessScore);
      
      return {
        offer_id: offer.id,
        supplier_id: offer.supplier_id,
        supplier_name: supplier?.name || 'Unknown Supplier',
        supplier_logo_url: supplier?.logo_url || undefined,
        supplier_reliability_score: reliability?.score ?? 0.5,
        supplier_reliability_band: reliability?.band ?? 'unknown',
        sku: offer.sku || '',
        price: Number(offer.price),
        price_per_unit: offer.price_per_unit ? Number(offer.price_per_unit) : undefined,
        units_per_case: offer.units_per_case,
        lead_time_days: offer.lead_time_days,
        moq: offer.moq,
        trust_score: trust?.score ?? 0.5,
        trust_band: trust?.band ?? 'unknown',
        freshness_score: freshnessScore,
        freshness_status: freshnessStatus,
        recommendation_rank: recommendationRank,
        is_recommended: recommendationRank === 1,
        updated_at: offer.updated_at,
        days_since_update: daysSinceUpdate,
      };
    });
    
    // Sort by recommendation rank, then trust-adjusted price
    mappedOffers.sort((a, b) => {
      if (a.recommendation_rank && b.recommendation_rank) {
        return a.recommendation_rank - b.recommendation_rank;
      }
      if (a.recommendation_rank) return -1;
      if (b.recommendation_rank) return 1;
      
      // Trust-adjusted price
      const aAdjusted = a.price * (1 + Math.pow(1 - a.trust_score, 1.5));
      const bAdjusted = b.price * (1 + Math.pow(1 - b.trust_score, 1.5));
      return aAdjusted - bAdjusted;
    });
    
    // Calculate market summary
    const prices = mappedOffers.map(o => o.price);
    const trustedOffers = mappedOffers.filter(
      o => o.trust_band === 'high_trust' || o.trust_band === 'medium_trust'
    );
    const trustedBest = trustedOffers.length > 0
      ? trustedOffers.reduce((best, o) => o.price < best.price ? o : best)
      : null;
      
    const uniqueSuppliers = new Set(mappedOffers.map(o => o.supplier_id));
    
    const response: OffersResponse = {
      product_id: productId,
      product_name: product.name,
      offers: mappedOffers,
      market_summary: {
        offer_count: mappedOffers.length,
        supplier_count: uniqueSuppliers.size,
        price_min: Math.min(...prices),
        price_max: Math.max(...prices),
        price_avg: prices.reduce((a, b) => a + b, 0) / prices.length,
        trusted_best_price: trustedBest?.price,
        trusted_best_supplier: trustedBest?.supplier_name,
      },
    };
    
    return NextResponse.json(response);
    
  } catch (error) {
    console.error('Product offers API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch offers' },
      { status: 500 }
    );
  }
}

function calculateFreshnessScore(daysSinceUpdate: number): number {
  if (daysSinceUpdate <= 7) return 1.0;
  if (daysSinceUpdate <= 14) return 0.9;
  if (daysSinceUpdate <= 30) return 0.7;
  if (daysSinceUpdate <= 60) return 0.4;
  if (daysSinceUpdate <= 90) return 0.2;
  return 0.1;
}

function getFreshnessStatus(score: number): 'fresh' | 'recent' | 'stale' | 'very_stale' {
  if (score >= 0.8) return 'fresh';
  if (score >= 0.5) return 'recent';
  if (score >= 0.2) return 'stale';
  return 'very_stale';
}
