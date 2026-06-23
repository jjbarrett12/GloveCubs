import { NextRequest, NextResponse } from "next/server";
import { getAdminOperator } from "@/lib/admin/get-admin-user";
import { fetchAdminNetTermsApplications } from "@/lib/admin/admin-net-terms";
import { logAdminExpressMutation } from "@/lib/admin/admin-express-mutation-log";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const operator = await getAdminOperator();
  if (!operator) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }

  const status = request.nextUrl.searchParams.get("status")?.trim() || undefined;
  const supabase = getSupabaseAdmin();
  const { applications, error, status: httpStatus } = await fetchAdminNetTermsApplications(supabase, status);

  logAdminExpressMutation({
    operatorId: operator.id,
    operatorEmail: operator.email,
    action: "net_terms_list",
    targetId: "all",
    success: !error,
    httpStatus,
    error: error ?? undefined,
    detail: { count: applications.length, filter_status: status ?? null },
  });

  if (error) {
    return NextResponse.json({ error }, { status: httpStatus >= 400 && httpStatus < 600 ? httpStatus : 500 });
  }

  return NextResponse.json({ applications });
}
