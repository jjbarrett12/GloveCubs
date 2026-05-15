import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin/get-admin-user";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { fetchAdminShipToAddresses, setDefaultAdminShipToAddress } from "@/lib/admin/admin-ship-to-addresses";
import { shipToAddressUuidParam as uuidParam } from "@/lib/commerce/ship-to-address-http-schema";

export async function POST(_request: Request, ctx: { params: { companyId: string; addressId: string } }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const companyId = uuidParam(ctx.params.companyId);
  const addressId = uuidParam(ctx.params.addressId);
  if (!companyId || !addressId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const supabase = getSupabaseAdmin() as any;
  const result = await setDefaultAdminShipToAddress(supabase, companyId, addressId);

  if (!result.ok) {
    if (result.code === "not_found") {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }
    if (result.code === "conflict") {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }
    console.error("[POST set-default ship-to]", result.error);
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  const { rows, error } = await fetchAdminShipToAddresses(supabase, companyId);
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, addresses: rows });
}
