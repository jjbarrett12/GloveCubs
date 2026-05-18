import type { SupabaseClient } from "@supabase/supabase-js";

/** PDP company pricing uses gc_resolve_buyer_unit_price — same RPC as Pricing Authority V2 company path (Phase 0E parity). */

export type ResolvedBuyerUnitPrice = {
  company_id: string;
  catalog_variant_id: string;
  catalog_product_id?: string;
  quantity: number;
  list_unit_price_major: number | null;
  list_unit_price_minor: number | null;
  pricing_tier_code: string;
  discount_percent: number;
  resolved_unit_price_major: number | null;
  resolved_unit_price_minor: number | null;
  currency_code: string;
  pricing_source: string;
  computed_at?: unknown;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return null;
}

export async function resolveBuyerUnitPriceViaRpc(
  client: SupabaseClient,
  params: { companyId: string; catalogVariantId: string; quantity?: number }
): Promise<{ ok: true; data: ResolvedBuyerUnitPrice } | { ok: false; error: string }> {
  const { data, error } = await client.rpc("gc_resolve_buyer_unit_price", {
    p_company_id: params.companyId,
    p_catalog_variant_id: params.catalogVariantId,
    p_quantity: params.quantity ?? 1,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const row = asRecord(data);
  if (!row) {
    return { ok: false, error: "empty_rpc_result" };
  }

  if (row.error != null) {
    return { ok: false, error: String(row.error) };
  }

  const company_id = String(row.company_id ?? params.companyId);
  const catalog_variant_id = String(row.catalog_variant_id ?? params.catalogVariantId);
  const pricing_tier_code = String(row.pricing_tier_code ?? "");
  const discount_percent = Number(row.discount_percent ?? 0);
  const currency_code = String(row.currency_code ?? "USD");
  const pricing_source = String(row.pricing_source ?? "unknown");

  const list_major = row.list_unit_price_major;
  const res_major = row.resolved_unit_price_major;

  return {
    ok: true,
    data: {
      company_id,
      catalog_variant_id,
      catalog_product_id: row.catalog_product_id != null ? String(row.catalog_product_id) : undefined,
      quantity: Number(row.quantity ?? params.quantity ?? 1),
      list_unit_price_major: list_major == null ? null : Number(list_major),
      list_unit_price_minor: row.list_unit_price_minor == null ? null : Number(row.list_unit_price_minor),
      pricing_tier_code,
      discount_percent,
      resolved_unit_price_major: res_major == null ? null : Number(res_major),
      resolved_unit_price_minor: row.resolved_unit_price_minor == null ? null : Number(row.resolved_unit_price_minor),
      currency_code,
      pricing_source,
      computed_at: row.computed_at,
    },
  };
}
