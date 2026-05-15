import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin/get-admin-user";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { createAdminShipToAddress, fetchAdminShipToAddresses } from "@/lib/admin/admin-ship-to-addresses";
import { shipToAddressPostBodySchema as addressBodySchema, shipToAddressUuidParam as uuidParam } from "@/lib/commerce/ship-to-address-http-schema";

export async function GET(_request: NextRequest, ctx: { params: { companyId: string } }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const companyId = uuidParam(ctx.params.companyId);
  if (!companyId) return NextResponse.json({ error: "Invalid company id" }, { status: 400 });

  const supabase = getSupabaseAdmin() as any;
  const { rows, error } = await fetchAdminShipToAddresses(supabase, companyId);
  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ addresses: rows });
}

export async function POST(request: NextRequest, ctx: { params: { companyId: string } }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const companyId = uuidParam(ctx.params.companyId);
  if (!companyId) return NextResponse.json({ error: "Invalid company id" }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = addressBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = getSupabaseAdmin() as any;

  const { data: co, error: coErr } = await supabase
    .schema("gc_commerce")
    .from("companies")
    .select("id")
    .eq("id", companyId)
    .maybeSingle();
  if (coErr || !co) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  const b = parsed.data;
  const { row, error, code } = await createAdminShipToAddress(supabase, companyId, admin.id, {
    label: b.label,
    recipient_name: b.recipient_name,
    company_name: b.company_name,
    address_line_1: b.address_line_1,
    address_line_2: b.address_line_2,
    city: b.city,
    region: b.region,
    postal_code: b.postal_code,
    country_code: b.country_code?.toUpperCase() || "US",
    phone: b.phone,
    delivery_notes: b.delivery_notes,
    is_archived: b.is_archived ?? false,
  });

  if (code === "validation" && error) {
    return NextResponse.json({ error }, { status: 400 });
  }
  if (error || !row) {
    console.error("[POST ship-to-addresses]", error);
    return NextResponse.json({ error: error || "Insert failed" }, { status: 500 });
  }

  return NextResponse.json({ address: row }, { status: 201 });
}
