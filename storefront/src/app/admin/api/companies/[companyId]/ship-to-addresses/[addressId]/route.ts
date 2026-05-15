import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminUser } from "@/lib/admin/get-admin-user";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { archiveAdminShipToAddress, updateAdminShipToAddress } from "@/lib/admin/admin-ship-to-addresses";

function uuidParam(id: string | undefined): string | null {
  if (!id || !z.string().uuid().safeParse(id).success) return null;
  return id;
}

const patchSchema = z
  .object({
    label: z.string().trim().max(200).optional().nullable(),
    recipient_name: z.string().trim().min(1).max(500).optional(),
    company_name: z.string().trim().max(500).optional().nullable(),
    address_line_1: z.string().trim().min(1).max(500).optional(),
    address_line_2: z.string().trim().max(500).optional().nullable(),
    city: z.string().trim().min(1).max(200).optional(),
    region: z.string().trim().min(1).max(200).optional(),
    postal_code: z.string().trim().min(1).max(32).optional(),
    country_code: z.string().trim().length(2).optional(),
    phone: z.string().trim().max(50).optional().nullable(),
    delivery_notes: z.string().trim().max(500).optional().nullable(),
    is_archived: z.boolean().optional(),
  })
  .strict();

export async function PATCH(request: NextRequest, ctx: { params: { companyId: string; addressId: string } }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const companyId = uuidParam(ctx.params.companyId);
  const addressId = uuidParam(ctx.params.addressId);
  if (!companyId || !addressId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

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

  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  const patchFields = { ...parsed.data };
  if (patchFields.country_code) {
    patchFields.country_code = patchFields.country_code.toUpperCase();
  }

  const supabase = getSupabaseAdmin() as any;
  const { row, error, code } = await updateAdminShipToAddress(supabase, companyId, addressId, patchFields);

  if (code === "not_found") {
    return NextResponse.json({ error: error || "Not found" }, { status: 404 });
  }
  if (code === "conflict" && error) {
    return NextResponse.json({ error }, { status: 409 });
  }
  if (code === "validation" && error) {
    return NextResponse.json({ error }, { status: 400 });
  }
  if (error || !row) {
    console.error("[PATCH ship-to-address]", error);
    return NextResponse.json({ error: error || "Update failed" }, { status: 500 });
  }

  return NextResponse.json({ address: row });
}

/** Archives the address (JSONB `is_archived`); does not hard-delete. */
export async function DELETE(_request: NextRequest, ctx: { params: { companyId: string; addressId: string } }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const companyId = uuidParam(ctx.params.companyId);
  const addressId = uuidParam(ctx.params.addressId);
  if (!companyId || !addressId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const supabase = getSupabaseAdmin() as any;
  const { row, error, code } = await archiveAdminShipToAddress(supabase, companyId, addressId);

  if (code === "not_found") {
    return NextResponse.json({ error: error || "Not found" }, { status: 404 });
  }
  if (error || !row) {
    console.error("[DELETE ship-to-address archive]", error);
    return NextResponse.json({ error: error || "Archive failed" }, { status: 500 });
  }

  return NextResponse.json({ address: row });
}
