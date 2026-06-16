import { NextResponse } from "next/server";
import { getAdminOperator } from "@/lib/admin/get-admin-user";
import { fetchAdminInventoryFromExpress } from "@/lib/admin/admin-inventory-express";
import { logAdminExpressMutation } from "@/lib/admin/admin-express-mutation-log";

export async function GET() {
  const operator = await getAdminOperator();
  if (!operator) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { rows, error, status } = await fetchAdminInventoryFromExpress(operator);

  logAdminExpressMutation({
    operatorId: operator.id,
    operatorEmail: operator.email,
    action: "inventory_list",
    targetId: "all",
    success: !error,
    httpStatus: status,
    error: error ?? undefined,
    detail: { count: rows.length },
  });

  if (error) {
    return NextResponse.json({ error }, { status: status >= 400 && status < 600 ? status : 502 });
  }

  return NextResponse.json({ rows });
}
