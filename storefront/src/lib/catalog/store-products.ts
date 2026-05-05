import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";

export type StoreProductRow = {
  id: string;
  name: string;
  slug: string;
  brandName: string | null;
  imageUrl: string | null;
};

type CatalogProduct = {
  id: string;
  name: string;
  slug: string;
  brand_id: string | null;
  status: string;
};

type ProductImage = {
  catalog_product_id: string;
  url: string;
  is_primary: boolean;
  sort_order: number | null;
};

/**
 * Lists active catalog_v2 products with brand name and primary/first gallery image.
 * Uses `any` for the admin client: generated `Database` types only include `public` schema.
 */
export async function fetchStoreProducts(): Promise<{ products: StoreProductRow[]; error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { products: [], error: "Supabase not configured" };
  }

  const supabase = getSupabaseAdmin() as any;

  const { data: products, error: productsError } = (await supabase
    .schema("catalog_v2")
    .from("catalog_products")
    .select("id, name, slug, brand_id, status")
    .eq("status", "active")
    .order("name")
    .limit(200)) as { data: CatalogProduct[] | null; error: { message: string } | null };

  if (productsError) {
    return { products: [], error: productsError.message };
  }
  if (!products?.length) {
    return { products: [], error: null };
  }

  const brandIds = Array.from(
    new Set(products.map((p) => p.brand_id).filter((id): id is string => id != null && id !== ""))
  );

  const brandMap = new Map<string, string>();
  if (brandIds.length > 0) {
    const { data: brands } = (await supabase
      .schema("catalogos")
      .from("brands")
      .select("id, name")
      .in("id", brandIds)) as { data: { id: string; name: string }[] | null };

    for (const b of brands ?? []) {
      brandMap.set(b.id, b.name);
    }
  }

  const productIds = products.map((p) => p.id);
  const { data: images } = (await supabase
    .schema("catalog_v2")
    .from("catalog_product_images")
    .select("catalog_product_id, url, is_primary, sort_order")
    .in("catalog_product_id", productIds)) as { data: ProductImage[] | null };

  const imageByProduct = new Map<string, string>();
  const sortedImages = [...(images ?? [])].sort((a, b) => {
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });
  for (const img of sortedImages) {
    if (!imageByProduct.has(img.catalog_product_id)) {
      imageByProduct.set(img.catalog_product_id, img.url);
    }
  }

  return {
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      brandName: p.brand_id ? brandMap.get(p.brand_id) ?? null : null,
      imageUrl: imageByProduct.get(p.id) ?? null,
    })),
    error: null,
  };
}
