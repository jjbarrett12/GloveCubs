import { NextResponse } from "next/server";
import { getAdminOperator } from "@/lib/admin/get-admin-user";
import { fetchAdminContactMessages } from "@/lib/admin/admin-contact-messages";
import { logAdminExpressMutation } from "@/lib/admin/admin-express-mutation-log";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export async function GET() {
  const operator = await getAdminOperator();
  if (!operator) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }

  const { rows, error } = await fetchAdminContactMessages();

  logAdminExpressMutation({
    operatorId: operator.id,
    operatorEmail: operator.email,
    action: "contact_messages_list",
    targetId: "all",
    success: !error,
    error: error ?? undefined,
    detail: { count: rows.length },
  });

  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  return NextResponse.json({ messages: rows });
}
