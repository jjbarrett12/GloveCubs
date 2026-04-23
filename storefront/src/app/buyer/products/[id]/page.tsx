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
    .schema('catalogos')
    .from('products')
    .select('id, name, sku, family_id, is_active, categories(slug)')
    .eq('id', id)
    .eq('is_active', true)
    .single();
  if (!data) return null;
  const cats = data.categories as { slug?: string } | { slug?: string }[] | null | undefined;
  const slug = Array.isArray(cats) ? cats[0]?.slug : cats?.slug;
  return {
    ...data,
    title: data.name as string,
    category: slug ?? null,
  };
}

async function getVariantsForProduct(
  familyId: string | null,
  fallbackId: string
): Promise<VariantOption[]> {
  const supabase = await getSupabase();
  if (!familyId) {
    const { data } = await supabase
      .schema('catalogos')
      .from('products')
      .select('id, sku, attributes')
      .eq('id', fallbackId)
      .eq('is_active', true)
      .single();
    if (!data) return [];
    const attrs = (data.attributes as Record<string, unknown> | null) ?? {};
    return [
      {
        id: data.id as string,
        sku: data.sku as string | null,
        size: (attrs.size as string | null) ?? null,
        color: (attrs.color as string | null) ?? null,
        is_listing_primary: true,
      },
    ];
  }
  const { data } = await supabase
    .schema('catalogos')
    .from('products')
    .select('id, sku, attributes, created_at')
    .eq('family_id', familyId)
    .eq('is_active', true)
    .order('sku', { ascending: true, nullsFirst: false });
  const rows = data ?? [];
  const primaryId =
    [...rows].sort(
      (a, b) =>
        String(a.sku ?? '').localeCompare(String(b.sku ?? '')) ||
        String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))
    )[0]?.id ?? null;
  return rows.map((row) => {
    const attrs = (row.attributes as Record<string, unknown> | null) ?? {};
    return {
      id: row.id as string,
      sku: row.sku as string | null,
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

  const variants = await getVariantsForProduct(
    (product.family_id as string | null) ?? null,
    productId
  );
  if (variants.length === 0) {
    notFound();
  }

  const supabase = await getSupabase();
  const primaryId =
    variants.find((v) => v.is_listing_primary)?.id ?? variants[0].id;
  const { data: headerRow } = await supabase
    .schema('catalogos')
    .from('products')
    .select('name')
    .eq('id', primaryId)
    .eq('is_active', true)
    .single();

  const displayName = (headerRow?.name as string | undefined) ?? (product.name as string);
  const displayTitle = (headerRow?.name as string | undefined) ?? (product.title as string | undefined);

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
