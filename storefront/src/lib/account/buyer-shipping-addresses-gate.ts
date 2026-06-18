import { NextResponse } from "next/server";
import {
  assertCustomerCompanyAccess,
  redirectsToAccountHub,
  resolveCustomerProcurementGate,
} from "@/lib/procurement/customer-procurement-session";
import { canMutateShipToAddresses, fetchCustomerCompanyMemberRole } from "@/lib/commerce/ship-to-address-mutation-role";

export type BuyerShippingAddressesGateOk = {
  userId: string;
  companyId: string;
  role: string;
  canMutate: boolean;
};

/**
 * Server-only gate for buyer ship-to APIs: session company, membership, and optional mutation role.
 */
export async function resolveBuyerShippingAddressesGate(
  supabase: unknown,
  options: { requireMutate: boolean },
): Promise<{ ok: true; ctx: BuyerShippingAddressesGateOk } | { ok: false; response: NextResponse }> {
  const gate = await resolveCustomerProcurementGate(supabase);
  if (gate.kind === "sign_in_required") {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (redirectsToAccountHub(gate)) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  const { userId, companyId } = gate.session;
  const allowed = await assertCustomerCompanyAccess(supabase as any, userId, companyId);
  if (!allowed) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  const role = await fetchCustomerCompanyMemberRole(supabase as any, userId, companyId);
  if (!role) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  const canMutate = canMutateShipToAddresses(role);
  if (options.requireMutate && !canMutate) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { ok: true, ctx: { userId, companyId, role, canMutate } };
}
