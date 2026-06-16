import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminOperator } from "@/lib/admin/get-admin-user";
import { expressAdminFetch } from "@/lib/admin/express-admin-bridge";
import { logAdminOrderMutation } from "@/lib/admin/admin-order-mutation-log";
import { ADMIN_SETTABLE_ORDER_STATUSES } from "@/lib/admin/admin-order-express-statuses";

const uuidSchema = z.string().uuid();

const bodySchema = z
  .object({
    status: z.enum(ADMIN_SETTABLE_ORDER_STATUSES).optional(),
    tracking_number: z.string().max(200).optional(),
    tracking_url: z.string().max(2000).optional(),
    carrier: z.string().max(120).optional(),
  })
  .refine((b) => b.status !== undefined || b.tracking_number !== undefined || b.tracking_url !== undefined || b.carrier !== undefined, {
    message: "At least one field required",
  });

export async function PATCH(request: NextRequest, ctx: { params: { orderId: string } }) {
  const operator = await getAdminOperator();
  if (!operator) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orderId = ctx.params.orderId;
  if (!uuidSchema.safeParse(orderId).success) {
    return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
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

  const payload: Record<string, string> = {};
  if (parsed.data.status !== undefined) payload.status = parsed.data.status;
  if (parsed.data.tracking_number !== undefined) payload.tracking_number = parsed.data.tracking_number;
  if (parsed.data.tracking_url !== undefined) payload.tracking_url = parsed.data.tracking_url;
  if (parsed.data.carrier !== undefined) payload.carrier = parsed.data.carrier;

  const result = await expressAdminFetch(operator, `/api/admin/orders/${encodeURIComponent(orderId)}`, {
    method: "PUT",
    json: payload,
  });

  if (!result.ok) {
    logAdminOrderMutation({
      operatorId: operator.id,
      operatorEmail: operator.email,
      action: "order_update",
      orderId,
      success: false,
      httpStatus: result.status,
      error: result.error,
      detail: { code: result.code ?? null },
    });
    return NextResponse.json(
      { error: result.error, code: result.code ?? null, blocked_lines: (result.body as { blocked_lines?: unknown })?.blocked_lines },
      { status: result.status >= 400 && result.status < 600 ? result.status : 502 },
    );
  }

  logAdminOrderMutation({
    operatorId: operator.id,
    operatorEmail: operator.email,
    action: "order_update",
    orderId,
    success: true,
    httpStatus: result.status,
    detail: { fields: Object.keys(payload) },
  });

  return NextResponse.json(result.data ?? { success: true });
}
