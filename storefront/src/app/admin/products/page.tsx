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

type V2ProductRow = {
  id: string;
  internal_sku: string | null;
  name: string;
  slug: string;
  brand_id: string | null;
};

async function getProducts(searchParams: {
  category?: string;
  hasAlerts?: string;
  hasOpportunity?: string;
}): Promise<ProductListItem[]> {
  const supabase = await getSupabase();

  const { data: products, error: productsError } = await supabase
    .schema("catalog_v2")
    .from("catalog_products")
    .select("id, internal_sku, name, slug, brand_id")
    .eq("status", "active")
    .order("name")
    .limit(100);

  if (productsError) throw new Error(`catalog_v2.catalog_products: ${productsError.message}`);
  if (!products || products.length === 0) return [];

  const productIds = products.map((p) => String((p as V2ProductRow).id));

  const { data: offerCounts, error: offerErr } = await supabase
    .from("supplier_offers")
    .select("product_id")
    .in("product_id", productIds)
    .eq("is_active", true);
  if (offerErr) throw new Error(`supplier_offers: ${offerErr.message}`);

  const offerCountMap = new Map<string, number>();
  (offerCounts || []).forEach((o) => {
    const pid = String(o.product_id);
    offerCountMap.set(pid, (offerCountMap.get(pid) || 0) + 1);
  });

  const brandIds = [...new Set(products.map((p) => (p as V2ProductRow).brand_id).filter(Boolean))] as string[];
  const brandNameById = new Map<string, string>();
  if (brandIds.length > 0) {
    const { data: brands, error: bErr } = await supabase
      .schema("catalogos")
      .from("brands")
      .select("id, name")
      .in("id", brandIds);
    if (bErr) throw new Error(`catalogos.brands: ${bErr.message}`);
    (brands || []).forEach((b: { id: string; name: string }) => brandNameById.set(b.id, b.name));
  }

  let result = (products as V2ProductRow[]).map((p) => {
    const pid = String(p.id);
    return {
      id: pid,
      sku: p.internal_sku ?? "",
      name: p.name,
      brand: p.brand_id ? brandNameById.get(p.brand_id) : undefined,
      category: undefined,
      price: undefined,
      offer_count: offerCountMap.get(pid) || 0,
      has_margin_opportunity: false,
      has_alerts: false,
      best_trust_band: undefined,
    };
  });

  if (searchParams.category) {
    result = [];
  }
  if (searchParams.hasAlerts === "true") {
    result = result.filter((p) => p.has_alerts);
  }
  if (searchParams.hasOpportunity === "true") {
    result = result.filter((p) => p.has_margin_opportunity);
  }

  return result;
}

async function getStats() {
  const supabase = await getSupabase();

  const [
    { count: totalProducts, error: totalErr },
    { count: withOffers, error: offersCountErr },
  ] = await Promise.all([
    supabase
      .schema("catalog_v2")
      .from("catalog_products")
      .select("*", { count: "exact", head: true })
      .eq("status", "active"),
    supabase.from("supplier_offers").select("product_id", { count: "exact", head: true }).eq("is_active", true),
  ]);

  if (totalErr) throw new Error(`catalog_v2.catalog_products count: ${totalErr.message}`);
  if (offersCountErr) throw new Error(`supplier_offers count: ${offersCountErr.message}`);

  return {
    total: totalProducts || 0,
    withOffers: withOffers || 0,
    withOpportunities: 0,
    withAlerts: 0,
  };
}

async function getCategories(): Promise<string[]> {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .schema("catalogos")
    .from("categories")
    .select("slug")
    .order("slug");
  if (error) throw new Error(`catalogos.categories: ${error.message}`);
  return Array.from(new Set((data || []).map((c) => c.slug).filter(Boolean))) as string[];
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

  const filtersActive = Boolean(
    searchParams.category || searchParams.hasAlerts === "true" || searchParams.hasOpportunity === "true",
  );
  const showCanonicalEmpty = stats.total === 0 && !filtersActive;

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
        showCanonicalEmpty={showCanonicalEmpty}
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
