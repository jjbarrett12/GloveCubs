import { NextResponse } from "next/server";
import { getAdminOperator } from "@/lib/admin/get-admin-user";
import { fetchAdminInventory } from "@/lib/admin/admin-variant-inventory";
import { logAdminExpressMutation } from "@/lib/admin/admin-express-mutation-log";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";

export async function GET() {
  const operator = await getAdminOperator();
  if (!operator) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }

  const supabase = getSupabaseAdmin();
  const { rows, error, status } = await fetchAdminInventory(supabase);

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
    return NextResponse.json({ error }, { status: status >= 400 && status < 600 ? status : 500 });
  }

  return NextResponse.json({ rows });
}
