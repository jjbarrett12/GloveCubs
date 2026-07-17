import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminOperator } from "@/lib/admin/get-admin-user";
import {
  buildReceiveLinesFromPo,
  fetchAdminPurchaseOrderById,
  parsePoId,
  receiveAdminPurchaseOrder,
} from "@/lib/admin/admin-purchase-orders";
import { logAdminExpressMutation } from "@/lib/admin/admin-express-mutation-log";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";

const lineSchema = z.object({
  catalog_variant_id: z.string().uuid(),
  quantity_received: z.number().int().min(0),
  quantity_damaged: z.number().int().min(0).optional(),
  bin_location: z.string().max(120).optional(),
  notes: z.string().max(500).optional(),
  unit_cost: z.number().optional(),
});

const bodySchema = z.object({
  lines: z.array(lineSchema).optional(),
  idempotency_key: z.string().max(120).optional(),
  receipt_notes: z.string().max(1000).optional(),
  allow_overage: z.boolean().optional(),
});

export async function POST(request: NextRequest, ctx: { params: { poId: string } }) {
  const operator = await getAdminOperator();
  if (!operator) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }

  const poId = parsePoId(ctx.params.poId);
  if (poId == null) return NextResponse.json({ error: "Invalid purchase order id" }, { status: 400 });

  let body: unknown = {};
  try {
    const text = await request.text();
    if (text.trim()) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  let lines = parsed.data.lines;
  if (!lines?.length) {
    const detail = await fetchAdminPurchaseOrderById(supabase, poId);
    if (detail.error || !detail.po) {
      return NextResponse.json(
        { error: detail.error || "Could not load PO for receive" },
        { status: detail.status >= 400 ? detail.status : 500 },
      );
    }
    lines = buildReceiveLinesFromPo(detail.po);
    if (lines.length === 0) {
      return NextResponse.json(
        { error: "PO has no remaining receivable lines with catalog_variant_id." },
        { status: 400 },
      );
    }
  }

  const positiveLines = lines.filter((l) => (l.quantity_received ?? 0) > 0 || (l.quantity_damaged ?? 0) > 0);
  if (positiveLines.length === 0) {
    return NextResponse.json({ error: "At least one line must have quantity_received or quantity_damaged" }, { status: 400 });
  }

  const result = await receiveAdminPurchaseOrder(supabase, poId, operator.id, positiveLines, {
    idempotencyKey: parsed.data.idempotency_key,
    receiptNotes: parsed.data.receipt_notes,
    allowOverage: parsed.data.allow_overage,
  });

  if (!result.success) {
    logAdminExpressMutation({
      operatorId: operator.id,
      operatorEmail: operator.email,
      action: "purchase_order_receive",
      targetId: String(poId),
      success: false,
      httpStatus: result.status,
      error: result.error ?? undefined,
      detail: { line_count: positiveLines.length },
    });
    return NextResponse.json(
      { error: result.error, code: result.code ?? null },
      { status: result.status >= 400 && result.status < 600 ? result.status : 500 },
    );
  }

  logAdminExpressMutation({
    operatorId: operator.id,
    operatorEmail: operator.email,
    action: "purchase_order_receive",
    targetId: String(poId),
    success: true,
    httpStatus: result.status,
    detail: { line_count: positiveLines.length },
  });

  return NextResponse.json({ success: true, po: result.po });
}
