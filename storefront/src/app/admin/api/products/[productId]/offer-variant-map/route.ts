import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminUser } from "@/lib/admin/get-admin-user";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { ADMIN_PRODUCT_UUID_RE } from "@/lib/admin/product-operations";
import { canMapOfferToVariant, OFFER_VARIANT_UUID_RE } from "@/lib/admin/offer-variant-map";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  offerId: z.string().uuid(),
  catalogVariantId: z.string().uuid().nullable(),
});

export async function PATCH(request: NextRequest, context: { params: { productId: string } }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const productId = context.params.productId?.trim();
  if (!productId || !ADMIN_PRODUCT_UUID_RE.test(productId)) {
    return NextResponse.json({ error: "Invalid product id" }, { status: 400 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = getSupabaseAdmin() as any;
  const { data: offer, error: offerErr } = await supabase
    .schema("catalogos")
    .from("supplier_offers")
    .select("id, product_id, catalog_variant_id")
    .eq("id", parsed.data.offerId)
    .maybeSingle();

  if (offerErr) {
    const msg = String(offerErr.message ?? "");
    if (msg.toLowerCase().includes("catalog_variant_id")) {
      return NextResponse.json({ error: "migration_pending" }, { status: 409 });
    }
    return NextResponse.json({ error: offerErr.message }, { status: 500 });
  }
  if (!offer || (offer as { product_id: string }).product_id !== productId) {
    return NextResponse.json({ error: "offer_not_on_product" }, { status: 400 });
  }

  let nextVariantId: string | null = parsed.data.catalogVariantId;
  if (nextVariantId) {
    if (!OFFER_VARIANT_UUID_RE.test(nextVariantId)) {
      return NextResponse.json({ error: "invalid_variant_id" }, { status: 400 });
    }
    const { data: variant, error: vErr } = await supabase
      .schema("catalog_v2")
      .from("catalog_variants")
      .select("id, catalog_product_id")
      .eq("id", nextVariantId)
      .maybeSingle();
    if (vErr || !variant) {
      return NextResponse.json({ error: "variant_not_found" }, { status: 400 });
    }
    const check = canMapOfferToVariant({
      offerProductId: productId,
      variantCatalogProductId: (variant as { catalog_product_id: string }).catalog_product_id,
      catalogVariantId: nextVariantId,
    });
    if (!check.ok) {
      return NextResponse.json({ error: check.reason }, { status: 400 });
    }
  }

  const { data: updated, error: upErr } = await supabase
    .schema("catalogos")
    .from("supplier_offers")
    .update({
      catalog_variant_id: nextVariantId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.offerId)
    .eq("product_id", productId)
    .select("id, catalog_variant_id, supplier_sku")
    .single();

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({
    offer: updated,
    mapped: nextVariantId != null,
  });
}
