import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin/get-admin-user";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const companyId = request.nextUrl.searchParams.get("company_id")?.trim();
  if (!companyId) {
    return NextResponse.json({ error: "company_id query required" }, { status: 400 });
  }
  const trustStatus = request.nextUrl.searchParams.get("trust_status")?.trim();
  const supabase = getSupabaseAdmin() as any;
  let query = supabase
    .schema("gc_commerce")
    .from("savings_opportunities")
    .select(
      "id, company_id, source_invoice_line_id, source_catalog_product_id, candidate_catalog_product_id, spec_group_id, substitution_candidate_id, basis_uom, source_unit_price_normalized, candidate_unit_price_normalized, estimated_delta_per_basis, trust_status, block_reason, reviewed_at, reviewed_by, created_at"
    )
    .eq("company_id", companyId);
  if (trustStatus) {
    query = query.eq("trust_status", trustStatus);
  }
  const { data, error } = await query.order("created_at", { ascending: false }).limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ opportunities: data ?? [] });
}
