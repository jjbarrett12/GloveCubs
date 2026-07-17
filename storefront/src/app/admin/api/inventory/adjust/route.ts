import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminOperator } from "@/lib/admin/get-admin-user";
import { adjustAdminInventory } from "@/lib/admin/admin-inventory";
import { adjustAdminVariantInventory } from "@/lib/admin/admin-variant-inventory";
import { logAdminExpressMutation } from "@/lib/admin/admin-express-mutation-log";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";

const variantBodySchema = z.object({
  catalog_variant_id: z.string().uuid(),
  delta: z.number().int().refine((n) => n !== 0, { message: "delta must be non-zero" }),
  reason: z.string().min(1).max(500),
  location_code: z.string().max(64).optional(),
});

const legacyBodySchema = z.object({
  product_id: z.string().uuid(),
  delta: z.number().int().refine((n) => n !== 0, { message: "delta must be non-zero" }),
  reason: z.string().max(500).optional(),
});

export async function POST(request: NextRequest) {
  const operator = await getAdminOperator();
  if (!operator) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const asVariant = variantBodySchema.safeParse(body);
  if (asVariant.success) {
    const { catalog_variant_id, delta, reason, location_code } = asVariant.data;
    const result = await adjustAdminVariantInventory(supabase, operator.id, {
      catalog_variant_id,
      delta,
      reason,
      location_code,
    });
    if (!result.success) {
      logAdminExpressMutation({
        operatorId: operator.id,
        operatorEmail: operator.email,
        action: "inventory_adjust",
        targetId: catalog_variant_id,
        success: false,
        httpStatus: result.status,
        error: result.error ?? undefined,
        detail: { code: result.code ?? null, delta },
      });
      return NextResponse.json(
        { error: result.error, code: result.code ?? null },
        { status: result.status >= 400 && result.status < 600 ? result.status : 500 },
      );
    }
    logAdminExpressMutation({
      operatorId: operator.id,
      operatorEmail: operator.email,
      action: "inventory_adjust",
      targetId: catalog_variant_id,
      success: true,
      httpStatus: result.status,
      detail: { delta },
    });
    return NextResponse.json({ success: true, stock: result.stock });
  }

  const asLegacy = legacyBodySchema.safeParse(body);
  if (!asLegacy.success) {
    return NextResponse.json({ error: "Invalid body", details: asLegacy.error.flatten() }, { status: 400 });
  }

  const { product_id, delta, reason } = asLegacy.data;
  const result = await adjustAdminInventory(supabase, operator.id, {
    product_id,
    delta,
    reason: reason?.trim() || "Admin adjustment (Next)",
  });

  if (!result.success) {
    logAdminExpressMutation({
      operatorId: operator.id,
      operatorEmail: operator.email,
      action: "inventory_adjust",
      targetId: product_id,
      success: false,
      httpStatus: result.status,
      error: result.error ?? undefined,
      detail: { code: result.code ?? null, delta },
    });
    return NextResponse.json(
      { error: result.error, code: result.code ?? null },
      { status: result.status >= 400 && result.status < 600 ? result.status : 500 },
    );
  }

  logAdminExpressMutation({
    operatorId: operator.id,
    operatorEmail: operator.email,
    action: "inventory_adjust",
    targetId: product_id,
    success: true,
    httpStatus: result.status,
    detail: { delta },
  });

  return NextResponse.json({ success: true, stock: result.stock });
}
