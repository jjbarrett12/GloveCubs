import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { fetchAdminShipToAddresses, setDefaultAdminShipToAddress } from "@/lib/admin/admin-ship-to-addresses";
import { resolveBuyerShippingAddressesGate } from "@/lib/account/buyer-shipping-addresses-gate";
import { shipToAddressUuidParam } from "@/lib/commerce/ship-to-address-http-schema";

export async function POST(_request: Request, ctx: { params: { addressId: string } }) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const addressId = shipToAddressUuidParam(ctx.params.addressId);
  if (!addressId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const supabase = getSupabaseAdmin() as any;
  const gated = await resolveBuyerShippingAddressesGate(supabase, { requireMutate: true });
  if (!gated.ok) return gated.response;

  const { companyId } = gated.ctx;

  const result = await setDefaultAdminShipToAddress(supabase, companyId, addressId);

  if (!result.ok) {
    if (result.code === "not_found") {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }
    if (result.code === "conflict") {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }
    console.error("[POST account/shipping-addresses/set-default]", result.error);
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  const { rows, error } = await fetchAdminShipToAddresses(supabase, companyId);
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, addresses: rows });
}
