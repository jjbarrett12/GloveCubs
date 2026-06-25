import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminOperator } from "@/lib/admin/get-admin-user";
import { expressAdminFetch } from "@/lib/admin/express-admin-bridge";
import { logAdminOrderMutation } from "@/lib/admin/admin-order-mutation-log";
import {
  ORDER_FULFILLMENT_ACTIONS_UNAVAILABLE_MESSAGE,
  resolveOrderFulfillmentAvailability,
} from "@/lib/admin/order-fulfillment-policy";

const uuidSchema = z.string().uuid();

const bodySchema = z.object({
  amount: z.number().positive().optional(),
  note: z.string().max(2000).optional(),
});

export async function POST(request: NextRequest, ctx: { params: { orderId: string } }) {
  const operator = await getAdminOperator();
  if (!operator) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orderId = ctx.params.orderId;
  if (!uuidSchema.safeParse(orderId).success) {
    return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
  }

  // Containment: fail closed before any Express bridge call so no AR/invoice
  // side effect occurs while the bridge is intentionally unavailable.
  const availability = resolveOrderFulfillmentAvailability();
  if (!availability.available) {
    logAdminOrderMutation({
      operatorId: operator.id,
      operatorEmail: operator.email,
      action: "invoice_payment",
      orderId,
      success: false,
      httpStatus: 503,
      error: availability.reason,
      detail: { code: availability.code },
    });
    return NextResponse.json(
      { error: ORDER_FULFILLMENT_ACTIONS_UNAVAILABLE_MESSAGE, code: availability.code },
      { status: 503 },
    );
  }

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

  const payload: { amount?: number; note?: string } = {};
  if (parsed.data.amount !== undefined) payload.amount = parsed.data.amount;
  if (parsed.data.note !== undefined) payload.note = parsed.data.note;

  const result = await expressAdminFetch(
    operator,
    `/api/admin/orders/${encodeURIComponent(orderId)}/invoice/payment`,
    { method: "POST", json: payload },
  );

  if (!result.ok) {
    logAdminOrderMutation({
      operatorId: operator.id,
      operatorEmail: operator.email,
      action: "invoice_payment",
      orderId,
      success: false,
      httpStatus: result.status,
      error: result.error,
      detail: { code: result.code ?? null },
    });
    return NextResponse.json(
      { error: result.error, code: result.code ?? null },
      { status: result.status >= 400 && result.status < 600 ? result.status : 502 },
    );
  }

  logAdminOrderMutation({
    operatorId: operator.id,
    operatorEmail: operator.email,
    action: "invoice_payment",
    orderId,
    success: true,
    httpStatus: result.status,
    detail: { amount: payload.amount ?? null },
  });

  return NextResponse.json(result.data ?? { success: true });
}
