import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { randomBytes } from "crypto";

export type ProductWriteInput = {
  name: string;
  brandName: string;
  categoryId: string;
  material: string;
  color: string;
  milThickness: string;
  casePack: string;
  description: string;
  primaryImageUrl: string;
  status: "draft" | "active";
  quoteOnly: boolean;
  variants: Array<{ sizeCode: string; variantSku: string; listPrice: string }>;
};

function slugifyBase(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "product";
}

async function pickDefaultProductTypeId(supabase: any): Promise<string | null> {
  const { data } = await supabase
    .schema("catalog_v2")
    .from("catalog_product_types")
    .select("id")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

async function resolveBrandId(supabase: any, brandName: string): Promise<string | null> {
  const t = brandName.trim();
  if (!t) return null;
  const { data } = await supabase
    .schema("catalogos")
    .from("brands")
    .select("id")
    .ilike("name", t)
    .limit(1)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

async function uniqueSlug(supabase: any, base: string): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const suffix = i === 0 ? "" : `-${randomBytes(2).toString("hex")}`;
    const slug = `${base}${suffix}`.slice(0, 120);
    const { data } = await supabase.schema("catalog_v2").from("catalog_products").select("id").eq("slug", slug).maybeSingle();
    if (!data) return slug;
  }
  return `${base}-${randomBytes(4).toString("hex")}`.slice(0, 120);
}

async function uniqueVariantSku(supabase: any, base: string): Promise<string> {
  const b = base.slice(0, 80);
  for (let i = 0; i < 8; i++) {
    const sku = i === 0 ? b : `${b}-${randomBytes(2).toString("hex")}`;
    const { data } = await supabase.schema("catalog_v2").from("catalog_variants").select("id").eq("variant_sku", sku).maybeSingle();
    if (!data) return sku;
  }
  return `${b}-${randomBytes(4).toString("hex")}`.slice(0, 120);
}

function buildMetadata(input: ProductWriteInput, brandNameUnmatched: boolean): Record<string, unknown> {
  const meta: Record<string, unknown> = {
    quote_only: input.quoteOnly,
  };
  if (input.categoryId.trim()) {
    meta.category_id = input.categoryId.trim();
  }
  if (input.material.trim()) meta.material = input.material.trim();
  if (input.color.trim()) meta.color = input.color.trim();
  if (input.milThickness.trim()) meta.mil_thickness = input.milThickness.trim();
  if (input.casePack.trim()) meta.case_pack = input.casePack.trim();
  if (brandNameUnmatched && input.brandName.trim()) {
    meta.brand_name_hint = input.brandName.trim();
  }
  return meta;
}

export async function insertCatalogProduct(input: ProductWriteInput): Promise<{ id: string } | { error: string }> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured." };
  const supabase = getSupabaseAdmin() as any;

  const typeId = await pickDefaultProductTypeId(supabase);
  if (!typeId) return { error: "No active catalog_product_types row found." };

  const brandId = await resolveBrandId(supabase, input.brandName);
  const brandUnmatched = Boolean(input.brandName.trim()) && !brandId;

  const slug = await uniqueSlug(supabase, slugifyBase(input.name));
  const internalSku = `GC-${randomBytes(3).toString("hex").toUpperCase()}`;

  const status = input.status;
  const metadata = buildMetadata(input, brandUnmatched);

  const { data: product, error: pErr } = await supabase
    .schema("catalog_v2")
    .from("catalog_products")
    .insert({
      product_type_id: typeId,
      brand_id: brandId,
      slug,
      internal_sku: internalSku,
      name: input.name.trim(),
      description: input.description.trim() || null,
      status: "draft",
      metadata,
    })
    .select("id")
    .single();

  if (pErr || !product) {
    return { error: pErr?.message ?? "Failed to create product." };
  }
  const productId = (product as { id: string }).id;

  const variants = input.variants.length
    ? input.variants
    : [{ sizeCode: "OS", variantSku: `${slug}-os`.toUpperCase(), listPrice: "" }];

  let sort = 0;
  for (const v of variants) {
    const skuBase = v.variantSku.trim() || `${internalSku}-${v.sizeCode || "SZ"}`.toUpperCase();
    const variantSku = await uniqueVariantSku(supabase, skuBase);
    const priceRaw = v.listPrice.trim();
    const listPrice = priceRaw === "" ? null : Number.parseFloat(priceRaw);
    const vmeta: Record<string, unknown> = {};
    if (!input.quoteOnly && listPrice != null && Number.isFinite(listPrice)) vmeta.list_price = listPrice;

    const { error: vErr } = await supabase.schema("catalog_v2").from("catalog_variants").insert({
      catalog_product_id: productId,
      variant_sku: variantSku,
      sort_order: sort++,
      is_active: true,
      size_code: v.sizeCode.trim() || null,
      metadata: vmeta,
    });
    if (vErr) {
      await supabase.schema("catalog_v2").from("catalog_products").delete().eq("id", productId);
      return { error: vErr.message };
    }
  }

  const img = input.primaryImageUrl.trim();
  if (img) {
    const { error: iErr } = await supabase.schema("catalog_v2").from("catalog_product_images").insert({
      catalog_product_id: productId,
      url: img,
      is_primary: true,
      sort_order: 0,
      metadata: {
        image_provenance: "editorial",
        source: "admin_product_form",
      },
    });
    if (iErr) {
      await supabase.schema("catalog_v2").from("catalog_products").delete().eq("id", productId);
      return { error: iErr.message };
    }
  }

  if (status === "active") {
    const { error: uErr } = await supabase.schema("catalog_v2").from("catalog_products").update({ status: "active" }).eq("id", productId);
    if (uErr) {
      return { error: uErr.message };
    }
  }

  return { id: productId };
}

export async function updateCatalogProduct(
  productId: string,
  input: ProductWriteInput
): Promise<{ ok: true } | { error: string }> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured." };
  const supabase = getSupabaseAdmin() as any;

  const brandId = await resolveBrandId(supabase, input.brandName);
  const brandUnmatched = Boolean(input.brandName.trim()) && !brandId;
  const metadata = buildMetadata(input, brandUnmatched);

  const targetStatus = input.status;

  const { error: pErr } = await supabase
    .schema("catalog_v2")
    .from("catalog_products")
    .update({
      name: input.name.trim(),
      description: input.description.trim() || null,
      brand_id: brandId,
      metadata,
      status: "draft",
    })
    .eq("id", productId);

  if (pErr) return { error: pErr.message };

  await supabase.schema("catalog_v2").from("catalog_variants").delete().eq("catalog_product_id", productId);

  const variants = input.variants.length
    ? input.variants
    : [{ sizeCode: "OS", variantSku: "", listPrice: "" }];

  let sort = 0;
  for (const v of variants) {
    const skuBase = v.variantSku.trim() || `SKU-${productId.slice(0, 8)}-${sort}`.toUpperCase();
    const variantSku = await uniqueVariantSku(supabase, skuBase);
    const priceRaw = v.listPrice.trim();
    const listPrice = priceRaw === "" ? null : Number.parseFloat(priceRaw);
    const vmeta: Record<string, unknown> = {};
    if (!input.quoteOnly && listPrice != null && Number.isFinite(listPrice)) vmeta.list_price = listPrice;

    const { error: vErr } = await supabase.schema("catalog_v2").from("catalog_variants").insert({
      catalog_product_id: productId,
      variant_sku: variantSku,
      sort_order: sort++,
      is_active: true,
      size_code: v.sizeCode.trim() || null,
      metadata: vmeta,
    });
    if (vErr) return { error: vErr.message };
  }

  await supabase.schema("catalog_v2").from("catalog_product_images").delete().eq("catalog_product_id", productId);

  const img = input.primaryImageUrl.trim();
  if (img) {
    const { error: iErr } = await supabase.schema("catalog_v2").from("catalog_product_images").insert({
      catalog_product_id: productId,
      url: img,
      is_primary: true,
      sort_order: 0,
      metadata: {
        image_provenance: "editorial",
        source: "admin_product_form",
      },
    });
    if (iErr) return { error: iErr.message };
  }

  if (targetStatus === "active") {
    const { error: uErr } = await supabase.schema("catalog_v2").from("catalog_products").update({ status: "active" }).eq("id", productId);
    if (uErr) return { error: uErr.message };
  }

  return { ok: true };
}

export async function promoteStagingToDraftProduct(
  stagingId: string,
  input: ProductWriteInput,
  createdBy: string | null
): Promise<{ productId: string } | { error: string }> {
  const created = await insertCatalogProduct({ ...input, status: "draft" });
  if ("error" in created) return created;

  const supabase = getSupabaseAdmin() as any;
  await supabase
    .schema("catalog_v2")
    .from("admin_url_clipboard_staging")
    .update({
      review_status: "converted_to_draft",
      created_catalog_product_id: created.id,
    })
    .eq("id", stagingId);

  void createdBy;
  return { productId: created.id };
}
