import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { archiveAdminShipToAddress, updateAdminShipToAddress } from "@/lib/admin/admin-ship-to-addresses";
import { resolveBuyerShippingAddressesGate } from "@/lib/account/buyer-shipping-addresses-gate";
import { shipToAddressPatchBodySchema, shipToAddressUuidParam } from "@/lib/commerce/ship-to-address-http-schema";

export async function PATCH(request: NextRequest, ctx: { params: { addressId: string } }) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const addressId = shipToAddressUuidParam(ctx.params.addressId);
  if (!addressId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const supabase = getSupabaseAdmin() as any;
  const gated = await resolveBuyerShippingAddressesGate(supabase, { requireMutate: true });
  if (!gated.ok) return gated.response;

  const { companyId } = gated.ctx;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = shipToAddressPatchBodySchema.safeParse(body);
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
    console.error("[PATCH account/shipping-addresses]", error);
    return NextResponse.json({ error: error || "Update failed" }, { status: 500 });
  }

  return NextResponse.json({ address: row });
}

/** Archives the address (JSONB `is_archived`); does not hard-delete. */
export async function DELETE(_request: NextRequest, ctx: { params: { addressId: string } }) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const addressId = shipToAddressUuidParam(ctx.params.addressId);
  if (!addressId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const supabase = getSupabaseAdmin() as any;
  const gated = await resolveBuyerShippingAddressesGate(supabase, { requireMutate: true });
  if (!gated.ok) return gated.response;

  const { companyId } = gated.ctx;

  const { row, error, code } = await archiveAdminShipToAddress(supabase, companyId, addressId);

  if (code === "not_found") {
    return NextResponse.json({ error: error || "Not found" }, { status: 404 });
  }
  if (error || !row) {
    console.error("[DELETE account/shipping-addresses archive]", error);
    return NextResponse.json({ error: error || "Archive failed" }, { status: 500 });
  }

  return NextResponse.json({ address: row });
}
