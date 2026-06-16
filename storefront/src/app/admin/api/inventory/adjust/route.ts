import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminOperator } from "@/lib/admin/get-admin-user";
import { expressAdminFetch } from "@/lib/admin/express-admin-bridge";
import { logAdminExpressMutation } from "@/lib/admin/admin-express-mutation-log";

const bodySchema = z.object({
  product_id: z.string().uuid(),
  delta: z.number().int().refine((n) => n !== 0, { message: "delta must be non-zero" }),
  reason: z.string().max(500).optional(),
});

export async function POST(request: NextRequest) {
  const operator = await getAdminOperator();
  if (!operator) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  const { product_id, delta, reason } = parsed.data;
  const result = await expressAdminFetch(operator, "/api/admin/inventory/adjust", {
    method: "POST",
    json: { product_id, delta, reason: reason?.trim() || "Admin adjustment (Next)" },
  });

  if (!result.ok) {
    logAdminExpressMutation({
      operatorId: operator.id,
      operatorEmail: operator.email,
      action: "inventory_adjust",
      targetId: product_id,
      success: false,
      httpStatus: result.status,
      error: result.error,
      detail: { code: result.code ?? null, delta },
    });
    return NextResponse.json(
      { error: result.error, code: result.code ?? null },
      { status: result.status >= 400 && result.status < 600 ? result.status : 502 },
    );
  }

  logAdminExpressMutation({
    operatorId: operator.id,
    operatorEmail: operator.email,
    action: "inventory_adjust",
    targetId: product_id,
    success: true,
    httpStatus: result.status,
    detail: { delta },
  });

  return NextResponse.json(result.data ?? { success: true });
}
