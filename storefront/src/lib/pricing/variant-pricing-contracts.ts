import type { SupabaseClient } from "@supabase/supabase-js";
import { b2bTierLabel } from "@/lib/pricing/b2b-tier-meta";
import type { ResolvedBuyerUnitPrice } from "@/lib/pricing/resolve-buyer-unit-price";

export type PdpVariantPricingRow = {
  catalogVariantId: string;
  catalogProductId: string;
  listUnitPriceMajor: number | null;
  offerCount: number;
  pricingSource: string;
  currencyCode: string;
};

export type PdpVariantCaseEconomics = {
  catalogVariantId: string;
  unitsPerCase: number | null;
  uomLabel: string | null;
  costBasis: string | null;
  listUnitPriceMajor: number | null;
  listCasePriceMajor: number | null;
  casePricingSource: string | null;
  normalizationConfidence: string | null;
  packagingSpec: string | null;
};

export type PdpBuyerUnitReference = {
  catalogVariantId: string;
  tierLabel: string;
  tierCode: string;
  listUsd: number;
  yourUsd: number;
  pricingSource: string;
  isVariantSpecificList: boolean;
};

export const PDP_BEST_PRICE_SCOPE = "product_min" as const;

const MAX_BATCH_VARIANT_IDS = 50;

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return null;
}

function finitePositive(n: unknown): number | null {
  if (n == null) return null;
  const x = Number(n);
  if (!Number.isFinite(x) || x <= 0) return null;
  return x;
}

export function mapVariantPricingRow(r: Record<string, unknown>): PdpVariantPricingRow | null {
  const catalogVariantId = String(r.catalog_variant_id ?? "");
  if (!catalogVariantId) return null;
  return {
    catalogVariantId,
    catalogProductId: String(r.catalog_product_id ?? ""),
    listUnitPriceMajor: finitePositive(r.list_unit_price_major),
    offerCount: Number(r.offer_count ?? 0),
    pricingSource: String(r.pricing_source ?? "unknown"),
    currencyCode: String(r.currency_code ?? "USD"),
  };
}

export function mapCaseEconomicsRow(r: Record<string, unknown>): PdpVariantCaseEconomics | null {
  const catalogVariantId = String(r.catalog_variant_id ?? "");
  if (!catalogVariantId) return null;
  if (r.error != null) return null;
  const unitsRaw = r.units_per_case;
  const unitsPerCase =
    unitsRaw == null ? null : Number.isFinite(Number(unitsRaw)) && Number(unitsRaw) > 0 ? Number(unitsRaw) : null;
  return {
    catalogVariantId,
    unitsPerCase,
    uomLabel: r.uom_label != null ? String(r.uom_label) : null,
    costBasis: r.cost_basis != null ? String(r.cost_basis) : null,
    listUnitPriceMajor: finitePositive(r.list_unit_price_major),
    listCasePriceMajor: finitePositive(r.list_case_price_major),
    casePricingSource: r.case_pricing_source != null ? String(r.case_pricing_source) : null,
    normalizationConfidence:
      r.normalization_confidence != null ? String(r.normalization_confidence) : null,
    packagingSpec: r.packaging_spec != null ? String(r.packaging_spec) : null,
  };
}

export function mapBuyerRpcToPdpReference(
  data: ResolvedBuyerUnitPrice & { is_variant_specific_list?: boolean }
): PdpBuyerUnitReference | null {
  if (data.pricing_source !== "site_variant_list_x_company_tier_v1") {
    return null;
  }
  if (data.list_unit_price_major == null || data.resolved_unit_price_major == null) return null;
  return {
    catalogVariantId: data.catalog_variant_id,
    tierLabel: b2bTierLabel(data.pricing_tier_code),
    tierCode: data.pricing_tier_code,
    listUsd: data.list_unit_price_major,
    yourUsd: data.resolved_unit_price_major,
    pricingSource: data.pricing_source,
    isVariantSpecificList: Boolean(data.is_variant_specific_list),
  };
}

export async function fetchVariantPricingRows(
  client: SupabaseClient,
  variantIds: string[]
): Promise<PdpVariantPricingRow[]> {
  const ids = Array.from(new Set(variantIds)).filter(Boolean).slice(0, MAX_BATCH_VARIANT_IDS);
  if (ids.length === 0) return [];

  const { data, error } = await client
    .from("variant_best_offer_price")
    .select(
      "catalog_variant_id, catalog_product_id, list_unit_price_major, offer_count, pricing_source, currency_code"
    )
    .in("catalog_variant_id", ids);

  if (error || !data?.length) return [];

  return (data as Record<string, unknown>[])
    .map((r) => mapVariantPricingRow(r))
    .filter((x): x is PdpVariantPricingRow => Boolean(x));
}

export async function fetchVariantCaseEconomicsBatch(
  client: SupabaseClient,
  variantIds: string[]
): Promise<PdpVariantCaseEconomics[]> {
  const ids = Array.from(new Set(variantIds)).filter(Boolean).slice(0, MAX_BATCH_VARIANT_IDS);
  if (ids.length === 0) return [];

  const { data, error } = await client.rpc("gc_variant_case_economics_batch", {
    p_catalog_variant_ids: ids,
  });

  if (error) return [];

  const root = asRecord(data);
  const items = root?.items;
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => mapCaseEconomicsRow(asRecord(item) ?? {}))
    .filter((x): x is PdpVariantCaseEconomics => Boolean(x));
}

export async function fetchBuyerUnitReferencesBatch(
  client: SupabaseClient,
  companyId: string,
  variantIds: string[],
  quantity = 1
): Promise<Record<string, PdpBuyerUnitReference>> {
  const ids = Array.from(new Set(variantIds)).filter(Boolean).slice(0, MAX_BATCH_VARIANT_IDS);
  if (ids.length === 0) return {};

  const { data, error } = await client.rpc("gc_resolve_buyer_unit_prices_batch", {
    p_company_id: companyId,
    p_catalog_variant_ids: ids,
    p_quantity: quantity,
  });

  if (error) return {};

  const root = asRecord(data);
  if (root?.error != null) return {};

  const items = root?.items;
  if (!Array.isArray(items)) return {};

  const out: Record<string, PdpBuyerUnitReference> = {};
  for (const raw of items) {
    const row = asRecord(raw);
    if (!row || row.error != null) continue;
    const vid = String(row.catalog_variant_id ?? "");
    if (!vid) continue;
    const listMajor = row.list_unit_price_major;
    const resMajor = row.resolved_unit_price_major;
    const source = String(row.pricing_source ?? "");
    if (source !== "site_variant_list_x_company_tier_v1") continue;
    if (listMajor == null || resMajor == null) continue;
    if (!row.is_variant_specific_list) continue;

    out[vid] = {
      catalogVariantId: vid,
      tierLabel: b2bTierLabel(String(row.pricing_tier_code ?? "")),
      tierCode: String(row.pricing_tier_code ?? ""),
      listUsd: Number(listMajor),
      yourUsd: Number(resMajor),
      pricingSource: source,
      isVariantSpecificList: true,
    };
  }
  return out;
}
