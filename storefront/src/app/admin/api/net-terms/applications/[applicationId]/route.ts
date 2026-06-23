import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminOperator } from "@/lib/admin/get-admin-user";
import { applyAdminNetTermsDecision } from "@/lib/admin/admin-net-terms";
import { logAdminExpressMutation } from "@/lib/admin/admin-express-mutation-log";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";

const bodySchema = z.object({
  action: z.enum(["approve", "deny", "hold", "resume"]),
  decision_notes: z.string().max(2000).optional(),
  invoice_terms_code: z.enum(["net15", "net30", "custom"]).optional(),
  invoice_terms_custom: z.string().max(200).optional(),
  approved_credit_limit: z.union([z.number(), z.string()]).optional(),
  invoice_orders_allowed: z.boolean().optional(),
  internal_notes: z.string().max(2000).optional(),
});

export async function PATCH(request: NextRequest, ctx: { params: { applicationId: string } }) {
  const operator = await getAdminOperator();
  if (!operator) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }

  const applicationId = ctx.params.applicationId.trim();
  if (!z.string().uuid().safeParse(applicationId).success) {
    return NextResponse.json({ error: "Invalid application id" }, { status: 400 });
  }

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
  const result = await applyAdminNetTermsDecision(supabase, operator.id, applicationId, parsed.data);

  if (result.error) {
    logAdminExpressMutation({
      operatorId: operator.id,
      operatorEmail: operator.email,
      action: "net_terms_patch",
      targetId: applicationId,
      success: false,
      httpStatus: result.status,
      error: result.error,
      detail: { action: parsed.data.action },
    });
    return NextResponse.json(
      { error: result.error },
      { status: result.status >= 400 && result.status < 600 ? result.status : 500 },
    );
  }

  logAdminExpressMutation({
    operatorId: operator.id,
    operatorEmail: operator.email,
    action: "net_terms_patch",
    targetId: applicationId,
    success: true,
    httpStatus: result.status,
    detail: { action: parsed.data.action },
  });

  return NextResponse.json({ success: true, application: result.application });
}
