import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminOperator } from "@/lib/admin/get-admin-user";
import { updateVariantFulfillment } from "@/lib/admin/variant-fulfillment-admin";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";

const bodySchema = z.object({
  fulfillment_mode: z.enum(["stocked", "dropship"]),
  inventory_visibility: z.enum(["hidden", "status", "quantity"]).default("hidden"),
  stock_enforcement: z.boolean().default(false),
  reorder_point: z.number().int().min(0).optional(),
  default_bin_location: z.string().max(120).nullable().optional(),
  default_location_code: z.string().max(64).optional(),
});

export async function POST(
  request: NextRequest,
  ctx: { params: { productId: string; variantId: string } },
) {
  const operator = await getAdminOperator();
  if (!operator) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const result = await updateVariantFulfillment(supabase, operator.id, {
    catalog_variant_id: ctx.params.variantId,
    ...parsed.data,
  });

  console.info(
    "[admin-variant-fulfillment]",
    JSON.stringify({
      ts: new Date().toISOString(),
      operator_id: operator.id,
      operator_email: operator.email,
      catalog_variant_id: ctx.params.variantId,
      catalog_product_id: ctx.params.productId,
      success: result.success,
      ...parsed.data,
    }),
  );

  if (!result.success) {
    return NextResponse.json({ error: result.error, code: result.code }, { status: result.status });
  }
  return NextResponse.json({ success: true });
}
