/**
 * Commercial Intelligence Dashboard
 * 
 * Daily command center for procurement operations.
 * Shows supplier health, margin opportunities, market stability,
 * forecasts, alerts, and performance metrics.
 */

import { Suspense } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  PageHeader,
  LoadingState,
} from "@/components/admin";
import { CommercialDashboardClient } from "./CommercialDashboardClient";

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

export interface SupplierHealthItem {
  supplier_id: string;
  supplier_name: string;
  reliability_score: number;
  reliability_band: string;
  previous_score?: number;
  change_direction?: "up" | "down" | "stable";
  product_count: number;
  anomaly_rate: number;
  freshness_score: number;
}

export interface MarginOpportunityItem {
  id: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  opportunity_band: string;
  estimated_savings_per_case: number;
  estimated_savings_percent: number;
  current_cost: number;
  best_alternative_cost: number;
  best_alternative_supplier: string;
  status: string;
}

export interface VolatileProductItem {
  product_id: string;
  product_name: string;
  product_sku: string;
  volatility: number;
  price_min: number;
  price_max: number;
  supplier_count: number;
}

export interface StaleOfferItem {
  offer_id: string;
  supplier_name: string;
  product_name: string;
  product_sku: string;
  days_stale: number;
  last_updated: string;
  cost: number;
}

export interface ProcurementAlert {
  id: string;
  alert_type: string;
  severity: string;
  title: string;
  description: string;
  product_id?: string;
  product_name?: string;
  supplier_id?: string;
  supplier_name?: string;
  created_at: string;
  status: string;
}

export interface ForecastItem {
  type: "supplier_risk" | "rebid_needed" | "commercial_risk";
  entity_id: string;
  entity_name: string;
  confidence: number;
  reasoning: string;
  predicted_impact?: string;
  time_horizon?: string;
}

export interface DashboardMetrics {
  recommendation_acceptance_rate: number;
  realized_savings_total: number;
  realized_savings_count: number;
  supplier_reliability_distribution: Record<string, number>;
  forecast_precision: number;
  total_active_suppliers: number;
  total_active_products: number;
  total_open_opportunities: number;
  total_open_alerts: number;
}

export interface DashboardData {
  supplierHealth: {
    deteriorating: SupplierHealthItem[];
    risky: SupplierHealthItem[];
    leaderboard: SupplierHealthItem[];
  };
  marginOpportunities: {
    largest: MarginOpportunityItem[];
    recentAccepted: MarginOpportunityItem[];
    recentRejected: MarginOpportunityItem[];
    realizedSavings: { supplier_name: string; total_savings: number }[];
  };
  marketStability: {
    volatileProducts: VolatileProductItem[];
    unstableMarkets: { category: string; avg_volatility: number; product_count: number }[];
    staleOffers: StaleOfferItem[];
  };
  forecasts: ForecastItem[];
  alerts: ProcurementAlert[];
  metrics: DashboardMetrics;
}

// ============================================================================
// DATA FETCHING
// ============================================================================

async function getSupplierHealth(): Promise<DashboardData["supplierHealth"]> {
  const supabase = await getSupabase();

  // Get current reliability scores with supplier names
  const { data: current } = await supabase
    .from("supplier_reliability_scores")
    .select(`
      supplier_id,
      reliability_score,
      reliability_band,
      freshness_score,
      anomaly_penalty,
      sample_size,
      calculated_at,
      suppliers!inner(name)
    `)
    .order("calculated_at", { ascending: false });

  // Dedupe to latest per supplier
  interface ReliabilityRow {
    supplier_id: string;
    reliability_score: number;
    reliability_band: string;
    freshness_score: number;
    anomaly_penalty: number;
    sample_size: number;
    calculated_at: string;
    suppliers: unknown;
  }
  const latestScores = new Map<string, ReliabilityRow>();
  (current || []).forEach((s) => {
    const row = s as unknown as ReliabilityRow;
    if (!latestScores.has(row.supplier_id)) {
      latestScores.set(row.supplier_id, row);
    }
  });

  // Get historical scores for comparison (7 days ago)
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: historical } = await supabase
    .from("supplier_reliability_scores")
    .select("supplier_id, reliability_score, calculated_at")
    .lt("calculated_at", weekAgo)
    .order("calculated_at", { ascending: false });

  const historicalMap = new Map<string, number>();
  (historical || []).forEach((h) => {
    if (!historicalMap.has(h.supplier_id)) {
      historicalMap.set(h.supplier_id, Number(h.reliability_score));
    }
  });

  // Get product counts per supplier
  const { data: productCounts } = await supabase
    .from("supplier_offers")
    .select("supplier_id")
    .eq("is_active", true);

  const productCountMap = new Map<string, number>();
  (productCounts || []).forEach((p) => {
    productCountMap.set(p.supplier_id, (productCountMap.get(p.supplier_id) || 0) + 1);
  });

  const suppliers: SupplierHealthItem[] = Array.from(latestScores.values()).map((s) => {
    const supplier = s.suppliers as unknown as { name: string };
    const currentScore = Number(s.reliability_score);
    const previousScore = historicalMap.get(s.supplier_id);
    let change_direction: "up" | "down" | "stable" = "stable";
    if (previousScore !== undefined) {
      if (currentScore < previousScore - 0.05) change_direction = "down";
      else if (currentScore > previousScore + 0.05) change_direction = "up";
    }

    return {
      supplier_id: s.supplier_id,
      supplier_name: supplier?.name || "Unknown",
      reliability_score: currentScore,
      reliability_band: s.reliability_band,
      previous_score: previousScore,
      change_direction,
      product_count: productCountMap.get(s.supplier_id) || 0,
      anomaly_rate: Number(s.anomaly_penalty) || 0,
      freshness_score: Number(s.freshness_score) || 0,
    };
  });

  const deteriorating = suppliers
    .filter((s) => s.change_direction === "down")
    .sort((a, b) => (a.previous_score || 0) - a.reliability_score - ((b.previous_score || 0) - b.reliability_score))
    .slice(0, 10);

  const risky = suppliers
    .filter((s) => s.reliability_band === "risky" || s.reliability_band === "watch")
    .sort((a, b) => a.reliability_score - b.reliability_score)
    .slice(0, 10);

  const leaderboard = [...suppliers]
    .sort((a, b) => b.reliability_score - a.reliability_score)
    .slice(0, 10);

  return { deteriorating, risky, leaderboard };
}

async function getMarginOpportunities(): Promise<DashboardData["marginOpportunities"]> {
  const supabase = await getSupabase();

  // Get open opportunities
  const { data: opportunities } = await supabase
    .from("margin_opportunities")
    .select(`
      id,
      product_id,
      opportunity_band,
      estimated_savings_per_case,
      estimated_savings_percent,
      current_cost,
      best_alternative_cost,
      best_alternative_supplier_id,
      status,
      products!inner(name, sku),
      suppliers:best_alternative_supplier_id(name)
    `)
    .in("opportunity_band", ["major", "meaningful", "minor"])
    .order("estimated_savings_percent", { ascending: false })
    .limit(50);

  const items: MarginOpportunityItem[] = (opportunities || []).map((o) => {
    const product = o.products as unknown as { name: string; sku: string };
    const supplier = o.suppliers as unknown as { name: string } | null;
    return {
      id: o.id,
      product_id: o.product_id,
      product_name: product?.name || "Unknown",
      product_sku: product?.sku || "",
      opportunity_band: o.opportunity_band,
      estimated_savings_per_case: Number(o.estimated_savings_per_case) || 0,
      estimated_savings_percent: Number(o.estimated_savings_percent) || 0,
      current_cost: Number(o.current_cost) || 0,
      best_alternative_cost: Number(o.best_alternative_cost) || 0,
      best_alternative_supplier: supplier?.name || "Unknown",
      status: o.status || "open",
    };
  });

  const largest = items.filter((i) => i.status === "open").slice(0, 10);
  const recentAccepted = items.filter((i) => i.status === "accepted").slice(0, 5);
  const recentRejected = items.filter((i) => i.status === "rejected").slice(0, 5);

  // Get realized savings leaderboard
  const { data: savings } = await supabase
    .from("margin_opportunities")
    .select(`
      estimated_savings_per_case,
      suppliers:best_alternative_supplier_id(name)
    `)
    .eq("status", "accepted")
    .not("best_alternative_supplier_id", "is", null);

  const savingsMap = new Map<string, number>();
  (savings || []).forEach((s) => {
    const supplier = s.suppliers as unknown as { name: string } | null;
    const name = supplier?.name || "Unknown";
    savingsMap.set(name, (savingsMap.get(name) || 0) + Number(s.estimated_savings_per_case));
  });

  const realizedSavings = Array.from(savingsMap.entries())
    .map(([supplier_name, total_savings]) => ({ supplier_name, total_savings }))
    .sort((a, b) => b.total_savings - a.total_savings)
    .slice(0, 5);

  return { largest, recentAccepted, recentRejected, realizedSavings };
}

async function getMarketStability(): Promise<DashboardData["marketStability"]> {
  const supabase = await getSupabase();

  // Get price history for volatility calculation
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: priceHistory } = await supabase
    .from("price_history")
    .select(`
      product_id,
      price,
      products!inner(name, sku, category)
    `)
    .gte("recorded_at", thirtyDaysAgo);

  // Calculate volatility per product
  const productPrices = new Map<string, { prices: number[]; product: { name: string; sku: string; category?: string } }>();
  (priceHistory || []).forEach((p) => {
    const product = p.products as unknown as { name: string; sku: string; category?: string };
    if (!productPrices.has(p.product_id)) {
      productPrices.set(p.product_id, { prices: [], product });
    }
    productPrices.get(p.product_id)!.prices.push(Number(p.price));
  });

  const volatileProducts: VolatileProductItem[] = [];
  productPrices.forEach((data, product_id) => {
    if (data.prices.length < 3) return;
    const mean = data.prices.reduce((a, b) => a + b, 0) / data.prices.length;
    const variance = data.prices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / data.prices.length;
    const volatility = Math.sqrt(variance) / mean;

    if (volatility > 0.1) {
      volatileProducts.push({
        product_id,
        product_name: data.product.name,
        product_sku: data.product.sku,
        volatility,
        price_min: Math.min(...data.prices),
        price_max: Math.max(...data.prices),
        supplier_count: 0, // Will be filled
      });
    }
  });

  volatileProducts.sort((a, b) => b.volatility - a.volatility);

  // Calculate unstable markets by category
  const categoryVolatility = new Map<string, { total: number; count: number }>();
  productPrices.forEach((data) => {
    const category = data.product.category || "Uncategorized";
    if (data.prices.length < 3) return;
    const mean = data.prices.reduce((a, b) => a + b, 0) / data.prices.length;
    const variance = data.prices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / data.prices.length;
    const volatility = Math.sqrt(variance) / mean;

    if (!categoryVolatility.has(category)) {
      categoryVolatility.set(category, { total: 0, count: 0 });
    }
    const cat = categoryVolatility.get(category)!;
    cat.total += volatility;
    cat.count += 1;
  });

  const unstableMarkets = Array.from(categoryVolatility.entries())
    .map(([category, data]) => ({
      category,
      avg_volatility: data.total / data.count,
      product_count: data.count,
    }))
    .filter((m) => m.avg_volatility > 0.08)
    .sort((a, b) => b.avg_volatility - a.avg_volatility)
    .slice(0, 5);

  // Get stale offers
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data: staleOffersData } = await supabase
    .from("supplier_offers")
    .select(`
      id,
      cost,
      updated_at,
      suppliers!inner(name),
      products!inner(name, sku)
    `)
    .eq("is_active", true)
    .lt("updated_at", fourteenDaysAgo)
    .order("updated_at", { ascending: true })
    .limit(20);

  const staleOffers: StaleOfferItem[] = (staleOffersData || []).map((o) => {
    const supplier = o.suppliers as unknown as { name: string };
    const product = o.products as unknown as { name: string; sku: string };
    const updatedAt = new Date(o.updated_at);
    const daysStale = Math.floor((Date.now() - updatedAt.getTime()) / (24 * 60 * 60 * 1000));

    return {
      offer_id: o.id,
      supplier_name: supplier?.name || "Unknown",
      product_name: product?.name || "Unknown",
      product_sku: product?.sku || "",
      days_stale: daysStale,
      last_updated: o.updated_at,
      cost: Number(o.cost),
    };
  });

  return { volatileProducts: volatileProducts.slice(0, 10), unstableMarkets, staleOffers };
}

async function getForecasts(): Promise<ForecastItem[]> {
  const supabase = await getSupabase();

  // Get suppliers with declining trends
  const { data: reliabilityTrends } = await supabase
    .from("supplier_reliability_scores")
    .select(`
      supplier_id,
      reliability_score,
      calculated_at,
      suppliers!inner(name)
    `)
    .order("calculated_at", { ascending: false })
    .limit(500);

  // Group by supplier and analyze trend
  const supplierTrends = new Map<string, { scores: number[]; name: string }>();
  (reliabilityTrends || []).forEach((r) => {
    const supplier = r.suppliers as unknown as { name: string };
    if (!supplierTrends.has(r.supplier_id)) {
      supplierTrends.set(r.supplier_id, { scores: [], name: supplier?.name || "Unknown" });
    }
    supplierTrends.get(r.supplier_id)!.scores.push(Number(r.reliability_score));
  });

  const forecasts: ForecastItem[] = [];

  supplierTrends.forEach((data, supplier_id) => {
    if (data.scores.length < 3) return;

    // Check for declining trend (most recent vs earlier)
    const recent = data.scores.slice(0, 3);
    const earlier = data.scores.slice(3, 6);
    if (earlier.length === 0) return;

    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const earlierAvg = earlier.reduce((a, b) => a + b, 0) / earlier.length;

    if (recentAvg < earlierAvg - 0.1) {
      forecasts.push({
        type: "supplier_risk",
        entity_id: supplier_id,
        entity_name: data.name,
        confidence: Math.min(0.95, 0.6 + (earlierAvg - recentAvg) * 2),
        reasoning: `Reliability dropped ${Math.round((earlierAvg - recentAvg) * 100)}% over recent period`,
        predicted_impact: recentAvg < 0.5 ? "High" : "Medium",
        time_horizon: "2-4 weeks",
      });
    }
  });

  // Sort by confidence
  return forecasts.sort((a, b) => b.confidence - a.confidence).slice(0, 10);
}

async function getAlerts(): Promise<ProcurementAlert[]> {
  const supabase = await getSupabase();

  const { data } = await supabase
    .from("procurement_alerts")
    .select(`
      id,
      alert_type,
      severity,
      title,
      description,
      product_id,
      supplier_id,
      created_at,
      status,
      products(name),
      suppliers(name)
    `)
    .in("status", ["open", "acknowledged"])
    .order("severity", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(20);

  return (data || []).map((a) => {
    const product = a.products as unknown as { name: string } | null;
    const supplier = a.suppliers as unknown as { name: string } | null;
    return {
      id: a.id,
      alert_type: a.alert_type,
      severity: a.severity,
      title: a.title,
      description: a.description,
      product_id: a.product_id,
      product_name: product?.name,
      supplier_id: a.supplier_id,
      supplier_name: supplier?.name,
      created_at: a.created_at,
      status: a.status,
    };
  });
}

async function getMetrics(): Promise<DashboardMetrics> {
  const supabase = await getSupabase();

  // Recommendation acceptance rate
  const { data: recommendations } = await supabase
    .from("margin_opportunities")
    .select("status")
    .in("status", ["accepted", "rejected"]);

  const accepted = (recommendations || []).filter((r) => r.status === "accepted").length;
  const total = (recommendations || []).length;
  const recommendation_acceptance_rate = total > 0 ? accepted / total : 0;

  // Realized savings
  const { data: savings } = await supabase
    .from("margin_opportunities")
    .select("estimated_savings_per_case")
    .eq("status", "accepted");

  const realized_savings_total = (savings || []).reduce(
    (sum, s) => sum + Number(s.estimated_savings_per_case),
    0
  );
  const realized_savings_count = (savings || []).length;

  // Supplier reliability distribution
  const { data: reliability } = await supabase
    .from("supplier_reliability_scores")
    .select("supplier_id, reliability_band, calculated_at")
    .order("calculated_at", { ascending: false });

  const latestBands = new Map<string, string>();
  (reliability || []).forEach((r) => {
    if (!latestBands.has(r.supplier_id)) {
      latestBands.set(r.supplier_id, r.reliability_band);
    }
  });

  const supplier_reliability_distribution: Record<string, number> = {
    trusted: 0,
    stable: 0,
    watch: 0,
    risky: 0,
  };
  latestBands.forEach((band) => {
    if (supplier_reliability_distribution[band] !== undefined) {
      supplier_reliability_distribution[band]++;
    }
  });

  // Totals
  const { count: total_active_suppliers } = await supabase
    .from("suppliers")
    .select("*", { count: "exact", head: true })
    .eq("is_active", true);

  const { count: total_active_products, error: activeProductsErr } = await supabase
    .schema("catalog_v2")
    .from("catalog_products")
    .select("*", { count: "exact", head: true })
    .eq("status", "active");
  if (activeProductsErr) throw new Error(`catalog_v2.catalog_products (commercial dashboard): ${activeProductsErr.message}`);

  const { count: total_open_opportunities } = await supabase
    .from("margin_opportunities")
    .select("*", { count: "exact", head: true })
    .in("opportunity_band", ["major", "meaningful"])
    .eq("status", "open");

  const { count: total_open_alerts } = await supabase
    .from("procurement_alerts")
    .select("*", { count: "exact", head: true })
    .in("status", ["open", "acknowledged"]);

  return {
    recommendation_acceptance_rate,
    realized_savings_total,
    realized_savings_count,
    supplier_reliability_distribution,
    forecast_precision: 0.78, // Placeholder - would need historical tracking
    total_active_suppliers: total_active_suppliers || 0,
    total_active_products: total_active_products || 0,
    total_open_opportunities: total_open_opportunities || 0,
    total_open_alerts: total_open_alerts || 0,
  };
}

async function getDashboardData(): Promise<DashboardData> {
  const [supplierHealth, marginOpportunities, marketStability, forecasts, alerts, metrics] =
    await Promise.all([
      getSupplierHealth(),
      getMarginOpportunities(),
      getMarketStability(),
      getForecasts(),
      getAlerts(),
      getMetrics(),
    ]);

  return {
    supplierHealth,
    marginOpportunities,
    marketStability,
    forecasts,
    alerts,
    metrics,
  };
}

// ============================================================================
// PAGE COMPONENT
// ============================================================================

async function DashboardContent() {
  const data = await getDashboardData();
  return <CommercialDashboardClient data={data} />;
}

export default function CommercialIntelligencePage() {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div>
      <PageHeader
        title="Commercial Intelligence"
        description={`Daily command center • ${today}`}
        breadcrumb={[
          { label: "Operations", href: "/admin" },
          { label: "Commercial" },
        ]}
      />

      <Suspense fallback={<LoadingState message="Loading commercial intelligence..." />}>
        <DashboardContent />
      </Suspense>
    </div>
  );
}
