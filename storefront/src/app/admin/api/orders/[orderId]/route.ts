import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminOperator } from "@/lib/admin/get-admin-user";
import { expressAdminFetch } from "@/lib/admin/express-admin-bridge";
import { logAdminOrderMutation } from "@/lib/admin/admin-order-mutation-log";
import { ADMIN_SETTABLE_ORDER_STATUSES } from "@/lib/admin/admin-order-express-statuses";
import {
  ORDER_FULFILLMENT_ACTIONS_UNAVAILABLE_MESSAGE,
  resolveOrderFulfillmentAvailability,
} from "@/lib/admin/order-fulfillment-policy";

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

  // Containment: fail closed before any Express bridge call so no inventory,
  // AR, PO, email, or order-status side effect can occur while the bridge is
  // intentionally unavailable.
  const availability = resolveOrderFulfillmentAvailability();
  if (!availability.available) {
    logAdminOrderMutation({
      operatorId: operator.id,
      operatorEmail: operator.email,
      action: "order_update",
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
