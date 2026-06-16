import { NextResponse } from "next/server";
import { getAdminOperator } from "@/lib/admin/get-admin-user";
import { expressAdminFetch } from "@/lib/admin/express-admin-bridge";
import { logAdminExpressMutation } from "@/lib/admin/admin-express-mutation-log";

function parsePoId(raw: string): number | null {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function POST(_request: Request, ctx: { params: { poId: string } }) {
  const operator = await getAdminOperator();
  if (!operator) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const poId = parsePoId(ctx.params.poId);
  if (poId == null) return NextResponse.json({ error: "Invalid purchase order id" }, { status: 400 });

  const result = await expressAdminFetch(operator, `/api/admin/purchase-orders/${poId}/send`, {
    method: "POST",
    json: {},
  });

  if (!result.ok) {
    logAdminExpressMutation({
      operatorId: operator.id,
      operatorEmail: operator.email,
      action: "purchase_order_send",
      targetId: String(poId),
      success: false,
      httpStatus: result.status,
      error: result.error,
    });
    return NextResponse.json(
      { error: result.error, code: result.code ?? null },
      { status: result.status >= 400 && result.status < 600 ? result.status : 502 },
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

  return NextResponse.json(result.data ?? { success: true });
}
