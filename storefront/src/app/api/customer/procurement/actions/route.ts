import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { resolveCustomerProcurementGate } from "@/lib/procurement/customer-procurement-session";
import {
  handleCustomerProcurementAction,
  type CustomerProcurementActionBody,
} from "@/lib/procurement/customer-procurement-api-handling";

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("viewed_recommendation"),
    savings_opportunity_id: z.string().uuid(),
  }),
  z.object({
    action: z.literal("acknowledge_recommendation"),
    savings_opportunity_id: z.string().uuid(),
  }),
  z.object({
    action: z.literal("request_reorder"),
    savings_opportunity_id: z.string().uuid().optional(),
    reorder_memory_id: z.string().uuid().optional(),
    message: z.string().max(4000).optional(),
  }),
  z.object({
    action: z.literal("request_quote"),
    savings_opportunity_id: z.string().uuid(),
    message: z.string().max(4000).optional(),
  }),
  z.object({
    action: z.literal("ask_about_alternate"),
    savings_opportunity_id: z.string().uuid(),
    message: z.string().trim().min(1).max(4000),
  }),
  z.object({ action: z.literal("viewed_procurement_history") }),
  z.object({
    action: z.literal("contact_advisor"),
    message: z.string().trim().min(1).max(4000),
  }),
]);

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
  const supabase = getSupabaseAdmin() as any;
  const gate = await resolveCustomerProcurementGate(supabase);
  if (gate.kind === "active_company_required") {
    return NextResponse.json(
      {
        error: "Choose an active organization before using procurement actions.",
        code: "ACTIVE_COMPANY_REQUIRED",
        company_ids: gate.companyIds,
      },
      { status: 409 }
    );
  }
  if (gate.kind !== "ready") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const session = gate.session;

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

  const body = parsed.data as CustomerProcurementActionBody;
  if (body.action === "request_reorder" && !body.savings_opportunity_id && !body.reorder_memory_id) {
    return NextResponse.json({ error: "reorder_target_required" }, { status: 400 });
  }

  const result = await handleCustomerProcurementAction(supabase, session, body);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
