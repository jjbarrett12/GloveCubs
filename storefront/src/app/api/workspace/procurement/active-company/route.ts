import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { resolveCustomerProcurementGate } from "@/lib/procurement/customer-procurement-session";
import { resolveActiveCompanyId, setActiveCompanyForUser } from "@/lib/procurement/repo-active-company-resolve";

const bodySchema = z.object({
  company_id: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
  const supabase = getSupabaseAdmin() as any;
  const gate = await resolveCustomerProcurementGate(supabase);
  if (gate.kind === "sign_in_required" || gate.kind === "no_membership") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = gate.kind === "ready" ? gate.session.userId : gate.userId;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  const setRes = await setActiveCompanyForUser(userId, parsed.data.company_id, { supabase });
  if (!setRes.ok) {
    const status = setRes.code === "NOT_A_MEMBER" ? 403 : 400;
    return NextResponse.json({ error: setRes.error, code: setRes.code }, { status });
  }

  const r = await resolveActiveCompanyId(userId, { supabase });
  return NextResponse.json({
    ok: true,
    company_id: r.companyId,
    requires_company_selection: !!r.requiresSelection,
    company_ids: r.memberships || [],
  });
}
