/**
 * Buyer Intelligence Dashboard
 * 
 * Enterprise buyer-facing dashboard showing platform value:
 * savings, market intelligence, supplier comparison, and opportunities.
 */

import { Suspense } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { PageHeader, LoadingState } from "@/components/admin";
import { BuyerDashboardClient } from "./BuyerDashboardClient";
import type { BuyerSpendOrderItemJoined } from "@/lib/contracts/admin-buyer-queries";
import { resolveOrderItemCatalogProductId } from "@/lib/commerce/resolve-catalog-product-id";
import { getSupabaseCatalogos } from "@/lib/jobs/supabase";

async function getSupabase() {
  const cookieStore = await cookies();
  /** Buyer dashboard queries many public tables not yet in generated `Database` — avoid `never` row types. */
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

export interface SavingsSummary {
  quarter_savings: number;
  realized_savings: number;
  pipeline_savings: number;
  savings_count: number;
  avg_savings_percent: number;
  vs_last_quarter: number;
}

export interface MarketIntelligence {
  total_products: number;
  products_with_offers: number;
  avg_price_range_percent: number;
  trusted_best_price_savings: number;
  suspicious_offer_count: number;
  stale_offer_count: number;
}

export interface SupplierComparisonItem {
  supplier_id: string;
  supplier_name: string;
  product_count: number;
  avg_price: number;
  avg_trust_score: number;
  reliability_score: number;
  reliability_band: string;
  recommendation_wins: number;
  total_spend: number;
}

export interface ProcurementRisk {
  deteriorating_suppliers: {
    supplier_id: string;
    supplier_name: string;
    current_score: number;
    previous_score: number;
    change_percent: number;
  }[];
  volatile_products: {
    product_id: string;
    product_name: string;
    volatility: number;
    price_min: number;
    price_max: number;
  }[];
  critical_alerts: number;
  high_alerts: number;
}

export interface SpendAnalytics {
  total_spend: number;
  spend_by_supplier: { supplier_name: string; spend: number; percent: number }[];
  spend_by_category: { category: string; spend: number; percent: number }[];
  spend_trend: { period: string; spend: number }[];
}

export interface SavingsOpportunity {
  id: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  current_supplier: string;
  current_cost: number;
  recommended_supplier: string;
  recommended_cost: number;
  savings_per_case: number;
  savings_percent: number;
  opportunity_band: string;
  confidence: number;
}

export interface BuyerDashboardData {
  savings: SavingsSummary;
  market: MarketIntelligence;
  suppliers: SupplierComparisonItem[];
  risks: ProcurementRisk;
  spend: SpendAnalytics;
  opportunities: SavingsOpportunity[];
}

// ============================================================================
// DATA FETCHING
// ============================================================================

/** Public table not yet in generated Database types — keep row shape explicit for strict builds. */
type MarginOpportunitySavingsRow = {
  estimated_savings_per_case?: unknown;
  estimated_savings_percent?: unknown;
};

async function getSavingsSummary(): Promise<SavingsSummary> {
  const supabase = await getSupabase();

  const quarterStart = new Date();
  quarterStart.setMonth(Math.floor(quarterStart.getMonth() / 3) * 3, 1);
  quarterStart.setHours(0, 0, 0, 0);

  const lastQuarterStart = new Date(quarterStart);
  lastQuarterStart.setMonth(lastQuarterStart.getMonth() - 3);

  // Get realized savings (accepted opportunities)
  const { data: realizedRaw } = await supabase
    .from("margin_opportunities")
    .select("estimated_savings_per_case, estimated_savings_percent")
    .eq("status", "accepted")
    .gte("updated_at", quarterStart.toISOString());

  const realized = (realizedRaw || []) as MarginOpportunitySavingsRow[];

  const realizedSavings = realized.reduce(
    (sum, r) => sum + Number(r.estimated_savings_per_case || 0),
    0
  );
  const avgSavingsPercent =
    realized.length > 0
      ? realized.reduce((sum, r) => sum + Number(r.estimated_savings_percent || 0), 0) / realized.length
      : 0;

  // Get pipeline savings (open opportunities)
  const { data: pipelineRaw } = await supabase
    .from("margin_opportunities")
    .select("estimated_savings_per_case")
    .eq("status", "open")
    .in("opportunity_band", ["major", "meaningful"]);

  const pipeline = (pipelineRaw || []) as MarginOpportunitySavingsRow[];

  const pipelineSavings = pipeline.reduce(
    (sum, p) => sum + Number(p.estimated_savings_per_case || 0),
    0
  );

  // Get last quarter for comparison
  const { data: lastQuarterRaw } = await supabase
    .from("margin_opportunities")
    .select("estimated_savings_per_case")
    .eq("status", "accepted")
    .gte("updated_at", lastQuarterStart.toISOString())
    .lt("updated_at", quarterStart.toISOString());

  const lastQuarter = (lastQuarterRaw || []) as MarginOpportunitySavingsRow[];

  const lastQuarterSavings = lastQuarter.reduce(
    (sum, r) => sum + Number(r.estimated_savings_per_case || 0),
    0
  );

  const vsLastQuarter =
    lastQuarterSavings > 0 ? ((realizedSavings - lastQuarterSavings) / lastQuarterSavings) * 100 : 0;

  return {
    quarter_savings: realizedSavings + pipelineSavings,
    realized_savings: realizedSavings,
    pipeline_savings: pipelineSavings,
    savings_count: realized.length,
    avg_savings_percent: avgSavingsPercent,
    vs_last_quarter: vsLastQuarter,
  };
}

async function getMarketIntelligence(): Promise<MarketIntelligence> {
  const supabase = await getSupabase();

  const { count: totalProducts } = await supabase
    .from("products")
    .select("*", { count: "exact", head: true })
    .eq("in_stock", true);

  // Products with active offers
  const { data: offerProducts } = await supabase
    .from("supplier_offers")
    .select("product_id")
    .eq("is_active", true);

  const uniqueProducts = new Set((offerProducts || []).map((o) => o.product_id));

  // Get suspicious offers
  const { data: suspicious } = await supabase
    .from("offer_trust_scores")
    .select("offer_id")
    .eq("trust_band", "low_trust");

  // Get stale offers (older than 14 days)
  const staleDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { count: staleCount } = await supabase
    .from("supplier_offers")
    .select("*", { count: "exact", head: true })
    .eq("is_active", true)
    .lt("updated_at", staleDate);

  // Calculate average price range
  const { data: priceRanges } = await supabase
    .from("supplier_offers")
    .select("product_id, cost")
    .eq("is_active", true)
    .gt("cost", 0);

  const productPrices = new Map<string, number[]>();
  (priceRanges || []).forEach((p) => {
    const prices = productPrices.get(p.product_id) || [];
    prices.push(Number(p.cost));
    productPrices.set(p.product_id, prices);
  });

  let totalRangePercent = 0;
  let rangeCount = 0;
  productPrices.forEach((prices) => {
    if (prices.length >= 2) {
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      if (min > 0) {
        totalRangePercent += ((max - min) / min) * 100;
        rangeCount++;
      }
    }
  });

  return {
    total_products: totalProducts || 0,
    products_with_offers: uniqueProducts.size,
    avg_price_range_percent: rangeCount > 0 ? totalRangePercent / rangeCount : 0,
    trusted_best_price_savings: 0, // Would need more complex calculation
    suspicious_offer_count: (suspicious || []).length,
    stale_offer_count: staleCount || 0,
  };
}

async function getSupplierComparison(): Promise<SupplierComparisonItem[]> {
  const supabase = await getSupabase();

  // Get suppliers with reliability scores
  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("id, name")
    .eq("is_active", true);

  if (!suppliers) return [];

  const supplierIds = suppliers.map((s) => s.id);

  // Get reliability scores
  const { data: reliability } = await supabase
    .from("supplier_reliability_scores")
    .select("supplier_id, reliability_score, reliability_band, calculated_at")
    .in("supplier_id", supplierIds)
    .order("calculated_at", { ascending: false });

  const reliabilityMap = new Map<string, { score: number; band: string }>();
  (reliability || []).forEach((r) => {
    if (!reliabilityMap.has(r.supplier_id)) {
      reliabilityMap.set(r.supplier_id, {
        score: Number(r.reliability_score),
        band: r.reliability_band,
      });
    }
  });

  // Get offer stats per supplier
  const { data: offerStats } = await supabase
    .from("supplier_offers")
    .select("supplier_id, cost, product_id")
    .eq("is_active", true)
    .in("supplier_id", supplierIds);

  const supplierStats = new Map<string, { costs: number[]; products: Set<string> }>();
  (offerStats || []).forEach((o) => {
    const stats = supplierStats.get(o.supplier_id) || { costs: [], products: new Set() };
    stats.costs.push(Number(o.cost));
    stats.products.add(o.product_id);
    supplierStats.set(o.supplier_id, stats);
  });

  // Get trust scores per supplier
  const { data: trustScores } = await supabase
    .from("offer_trust_scores")
    .select("supplier_id, trust_score")
    .in("supplier_id", supplierIds);

  const trustMap = new Map<string, number[]>();
  (trustScores || []).forEach((t) => {
    const scores = trustMap.get(t.supplier_id) || [];
    scores.push(Number(t.trust_score));
    trustMap.set(t.supplier_id, scores);
  });

  // Get recommendation wins
  const { data: recommendations } = await supabase
    .from("supplier_recommendations")
    .select("supplier_id")
    .eq("recommended_rank", 1)
    .in("supplier_id", supplierIds);

  const winsMap = new Map<string, number>();
  (recommendations || []).forEach((r) => {
    winsMap.set(r.supplier_id, (winsMap.get(r.supplier_id) || 0) + 1);
  });

  return suppliers
    .map((s) => {
      const stats = supplierStats.get(s.id);
      const rel = reliabilityMap.get(s.id);
      const trustScoresArr = trustMap.get(s.id) || [];
      const avgTrust =
        trustScoresArr.length > 0
          ? trustScoresArr.reduce((a, b) => a + b, 0) / trustScoresArr.length
          : 0.5;
      const avgPrice =
        stats && stats.costs.length > 0
          ? stats.costs.reduce((a, b) => a + b, 0) / stats.costs.length
          : 0;

      return {
        supplier_id: s.id,
        supplier_name: s.name,
        product_count: stats?.products.size || 0,
        avg_price: avgPrice,
        avg_trust_score: avgTrust,
        reliability_score: rel?.score || 0.5,
        reliability_band: rel?.band || "unknown",
        recommendation_wins: winsMap.get(s.id) || 0,
        total_spend: 0, // Would need order data
      };
    })
    .filter((s) => s.product_count > 0)
    .sort((a, b) => b.reliability_score - a.reliability_score)
    .slice(0, 15);
}

async function getProcurementRisks(): Promise<ProcurementRisk> {
  const supabase = await getSupabase();

  // Get deteriorating suppliers
  const { data: currentScores } = await supabase
    .from("supplier_reliability_scores")
    .select("supplier_id, reliability_score, calculated_at, suppliers!inner(name)")
    .order("calculated_at", { ascending: false });

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: pastScores } = await supabase
    .from("supplier_reliability_scores")
    .select("supplier_id, reliability_score")
    .lt("calculated_at", weekAgo)
    .order("calculated_at", { ascending: false });

  const currentMap = new Map<string, { score: number; name: string }>();
  (currentScores || []).forEach((s) => {
    if (!currentMap.has(s.supplier_id)) {
      const supplier = s.suppliers as unknown as { name: string };
      currentMap.set(s.supplier_id, {
        score: Number(s.reliability_score),
        name: supplier?.name || "Unknown",
      });
    }
  });

  const pastMap = new Map<string, number>();
  (pastScores || []).forEach((s) => {
    if (!pastMap.has(s.supplier_id)) {
      pastMap.set(s.supplier_id, Number(s.reliability_score));
    }
  });

  const deteriorating: ProcurementRisk["deteriorating_suppliers"] = [];
  currentMap.forEach((current, supplierId) => {
    const past = pastMap.get(supplierId);
    if (past && current.score < past - 0.05) {
      deteriorating.push({
        supplier_id: supplierId,
        supplier_name: current.name,
        current_score: current.score,
        previous_score: past,
        change_percent: ((current.score - past) / past) * 100,
      });
    }
  });

  // Get volatile products
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: priceHistory } = await supabase
    .from("price_history")
    .select("product_id, price, products!inner(name)")
    .gte("recorded_at", thirtyDaysAgo);

  const productPrices = new Map<string, { prices: number[]; name: string }>();
  (priceHistory || []).forEach((p) => {
    const product = p.products as unknown as { name: string };
    const data = productPrices.get(p.product_id) || { prices: [], name: product?.name || "Unknown" };
    data.prices.push(Number(p.price));
    productPrices.set(p.product_id, data);
  });

  const volatile: ProcurementRisk["volatile_products"] = [];
  productPrices.forEach((data, productId) => {
    if (data.prices.length >= 3) {
      const mean = data.prices.reduce((a, b) => a + b, 0) / data.prices.length;
      const variance = data.prices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / data.prices.length;
      const volatility = Math.sqrt(variance) / mean;
      if (volatility > 0.15) {
        volatile.push({
          product_id: productId,
          product_name: data.name,
          volatility,
          price_min: Math.min(...data.prices),
          price_max: Math.max(...data.prices),
        });
      }
    }
  });

  // Get alert counts
  const { data: alerts } = await supabase
    .from("procurement_alerts")
    .select("severity")
    .in("status", ["open", "acknowledged"]);

  const criticalAlerts = (alerts || []).filter((a) => a.severity === "critical").length;
  const highAlerts = (alerts || []).filter((a) => a.severity === "high").length;

  return {
    deteriorating_suppliers: deteriorating.sort((a, b) => a.change_percent - b.change_percent).slice(0, 5),
    volatile_products: volatile.sort((a, b) => b.volatility - a.volatility).slice(0, 5),
    critical_alerts: criticalAlerts,
    high_alerts: highAlerts,
  };
}

async function getSpendAnalytics(): Promise<SpendAnalytics> {
  const supabase = await getSupabase();

  // Order lines: prefer resolved catalog UUID for category rollups; keep legacy products join for history.
  const { data: orderItems, error: orderItemsError } = await supabase
    .from("order_items")
    .select(`
      quantity,
      unit_price,
      product_id,
      canonical_product_id,
      orders!inner(created_at, status),
      products!inner(name, category, brand)
    `)
    .in("orders.status", ["completed", "shipped", "delivered"]);

  if (orderItemsError) {
    console.error("[buyer-intelligence] getSpendAnalytics order_items:", orderItemsError.message);
  }

  const liveToCatalogUuid = new Map<number, string>();
  try {
    const catalogos = getSupabaseCatalogos();
    const { data: links } = await catalogos
      .from("products")
      .select("id, live_product_id")
      .not("live_product_id", "is", null)
      .limit(20000);
    for (const row of links ?? []) {
      if (row.live_product_id != null && row.id != null) {
        liveToCatalogUuid.set(Number(row.live_product_id), String(row.id));
      }
    }
  } catch {
    // Rollups still work from products join when mapping is unavailable.
  }

  const catalogIdSet = new Set<string>();
  for (const raw of orderItems ?? []) {
    const row = raw as unknown as BuyerSpendOrderItemJoined;
    const cid = resolveOrderItemCatalogProductId(
      { canonical_product_id: row.canonical_product_id, product_id: row.product_id },
      liveToCatalogUuid
    );
    if (cid) catalogIdSet.add(cid);
  }
  const catalogIds = Array.from(catalogIdSet);
  const { data: catalogRows } =
    catalogIds.length > 0
      ? await getSupabaseCatalogos()
          .from("products")
          .select("id, categories(slug)")
          .in("id", catalogIds)
          .eq("is_active", true)
      : { data: [] as { id: string; categories?: { slug?: string } | { slug?: string }[] }[] };

  const categoryByCatalogId = new Map<string, string | null>(
    (catalogRows ?? []).map((r) => {
      const c = r.categories;
      const slug = Array.isArray(c) ? c[0]?.slug : c?.slug;
      return [r.id, slug ?? null];
    })
  );

  let totalSpend = 0;
  const categorySpend = new Map<string, number>();
  const monthlySpend = new Map<string, number>();

  (orderItems || []).forEach((raw) => {
    const item = raw as unknown as BuyerSpendOrderItemJoined;
    const spend = Number(item.quantity) * Number(item.unit_price);
    totalSpend += spend;

    const product = item.products;
    const order = item.orders;

    const catalogId = resolveOrderItemCatalogProductId(
      { canonical_product_id: item.canonical_product_id, product_id: item.product_id },
      liveToCatalogUuid
    );
    const fromCatalog =
      catalogId != null ? categoryByCatalogId.get(catalogId) : undefined;
    const category =
      fromCatalog != null && String(fromCatalog).trim() !== ""
        ? String(fromCatalog)
        : product?.category || "Uncategorized";
    categorySpend.set(category, (categorySpend.get(category) || 0) + spend);

    // By month
    const month = new Date(order?.created_at).toISOString().slice(0, 7);
    monthlySpend.set(month, (monthlySpend.get(month) || 0) + spend);
  });

  // Convert to arrays
  const spendByCategory = Array.from(categorySpend.entries())
    .map(([category, spend]) => ({
      category,
      spend,
      percent: totalSpend > 0 ? (spend / totalSpend) * 100 : 0,
    }))
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 8);

  const spendTrend = Array.from(monthlySpend.entries())
    .map(([period, spend]) => ({ period, spend }))
    .sort((a, b) => a.period.localeCompare(b.period))
    .slice(-6);

  // Mock supplier spend (would need supplier tracking on orders)
  const spendBySupplier: SpendAnalytics["spend_by_supplier"] = [];

  return {
    total_spend: totalSpend,
    spend_by_supplier: spendBySupplier,
    spend_by_category: spendByCategory,
    spend_trend: spendTrend,
  };
}

async function getSavingsOpportunities(): Promise<SavingsOpportunity[]> {
  const supabase = await getSupabase();

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
      products!inner(name, sku),
      current_supplier:suppliers!margin_opportunities_current_supplier_id_fkey(name),
      recommended_supplier:suppliers!margin_opportunities_best_alternative_supplier_id_fkey(name)
    `)
    .eq("status", "open")
    .in("opportunity_band", ["major", "meaningful"])
    .order("estimated_savings_percent", { ascending: false })
    .limit(10);

  return (opportunities || []).map((o) => {
    const product = o.products as unknown as { name: string; sku: string };
    const currentSupplier = o.current_supplier as unknown as { name: string } | null;
    const recommendedSupplier = o.recommended_supplier as unknown as { name: string } | null;

    return {
      id: o.id,
      product_id: o.product_id,
      product_name: product?.name || "Unknown",
      product_sku: product?.sku || "",
      current_supplier: currentSupplier?.name || "Current",
      current_cost: Number(o.current_cost),
      recommended_supplier: recommendedSupplier?.name || "Alternative",
      recommended_cost: Number(o.best_alternative_cost),
      savings_per_case: Number(o.estimated_savings_per_case),
      savings_percent: Number(o.estimated_savings_percent),
      opportunity_band: o.opportunity_band,
      confidence: 0.85, // Would come from actual data
    };
  });
}

async function getBuyerDashboardData(): Promise<BuyerDashboardData> {
  const [savings, market, suppliers, risks, spend, opportunities] = await Promise.all([
    getSavingsSummary(),
    getMarketIntelligence(),
    getSupplierComparison(),
    getProcurementRisks(),
    getSpendAnalytics(),
    getSavingsOpportunities(),
  ]);

  return { savings, market, suppliers, risks, spend, opportunities };
}

// ============================================================================
// PAGE COMPONENT
// ============================================================================

async function DashboardContent() {
  const data = await getBuyerDashboardData();
  return <BuyerDashboardClient data={data} />;
}

export default function BuyerIntelligencePage() {
  return (
    <div>
      <PageHeader
        title="Buyer Intelligence"
        description="Platform value and procurement insights"
        breadcrumb={[
          { label: "Operations", href: "/admin" },
          { label: "Buyer Intelligence" },
        ]}
      />

      <Suspense fallback={<LoadingState message="Loading buyer intelligence..." />}>
        <DashboardContent />
      </Suspense>
    </div>
  );
}
