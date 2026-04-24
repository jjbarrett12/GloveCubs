/**
 * Product Intelligence Page
 * 
 * Market analysis, supplier comparison, and pricing intelligence for a product.
 * Shows trust-adjusted pricing, supplier reliability, and operator tools.
 */

import { Suspense } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  PageHeader,
  StatCard,
  StatGrid,
  LoadingState,
  TableCard,
} from "@/components/admin";
import { ProductIntelligenceClient } from "./ProductIntelligenceClient";

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

// ============================================================================
// TYPES
// ============================================================================

export interface ProductData {
  id: string;
  sku: string;
  name: string;
  brand?: string;
  category?: string;
  attributes?: Record<string, unknown>;
  /** catalog_v2.catalog_products.id when linked from listing */
  catalog_product_id?: string | null;
  current_price?: number;
  current_cost?: number;
}

export interface SupplierOffer {
  id: string;
  supplier_id: string;
  supplier_name: string;
  supplier_sku: string;
  cost: number;
  sell_price?: number;
  lead_time_days?: number;
  units_per_case?: number;
  is_active: boolean;
  updated_at: string;
  trust_score?: number;
  trust_band?: string;
  reliability_score?: number;
  reliability_band?: string;
  recommendation_rank?: number;
  recommendation_score?: number;
  freshness_score?: number;
  match_confidence?: number;
  anomaly_penalty?: number;
}

export interface MarketOverview {
  supplier_count: number;
  active_offer_count: number;
  price_min: number;
  price_max: number;
  price_median: number;
  best_raw_price: number;
  best_trusted_price: number;
  best_trusted_supplier_id: string | null;
  price_volatility: number;
  has_suspicious_offers: boolean;
  margin_opportunity_score?: number;
  margin_opportunity_band?: string;
}

export interface PricingAlert {
  id: string;
  alert_type: string;
  severity: string;
  title: string;
  description: string;
  created_at: string;
  status: string;
}

export interface AnomalyHistoryItem {
  id: string;
  offer_id: string;
  supplier_name: string;
  analysis_category: string;
  is_suspicious: boolean;
  confidence: number;
  reasoning?: string;
  created_at: string;
}

// ============================================================================
// DATA FETCHING
// ============================================================================

async function getProduct(id: string): Promise<ProductData | null> {
  const supabase = await getSupabase();

  const { data: row, error: v2Err } = await supabase
    .schema("catalog_v2")
    .from("catalog_products")
    .select("id, internal_sku, name, metadata, brand_id")
    .eq("id", id)
    .maybeSingle();

  if (v2Err) {
    throw new Error(`catalog_v2.catalog_products: ${v2Err.message}`);
  }

  if (!row) return null;

  const r = row as {
    id: string;
    internal_sku: string | null;
    name: string;
    metadata?: Record<string, unknown> | null;
    brand_id: string | null;
  };
  let brandName: string | undefined;
  if (r.brand_id) {
    const { data: b } = await supabase.schema("catalogos").from("brands").select("name").eq("id", r.brand_id).maybeSingle();
    brandName = (b as { name?: string } | null)?.name ?? undefined;
  }

  return {
    id: r.id,
    sku: r.internal_sku ?? "",
    name: r.name,
    brand: brandName,
    category: undefined,
    attributes: (r.metadata?.facet_attributes as Record<string, unknown>) ?? r.metadata ?? undefined,
    catalog_product_id: r.id,
  };
}

async function getSupplierOffers(productId: string): Promise<SupplierOffer[]> {
  const supabase = await getSupabase();
  
  // Get offers with supplier info
  const { data: offers } = await supabase
    .from("supplier_offers")
    .select(`
      id,
      supplier_id,
      supplier_sku,
      cost,
      sell_price,
      lead_time_days,
      units_per_case,
      is_active,
      updated_at,
      suppliers!inner(name)
    `)
    .eq("product_id", productId)
    .order("cost", { ascending: true });
    
  if (!offers) return [];
  
  // Get trust scores
  const offerIds = offers.map((o) => o.id);
  const { data: trustScores } = await supabase
    .from("offer_trust_scores")
    .select("offer_id, trust_score, trust_band, freshness_score, match_confidence, anomaly_penalty")
    .in("offer_id", offerIds);
    
  const trustMap = new Map((trustScores || []).map((t) => [t.offer_id, t]));
  
  // Get supplier reliability
  const supplierIds = Array.from(new Set(offers.map((o) => o.supplier_id)));
  const { data: reliabilityScores } = await supabase
    .from("supplier_reliability_scores")
    .select("supplier_id, reliability_score, reliability_band")
    .in("supplier_id", supplierIds);
    
  const reliabilityMap = new Map((reliabilityScores || []).map((r) => [r.supplier_id, r]));
  
  // Get recommendations
  const { data: recommendations } = await supabase
    .from("supplier_recommendations")
    .select("supplier_id, recommended_rank, recommendation_score")
    .eq("product_id", productId);
    
  const recMap = new Map((recommendations || []).map((r) => [r.supplier_id, r]));
  
  return offers.map((o) => {
    const trust = trustMap.get(o.id);
    const reliability = reliabilityMap.get(o.supplier_id);
    const rec = recMap.get(o.supplier_id);
    const supplier = o.suppliers as unknown as { name: string };
    
    return {
      id: o.id,
      supplier_id: o.supplier_id,
      supplier_name: supplier?.name || "Unknown",
      supplier_sku: o.supplier_sku,
      cost: Number(o.cost),
      sell_price: o.sell_price ? Number(o.sell_price) : undefined,
      lead_time_days: o.lead_time_days,
      units_per_case: o.units_per_case,
      is_active: o.is_active,
      updated_at: o.updated_at,
      trust_score: trust ? Number(trust.trust_score) : undefined,
      trust_band: trust?.trust_band,
      reliability_score: reliability ? Number(reliability.reliability_score) : undefined,
      reliability_band: reliability?.reliability_band,
      recommendation_rank: rec?.recommended_rank,
      recommendation_score: rec ? Number(rec.recommendation_score) : undefined,
      freshness_score: trust ? Number(trust.freshness_score) : undefined,
      match_confidence: trust ? Number(trust.match_confidence) : undefined,
      anomaly_penalty: trust ? Number(trust.anomaly_penalty) : undefined,
    };
  });
}

async function getMarketOverview(productId: string, offers: SupplierOffer[]): Promise<MarketOverview> {
  const supabase = await getSupabase();
  
  const activeOffers = offers.filter((o) => o.is_active && o.cost > 0);
  const prices = activeOffers.map((o) => o.cost).sort((a, b) => a - b);
  
  // Calculate trust-adjusted best price
  let bestTrustedPrice = prices[0] || 0;
  let bestTrustedSupplierId: string | null = null;
  
  for (const offer of activeOffers) {
    const trustScore = offer.trust_score ?? 0.5;
    // Trust-adjusted price: lower trust = higher effective price
    const trustAdjustedPrice = offer.cost * (1 + Math.pow(1 - trustScore, 1.5));
    if (!bestTrustedSupplierId || trustAdjustedPrice < bestTrustedPrice) {
      bestTrustedPrice = trustAdjustedPrice;
      bestTrustedSupplierId = offer.supplier_id;
    }
  }
  
  // Calculate volatility from price history
  const { data: priceHistory, error: priceHistoryError } = await supabase
    .from("price_history")
    .select("price")
    .eq("product_id", productId)
    .gte("recorded_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .limit(100);

  let volatility = 0;
  if (priceHistoryError) {
    /* optional table / view — omit volatility when unavailable */
  } else if (priceHistory && priceHistory.length > 1) {
    const historicalPrices = priceHistory.map((p) => Number(p.price));
    const mean = historicalPrices.reduce((a, b) => a + b, 0) / historicalPrices.length;
    const variance = historicalPrices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / historicalPrices.length;
    volatility = Math.sqrt(variance) / mean; // Coefficient of variation
  }
  
  // Check for margin opportunity
  const { data: marginOpp } = await supabase
    .from("margin_opportunities")
    .select("opportunity_score, opportunity_band")
    .eq("product_id", productId)
    .order("calculated_at", { ascending: false })
    .limit(1)
    .single();
  
  const hasSuspicious = activeOffers.some((o) => o.trust_band === "low_trust" || o.anomaly_penalty && o.anomaly_penalty > 0.3);
  
  return {
    supplier_count: new Set(offers.map((o) => o.supplier_id)).size,
    active_offer_count: activeOffers.length,
    price_min: prices[0] || 0,
    price_max: prices[prices.length - 1] || 0,
    price_median: prices[Math.floor(prices.length / 2)] || 0,
    best_raw_price: prices[0] || 0,
    best_trusted_price: bestTrustedPrice,
    best_trusted_supplier_id: bestTrustedSupplierId,
    price_volatility: volatility,
    has_suspicious_offers: hasSuspicious,
    margin_opportunity_score: marginOpp ? Number(marginOpp.opportunity_score) : undefined,
    margin_opportunity_band: marginOpp?.opportunity_band,
  };
}

async function getPricingAlerts(productId: string): Promise<PricingAlert[]> {
  const supabase = await getSupabase();

  const { data, error } = await supabase
    .schema("catalogos")
    .from("procurement_alerts")
    .select("id, alert_type, severity, title, summary, created_at, status")
    .eq("entity_type", "product")
    .eq("entity_id", productId)
    .in("status", ["open", "acknowledged"])
    .order("severity", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) throw new Error(`catalogos.procurement_alerts: ${error.message}`);

  return (data || []).map((a) => ({
    id: a.id,
    alert_type: a.alert_type,
    severity: a.severity,
    title: a.title,
    description: (a as { summary?: string }).summary ?? "",
    created_at: a.created_at,
    status: a.status,
  }));
}

async function getAnomalyHistory(canonicalProductId: string | null | undefined): Promise<AnomalyHistoryItem[]> {
  const supabase = await getSupabase();

  if (!canonicalProductId) {
    return [];
  }

  const { data, error } = await supabase
    .schema("catalogos")
    .from("ai_pricing_analysis")
    .select(`
      id,
      supplier_offer_id,
      analysis_category,
      is_suspicious,
      confidence,
      reasoning_summary,
      created_at,
      supplier_offers!inner(supplier_id, suppliers!inner(name))
    `)
    .eq("canonical_product_id", canonicalProductId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) throw new Error(`catalogos.ai_pricing_analysis: ${error.message}`);

  return (data || []).map((a) => {
    const offer = a.supplier_offers as unknown as { supplier_id: string; suppliers: { name: string } };
    return {
      id: a.id,
      offer_id: (a as { supplier_offer_id?: string }).supplier_offer_id ?? "",
      supplier_name: offer?.suppliers?.name || "Unknown",
      analysis_category: a.analysis_category,
      is_suspicious: a.is_suspicious,
      confidence: Number(a.confidence),
      reasoning: a.reasoning_summary,
      created_at: a.created_at,
    };
  });
}

// ============================================================================
// PAGE COMPONENT
// ============================================================================

async function ProductIntelligenceContent({ productId }: { productId: string }) {
  const product = await getProduct(productId);
  
  if (!product) {
    notFound();
  }
  
  const [offers, alerts, anomalyHistory] = await Promise.all([
    getSupplierOffers(productId),
    getPricingAlerts(productId),
    getAnomalyHistory(product.catalog_product_id),
  ]);
  
  const market = await getMarketOverview(productId, offers);
  
  return (
    <ProductIntelligenceClient
      product={product}
      offers={offers}
      market={market}
      alerts={alerts}
      anomalyHistory={anomalyHistory}
    />
  );
}

export default async function ProductIntelligencePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div>
      <PageHeader
        title="Product Intelligence"
        breadcrumb={[
          { label: "Operations", href: "/admin" },
          { label: "Products", href: "/admin/products" },
          { label: "Intelligence" },
        ]}
      />

      <Suspense fallback={<LoadingState message="Loading intelligence data..." />}>
        <ProductIntelligenceContent productId={id} />
      </Suspense>
    </div>
  );
}
