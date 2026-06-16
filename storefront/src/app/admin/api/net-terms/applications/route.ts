import { NextRequest, NextResponse } from "next/server";
import { getAdminOperator } from "@/lib/admin/get-admin-user";
import { fetchAdminNetTermsApplicationsFromExpress } from "@/lib/admin/admin-net-terms-express";
import { logAdminExpressMutation } from "@/lib/admin/admin-express-mutation-log";

export async function GET(request: NextRequest) {
  const operator = await getAdminOperator();
  if (!operator) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const status = request.nextUrl.searchParams.get("status")?.trim() || undefined;
  const { applications, error, status: httpStatus } = await fetchAdminNetTermsApplicationsFromExpress(operator, status);

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
    return NextResponse.json({ error }, { status: httpStatus >= 400 && httpStatus < 600 ? httpStatus : 502 });
  }

  return NextResponse.json({ applications });
}
