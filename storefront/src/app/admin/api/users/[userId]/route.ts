import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminOperator } from "@/lib/admin/get-admin-user";
import { expressAdminFetch } from "@/lib/admin/express-admin-bridge";
import { logAdminExpressMutation } from "@/lib/admin/admin-express-mutation-log";

const DISCOUNT_TIERS = ["standard", "bronze", "silver", "gold", "platinum"] as const;
const PAYMENT_TERMS = ["credit_card", "ach", "net30"] as const;

const bodySchema = z
  .object({
    is_approved: z.boolean().optional(),
    discount_tier: z.enum(DISCOUNT_TIERS).optional(),
    payment_terms: z.enum(PAYMENT_TERMS).optional(),
  })
  .refine((b) => b.is_approved !== undefined || b.discount_tier !== undefined || b.payment_terms !== undefined, {
    message: "At least one field required",
  });

export async function PUT(request: NextRequest, ctx: { params: { userId: string } }) {
  const operator = await getAdminOperator();
  if (!operator) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = ctx.params.userId.trim();
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
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

  const payload: Record<string, unknown> = {};
  if (parsed.data.is_approved !== undefined) payload.is_approved = parsed.data.is_approved;
  if (parsed.data.discount_tier !== undefined) payload.discount_tier = parsed.data.discount_tier;
  if (parsed.data.payment_terms !== undefined) payload.payment_terms = parsed.data.payment_terms;

  const result = await expressAdminFetch(operator, `/api/admin/users/${encodeURIComponent(userId)}`, {
    method: "PUT",
    json: payload,
  });

  if (!result.ok) {
    logAdminExpressMutation({
      operatorId: operator.id,
      operatorEmail: operator.email,
      action: "user_update",
      targetId: userId,
      success: false,
      httpStatus: result.status,
      error: result.error,
    });
    return NextResponse.json(
      { error: result.error, code: result.code ?? null },
      { status: result.status >= 400 && result.status < 600 ? result.status : 502 },
    );
  }

  logAdminExpressMutation({
    operatorId: operator.id,
    operatorEmail: operator.email,
    action: "user_update",
    targetId: userId,
    success: true,
    httpStatus: result.status,
    detail: { fields: Object.keys(payload) },
  });

  return NextResponse.json(result.data ?? { success: true });
}
