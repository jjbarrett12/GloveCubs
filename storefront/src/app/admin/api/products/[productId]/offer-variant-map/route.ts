import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminOperator } from "@/lib/admin/get-admin-user";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { ADMIN_PRODUCT_UUID_RE } from "@/lib/admin/product-operations";
import { canMapOfferToVariant, OFFER_VARIANT_UUID_RE } from "@/lib/admin/offer-variant-map";
import { isApprovedPublishedList, requireApprovedListToMap, validatePublishedListApproval, withOperatorApprovedSellPrice } from "@/lib/pricing/published-list-pricing";

export const dynamic = "force-dynamic";

const patchSchema = z
  .object({
    offerId: z.string().uuid(),
    catalogVariantId: z.string().uuid().nullable().optional(),
    sellPrice: z.number().finite().nullable().optional(),
  })
  .refine((d) => d.catalogVariantId !== undefined || d.sellPrice !== undefined, {
    message: "catalogVariantId or sellPrice required",
  });

export async function PATCH(request: NextRequest, context: { params: { productId: string } }) {
  const admin = await getAdminOperator();
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
    .select("id, product_id, catalog_variant_id, sell_price, sell_price_verified_at, cost")
    .eq("id", parsed.data.offerId)
    .maybeSingle();

  if (offerErr) {
    const msg = String(offerErr.message ?? "").toLowerCase();
    if (msg.includes("catalog_variant_id") || msg.includes("sell_price_verified_at")) {
      return NextResponse.json({ error: "migration_pending" }, { status: 409 });
    }
    return NextResponse.json({ error: offerErr.message }, { status: 500 });
  }
  if (!offer || (offer as { product_id: string }).product_id !== productId) {
    return NextResponse.json({ error: "offer_not_on_product" }, { status: 400 });
  }

  const verifiedBy = admin.email?.trim() || admin.id;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (parsed.data.sellPrice !== undefined) {
    if (parsed.data.sellPrice != null) {
      const gate = validatePublishedListApproval({
        cost: (offer as { cost: number | null }).cost,
        sellPrice: parsed.data.sellPrice,
      });
      if (!gate.ok) {
        return NextResponse.json(
          {
            error: gate.reason,
            cost: gate.cost,
            sellPrice: gate.sellPrice,
            minimumSafeList: gate.minimumSafeList,
            kodiak: gate.kodiak,
            kodiakGmPercent: gate.kodiakGmPercent,
          },
          { status: 400 }
        );
      }
    }
    Object.assign(
      patch,
      withOperatorApprovedSellPrice({}, { sellPrice: parsed.data.sellPrice, verifiedBy })
    );
  }

  let nextVariantId: string | null | undefined = parsed.data.catalogVariantId;
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
    const listCheck = requireApprovedListToMap({
      sellPrice:
        parsed.data.sellPrice !== undefined
          ? parsed.data.sellPrice
          : (offer as { sell_price: number | null }).sell_price,
      verifiedAt:
        parsed.data.sellPrice !== undefined
          ? parsed.data.sellPrice != null && parsed.data.sellPrice > 0
            ? String(patch.sell_price_verified_at ?? "")
            : null
          : (offer as { sell_price_verified_at: string | null }).sell_price_verified_at,
    });
    if (!listCheck.ok) {
      return NextResponse.json({ error: "list_unapproved" }, { status: 400 });
    }
    patch.catalog_variant_id = nextVariantId;
  } else if (nextVariantId === null) {
    patch.catalog_variant_id = null;
  }

  const { data: updated, error: upErr } = await supabase
    .schema("catalogos")
    .from("supplier_offers")
    .update(patch)
    .eq("id", parsed.data.offerId)
    .eq("product_id", productId)
    .select("id, catalog_variant_id, supplier_sku, sell_price, sell_price_verified_at")
    .single();

  if (upErr) {
    const msg = String(upErr.message ?? "").toLowerCase();
    if (msg.includes("sell_price_verified_at")) {
      return NextResponse.json({ error: "migration_pending" }, { status: 409 });
    }
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const row = updated as {
    catalog_variant_id: string | null;
    sell_price: number | null;
    sell_price_verified_at: string | null;
  };
  return NextResponse.json({
    offer: updated,
    mapped: row.catalog_variant_id != null,
    listApproved: isApprovedPublishedList({
      sellPrice: row.sell_price,
      verifiedAt: row.sell_price_verified_at,
    }),
  });
}
