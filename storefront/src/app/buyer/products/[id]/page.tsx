/**
 * Buyer Product Detail Page
 * 
 * Shows product information with supplier offer comparison.
 * Full supplier identity visibility for procurement decisions.
 */

import { Suspense } from 'react';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { ProductDetailClient, type VariantOption } from './ProductDetailClient';

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

async function getProductRow(id: string) {
  const supabase = await getSupabase();
  const { data } = await supabase
    .schema('catalog_v2')
    .from('catalog_products')
    .select('id, name, internal_sku, status, metadata')
    .eq('id', id)
    .eq('status', 'active')
    .single();
  if (!data) return null;
  return {
    ...data,
    title: data.name as string,
    category: null,
    family_id: null,
  };
}

async function getVariantsForProduct(
  _familyId: string | null,
  catalogProductId: string
): Promise<VariantOption[]> {
  const supabase = await getSupabase();
  const { data } = await supabase
    .schema('catalog_v2')
    .from('catalog_variants')
    .select('id, variant_sku, metadata, sort_order, created_at')
    .eq('catalog_product_id', catalogProductId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  const rows = data ?? [];
  const primaryId =
    [...rows].sort(
      (a, b) =>
        String(a.variant_sku ?? '').localeCompare(String(b.variant_sku ?? '')) ||
        String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))
    )[0]?.id ?? null;
  return rows.map((row) => {
    const attrs = (row.metadata as Record<string, unknown> | null) ?? {};
    return {
      id: row.id as string,
      sku: row.variant_sku as string | null,
      size: (attrs.size as string | null) ?? null,
      color: (attrs.color as string | null) ?? null,
      is_listing_primary: primaryId != null && row.id === primaryId,
    };
  });
}

async function ProductDetailContent({ productId }: { productId: string }) {
  const product = await getProductRow(productId);

  if (!product) {
    notFound();
  }

  const variants = await getVariantsForProduct(null, productId);
  if (variants.length === 0) {
    notFound();
  }

  const displayName = product.name as string;
  const displayTitle = (product.title as string | undefined) ?? displayName;

  return (
    <ProductDetailClient
      initialProductId={productId}
      displayName={displayName}
      displayTitle={displayTitle}
      category={product.category as string | null}
      variants={variants}
    />
  );
}

export default async function BuyerProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          }
        >
          <ProductDetailContent productId={id} />
        </Suspense>
      </div>
    </div>
  );
}
