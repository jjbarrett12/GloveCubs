import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminOperator } from "@/lib/admin/get-admin-user";
import { expressAdminFetch } from "@/lib/admin/express-admin-bridge";
import { logAdminExpressMutation } from "@/lib/admin/admin-express-mutation-log";
import { fetchAdminPurchaseOrderDetailFromExpress } from "@/lib/admin/admin-purchase-orders-express";

const lineSchema = z.object({
  canonical_product_id: z.string().uuid(),
  quantity_received: z.number().int().positive(),
});

const bodySchema = z.object({
  lines: z.array(lineSchema).optional(),
});

function parsePoId(raw: string): number | null {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function buildReceiveLinesFromPo(po: {
  lines?: { canonical_product_id?: string; product_id?: string; quantity?: number }[];
}): { canonical_product_id: string; quantity_received: number }[] {
  const out: { canonical_product_id: string; quantity_received: number }[] = [];
  for (const line of po.lines ?? []) {
    const canon = line.canonical_product_id || line.product_id;
    if (!canon || typeof canon !== "string") continue;
    const qty = Math.max(1, parseInt(String(line.quantity ?? 1), 10) || 1);
    out.push({ canonical_product_id: canon, quantity_received: qty });
  }
  return out;
}

export async function POST(request: NextRequest, ctx: { params: { poId: string } }) {
  const operator = await getAdminOperator();
  if (!operator) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  let lines = parsed.data.lines;
  if (!lines?.length) {
    const detail = await fetchAdminPurchaseOrderDetailFromExpress(operator, poId);
    if (detail.error || !detail.po) {
      return NextResponse.json(
        { error: detail.error || "Could not load PO for receive" },
        { status: detail.status >= 400 ? detail.status : 502 },
      );
    }
    lines = buildReceiveLinesFromPo(detail.po);
    if (lines.length === 0) {
      return NextResponse.json(
        { error: "PO has no lines with canonical_product_id; cannot receive automatically." },
        { status: 400 },
      );
    }
  }

  const result = await expressAdminFetch(operator, `/api/admin/purchase-orders/${poId}/receive`, {
    method: "POST",
    json: { lines },
  });

  if (!result.ok) {
    logAdminExpressMutation({
      operatorId: operator.id,
      operatorEmail: operator.email,
      action: "purchase_order_receive",
      targetId: String(poId),
      success: false,
      httpStatus: result.status,
      error: result.error,
      detail: { line_count: lines.length },
    });
    return NextResponse.json(
      { error: result.error, code: result.code ?? null },
      { status: result.status >= 400 && result.status < 600 ? result.status : 502 },
    );
  }

  logAdminExpressMutation({
    operatorId: operator.id,
    operatorEmail: operator.email,
    action: "purchase_order_receive",
    targetId: String(poId),
    success: true,
    httpStatus: result.status,
    detail: { line_count: lines.length },
  });

  return NextResponse.json(result.data ?? { success: true });
}
