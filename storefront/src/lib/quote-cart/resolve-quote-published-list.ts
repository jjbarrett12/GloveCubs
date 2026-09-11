/**
 * Server-side quote published-list authority.
 *
 * Semantics: selected catalog variant → public.variant_best_offer_price
 * (catalogos.variant_best_offer_price: min active mapped sell_price).
 * That is published LIST (min mapped sell_price), not company-tier PA V2.
 *
 * Client unit_price_major is never used as published list.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchVariantPricingRows,
  VARIANT_PRICING_ID_BATCH,
  type PdpVariantPricingRow,
} from "@/lib/pricing/variant-pricing-contracts";
import type { QuoteLinePricingStatus } from "@/lib/quote-cart/types";

export type QuotePublishedListResult = {
  unit_price_major: number | null;
  pricing_status: QuoteLinePricingStatus;
};

export type QuotePublishedListLineInput = {
  product_id: string;
  catalog_variant_id?: string | null;
  sell_unit?: string | null;
};

export const QUOTE_REQUEST_PRICING: QuotePublishedListResult = {
  unit_price_major: null,
  pricing_status: "request_pricing",
};

function finitePositiveList(n: unknown): number | null {
  if (n == null) return null;
  const x = Number(n);
  if (!Number.isFinite(x) || x <= 0) return null;
  return x;
}

/** Email copy: only server-verified list may be labeled published list. */
export function formatQuoteRequestEmailPriceLabel(unitPriceMajor: number | null): string {
  const n = finitePositiveList(unitPriceMajor);
  return n != null ? `published list ${n}` : "request pricing";
}

/**
 * Pure per-line decision. Identity is exact catalog_variant_id only.
 * Pallet lines have no published case-list authority.
 */
export function resolveQuoteLinePublishedList(input: {
  sellUnit?: string | null;
  catalogVariantId?: string | null;
  productId: string;
  pricingRow: PdpVariantPricingRow | undefined;
  productStatus: string | undefined;
}): QuotePublishedListResult {
  if (input.sellUnit === "pallet") return QUOTE_REQUEST_PRICING;
  const vid = input.catalogVariantId?.trim() || "";
  if (!vid) return QUOTE_REQUEST_PRICING;
  const row = input.pricingRow;
  if (!row || row.catalogVariantId !== vid) return QUOTE_REQUEST_PRICING;
  if (row.catalogProductId !== input.productId) return QUOTE_REQUEST_PRICING;
  if (input.productStatus !== "active") return QUOTE_REQUEST_PRICING;
  const list = finitePositiveList(row.listUnitPriceMajor);
  if (list == null) return QUOTE_REQUEST_PRICING;
  return { unit_price_major: list, pricing_status: "variant_published_list" };
}

export function quotePublishedListLookupQueryCount(
  uniqueVariantIds: number,
  uniquePricedProductIds: number
): number {
  const variantBatches =
    uniqueVariantIds <= 0 ? 0 : Math.ceil(uniqueVariantIds / VARIANT_PRICING_ID_BATCH);
  const productBatches =
    uniquePricedProductIds <= 0 ? 0 : Math.ceil(uniquePricedProductIds / VARIANT_PRICING_ID_BATCH);
  return variantBatches + productBatches;
}

async function fetchVariantPricingRowsChunked(
  client: SupabaseClient,
  variantIds: string[]
): Promise<PdpVariantPricingRow[]> {
  const ids = Array.from(new Set(variantIds)).filter(Boolean);
  const rows: PdpVariantPricingRow[] = [];
  for (let i = 0; i < ids.length; i += VARIANT_PRICING_ID_BATCH) {
    const chunk = ids.slice(i, i + VARIANT_PRICING_ID_BATCH);
    rows.push(...(await fetchVariantPricingRows(client, chunk)));
  }
  return rows;
}

async function fetchCatalogProductStatuses(
  client: SupabaseClient,
  productIds: string[]
): Promise<Map<string, string>> {
  const ids = Array.from(new Set(productIds)).filter(Boolean);
  const out = new Map<string, string>();
  for (let i = 0; i < ids.length; i += VARIANT_PRICING_ID_BATCH) {
    const chunk = ids.slice(i, i + VARIANT_PRICING_ID_BATCH);
    const { data, error } = await client
      .schema("catalog_v2")
      .from("catalog_products")
      .select("id, status")
      .in("id", chunk);
    if (error || !data?.length) continue;
    for (const row of data as Array<{ id?: unknown; status?: unknown }>) {
      const id = typeof row.id === "string" ? row.id : "";
      if (!id) continue;
      out.set(id, typeof row.status === "string" ? row.status : "");
    }
  }
  return out;
}

/**
 * One result per input line. Pricing lookup is batched (not N+1).
 * Does not read client unit_price_major.
 */
export async function resolveQuoteRequestPublishedListPrices(
  client: SupabaseClient,
  lines: QuotePublishedListLineInput[]
): Promise<QuotePublishedListResult[]> {
  const variantIds = lines
    .filter((l) => l.sell_unit !== "pallet")
    .map((l) => l.catalog_variant_id?.trim() || "")
    .filter(Boolean);

  const pricingRows =
    variantIds.length === 0 ? [] : await fetchVariantPricingRowsChunked(client, variantIds);
  const priceByVariant = new Map(pricingRows.map((r) => [r.catalogVariantId, r]));

  const productIdsForStatus: string[] = [];
  for (const line of lines) {
    if (line.sell_unit === "pallet") continue;
    const vid = line.catalog_variant_id?.trim() || "";
    if (!vid) continue;
    const row = priceByVariant.get(vid);
    if (row && finitePositiveList(row.listUnitPriceMajor) != null) {
      productIdsForStatus.push(line.product_id);
    }
  }

  const productStatus =
    productIdsForStatus.length === 0
      ? new Map<string, string>()
      : await fetchCatalogProductStatuses(client, productIdsForStatus);

  return lines.map((line) => {
    const vid = line.catalog_variant_id?.trim() || "";
    return resolveQuoteLinePublishedList({
      sellUnit: line.sell_unit,
      catalogVariantId: vid || null,
      productId: line.product_id,
      pricingRow: vid ? priceByVariant.get(vid) : undefined,
      productStatus: productStatus.get(line.product_id),
    });
  });
}

export function snapshotClientPriceAudit(
  clientUnitPriceMajor: number | null | undefined,
  authoritative: QuotePublishedListResult
): number | null {
  const client = finitePositiveList(clientUnitPriceMajor);
  if (client == null) return null;
  if (client === authoritative.unit_price_major) return null;
  return client;
}
