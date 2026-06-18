import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import {
  assertCustomerCompanyAccess,
  redirectsToAccountHub,
  resolveCustomerProcurementGate,
} from "@/lib/procurement/customer-procurement-session";
import { buildReorderQuotePayload } from "@/lib/account/reorder-to-quote-read-model";
import { isGcReorderToQuoteEnabled } from "@/lib/account/buyer-orders-read-model";

const bodySchema = z.object({
  orderId: z.string().uuid(),
  selectedLineIds: z.array(z.string().uuid()).optional().nullable(),
});

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  if (!isGcReorderToQuoteEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

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

  const supabase = getSupabaseAdmin() as any;
  const gate = await resolveCustomerProcurementGate(supabase);
  if (gate.kind === "sign_in_required") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (redirectsToAccountHub(gate)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { userId, companyId } = gate.session;
  const allowed = await assertCustomerCompanyAccess(supabase, userId, companyId);
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { orderId, selectedLineIds } = parsed.data;
  const { payload, error } = await buildReorderQuotePayload(supabase, companyId, orderId, {
    selectedLineIds: selectedLineIds ?? undefined,
  });

  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }
  if (!payload) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  return NextResponse.json({
    sourceOrder: payload.sourceOrder,
    availableLines: payload.availableLines,
    blockedLines: payload.blockedLines,
    summary: payload.summary,
  });
}
