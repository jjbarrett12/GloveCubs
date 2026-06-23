import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminOperator } from "@/lib/admin/get-admin-user";
import { assignPoLineVariant, parsePoId } from "@/lib/admin/admin-purchase-orders";
import { logAdminExpressMutation } from "@/lib/admin/admin-express-mutation-log";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";

const bodySchema = z.object({
  line_index: z.number().int().min(0),
  catalog_variant_id: z.string().uuid(),
});

export async function POST(request: NextRequest, ctx: { params: { poId: string } }) {
  const operator = await getAdminOperator();
  if (!operator) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });

  const poId = parsePoId(ctx.params.poId);
  if (poId == null) return NextResponse.json({ error: "Invalid purchase order id" }, { status: 400 });

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
  const result = await assignPoLineVariant(
    supabase,
    poId,
    parsed.data.line_index,
    parsed.data.catalog_variant_id,
    operator.id,
  );

  logAdminExpressMutation({
    operatorId: operator.id,
    operatorEmail: operator.email,
    action: "purchase_order_receive",
    targetId: String(poId),
    success: result.success,
    httpStatus: result.status,
    error: result.error ?? undefined,
    detail: { assign_line_index: parsed.data.line_index, catalog_variant_id: parsed.data.catalog_variant_id },
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error, code: result.code }, { status: result.status });
  }
  return NextResponse.json({ success: true });
}
