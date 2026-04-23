/**
 * Products Admin Page
 * 
 * Lists products with links to intelligence view
 */

import { Suspense } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import Link from "next/link";
import {
  PageHeader,
  StatCard,
  StatGrid,
  LoadingState,
  TableCard,
  TableToolbar,
  EmptyState,
} from "@/components/admin";
import { ProductsTableClient } from "./ProductsTableClient";

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

interface ProductListItem {
  id: string;
  sku: string;
  name: string;
  brand?: string;
  category?: string;
  price?: number;
  offer_count: number;
  has_margin_opportunity: boolean;
  has_alerts: boolean;
  best_trust_band?: string;
}

async function getProducts(searchParams: {
  category?: string;
  hasAlerts?: string;
  hasOpportunity?: string;
}): Promise<ProductListItem[]> {
  const supabase = await getSupabase();

  // Get products with offer counts and alert status
  let query = supabase
    .from("products")
    .select(`
      id,
      sku,
      name,
      brand,
      category,
      price
    `)
    .eq("in_stock", true)
    .order("name")
    .limit(100);

  if (searchParams.category) {
    query = query.eq("category", searchParams.category);
  }

  const { data: products } = await query;

  if (!products || products.length === 0) return [];

  const productIds = products.map((p) => String(p.id));

  // Get offer counts
  const { data: offerCounts } = await supabase
    .from("supplier_offers")
    .select("product_id")
    .in("product_id", productIds)
    .eq("is_active", true);

  const offerCountMap = new Map<string, number>();
  (offerCounts || []).forEach((o) => {
    const pid = String(o.product_id);
    offerCountMap.set(pid, (offerCountMap.get(pid) || 0) + 1);
  });

  // Get margin opportunities
  const { data: opportunities } = await supabase
    .from("margin_opportunities")
    .select("product_id, opportunity_band")
    .in("product_id", productIds)
    .in("opportunity_band", ["major", "meaningful"]);

  const oppSet = new Set((opportunities || []).map((o) => String(o.product_id)));

  // Get alerts
  const { data: alerts } = await supabase
    .from("procurement_alerts")
    .select("product_id")
    .in("product_id", productIds)
    .in("status", ["open", "acknowledged"]);

  const alertSet = new Set((alerts || []).map((a) => String(a.product_id)));

  // Get best trust bands
  const { data: trustScores } = await supabase
    .from("offer_trust_scores")
    .select("product_id, trust_band")
    .in("product_id", productIds)
    .order("trust_score", { ascending: false });

  const trustMap = new Map<string, string>();
  (trustScores || []).forEach((t) => {
    const pid = String(t.product_id);
    if (!trustMap.has(pid)) {
      trustMap.set(pid, t.trust_band);
    }
  });

  let result = products.map((p) => {
    const pid = String(p.id);
    return {
      id: pid,
      sku: p.sku,
      name: p.name,
      brand: p.brand,
      category: p.category,
      price: p.price,
      offer_count: offerCountMap.get(pid) || 0,
      has_margin_opportunity: oppSet.has(pid),
      has_alerts: alertSet.has(pid),
      best_trust_band: trustMap.get(pid),
    };
  });

  // Filter by alerts
  if (searchParams.hasAlerts === "true") {
    result = result.filter((p) => p.has_alerts);
  }

  // Filter by opportunity
  if (searchParams.hasOpportunity === "true") {
    result = result.filter((p) => p.has_margin_opportunity);
  }

  return result;
}

async function getStats() {
  const supabase = await getSupabase();

  const [
    { count: totalProducts },
    { count: withOffers },
    { count: withOpportunities },
    { count: withAlerts },
  ] = await Promise.all([
    supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("in_stock", true),
    supabase
      .from("supplier_offers")
      .select("product_id", { count: "exact", head: true })
      .eq("is_active", true),
    supabase
      .from("margin_opportunities")
      .select("*", { count: "exact", head: true })
      .in("opportunity_band", ["major", "meaningful"]),
    supabase
      .from("procurement_alerts")
      .select("*", { count: "exact", head: true })
      .in("status", ["open", "acknowledged"]),
  ]);

  return {
    total: totalProducts || 0,
    withOffers: withOffers || 0,
    withOpportunities: withOpportunities || 0,
    withAlerts: withAlerts || 0,
  };
}

async function getCategories(): Promise<string[]> {
  const supabase = await getSupabase();

  const { data } = await supabase
    .from("products")
    .select("category")
    .eq("in_stock", true)
    .not("category", "is", null);

  const unique = Array.from(new Set((data || []).map((p) => p.category).filter(Boolean))) as string[];
  return unique.sort();
}

async function ProductsContent({
  searchParams,
}: {
  searchParams: { category?: string; hasAlerts?: string; hasOpportunity?: string };
}) {
  const [products, stats, categories] = await Promise.all([
    getProducts(searchParams),
    getStats(),
    getCategories(),
  ]);

  return (
    <div className="space-y-6">
      <StatGrid columns={4}>
        <StatCard label="Total Products" value={stats.total} color="default" />
        <StatCard label="With Active Offers" value={stats.withOffers} color="blue" />
        <StatCard
          label="Margin Opportunities"
          value={stats.withOpportunities}
          color="green"
          href="/admin/products?hasOpportunity=true"
        />
        <StatCard
          label="With Alerts"
          value={stats.withAlerts}
          color={stats.withAlerts > 0 ? "amber" : "default"}
          href="/admin/products?hasAlerts=true"
        />
      </StatGrid>

      <ProductsTableClient
        products={products}
        categories={categories}
        currentFilters={searchParams}
      />
    </div>
  );
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; hasAlerts?: string; hasOpportunity?: string }>;
}) {
  const params = await searchParams;

  return (
    <div>
      <PageHeader
        title="Product Intelligence"
        description="Market analysis and supplier comparison for products"
        breadcrumb={[
          { label: "Operations", href: "/admin" },
          { label: "Products" },
        ]}
      />

      <Suspense fallback={<LoadingState message="Loading products..." />}>
        <ProductsContent searchParams={params} />
      </Suspense>
    </div>
  );
}
