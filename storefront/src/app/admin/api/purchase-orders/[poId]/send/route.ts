import { NextResponse } from "next/server";
import { getAdminOperator } from "@/lib/admin/get-admin-user";
import { parsePoId, sendAdminPurchaseOrder } from "@/lib/admin/admin-purchase-orders";
import { logAdminExpressMutation } from "@/lib/admin/admin-express-mutation-log";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";

export async function POST(_request: Request, ctx: { params: { poId: string } }) {
  const operator = await getAdminOperator();
  if (!operator) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }

  const poId = parsePoId(ctx.params.poId);
  if (poId == null) return NextResponse.json({ error: "Invalid purchase order id" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const result = await sendAdminPurchaseOrder(supabase, poId, operator.id);

  if (!result.success) {
    logAdminExpressMutation({
      operatorId: operator.id,
      operatorEmail: operator.email,
      action: "purchase_order_send",
      targetId: String(poId),
      success: false,
      httpStatus: result.status,
      error: result.error ?? undefined,
    });
    return NextResponse.json(
      { error: result.error, code: result.code ?? null },
      { status: result.status >= 400 && result.status < 600 ? result.status : 500 },
    );
  }

  logAdminExpressMutation({
    operatorId: operator.id,
    operatorEmail: operator.email,
    action: "purchase_order_send",
    targetId: String(poId),
    success: true,
    httpStatus: result.status,
  });

  return NextResponse.json({
    success: true,
    sent: result.sent,
    po_number: result.po_number,
  });
}
