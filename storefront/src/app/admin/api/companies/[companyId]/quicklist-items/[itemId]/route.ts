import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminUser } from "@/lib/admin/get-admin-user";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const patchSchema = z.object({
  admin_note: z.string().trim().max(2000).optional().nullable(),
  sort_order: z.number().int().min(0).max(1_000_000).optional(),
});

function uuidParam(id: string | undefined): string | null {
  if (!id || !z.string().uuid().safeParse(id).success) return null;
  return id;
}

export async function PATCH(request: NextRequest, ctx: { params: { companyId: string; itemId: string } }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const companyId = uuidParam(ctx.params.companyId);
  const itemId = uuidParam(ctx.params.itemId);
  if (!companyId || !itemId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.admin_note === undefined && parsed.data.sort_order === undefined) {
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.admin_note !== undefined) patch.admin_note = parsed.data.admin_note?.trim() || null;
  if (parsed.data.sort_order !== undefined) patch.sort_order = parsed.data.sort_order;

  const supabase = getSupabaseAdmin() as any;
  const { data, error } = await supabase
    .schema("gc_commerce")
    .from("company_quicklist_items")
    .update(patch)
    .eq("id", itemId)
    .eq("company_id", companyId)
    .is("valid_to", null)
    .select("id, company_id, catalog_product_id, catalog_variant_id, sort_order, admin_note, updated_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Quicklist item not found or archived" }, { status: 404 });
  }

  return NextResponse.json({ item: data });
}

export async function DELETE(_request: NextRequest, ctx: { params: { companyId: string; itemId: string } }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const companyId = uuidParam(ctx.params.companyId);
  const itemId = uuidParam(ctx.params.itemId);
  if (!companyId || !itemId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const supabase = getSupabaseAdmin() as any;
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .schema("gc_commerce")
    .from("company_quicklist_items")
    .update({ valid_to: now, updated_at: now })
    .eq("id", itemId)
    .eq("company_id", companyId)
    .is("valid_to", null)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Quicklist item not found or already archived" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
