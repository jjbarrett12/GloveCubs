import type { SupabaseClient } from "@supabase/supabase-js";
import { tryParsePersistedShipToAddressJson } from "@/lib/admin/admin-ship-to-addresses";

export type ResolvedQuoteShipTo = {
  ship_to_address_id: string;
  ship_to_label: string | null;
  ship_to_snapshot: Record<string, unknown>;
};

/**
 * Server-only: load ship-to for active company, validate non-archived v1 JSON, return immutable JSON copy for quote_requests.
 */
export async function resolveQuoteShipToSnapshot(
  supabase: SupabaseClient,
  companyId: string,
  shipToAddressId: string,
): Promise<
  | { ok: true; ship: ResolvedQuoteShipTo }
  | { ok: false; status: 400 | 404 | 409; error: string }
> {
  const { data, error } = await supabase
    .schema("gc_commerce")
    .from("ship_to_addresses")
    .select("id, company_id, label, address")
    .eq("id", shipToAddressId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) {
    return { ok: false, status: 400, error: error.message };
  }
  if (!data) {
    return { ok: false, status: 404, error: "Ship-to address not found" };
  }

  const row = data as { id: string; label: string | null; address: unknown };
  const addr = tryParsePersistedShipToAddressJson(row.address);
  if (!addr) {
    return { ok: false, status: 400, error: "Ship-to address record is invalid" };
  }
  if (addr.is_archived) {
    return { ok: false, status: 409, error: "Archived ship-to addresses cannot be used on new quote requests" };
  }

  const ship_to_snapshot = JSON.parse(JSON.stringify(addr)) as Record<string, unknown>;
  const ship_to_label = row.label != null && String(row.label).trim() ? String(row.label).trim() : null;

  return {
    ok: true,
    ship: {
      ship_to_address_id: String(row.id),
      ship_to_label,
      ship_to_snapshot,
    },
  };
}
