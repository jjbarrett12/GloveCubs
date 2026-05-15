import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { createAdminShipToAddress, fetchAdminShipToAddresses } from "@/lib/admin/admin-ship-to-addresses";
import { resolveBuyerShippingAddressesGate } from "@/lib/account/buyer-shipping-addresses-gate";
import { shipToAddressBuyerPostBodySchema } from "@/lib/commerce/ship-to-address-http-schema";

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const supabase = getSupabaseAdmin() as any;
  const gated = await resolveBuyerShippingAddressesGate(supabase, { requireMutate: false });
  if (!gated.ok) return gated.response;

  const { companyId } = gated.ctx;
  const { rows, error } = await fetchAdminShipToAddresses(supabase, companyId);
  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ addresses: rows });
}

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const supabase = getSupabaseAdmin() as any;
  const gated = await resolveBuyerShippingAddressesGate(supabase, { requireMutate: true });
  if (!gated.ok) return gated.response;

  const { userId, companyId } = gated.ctx;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = shipToAddressBuyerPostBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  const { data: co, error: coErr } = await supabase
    .schema("gc_commerce")
    .from("companies")
    .select("id")
    .eq("id", companyId)
    .maybeSingle();
  if (coErr || !co) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  const pb = parsed.data;
  const { row, error, code } = await createAdminShipToAddress(supabase, companyId, userId, {
    label: pb.label,
    recipient_name: pb.recipient_name,
    company_name: pb.company_name,
    address_line_1: pb.address_line_1,
    address_line_2: pb.address_line_2,
    city: pb.city,
    region: pb.region,
    postal_code: pb.postal_code,
    country_code: pb.country_code?.toUpperCase() || "US",
    phone: pb.phone,
    delivery_notes: pb.delivery_notes,
    is_archived: pb.is_archived ?? false,
  });

  if (code === "validation" && error) {
    return NextResponse.json({ error }, { status: 400 });
  }
  if (error || !row) {
    console.error("[POST account/shipping-addresses]", error);
    return NextResponse.json({ error: error || "Insert failed" }, { status: 500 });
  }

  return NextResponse.json({ address: row }, { status: 201 });
}
