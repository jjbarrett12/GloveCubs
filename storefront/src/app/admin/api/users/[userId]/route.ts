import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminOperator } from "@/lib/admin/get-admin-user";
import { updateAdminUser } from "@/lib/admin/admin-users";
import { logAdminExpressMutation } from "@/lib/admin/admin-express-mutation-log";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";

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

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }

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

  const supabase = getSupabaseAdmin();
  const result = await updateAdminUser(supabase, userId, parsed.data);

  if (result.error) {
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
      { error: result.error },
      { status: result.status >= 400 && result.status < 600 ? result.status : 500 },
    );
  }

  logAdminExpressMutation({
    operatorId: operator.id,
    operatorEmail: operator.email,
    action: "user_update",
    targetId: userId,
    success: true,
    httpStatus: result.status,
    detail: { fields: Object.keys(parsed.data) },
  });

  return NextResponse.json({ success: true, user: result.user });
}
